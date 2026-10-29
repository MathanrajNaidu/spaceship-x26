import type { Express } from 'express';

import { Authorizer } from './application/auth/Authorizer.js';
import { KeyedMutex } from './application/concurrency/KeyedMutex.js';
import type { AuditLogRepository } from './application/ports/AuditLogRepository.js';
import type { PassengerRepository } from './application/ports/PassengerRepository.js';
import type { ResourceRepository } from './application/ports/ResourceRepository.js';
import type { UsageSessionRepository } from './application/ports/UsageSessionRepository.js';
import { CrewLeadQuery } from './application/services/CrewLeadQuery.js';
import { AuditService } from './application/services/AuditService.js';
import { PassengerService } from './application/services/PassengerService.js';
import { ReportingService } from './application/services/ReportingService.js';
import { ResourceService } from './application/services/ResourceService.js';
import { UsageService } from './application/services/UsageService.js';
import { AuditLogSubscriber } from './application/subscribers/AuditLogSubscriber.js';
import { TierAccessPolicy } from './domain/access/TierAccessPolicy.js';
import { CrewLead } from './domain/crew/CrewLead.js';
import { CrewRoster } from './domain/crew/CrewRoster.js';
import { createApp } from './http/app.js';
import { InProcessEventBus } from './infrastructure/events/InProcessEventBus.js';
import { RosterActorResolver } from './infrastructure/auth/RosterActorResolver.js';
import { loadConfig, type AppConfig } from './infrastructure/config/env.js';
import { UuidGenerator } from './infrastructure/ids/UuidGenerator.js';
import { InMemoryAuditLogRepository } from './infrastructure/persistence/in-memory/InMemoryAuditLogRepository.js';
import { InMemoryPassengerRepository } from './infrastructure/persistence/in-memory/InMemoryPassengerRepository.js';
import { InMemoryResourceRepository } from './infrastructure/persistence/in-memory/InMemoryResourceRepository.js';
import { InMemoryUsageSessionRepository } from './infrastructure/persistence/in-memory/InMemoryUsageSessionRepository.js';
import { openSqliteDatabase } from './infrastructure/persistence/sqlite/openSqliteDatabase.js';
import { SqliteAuditLogRepository } from './infrastructure/persistence/sqlite/SqliteAuditLogRepository.js';
import { SqlitePassengerRepository } from './infrastructure/persistence/sqlite/SqlitePassengerRepository.js';
import { SqliteResourceRepository } from './infrastructure/persistence/sqlite/SqliteResourceRepository.js';
import { SqliteUsageSessionRepository } from './infrastructure/persistence/sqlite/SqliteUsageSessionRepository.js';
import { DEFAULT_CREW_LEADS } from './infrastructure/seed/missionSeed.js';
import { seedMission } from './infrastructure/seed/seedMission.js';
import { createLogger } from './infrastructure/logging/createLogger.js';
import { SystemClock } from './infrastructure/time/SystemClock.js';

export interface ApplicationRuntime {
  app: Express;
  config: AppConfig;
  roster: CrewRoster;
}

export async function buildApplication(env: NodeJS.ProcessEnv): Promise<ApplicationRuntime> {
  const config = loadConfig(env, DEFAULT_CREW_LEADS);
  const roster = CrewRoster.of(config.crewLeads.map((lead) => CrewLead.create(lead.id, lead.name)));

  let passengers: PassengerRepository;
  let resources: ResourceRepository;
  let sessions: UsageSessionRepository;
  let auditLog: AuditLogRepository;
  let shouldSeed = true;

  if (config.storage === 'sqlite') {
    const sqlite = openSqliteDatabase(config.sqlitePath);
    passengers = new SqlitePassengerRepository(sqlite.db);
    resources = new SqliteResourceRepository(sqlite.db);
    sessions = new SqliteUsageSessionRepository(sqlite.db);
    auditLog = new SqliteAuditLogRepository(sqlite.db);
    shouldSeed = sqlite.isEmpty();
  } else {
    passengers = new InMemoryPassengerRepository();
    resources = new InMemoryResourceRepository();
    sessions = new InMemoryUsageSessionRepository();
    auditLog = new InMemoryAuditLogRepository();
  }

  const authorizer = new Authorizer();
  const clock = new SystemClock();
  const ids = new UuidGenerator();
  const events = new InProcessEventBus();
  events.subscribe(new AuditLogSubscriber(auditLog, ids));
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
  const usageService = new UsageService(
    authorizer,
    passengers,
    resources,
    sessions,
    new TierAccessPolicy(),
    ids,
    clock,
    mutex,
    events,
  );
  const auditService = new AuditService(authorizer, auditLog);
  const reportingService = new ReportingService(
    authorizer,
    passengers,
    resources,
    sessions,
    clock,
    auditLog,
    config.demand,
  );
  const resourceService = new ResourceService(
    authorizer,
    resources,
    passengers,
    ids,
    clock,
    events,
    sessions,
    mutex,
  );
  const lead = roster.leads[0];
  if (shouldSeed) {
    await seedMission({
      lead,
      passengerService,
      resourceService,
      seedDemoPassengers: config.seedDemoPassengers,
    });
  }
  const app = createApp({
    actorResolver: new RosterActorResolver(roster, passengers),
    passengerService,
    resourceService,
    usageService,
    auditService,
    reportingService,
    crewLeadQuery: new CrewLeadQuery(roster, authorizer),
    logger: createLogger(config.logLevel),
  });
  return { app, config, roster };
}
