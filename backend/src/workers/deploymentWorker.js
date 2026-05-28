require('dotenv').config();

const { Worker } = require('bullmq');
const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const { createConnection } = require('../config/redis');
const Deployment = require('../models/Deployment');
const { QUEUE_NAME } = require('../queue');
const { runDockerOnEC2, stopDockerOnEC2, containerNameFor, portForDomain } = require('./ec2Runner');
const { addRoute, removeRoute } = require('./caddyClient');
const { invokePostDeployLambda, invokeTeardownLambda } = require('./lambdaInvoker');
const { createPublisher } = require('../eventBus');
const { jobDuration, jobsTotal, jobFailuresTotal } = require('../metrics');

const publisher = createPublisher();

async function step(stageName, fn) {
  try {
    return await fn();
  } catch (err) {
    if (!err.stage) err.stage = stageName;
    throw err;
  }
}

async function emitUpdate(deploymentId) {
  const fresh = await Deployment.findById(deploymentId).lean();
  if (!fresh) return;
  const deployment = {
    id: fresh._id.toString(),
    clientName: fresh.clientName,
    domain: fresh.domain,
    image: fresh.image,
    status: fresh.status,
    logs: fresh.logs || [],
    containerId: fresh.containerId,
    containerName: fresh.containerName,
    hostPort: fresh.hostPort,
    lambdaRequestId: fresh.lambdaRequestId,
    teardownLambdaRequestId: fresh.teardownLambdaRequestId,
    errorMessage: fresh.errorMessage,
    createdAt: fresh.createdAt,
    updatedAt: fresh.updatedAt,
  };
  await publisher.publish({
    type: 'deployment:update',
    deploymentId: deployment.id,
    deployment,
  });
}

async function appendLog(deploymentId, level, message) {
  await Deployment.updateOne(
    { _id: deploymentId },
    { $push: { logs: { ts: new Date(), level, message } } }
  );
  console.log(`[worker:${deploymentId}] [${level}] ${message}`);
  await emitUpdate(deploymentId);
}

async function setStatus(deploymentId, status, extra = {}) {
  await Deployment.updateOne({ _id: deploymentId }, { $set: { status, ...extra } });
  await emitUpdate(deploymentId);
}

async function handleDeploy(deployment) {
  const id = deployment._id.toString();
  await setStatus(id, 'In Progress');
  await appendLog(id, 'info', 'Starting deployment…');

  let containerInfo;
  await step('docker', async () => {
    containerInfo = await runDockerOnEC2({
      image: deployment.image,
      domain: deployment.domain,
      clientName: deployment.clientName,
    });
    await Deployment.updateOne(
      { _id: id },
      {
        $set: {
          containerId: containerInfo.containerId,
          containerName: containerInfo.containerName,
          hostPort: containerInfo.port,
        },
      }
    );
    await appendLog(
      id,
      'info',
      `Container started: ${containerInfo.containerId || '(id unknown)'} on host port ${containerInfo.port}`
    );
  });

  await step('caddy', async () => {
    if (!process.env.CADDY_ADMIN_URL) {
      await appendLog(id, 'warn', 'CADDY_ADMIN_URL not configured; skipping reverse-proxy registration.');
      return;
    }
    await addRoute({
      domain: deployment.domain,
      upstream: `127.0.0.1:${containerInfo.port}`,
    });
    await appendLog(id, 'info', `Caddy route active for ${deployment.domain}. Let's Encrypt cert issues on first request.`);
  });

  let lambdaResult = null;
  await step('lambda', async () => {
    if (!process.env.LAMBDA_FUNCTION_NAME) {
      await appendLog(id, 'warn', 'LAMBDA_FUNCTION_NAME not configured; skipping post-deploy Lambda.');
      return;
    }
    lambdaResult = await invokePostDeployLambda({
      deploymentId: id,
      clientName: deployment.clientName,
      domain: deployment.domain,
      image: deployment.image,
      containerId: containerInfo.containerId,
      hostPort: containerInfo.port,
    });
    await appendLog(id, 'info', `Lambda completed (requestId=${lambdaResult.requestId})`);
  });

  await setStatus(id, 'Completed', {
    lambdaRequestId: lambdaResult?.requestId || null,
    errorMessage: null,
  });
  await appendLog(id, 'info', 'Deployment completed successfully ✅');
}

