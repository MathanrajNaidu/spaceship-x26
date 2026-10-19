import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { errorHandler } from '../../src/http/errors/errorHandler.js';
import { noopLogger } from '../../src/http/logging.js';
import { requestId } from '../../src/http/middleware/requestId.js';
import { resolveActor } from '../../src/http/middleware/resolveActor.js';
import { CrewLead } from '../../src/domain/crew/CrewLead.js';
import { CrewRoster } from '../../src/domain/crew/CrewRoster.js';
import { Passenger } from '../../src/domain/passenger/Passenger.js';
import { MembershipTier } from '../../src/domain/tier/MembershipTier.js';
import { RosterActorResolver } from '../../src/infrastructure/auth/RosterActorResolver.js';
import { InMemoryPassengerRepository } from '../../src/infrastructure/persistence/in-memory/InMemoryPassengerRepository.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

async function build() {
  const passengers = new InMemoryPassengerRepository();
  const active = Passenger.create({
    id: 'pas-jonah',
    name: 'Jonah Hale',
    tier: MembershipTier.SILVER,
    now: NOW,
  });
  const inactive = Passenger.create({
    id: 'pas-old',
    name: 'Old Timer',
    tier: MembershipTier.GOLD,
    now: NOW,
  });
  inactive.deactivate(NOW);
  await passengers.save(active);
  await passengers.save(inactive);
  const roster = CrewRoster.of([
    CrewLead.create('crew-ada', 'Ada Okonkwo'),
    CrewLead.create('crew-bao', 'Bao Chen'),
    CrewLead.create('crew-mira', 'Mira Santos'),
  ]);
  const app = express();
  app.use(requestId);
  app.use(resolveActor(new RosterActorResolver(roster, passengers)));
  app.get('/who', (req, res) => {
    res.json({ id: req.actor?.id, role: req.actor?.role, name: req.actor?.name });
  });
  app.use(errorHandler(noopLogger));
  return app;
}

describe('actor resolution', () => {
  it('resolves a crew lead and an active passenger', async () => {
    const app = await build();
    const lead = await request(app).get('/who').set('X-Actor-Id', 'crew-ada');
    expect(lead.status).toBe(200);
    expect(lead.body).toEqual({ id: 'crew-ada', role: 'CREW_LEAD', name: 'Ada Okonkwo' });

    const passenger = await request(app).get('/who').set('X-Actor-Id', 'pas-jonah');
    expect(passenger.body).toEqual({ id: 'pas-jonah', role: 'PASSENGER', name: 'Jonah Hale' });
  });

  it('rejects a missing, blank, unknown or inactive actor', async () => {
    const app = await build();
    for (const header of [undefined, '   ', 'nobody', 'pas-old']) {
      const call = request(app).get('/who');
      const response = header === undefined ? await call : await call.set('X-Actor-Id', header);
      expect(response.status).toBe(401);
      expect((response.body as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
    }
  });
});
