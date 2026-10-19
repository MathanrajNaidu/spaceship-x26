import express, { type Express } from 'express';

import { errorHandler } from './errors/errorHandler.js';
import './httpTypes.js';
import { noopLogger, type ErrorLogger } from './logging.js';
import { notFound } from './middleware/notFound.js';
import { requestId } from './middleware/requestId.js';

export interface AppDependencies {
  logger?: ErrorLogger;
}

export function createApp(deps: AppDependencies = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.use(notFound);
  app.use(errorHandler(deps.logger ?? noopLogger));
  return app;
}
