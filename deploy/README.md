# Caddy host setup

The control panel registers reverse-proxy routes via Caddy's JSON admin API.
This directory contains the bootstrap config and instructions for running Caddy
on the EC2 host that fronts client containers.

## Prerequisites

- An EC2 instance with Docker installed and the SSM agent running (or SSH access).
- A security group that allows inbound `80` and `443` from the internet.
- DNS for each client `domain` pointing at the EC2 public IP (or a load balancer).

## Run Caddy as a container

The control panel expects:

- The Caddy admin API reachable at `CADDY_ADMIN_URL` from the backend process
  (typically `http://<ec2-internal-ip>:2019`).
- Caddy started with `caddy-bootstrap.json` so the `srv0` HTTP server and the
  ACME issuer exist before any routes are PATCHed in.

On the EC2 host:

```bash
# 1. Drop the bootstrap config somewhere persistent
sudo mkdir -p /etc/caddy
sudo cp caddy-bootstrap.json /etc/caddy/caddy.json

# 2. Run Caddy as a long-lived container
docker run -d \
  --name caddy \
  --restart unless-stopped \
  --network host \
  -v /etc/caddy:/etc/caddy \
  -v caddy_data:/data \
  -v caddy_config:/config \
  caddy:2 \
  caddy run --config /etc/caddy/caddy.json
```

`--network host` keeps the admin API addressable as `127.0.0.1:2019` from other
containers on the host and lets Caddy bind `:80` / `:443` directly.

## Security notes

- The admin API has no authentication. Do not expose `:2019` to the internet.
  Restrict it via security group / `iptables` to the backend's source IP.
- The `caddy_data` volume holds the ACME account key and issued certs; back it up.

## Verifying

From the backend host:

```bash
curl -s http://<ec2-internal-ip>:2019/config/apps/http/servers/srv0/routes | jq .
```

Should return `[]` on first boot. The control panel populates it as deployments
complete.
