import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { buildTestApp, CREW } from '../support/buildTestApp.js';

interface PassengerBody {
  passenger: {
    id: string;
    name: string;
    tier: string;
    status: string;
  };
}

interface ErrorBody {
  error: { code: string; message: string; details?: { issues?: { path: string }[] } };
}

describe('level 1 HTTP', () => {
  it('lets a crew lead manage passengers and blocks the wrong role', async () => {
    const { app } = buildTestApp();
    const created = await request(app)
      .post('/api/v1/passengers')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: '  Jonah Hale  ', tier: 'SILVER' });
    expect(created.status).toBe(201);
    expect(created.headers.location).toBe('/api/v1/passengers/pas-1');
    const body = created.body as PassengerBody;
    expect(body.passenger).toMatchObject({
      id: 'pas-1',
      name: 'Jonah Hale',
      tier: 'SILVER',
      status: 'ACTIVE',
    });

    const forbidden = await request(app)
      .post('/api/v1/passengers')
      .set('X-Actor-Id', 'pas-1')
      .send({ name: 'Priya', tier: 'GOLD' });
    expect(forbidden.status).toBe(403);
    expect((forbidden.body as ErrorBody).error.code).toBe('FORBIDDEN');

    const invalidTier = await request(app)
      .post('/api/v1/passengers')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Priya', tier: 'DIAMOND' });
    expect(invalidTier.status).toBe(400);
    expect((invalidTier.body as ErrorBody).error.code).toBe('INVALID_TIER');

    const missingName = await request(app)
      .post('/api/v1/passengers')
      .set('X-Actor-Id', CREW.ada)
      .send({ tier: 'GOLD' });
    expect(missingName.status).toBe(400);
    expect((missingName.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
    expect((missingName.body as ErrorBody).error.details?.issues?.[0]?.path).toBe('name');

    const extra = await request(app)
      .post('/api/v1/passengers')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Priya', tier: 'GOLD', nickname: 'P' });
    expect(extra.status).toBe(400);

    await request(app)
      .post('/api/v1/passengers')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Priya Nair', tier: 'GOLD' });

    const renamed = await request(app)
      .patch('/api/v1/passengers/pas-1')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Jonah Hale Jr' });
    expect(renamed.status).toBe(200);
    expect((renamed.body as PassengerBody).passenger.name).toBe('Jonah Hale Jr');

    const missing = await request(app)
      .get('/api/v1/passengers/missing')
      .set('X-Actor-Id', CREW.ada);
    expect(missing.status).toBe(404);
    expect((missing.body as ErrorBody).error.code).toBe('PASSENGER_NOT_FOUND');

    const listed = await request(app)
      .get('/api/v1/passengers')
      .query({ tier: 'GOLD', status: 'ACTIVE', limit: 10, offset: 0 })
      .set('X-Actor-Id', CREW.ada);
    expect(listed.status).toBe(200);
    expect(
      (listed.body as { data: { id: string }[]; page: { total: number } }).data.map(
        (item) => item.id,
      ),
    ).toEqual(['pas-2']);

    const badPage = await request(app)
      .get('/api/v1/passengers')
      .query({ limit: 201 })
      .set('X-Actor-Id', CREW.ada);
    expect(badPage.status).toBe(400);

    const profile = await request(app).get('/api/v1/me').set('X-Actor-Id', 'pas-1');
    expect(profile.status).toBe(200);
    expect((profile.body as PassengerBody).passenger.name).toBe('Jonah Hale Jr');

    const crewOnMe = await request(app).get('/api/v1/me').set('X-Actor-Id', CREW.ada);
    expect(crewOnMe.status).toBe(403);

    const leads = await request(app).get('/api/v1/crew-leads').set('X-Actor-Id', CREW.ada);
    expect(leads.status).toBe(200);
    expect(leads.body).toEqual({
      data: [
        { id: 'crew-ada', name: 'Ada Okonkwo' },
        { id: 'crew-bao', name: 'Bao Chen' },
        { id: 'crew-mira', name: 'Mira Santos' },
      ],
    });
    const passengerLeads = await request(app).get('/api/v1/crew-leads').set('X-Actor-Id', 'pas-1');
    expect(passengerLeads.status).toBe(403);
  });

  it('provisions resources and discovers only what the passenger tier allows', async () => {
    const { app, resources, clock } = buildTestApp();
    const food = await request(app)
      .post('/api/v1/resources')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Food Station Alpha', type: 'FOOD_STATION', capacity: 8 });
    expect(food.status).toBe(201);
    expect(food.headers.location).toBe('/api/v1/resources/res-1');

    const override = await request(app)
      .post('/api/v1/resources')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Officers Gym', type: 'FITNESS_CENTER', capacity: 2, minimumTier: 'PLATINUM' });
    expect(override.status).toBe(201);
    expect((override.body as { resource: { minimumTier: string } }).resource.minimumTier).toBe(
      'PLATINUM',
    );

    await request(app)
      .post('/api/v1/resources')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Private Cabin 1', type: 'PRIVATE_CABIN', capacity: 1 });
    const hygiene = await request(app)
      .post('/api/v1/resources')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Hygiene Pod', type: 'BASIC_HYGIENE', capacity: 3 });
    const hygieneId = (hygiene.body as { resource: { id: string } }).resource.id;
    const stored = await resources.findById(hygieneId);
    stored?.decommission(clock.now());
    if (!stored) {
      throw new Error('expected hygiene pod');
    }
    await resources.save(stored);

    for (const [capacity, code] of [
      [0, 'INVALID_CAPACITY'],
      [-3, 'INVALID_CAPACITY'],
      [1.5, 'INVALID_CAPACITY'],
    ] as const) {
      const response = await request(app)
        .post('/api/v1/resources')
        .set('X-Actor-Id', CREW.ada)
        .send({ name: 'Bad', type: 'FOOD_STATION', capacity });
      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error.code).toBe(code);
    }

    const missingCapacity = await request(app)
      .post('/api/v1/resources')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Bad', type: 'FOOD_STATION' });
    expect(missingCapacity.status).toBe(400);
    expect((missingCapacity.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');

    const unknownType = await request(app)
      .post('/api/v1/resources')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Warp', type: 'WARP_DRIVE', capacity: 1 });
    expect(unknownType.status).toBe(400);
    expect((unknownType.body as ErrorBody).error.code).toBe('INVALID_RESOURCE_TYPE');

    const details = await request(app).get('/api/v1/resources/res-1').set('X-Actor-Id', CREW.ada);
    expect(details.status).toBe(200);
    expect((details.body as { occupancy: { availableSlots: number } }).occupancy).toEqual({
      active: 0,
      capacity: 8,
      availableSlots: 8,
    });

    const missingResource = await request(app)
      .get('/api/v1/resources/missing')
      .set('X-Actor-Id', CREW.ada);
    expect(missingResource.status).toBe(404);

    await request(app)
      .post('/api/v1/passengers')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Jonah Hale', tier: 'SILVER' });
    await request(app)
      .post('/api/v1/passengers')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Elena Voss', tier: 'PLATINUM' });

    const silver = await request(app).get('/api/v1/me/resources').set('X-Actor-Id', 'pas-1');
    expect(silver.status).toBe(200);
    const silverNames = (
      silver.body as { data: { name: string; availableSlots: number }[] }
    ).data.map((item) => item.name);
    expect(silverNames).toEqual(['Food Station Alpha']);
    expect((silver.body as { data: { availableSlots: number }[] }).data[0]?.availableSlots).toBe(8);

    const platinum = await request(app).get('/api/v1/me/resources').set('X-Actor-Id', 'pas-2');
    const platinumNames = (platinum.body as { data: { name: string }[] }).data.map(
      (item) => item.name,
    );
    expect(platinumNames).toEqual(['Food Station Alpha', 'Officers Gym', 'Private Cabin 1']);
    expect(platinumNames).not.toContain('Hygiene Pod');

    const empty = await request(app)
      .get('/api/v1/me/resources')
      .set('X-Actor-Id', 'pas-1')
      .query({ limit: 10, offset: 20 });
    expect((empty.body as { data: unknown[] }).data).toEqual([]);

    const crewDiscover = await request(app).get('/api/v1/me/resources').set('X-Actor-Id', CREW.ada);
    expect(crewDiscover.status).toBe(403);
  });
});
