import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { buildTestApp, CREW } from '../support/buildTestApp.js';

interface ErrorBody {
  error: { code: string };
}

describe('mission scenario', () => {
  it('runs a voyage across passenger setup, live access control and reporting', async () => {
    const { app, clock } = buildTestApp(new Date('2026-06-01T08:00:00.000Z'));

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
    expect(food.status).toBe(201);
    const foodId = (food.body as { resource: { id: string } }).resource.id;
    const luxuryId = (luxury.body as { resource: { id: string } }).resource.id;
    const jonahId = (jonah.body as { passenger: { id: string } }).passenger.id;
    const elenaId = (elena.body as { passenger: { id: string } }).passenger.id;

    const discovered = await request(app).get('/api/v1/me/resources').set('X-Actor-Id', jonahId);
    expect(discovered.status).toBe(200);
    const names = (
      discovered.body as { data: { name: string; availableSlots: number }[] }
    ).data.map((row) => row.name);
    expect(names).toContain('Food Station Alpha');
    expect(names).not.toContain('Luxury O2 Pod A');

    const started = await request(app)
      .post('/api/v1/me/sessions')
      .set('X-Actor-Id', jonahId)
      .send({ resourceId: foodId });
    expect(started.status).toBe(201);
    const deniedTier = await request(app)
      .post('/api/v1/me/sessions')
      .set('X-Actor-Id', jonahId)
      .send({ resourceId: luxuryId });
    expect((deniedTier.body as ErrorBody).error.code).toBe('TIER_ACCESS_DENIED');
    const deniedCapacity = await request(app)
      .post('/api/v1/me/sessions')
      .set('X-Actor-Id', elenaId)
      .send({ resourceId: foodId });
    expect((deniedCapacity.body as ErrorBody).error.code).toBe('CAPACITY_EXCEEDED');

    const luxurySession = await request(app)
      .post('/api/v1/me/sessions')
      .set('X-Actor-Id', elenaId)
      .send({ resourceId: luxuryId });
    expect(luxurySession.status).toBe(201);
    clock.advance(15 * 60 * 1000);

    const downgrade = await request(app)
      .put(`/api/v1/passengers/${elenaId}/tier`)
      .set('X-Actor-Id', CREW.mira)
      .send({ tier: 'SILVER' });
    expect(downgrade.status).toBe(200);
    expect(
      (downgrade.body as { endedSessions: { endReason: string }[] }).endedSessions[0]?.endReason,
    ).toBe('TIER_DOWNGRADED');

    const stillBusy = await request(app)
      .post(`/api/v1/resources/${foodId}/decommission`)
      .set('X-Actor-Id', CREW.ada);
    expect((stillBusy.body as ErrorBody).error.code).toBe('RESOURCE_IN_USE');
    const foodSessionId = (started.body as { session: { id: string } }).session.id;
    await request(app).post(`/api/v1/me/sessions/${foodSessionId}/end`).set('X-Actor-Id', jonahId);
    const retired = await request(app)
      .post(`/api/v1/resources/${foodId}/decommission`)
      .set('X-Actor-Id', CREW.ada);
    expect(retired.status).toBe(200);

    const history = await request(app)
      .get(`/api/v1/passengers/${elenaId}/history`)
      .set('X-Actor-Id', CREW.ada);
    expect(history.status).toBe(200);
    expect(
      (history.body as { sessions: { tierAtStart: string; endReason: string | null }[] })
        .sessions[0],
    ).toMatchObject({ tierAtStart: 'PLATINUM', endReason: 'TIER_DOWNGRADED' });

    const tiers = await request(app)
      .get('/api/v1/reports/usage-by-tier')
      .set('X-Actor-Id', CREW.ada);
    const platinum = (tiers.body as { tiers: { tier: string; sessions: number }[] }).tiers.find(
      (group) => group.tier === 'PLATINUM',
    );
    expect(platinum?.sessions).toBe(1);

    const demand = await request(app)
      .get('/api/v1/reports/resource-demand')
      .set('X-Actor-Id', CREW.ada);
    const luxuryDemand = (
      demand.body as { data: { name: string; demandLevel: string; capacityDenials: number }[] }
    ).data.find((row) => row.name === 'Luxury O2 Pod A');
    expect(luxuryDemand?.demandLevel).toBe('HIGH');

    const live = await request(app).get('/api/v1/reports/active-usage').set('X-Actor-Id', CREW.bao);
    const liveNames = (live.body as { resources: { name: string }[] }).resources.map(
      (row) => row.name,
    );
    expect(liveNames).toContain('Luxury O2 Pod A');
    expect(liveNames).not.toContain('Food Station Alpha');

    const audit = await request(app)
      .get('/api/v1/audit-log?outcome=DENIED')
      .set('X-Actor-Id', CREW.ada);
    expect((audit.body as { page: { total: number } }).page.total).toBeGreaterThanOrEqual(2);
  });
});
