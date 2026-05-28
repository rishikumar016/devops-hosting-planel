const IORedis = require('ioredis');

function buildRedisOptions() {
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

function createConnection() {
  const conn = new IORedis(buildRedisOptions());
  conn.on('error', (err) => console.error('[redis] error:', err.message));
  return conn;
}

module.exports = { createConnection, buildRedisOptions };
