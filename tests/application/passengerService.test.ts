import { describe, expect, it } from 'vitest';

import { Authorizer } from '../../src/application/auth/Authorizer.js';
import type { Actor } from '../../src/application/auth/Actor.js';
import { PassengerService } from '../../src/application/services/PassengerService.js';
import { AuthorizationError } from '../../src/domain/errors/AuthorizationError.js';
import { PassengerNotFoundError } from '../../src/domain/errors/NotFoundError.js';
import { InvalidTierError } from '../../src/domain/errors/ValidationError.js';
import { PassengerInactiveError } from '../../src/domain/errors/ConflictError.js';
import { KeyedMutex } from '../../src/application/concurrency/KeyedMutex.js';
import { InProcessEventBus } from '../../src/infrastructure/events/InProcessEventBus.js';
import { InMemoryPassengerRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryPassengerRepository.js';
import { InMemoryResourceRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryResourceRepository.js';
import { InMemoryUsageSessionRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryUsageSessionRepository.js';
import { FakeClock } from '../support/FakeClock.js';
import { SequentialIdGenerator } from '../support/SequentialIdGenerator.js';

const crew: Actor = { id: 'crew-ada', role: 'CREW_LEAD', name: 'Ada Okonkwo' };
const passengerActor: Actor = { id: 'pas-1', role: 'PASSENGER', name: 'Jonah Hale' };

function service() {
  const clock = new FakeClock(new Date('2026-04-01T00:00:00.000Z'));
  const passengers = new InMemoryPassengerRepository();
  const ids = new SequentialIdGenerator();
  const events = new InProcessEventBus();
  const passengerService = new PassengerService(
    new Authorizer(),
    passengers,
    ids,
    clock,
    events,
    new InMemoryUsageSessionRepository(),
    new InMemoryResourceRepository(),
    new KeyedMutex(),
  );
  return { clock, passengers, passengerService };
}

describe('Authorizer', () => {
  const authorizer = new Authorizer();

  it('accepts the matching role and rejects the other', () => {
    expect(authorizer.requireCrewLead(crew)).toBe(crew);
    expect(authorizer.requirePassenger(passengerActor)).toBe(passengerActor);
    expect(() => authorizer.requireCrewLead(passengerActor)).toThrow(AuthorizationError);
    expect(() => authorizer.requirePassenger(crew)).toThrow(AuthorizationError);
  });
});

describe('PassengerService', () => {
  it('lets a crew lead create, read, rename and list passengers', async () => {
    const { passengerService, clock } = service();
    const created = await passengerService.create(crew, { name: '  Jonah Hale  ', tier: 'SILVER' });
    expect(created.id).toBe('pas-1');
    expect(created.name).toBe('Jonah Hale');
    expect(created.tier.name).toBe('SILVER');
    expect(created.createdAt.toISOString()).toBe('2026-04-01T00:00:00.000Z');

    clock.advance(1_000);
    const renamed = await passengerService.updateName(crew, created.id, 'Jonah Hale Jr');
    expect(renamed.name).toBe('Jonah Hale Jr');
    expect(renamed.updatedAt.toISOString()).toBe('2026-04-01T00:00:01.000Z');

    await passengerService.create(crew, { name: 'Priya Nair', tier: 'GOLD' });
    const page = await passengerService.list(crew, { limit: 1, offset: 1 });
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.name)).toEqual(['Priya Nair']);

    const gold = await passengerService.list(crew, {
      tier: 'GOLD',
      status: 'ACTIVE',
      limit: 10,
      offset: 0,
    });
    expect(gold.items.map((item) => item.id)).toEqual(['pas-2']);
    expect(await passengerService.get(crew, 'pas-2')).toMatchObject({ name: 'Priya Nair' });
  });

  it('rejects an unknown tier and a missing passenger', async () => {
    const { passengerService } = service();
    await expect(
      passengerService.create(crew, { name: 'Jonah', tier: 'DIAMOND' }),
    ).rejects.toBeInstanceOf(InvalidTierError);
    await expect(passengerService.get(crew, 'missing')).rejects.toBeInstanceOf(
      PassengerNotFoundError,
    );
    await expect(passengerService.updateName(crew, 'missing', 'Nope')).rejects.toBeInstanceOf(
      PassengerNotFoundError,
    );
  });

  it('refuses passenger callers on crew operations and crew callers on /me', async () => {
    const { passengerService } = service();
    await expect(
      passengerService.create(passengerActor, { name: 'Jonah', tier: 'SILVER' }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      passengerService.list(passengerActor, { limit: 10, offset: 0 }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(passengerService.getOwn(crew)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('returns the caller profile and refuses to rename an inactive passenger', async () => {
    const { passengerService, passengers, clock } = service();
    const created = await passengerService.create(crew, { name: 'Jonah Hale', tier: 'SILVER' });
    const actor: Actor = { id: created.id, role: 'PASSENGER', name: created.name };
    expect((await passengerService.getOwn(actor)).id).toBe(created.id);

    const stored = await passengers.findById(created.id);
    stored?.deactivate(clock.now());
    if (!stored) {
      throw new Error('expected passenger');
    }
    await passengers.save(stored);
    await expect(passengerService.updateName(crew, created.id, 'New')).rejects.toBeInstanceOf(
      PassengerInactiveError,
    );
    await expect(passengerService.getOwn(actor)).resolves.toMatchObject({ status: 'INACTIVE' });
  });

  it('returns not found when the authenticated passenger record is gone', async () => {
    const { passengerService } = service();
    await expect(passengerService.getOwn(passengerActor)).rejects.toBeInstanceOf(
      PassengerNotFoundError,
    );
  });
});
