const { Queue } = require('bullmq');
const { createConnection } = require('./config/redis');

const QUEUE_NAME = 'deployments';

const connection = createConnection();

const deploymentQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 24 * 3600, count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

async function enqueueDeploy(deploymentId) {
  return deploymentQueue.add(
    'deploy',
    { deploymentId: String(deploymentId) },
    { jobId: `deploy-${deploymentId}` }
  );
}

async function enqueueRollback(deploymentId) {
  return deploymentQueue.add(
    'rollback',
    { deploymentId: String(deploymentId) },
    { jobId: `rollback-${deploymentId}-${Date.now()}` }
  );
}

module.exports = { deploymentQueue, enqueueDeploy, enqueueRollback, QUEUE_NAME };
