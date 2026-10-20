import { describe, expect, it } from 'vitest';

import type { Actor } from '../../src/application/auth/Actor.js';
import { Authorizer } from '../../src/application/auth/Authorizer.js';
import { KeyedMutex } from '../../src/application/concurrency/KeyedMutex.js';
import { PassengerService } from '../../src/application/services/PassengerService.js';
import { ReportingService } from '../../src/application/services/ReportingService.js';
import { ResourceService } from '../../src/application/services/ResourceService.js';
import { UsageService } from '../../src/application/services/UsageService.js';
import { TierAccessPolicy } from '../../src/domain/access/TierAccessPolicy.js';
import { AuthenticationError } from '../../src/domain/errors/AuthenticationError.js';
import { AuthorizationError } from '../../src/domain/errors/AuthorizationError.js';
import { PassengerNotFoundError } from '../../src/domain/errors/NotFoundError.js';
import { InvalidTimeRangeError } from '../../src/domain/errors/ValidationError.js';
import { RESOURCE_TYPES } from '../../src/domain/resource/ResourceType.js';
import { InProcessEventBus } from '../../src/infrastructure/events/InProcessEventBus.js';
import { InMemoryPassengerRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryPassengerRepository.js';
import { InMemoryResourceRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryResourceRepository.js';
import { InMemoryUsageSessionRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryUsageSessionRepository.js';
import { FakeClock } from '../support/FakeClock.js';
import { SequentialIdGenerator } from '../support/SequentialIdGenerator.js';

const crew: Actor = { id: 'crew-ada', role: 'CREW_LEAD', name: 'Ada Okonkwo' };

function harness() {
  const clock = new FakeClock(new Date('2026-06-01T08:00:00.000Z'));
  const ids = new SequentialIdGenerator();
  const passengers = new InMemoryPassengerRepository();
  const resources = new InMemoryResourceRepository();
  const sessions = new InMemoryUsageSessionRepository();
  const events = new InProcessEventBus();
  const authorizer = new Authorizer();
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
    sessions,
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
  const reporting = new ReportingService(authorizer, passengers, resources, sessions, clock);
  return { clock, passengers, passengerService, resourceService, usageService, reporting };
}

describe('personal usage history', () => {
  it('totals every resource type and trends only the days that were used', async () => {
    const { clock, passengerService, resourceService, usageService, reporting } = harness();
    const food = await resourceService.provision(crew, {
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 2,
    });
    const pod = await resourceService.provision(crew, {
      name: 'Sleeping Pod 1',
      type: 'SLEEPING_POD',
      capacity: 1,
    });
    const jonah = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    const actor: Actor = { id: jonah.id, role: 'PASSENGER', name: jonah.name };
    const first = await usageService.startUsage(actor, food.id);
    clock.advance(60 * 60 * 1000);
    await usageService.endOwn(actor, first.id);
    clock.set(new Date('2026-06-03T09:00:00.000Z'));
    await usageService.startUsage(actor, pod.id);
    clock.advance(30 * 60 * 1000);

    const history = await reporting.ownHistory(actor, {});
    expect(history.sessions.map((session) => session.resourceId)).toEqual([pod.id, food.id]);
    const foodTotal = history.totalsByResourceType.find((total) => total.type === 'FOOD_STATION');
    const podTotal = history.totalsByResourceType.find((total) => total.type === 'SLEEPING_POD');
    expect(foodTotal).toEqual({
      type: 'FOOD_STATION',
      sessions: 1,
      totalDurationMs: 60 * 60 * 1000,
    });
    expect(podTotal).toEqual({
      type: 'SLEEPING_POD',
      sessions: 1,
      totalDurationMs: 30 * 60 * 1000,
    });
    expect(history.totalsByResourceType.map((total) => total.type)).toEqual([...RESOURCE_TYPES]);
    expect(history.daily).toEqual([
      { date: '2026-06-01', sessions: 1, totalDurationMs: 60 * 60 * 1000 },
      { date: '2026-06-03', sessions: 1, totalDurationMs: 30 * 60 * 1000 },
    ]);

    const windowed = await reporting.passengerHistory(crew, jonah.id, {
      from: new Date('2026-06-03T00:00:00.000Z'),
      to: new Date('2026-06-04T00:00:00.000Z'),
    });
    expect(windowed.sessions).toHaveLength(1);
    expect(
      windowed.totalsByResourceType.find((total) => total.type === 'FOOD_STATION')?.sessions,
    ).toBe(0);
  });

  it('rejects a reversed window, the wrong role and a missing passenger', async () => {
    const { passengerService, reporting, passengers, clock } = harness();
    const jonah = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    const actor: Actor = { id: jonah.id, role: 'PASSENGER', name: jonah.name };
    const from = new Date('2026-06-02T00:00:00.000Z');
    const to = new Date('2026-06-01T00:00:00.000Z');
    await expect(reporting.ownHistory(actor, { from, to })).rejects.toBeInstanceOf(
      InvalidTimeRangeError,
    );
    await expect(reporting.passengerHistory(actor, jonah.id, {})).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(reporting.ownHistory(crew, {})).rejects.toBeInstanceOf(AuthorizationError);
    await expect(reporting.passengerHistory(crew, 'missing', {})).rejects.toBeInstanceOf(
      PassengerNotFoundError,
    );
    const stored = await passengers.findById(jonah.id);
    stored?.deactivate(clock.now());
    if (!stored) {
      throw new Error('expected passenger');
    }
    await passengers.save(stored);
    const history = await reporting.passengerHistory(crew, jonah.id, {});
    expect(history.sessions).toEqual([]);
    expect(history.totalsByResourceType.every((total) => total.sessions === 0)).toBe(true);
    await expect(reporting.ownHistory(actor, {})).rejects.toBeInstanceOf(AuthenticationError);
  });
});
