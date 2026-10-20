import type { Express } from 'express';

import { Authorizer } from './application/auth/Authorizer.js';
import { CrewLeadQuery } from './application/services/CrewLeadQuery.js';
import { PassengerService } from './application/services/PassengerService.js';
import { ResourceService } from './application/services/ResourceService.js';
import { CrewLead } from './domain/crew/CrewLead.js';
import { CrewRoster } from './domain/crew/CrewRoster.js';
import { createApp } from './http/app.js';
import { RosterActorResolver } from './infrastructure/auth/RosterActorResolver.js';
import { loadConfig, type AppConfig } from './infrastructure/config/env.js';
import { UuidGenerator } from './infrastructure/ids/UuidGenerator.js';
import { InMemoryPassengerRepository } from './infrastructure/persistence/in-memory/InMemoryPassengerRepository.js';
import { InMemoryResourceRepository } from './infrastructure/persistence/in-memory/InMemoryResourceRepository.js';
import { DEFAULT_CREW_LEADS } from './infrastructure/seed/missionSeed.js';
import { seedMission } from './infrastructure/seed/seedMission.js';
import { SystemClock } from './infrastructure/time/SystemClock.js';

export interface ApplicationRuntime {
  app: Express;
  config: AppConfig;
  roster: CrewRoster;
}

export async function buildApplication(env: NodeJS.ProcessEnv): Promise<ApplicationRuntime> {
  const config = loadConfig(env, DEFAULT_CREW_LEADS);
  const roster = CrewRoster.of(config.crewLeads.map((lead) => CrewLead.create(lead.id, lead.name)));
  const passengers = new InMemoryPassengerRepository();
  const resources = new InMemoryResourceRepository();
  const authorizer = new Authorizer();
  const clock = new SystemClock();
  const ids = new UuidGenerator();
  const passengerService = new PassengerService(authorizer, passengers, ids, clock);
  const resourceService = new ResourceService(authorizer, resources, passengers, ids, clock);
  const lead = roster.leads[0];
  await seedMission({
    lead,
    passengerService,
    resourceService,
    seedDemoPassengers: config.seedDemoPassengers,
  });
  const app = createApp({
    actorResolver: new RosterActorResolver(roster, passengers),
    passengerService,
    resourceService,
    crewLeadQuery: new CrewLeadQuery(roster, authorizer),
  });
  return { app, config, roster };
}