async function handleRollback(deployment) {
  const id = deployment._id.toString();
  await appendLog(id, 'warn', 'Starting rollback…');

  await step('caddy', async () => {
    if (!process.env.CADDY_ADMIN_URL) {
      await appendLog(id, 'warn', 'CADDY_ADMIN_URL not configured; skipping route removal.');
      return;
    }
    const existed = await removeRoute({ domain: deployment.domain });
    await appendLog(id, 'info', existed ? 'Caddy route removed.' : 'No Caddy route found (already gone).');
  });

  await step('docker', async () => {
    const containerName = deployment.containerName || containerNameFor(deployment.clientName, deployment.domain);
    await stopDockerOnEC2({ containerName });
    await appendLog(id, 'info', `Container ${containerName} stopped and removed.`);
  });

  let teardownResult = null;
  await step('lambda', async () => {
    if (!process.env.LAMBDA_TEARDOWN_FUNCTION_NAME) {
      await appendLog(id, 'warn', 'LAMBDA_TEARDOWN_FUNCTION_NAME not configured; skipping teardown Lambda.');
      return;
    }
    teardownResult = await invokeTeardownLambda({
      deploymentId: id,
      clientName: deployment.clientName,
      domain: deployment.domain,
      image: deployment.image,
      hostPort: deployment.hostPort || portForDomain(deployment.domain),
    });
    await appendLog(id, 'info', `Teardown Lambda completed (requestId=${teardownResult.requestId})`);
  });

  await setStatus(id, 'Rolled Back', {
    teardownLambdaRequestId: teardownResult?.requestId || null,
    errorMessage: null,
  });
  await appendLog(id, 'info', 'Rollback completed ✅');
}

async function processJob(job) {
  const jobType = job.name === 'rollback' ? 'rollback' : 'deploy';
  const startedAt = Date.now();
  let outcome = 'completed';
  try {
    const deployment = await Deployment.findById(job.data.deploymentId);
    if (!deployment) throw Object.assign(new Error('Deployment not found'), { stage: 'lookup' });

    if (jobType === 'rollback') {
      await handleRollback(deployment);
    } else {
      await handleDeploy(deployment);
    }
  } catch (err) {
    outcome = 'failed';
    jobFailuresTotal.inc({ stage: err.stage || 'unknown', job_type: jobType });
    throw err;
  } finally {
    const secs = (Date.now() - startedAt) / 1000;
    jobDuration.observe({ outcome, job_type: jobType }, secs);
    jobsTotal.inc({ outcome, job_type: jobType });
  }
}

async function main() {
  await connectDB();

  const connection = createConnection();
  const worker = new Worker(QUEUE_NAME, processJob, {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 2),
  });

  worker.on('completed', (job) => {
    console.log(`[worker] job ${job.id} (${job.name}) completed`);
  });

  worker.on('failed', async (job, err) => {
    console.error(`[worker] job ${job?.id} (${job?.name}) failed:`, err?.message);
    if (!job?.data?.deploymentId) return;
    try {
      const isRollback = job.name === 'rollback';
      await Deployment.updateOne(
        { _id: job.data.deploymentId },
        {
          $set: {
            status: 'Failed',
            errorMessage: err?.message || 'Unknown error',
          },
          $push: {
            logs: {
              ts: new Date(),
              level: 'error',
              message: `${isRollback ? 'Rollback' : 'Deployment'} failed at stage "${err?.stage || 'unknown'}": ${err?.message}`,
            },
          },
        }
      );
      await emitUpdate(job.data.deploymentId);
    } catch (e) {
      console.error('[worker] failed to record failure:', e.message);
    }
  });

  console.log(`[worker] running, concurrency=${process.env.WORKER_CONCURRENCY || 2}`);

  async function shutdown(signal) {
    console.log(`[worker] ${signal} received, shutting down`);
    try {
      await worker.close();
      await publisher.close();
      await mongoose.connection.close();
    } finally {
      process.exit(0);
    }
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[worker] failed to start:', err);
    process.exit(1);
  });
}

module.exports = { processJob, handleDeploy, handleRollback };
