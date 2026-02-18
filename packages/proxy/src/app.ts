import express from 'express';
import cors from 'cors';
import { env, logger } from './config';
import { requestLogger } from './middleware/request-logger';
import { healthRoutes } from './routes/health.routes';
import { chatRoutes } from './routes/chat.routes';
import { completionRoutes } from './routes/completion.routes';
import { reviewRoutes } from './routes/review.routes';
import { adminRoutes } from './routes/admin.routes';
import { authMiddleware } from './middleware/auth';
import { rateLimiter } from './middleware/rate-limiter';
import { quotaGuard } from './middleware/quota-guard';
import { piiScanner } from './middleware/pii-scanner';
import { errorHandler } from './middleware/error-handler';
import { pluginRegistry } from './plugin';

export function createApp() {
  const app = express();

  // Base middleware
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  // Health checks (no auth)
  app.use('/', healthRoutes);

  // API routes with full middleware pipeline
  const apiRouter = express.Router();
  apiRouter.use(authMiddleware);
  apiRouter.use(rateLimiter);
  apiRouter.use(quotaGuard);
  apiRouter.use(piiScanner);

  // Plugin middleware (after security pipeline)
  pluginRegistry.applyMiddleware(apiRouter);

  apiRouter.use('/chat', chatRoutes);
  apiRouter.use('/completion', completionRoutes);
  apiRouter.use('/review', reviewRoutes);

  // Plugin routes (after built-in routes)
  pluginRegistry.applyRoutes(apiRouter);

  app.use('/api/v1', apiRouter);

  // Admin routes (auth + admin role required)
  app.use('/api/v1/admin', authMiddleware, adminRoutes);

  // Error handler
  app.use(errorHandler);

  return app;
}
