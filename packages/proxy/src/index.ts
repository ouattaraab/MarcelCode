import { createApp } from './app';
import { env, logger, disconnectPrisma, disconnectRedis } from './config';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Marcel'IA Proxy running on port ${env.PORT} [${env.NODE_ENV}]`);
});

async function shutdown() {
  logger.info('Shutting down gracefully...');
  server.close(async () => {
    await disconnectPrisma();
    await disconnectRedis();
    logger.info('Server stopped');
    process.exit(0);
  });

  // Force shutdown after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
