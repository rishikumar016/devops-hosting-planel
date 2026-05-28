require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server: SocketIOServer } = require('socket.io');

const { connectDB } = require('./config/db');
const deploymentRoutes = require('./routes/deployments');
const Deployment = require('./models/Deployment');
const { deploymentQueue } = require('./queue');
const { register, queueDepth, deploymentsByStatus } = require('./metrics');
const { createSubscriber } = require('./eventBus');

const PORT = Number(process.env.PORT || 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api', deploymentRoutes);

app.get('/metrics', async (_req, res, next) => {
  try {
    const counts = await deploymentQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    );
    for (const [state, n] of Object.entries(counts)) {
      queueDepth.set({ state }, n);
    }

    const statusGroups = await Deployment.aggregate([
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]);
    deploymentsByStatus.reset();
    for (const row of statusGroups) {
      deploymentsByStatus.set({ status: row._id || 'unknown' }, row.n);
    }

    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error('[api] unhandled error:', err);
  res.status(500).json({ ok: false, error: err.message || 'Internal Server Error' });
});

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: { origin: FRONTEND_ORIGIN, credentials: true },
  path: '/socket.io',
});

io.on('connection', (socket) => {
  socket.on('subscribe', (deploymentId) => {
    if (typeof deploymentId === 'string' && deploymentId.length > 0) {
      socket.join(`deployment:${deploymentId}`);
    }
  });
  socket.on('unsubscribe', (deploymentId) => {
    if (typeof deploymentId === 'string' && deploymentId.length > 0) {
      socket.leave(`deployment:${deploymentId}`);
    }
  });
});

const subscriber = createSubscriber((event) => {
  if (!event || event.type !== 'deployment:update' || !event.deployment) return;
  const d = event.deployment;
  io.to(`deployment:${d.id}`).emit('deployment:update', d);
  io.emit('deployment:list-update', {
    id: d.id,
    status: d.status,
    updatedAt: d.updatedAt,
  });
});

async function start() {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT}`);
    console.log(`[api] socket.io path: /socket.io`);
  });
}

function shutdown(signal) {
  console.log(`[api] ${signal} received, shutting down`);
  server.close(() => {
    subscriber.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('[api] failed to start:', err);
  process.exit(1);
});
