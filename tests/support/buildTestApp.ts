import { Authorizer } from '../../src/application/auth/Authorizer.js';
import { KeyedMutex } from '../../src/application/concurrency/KeyedMutex.js';
import { CrewLeadQuery } from '../../src/application/services/CrewLeadQuery.js';
import { PassengerService } from '../../src/application/services/PassengerService.js';
import { ResourceService } from '../../src/application/services/ResourceService.js';
import { CrewLead } from '../../src/domain/crew/CrewLead.js';
import { CrewRoster } from '../../src/domain/crew/CrewRoster.js';
import { createApp } from '../../src/http/app.js';
import { InProcessEventBus } from '../../src/infrastructure/events/InProcessEventBus.js';
import { RosterActorResolver } from '../../src/infrastructure/auth/RosterActorResolver.js';
import { InMemoryPassengerRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryPassengerRepository.js';
import { InMemoryResourceRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryResourceRepository.js';
import { InMemoryUsageSessionRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryUsageSessionRepository.js';
import { FakeClock } from './FakeClock.js';
import { SequentialIdGenerator } from './SequentialIdGenerator.js';

export const CREW = {
  ada: 'crew-ada',
  bao: 'crew-bao',
  mira: 'crew-mira',
} as const;

export function buildTestApp(now = new Date('2026-06-01T00:00:00.000Z')) {
  const clock = new FakeClock(now);
  const ids = new SequentialIdGenerator();
  const passengers = new InMemoryPassengerRepository();
  const resources = new InMemoryResourceRepository();
  const authorizer = new Authorizer();
  const roster = CrewRoster.of([
    CrewLead.create(CREW.ada, 'Ada Okonkwo'),
    CrewLead.create(CREW.bao, 'Bao Chen'),
    CrewLead.create(CREW.mira, 'Mira Santos'),
  ]);
  const events = new InProcessEventBus();
  const sessions = new InMemoryUsageSessionRepository();
  const mutex = new KeyedMutex();
  const passengerService = new PassengerService(
    authorizer,
    passengers,
    ids,
    clock,
    events,
    sessions,
    resources,
    mutex,
  );
  const resourceService = new ResourceService(
    authorizer,
    resources,
    passengers,
    ids,
    clock,
    events,
  );
  const app = createApp({
    actorResolver: new RosterActorResolver(roster, passengers),
    passengerService,
    resourceService,
    crewLeadQuery: new CrewLeadQuery(roster, authorizer),
  });
  return { app, clock, ids, passengers, resources, passengerService, resourceService, roster };
}
