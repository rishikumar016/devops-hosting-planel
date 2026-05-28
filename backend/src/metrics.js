const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'hcp_' });

const jobDuration = new client.Histogram({
  name: 'hcp_deployment_job_duration_seconds',
  help: 'Deployment job duration in seconds, labeled by outcome and job type',
  labelNames: ['outcome', 'job_type'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

const jobsTotal = new client.Counter({
  name: 'hcp_deployment_jobs_total',
  help: 'Total number of deployment jobs processed',
  labelNames: ['outcome', 'job_type'],
  registers: [register],
});

const jobFailuresTotal = new client.Counter({
  name: 'hcp_deployment_job_failures_total',
  help: 'Deployment job failures by stage',
  labelNames: ['stage', 'job_type'],
  registers: [register],
});

const queueDepth = new client.Gauge({
  name: 'hcp_queue_depth',
  help: 'BullMQ queue depth by job state',
  labelNames: ['state'],
  registers: [register],
});

const deploymentsByStatus = new client.Gauge({
  name: 'hcp_deployments_by_status',
  help: 'Count of Deployment documents grouped by status',
  labelNames: ['status'],
  registers: [register],
});

module.exports = {
  register,
  client,
  jobDuration,
  jobsTotal,
  jobFailuresTotal,
  queueDepth,
  deploymentsByStatus,
};
