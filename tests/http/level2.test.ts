import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { buildTestApp, CREW } from '../support/buildTestApp.js';

interface ErrorBody {
  error: { code: string; message: string };
}

interface SessionBody {
  session: { id: string; endReason: string | null; tierAtStart: string };
}

describe('level 2 HTTP', () => {
  it('starts, denies, ends and audits resource use', async () => {
    const { app } = buildTestApp();
    const food = await request(app)
      .post('/api/v1/resources')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Food Station Alpha', type: 'FOOD_STATION', capacity: 1 });
    const luxury = await request(app)
      .post('/api/v1/resources')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Luxury O2 Pod A', type: 'LUXURY_O2_POD', capacity: 1 });
    const jonah = await request(app)
      .post('/api/v1/passengers')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Jonah Hale', tier: 'SILVER' });
    const elena = await request(app)
      .post('/api/v1/passengers')
      .set('X-Actor-Id', CREW.bao)
      .send({ name: 'Elena Voss', tier: 'PLATINUM' });
    const foodId = (food.body as { resource: { id: string } }).resource.id;
    const luxuryId = (luxury.body as { resource: { id: string } }).resource.id;
    const jonahId = (jonah.body as { passenger: { id: string } }).passenger.id;
    const elenaId = (elena.body as { passenger: { id: string } }).passenger.id;

    const denied = await request(app)
      .post('/api/v1/me/sessions')
      .set('X-Actor-Id', jonahId)
      .send({ resourceId: luxuryId });
    expect(denied.status).toBe(403);
    expect((denied.body as ErrorBody).error.code).toBe('TIER_ACCESS_DENIED');

    const started = await request(app)
      .post('/api/v1/me/sessions')
      .set('X-Actor-Id', jonahId)
      .send({ resourceId: foodId });
    expect(started.status).toBe(201);
    expect(started.headers.location).toBe('/api/v1/me/sessions/ses-1');
    const sessionId = (started.body as SessionBody).session.id;

    const duplicate = await request(app)
      .post('/api/v1/me/sessions')
      .set('X-Actor-Id', jonahId)
      .send({ resourceId: foodId });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as ErrorBody).error.code).toBe('SESSION_ALREADY_ACTIVE');

    const full = await request(app)
      .post('/api/v1/me/sessions')
      .set('X-Actor-Id', elenaId)
      .send({ resourceId: foodId });
    expect((full.body as ErrorBody).error.code).toBe('CAPACITY_EXCEEDED');

    const mine = await request(app)
      .get('/api/v1/me/sessions?status=active')
      .set('X-Actor-Id', jonahId);
    expect(mine.status).toBe(200);
    expect((mine.body as { data: { id: string }[] }).data).toHaveLength(1);

    const crewBlocked = await request(app)
      .post('/api/v1/me/sessions')
      .set('X-Actor-Id', CREW.ada)
      .send({ resourceId: foodId });
    expect(crewBlocked.status).toBe(403);

    const endedByCrew = await request(app)
      .post(`/api/v1/sessions/${sessionId}/end`)
      .set('X-Actor-Id', CREW.mira);
    expect(endedByCrew.status).toBe(200);
    expect((endedByCrew.body as SessionBody).session.endReason).toBe('CREW_ENDED');

    const again = await request(app)
      .post(`/api/v1/me/sessions/${sessionId}/end`)
      .set('X-Actor-Id', jonahId);
    expect(again.status).toBe(409);

    const hidden = await request(app)
      .post(`/api/v1/me/sessions/${sessionId}/end`)
      .set('X-Actor-Id', elenaId);
    expect(hidden.status).toBe(404);

    const audit = await request(app)
      .get('/api/v1/audit-log?outcome=DENIED&action=UsageDenied')
      .set('X-Actor-Id', CREW.ada);
    expect(audit.status).toBe(200);
    expect((audit.body as { page: { total: number } }).page.total).toBeGreaterThanOrEqual(1);
    const passengerAudit = await request(app).get('/api/v1/audit-log').set('X-Actor-Id', jonahId);
    expect(passengerAudit.status).toBe(403);
    const badRange = await request(app)
      .get('/api/v1/audit-log?from=2026-06-02T00:00:00.000Z&to=2026-06-01T00:00:00.000Z')
      .set('X-Actor-Id', CREW.ada);
    expect(badRange.status).toBe(400);
    expect((badRange.body as ErrorBody).error.code).toBe('INVALID_TIME_RANGE');
  });

  it('downgrades a tier, deactivates a passenger and decommissions a free resource', async () => {
    const { app } = buildTestApp();
    const cabin = await request(app)
      .post('/api/v1/resources')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Private Cabin 1', type: 'PRIVATE_CABIN', capacity: 1 });
    const food = await request(app)
      .post('/api/v1/resources')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Food Station Alpha', type: 'FOOD_STATION', capacity: 1 });
    const elena = await request(app)
      .post('/api/v1/passengers')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Elena Voss', tier: 'PLATINUM' });
    const cabinId = (cabin.body as { resource: { id: string } }).resource.id;
    const foodId = (food.body as { resource: { id: string } }).resource.id;
    const elenaId = (elena.body as { passenger: { id: string } }).passenger.id;

    await request(app)
      .post('/api/v1/me/sessions')
      .set('X-Actor-Id', elenaId)
      .send({ resourceId: cabinId });
    await request(app)
      .post('/api/v1/me/sessions')
      .set('X-Actor-Id', elenaId)
      .send({ resourceId: foodId });

    const same = await request(app)
      .put(`/api/v1/passengers/${elenaId}/tier`)
      .set('X-Actor-Id', CREW.ada)
      .send({ tier: 'PLATINUM' });
    expect(same.status).toBe(409);

    const downgrade = await request(app)
      .put(`/api/v1/passengers/${elenaId}/tier`)
      .set('X-Actor-Id', CREW.ada)
      .send({ tier: 'SILVER' });
    expect(downgrade.status).toBe(200);
    const ended = (downgrade.body as { endedSessions: { resourceId: string; endReason: string }[] })
      .endedSessions;
    expect(ended).toEqual([
      expect.objectContaining({ resourceId: cabinId, endReason: 'TIER_DOWNGRADED' }),
    ]);

    const inUse = await request(app)
      .post(`/api/v1/resources/${foodId}/decommission`)
      .set('X-Actor-Id', CREW.ada);
    expect(inUse.status).toBe(409);
    expect((inUse.body as ErrorBody).error.code).toBe('RESOURCE_IN_USE');

    const deactivated = await request(app)
      .post(`/api/v1/passengers/${elenaId}/deactivate`)
      .set('X-Actor-Id', CREW.bao);
    expect(deactivated.status).toBe(200);
    expect((deactivated.body as { passenger: { status: string } }).passenger.status).toBe(
      'INACTIVE',
    );

    const retired = await request(app)
      .post(`/api/v1/resources/${foodId}/decommission`)
      .set('X-Actor-Id', CREW.mira);
    expect(retired.status).toBe(200);
    expect((retired.body as { resource: { status: string } }).resource.status).toBe(
      'DECOMMISSIONED',
    );

    const gone = await request(app).get('/api/v1/me').set('X-Actor-Id', elenaId);
    expect(gone.status).toBe(401);
  });
});
