const { createConnection } = require('./config/redis');

const CHANNEL = 'deployment-events';

function createPublisher() {
  const pub = createConnection();
  return {
    async publish(event) {
      try {
        await pub.publish(CHANNEL, JSON.stringify(event));
      } catch (err) {
        console.error('[eventBus] publish failed:', err.message);
      }
    },
    async close() {
      try {
        await pub.quit();
      } catch {
        pub.disconnect();
      }
    },
  };
}

function createSubscriber(onEvent) {
  const sub = createConnection();
  sub.subscribe(CHANNEL, (err) => {
    if (err) console.error('[eventBus] subscribe failed:', err.message);
    else console.log(`[eventBus] subscribed to ${CHANNEL}`);
  });
  sub.on('message', (_channel, payload) => {
    try {
      const event = JSON.parse(payload);
      onEvent(event);
    } catch (err) {
      console.error('[eventBus] bad payload:', err.message);
    }
  });
  return {
    async close() {
      try {
        await sub.unsubscribe(CHANNEL);
        await sub.quit();
      } catch {
        sub.disconnect();
      }
    },
  };
}

module.exports = { CHANNEL, createPublisher, createSubscriber };
