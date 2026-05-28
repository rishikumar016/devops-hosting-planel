# Hosting Control Panel

Admin dashboard for an internal hosting platform. Onboards clients by running
their Docker image on a shared EC2 host, registering a reverse-proxy route in
Caddy, and invoking a post-deploy Lambda for any external bookkeeping. Status is
streamed to the React UI over WebSockets and exposed as Prometheus metrics for
on-call.

## Architecture

```
            ┌───────────────┐
   Browser ─┤   React/Vite  │── HTTP ─────────────┐
            │ socket.io-cl. │── /socket.io (WS) ──┤
            └───────────────┘                     │
                                                  ▼
                                    ┌───────────────────────┐
                                    │  Express API + WS hub │
                                    │   /api  /metrics  /ws │
                                    └──┬─────────────┬──────┘
                                       │             │
                            BullMQ enq.│             │ Subscribe
                                       ▼             │
                                  ┌────────┐         │
                                  │ Redis  │◄────────┘ pub/sub
                                  └───┬────┘             "deployment-events"
                                      │ jobs
                                      ▼
                              ┌───────────────┐
                              │ Worker (Node) │
                              │  - SSM/SSH    │── EC2 (Docker)
                              │  - Caddy API  │── Caddy admin :2019
                              │  - Lambda v3  │── AWS Lambda
                              └──────┬────────┘
                                     │ pub
                                     ▼
                                  Redis  (deployment-events)

   MongoDB stores Deployment documents (status + logs).
```

### Request flow (POST /api/deploy)

1. API validates input and inserts a `Deployment` row in `Pending`.
2. API enqueues a BullMQ job with `jobId = "deploy:<deploymentId>"` (idempotent).
3. API responds `200 OK` immediately — it never blocks on the slow work.
4. Worker picks up the job and walks through `docker → caddy → lambda`, writing
   logs and status transitions to Mongo as it goes.
5. After every write, the worker publishes a JSON event to Redis channel
   `deployment-events`.
6. The API process is subscribed to that channel and fans events out to the
   `deployment:<id>` Socket.IO room — the UI sees status update without
   polling.

### Rollback

`POST /api/deploy/:id/rollback` is only accepted while status is `Completed` or
`Failed`. The worker tears down in the **opposite** order from setup —
**remove the Caddy route first**, then stop the container, then run the
teardown Lambda. Stopping the container before the route is removed leaves a
small window where Caddy proxies to a dead upstream.

## Tech stack

| Layer            | Choice                                             |
| ---------------- | -------------------------------------------------- |
| HTTP API         | Node.js 18+, Express                               |
| WebSockets       | Socket.IO (path `/socket.io`)                      |
| Job queue        | BullMQ on Redis (`ioredis`)                        |
| Worker ↔ API bus | Redis pub/sub channel `deployment-events`          |
| Database         | MongoDB via Mongoose                               |
| AWS              | **AWS SDK v3** (`@aws-sdk/client-ssm`, `client-lambda`) |
| EC2 access       | SSM `SendCommand` by default, SSH fallback         |
| Reverse proxy    | Caddy 2 + JSON admin API                           |
| Metrics          | `prom-client`, exposed at `GET /metrics`           |
| Frontend         | React 18 + Vite + plain JSX + hand-written CSS     |

## Local setup

### Prerequisites

- Node 18+
- MongoDB running locally (default URI `mongodb://localhost:27017/hosting-control-panel`)
- Redis running locally (default `127.0.0.1:6379`)
- For real deploys: AWS credentials, an EC2 with SSM, two Lambda functions, a
  Caddy host. None of these are required to *start* the API and UI — without
  them, deployment jobs will fail at the relevant step and the worker will mark
  the row as `Failed`, but the WebSocket + UI flow still works end-to-end.

### Backend

```bash
cd backend
npm install
cp .env.example .env   # then edit
npm start              # terminal 1: API at http://localhost:4000
npm run worker         # terminal 2: BullMQ worker
```

### Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 — proxies /api + /socket.io to :4000
```

## API reference

| Method | Path                          | Description                                                                 |
| ------ | ----------------------------- | --------------------------------------------------------------------------- |
| `POST` | `/api/deploy`                 | Validate input, create `Pending` Deployment, enqueue deploy job. Returns 200 with the summary. |
| `POST` | `/api/deploy/:id/rollback`    | 404 if missing, 409 if status not in `[Completed, Failed]`, else enqueue rollback. Returns 202. |
| `GET`  | `/api/status/:id`             | Full Deployment doc (with `id` not `_id`). 404/400 on miss/bad id.          |
| `GET`  | `/api/deployments`            | Latest 50 deployments, sorted desc by `createdAt`, projected fields only.   |
| `GET`  | `/metrics`                    | Prometheus exposition format (samples queue depth + status counts at scrape time). |
| `GET`  | `/health`                     | `{ ok: true }`.                                                             |

### Request body — POST /api/deploy

```json
{
  "clientName": "acme-corp",
  "domain": "app.acme.example.com",
  "image": "nginx:1.27-alpine"
}
```

Validation:

- `clientName`: trimmed, ≥2 characters.
- `domain`: matches `(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}`.
- `image`: matches `[a-z0-9._\-/]+(:[a-zA-Z0-9._-]+)?` (repo[:tag]).

## WebSocket events

Client connects to `/socket.io` and emits `subscribe <deploymentId>` to join the
per-deployment room. Server emits:

| Event                    | Payload                                                   |
| ------------------------ | --------------------------------------------------------- |
| `deployment:update`      | Full Deployment object (status, logs, ids, error, etc.)   |
| `deployment:list-update` | `{ id, status, updatedAt }` (broadcast to all clients)    |

On reconnect, the client should re-emit `subscribe` and refetch
`GET /api/status/:id` once — events that fired while the socket was down are
lost (Socket.IO does not queue them server-side here).

## Metrics

All metrics use the `hcp_` prefix. Default Node metrics are also exported.

| Metric                                 | Type      | Labels                  |
| -------------------------------------- | --------- | ----------------------- |
| `hcp_deployment_job_duration_seconds`  | Histogram | `outcome`, `job_type`   |
| `hcp_deployment_jobs_total`            | Counter   | `outcome`, `job_type`   |
| `hcp_deployment_job_failures_total`    | Counter   | `stage`, `job_type`     |
| `hcp_queue_depth`                      | Gauge     | `state`                 |
| `hcp_deployments_by_status`            | Gauge     | `status`                |

`stage` is one of `docker`, `caddy`, `lambda`, `lookup`, `unknown` and tells you
*which* step of the job blew up. `state` is BullMQ's `waiting / active /
delayed / failed / completed`. Both gauges are sampled at scrape time — the API
queries BullMQ (via Redis) and Mongo every time `/metrics` is hit.

## Design notes (the talking points)

1. **Why a queue?** The API responds in milliseconds while the slow work (pulling
   an image, restarting Caddy, hitting Lambda) runs in a separate worker
   process. Retries, concurrency limits, and horizontal scale all come for
   free.
2. **Why SSM over SSH?** No inbound SSH port needs to be open on the EC2 SG; the
   call is IAM-authed and audited in CloudWatch; there's no key file to ship
   to the backend. SSH is kept as a fallback (`EC2_EXEC_MODE=ssh`) for hosts
   without the SSM agent.
3. **Why WebSockets over polling?** Status changes show up in the UI within
   one network round-trip of the worker writing them — no fixed polling
   interval. Logs stream as they're appended.
4. **Why Redis pub/sub for the WS bridge?** The worker is a different Node
   process from the API; it can't reach the in-memory `io` instance. Redis
   pub/sub also lets the API scale to multiple replicas without losing
   fan-out — every API replica subscribes and reaches its own connected
   clients.
5. **Why Caddy?** Automatic Let's Encrypt on first request, a JSON admin API
   that supports addressable nodes via `@id` (so re-registering a domain
   *replaces* its route instead of accumulating duplicates), and no reload
   step.
6. **Why expose `/metrics` from the API process, not the worker?** The API
   already has an HTTP server; sampling queue depth from BullMQ on each scrape
   works from any process because BullMQ stores it in Redis. A separate
   exporter would duplicate plumbing.

## Common pitfalls (already handled)

- `queue.js` imports `./config/redis` (it's at `src/queue.js`); files under
  `src/workers/` and `src/routes/` use `../config/redis`.
- BullMQ requires `maxRetriesPerRequest: null` and `enableReadyCheck: false` on
  the ioredis connection — set in `src/config/redis.js`.
- Cross-process WebSocket fan-out uses Redis pub/sub with two separate
  connections (one publisher in the worker, one subscriber in the API). A
  subscriber connection can't issue normal commands.
- Shell injection: every user-controlled value (`clientName`, `domain`, `image`)
  is single-quote-escaped before going into a remote `docker run` command.
- Idempotency: deploy jobs use `jobId = deploy:<id>`; Caddy routes use `@id` so
  re-registration replaces the existing route; `docker rm -f … || true` makes
  the rollback step a no-op on an already-stopped container.
- Rollback ordering: Caddy route is removed **before** the container is
  stopped to avoid 502s during the gap.
- Frontend Vite proxy forwards `/socket.io` with `ws: true` so the WebSocket
  upgrade doesn't silently downgrade to long-polling.

## Project layout

```
backend/
  src/
    server.js              # Express + Socket.IO + /metrics
    queue.js               # BullMQ queue producer
    eventBus.js            # Redis pub/sub (worker ⇄ API)
    metrics.js             # prom-client registry
    config/{db,redis}.js
    models/Deployment.js
    routes/deployments.js
    utils/validate.js
    workers/
      deploymentWorker.js  # BullMQ consumer
      ec2Runner.js         # SSM / SSH docker driver
      caddyClient.js       # Caddy admin API client
      lambdaInvoker.js     # AWS SDK v3 Invoke
frontend/
  src/
    App.jsx
    main.jsx
    socket.js              # shared Socket.IO client singleton
    components/{OnboardingForm,DeploymentList,DeploymentDetail,StatusBadge}.jsx
    hooks/useDeploymentStatus.js
    styles/global.css
deploy/
  caddy-bootstrap.json
  README.md
```
