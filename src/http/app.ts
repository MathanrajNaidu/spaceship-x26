import express, { type Express } from 'express';

import type { ActorResolver } from '../application/ports/ActorResolver.js';
import type { CrewLeadQuery } from '../application/services/CrewLeadQuery.js';
import type { PassengerService } from '../application/services/PassengerService.js';
import type { ResourceService } from '../application/services/ResourceService.js';
import { crewController } from './controllers/crew.controller.js';
import { passengerController } from './controllers/passenger.controller.js';
import { resourceController } from './controllers/resource.controller.js';
import { errorHandler } from './errors/errorHandler.js';
import './httpTypes.js';
import { noopLogger, type ErrorLogger } from './logging.js';
import { notFound } from './middleware/notFound.js';
import { requestId } from './middleware/requestId.js';
import { resolveActor } from './middleware/resolveActor.js';

export interface AppDependencies {
  actorResolver: ActorResolver;
  passengerService: PassengerService;
  resourceService: ResourceService;
  crewLeadQuery: CrewLeadQuery;
  logger?: ErrorLogger;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(express.json({ limit: '100kb' }));

  const auth = resolveActor(deps.actorResolver);
  const passengers = passengerController(deps.passengerService);
  const resources = resourceController(deps.resourceService);
  const crew = crewController(deps.crewLeadQuery);

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.get('/api/v1/crew-leads', auth, crew.list);
  app.post('/api/v1/passengers', auth, passengers.create);
  app.get('/api/v1/passengers', auth, passengers.list);
  app.get('/api/v1/passengers/:id', auth, passengers.get);
  app.patch('/api/v1/passengers/:id', auth, passengers.update);
  app.post('/api/v1/resources', auth, resources.provision);
  app.get('/api/v1/resources', auth, resources.list);
  app.get('/api/v1/resources/:id', auth, resources.get);
  app.get('/api/v1/me', auth, passengers.me);
  app.get('/api/v1/me/resources', auth, resources.discover);

  app.use(notFound);
  app.use(errorHandler(deps.logger ?? noopLogger));
  return app;
}
