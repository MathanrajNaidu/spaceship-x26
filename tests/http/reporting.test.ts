import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { buildTestApp, CREW } from '../support/buildTestApp.js';

interface ErrorBody {
  error: { code: string };
}

describe('reporting HTTP', () => {
  it('returns history, tier groups, demand and the live snapshot', async () => {
    const { app, clock } = buildTestApp();
    const food = await request(app)
      .post('/api/v1/resources')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Food Station Alpha', type: 'FOOD_STATION', capacity: 1 });
    const foodId = (food.body as { resource: { id: string } }).resource.id;
    const jonah = await request(app)
      .post('/api/v1/passengers')
      .set('X-Actor-Id', CREW.ada)
      .send({ name: 'Jonah Hale', tier: 'SILVER' });
    const jonahId = (jonah.body as { passenger: { id: string } }).passenger.id;
    await request(app)
      .post('/api/v1/me/sessions')
      .set('X-Actor-Id', jonahId)
      .send({ resourceId: foodId });
    clock.advance(60_000);

    const own = await request(app).get('/api/v1/me/history').set('X-Actor-Id', jonahId);
    expect(own.status).toBe(200);
    const history = own.body as {
      sessions: { id: string }[];
      totalsByResourceType: { type: string; sessions: number }[];
      daily: { date: string }[];
    };
    expect(history.sessions).toHaveLength(1);
    expect(history.totalsByResourceType).toHaveLength(9);
    expect(history.totalsByResourceType.find((row) => row.type === 'FOOD_STATION')?.sessions).toBe(
      1,
    );
    expect(history.daily).toHaveLength(1);

    const crewView = await request(app)
      .get(`/api/v1/passengers/${jonahId}/history`)
      .set('X-Actor-Id', CREW.mira);
    expect(crewView.status).toBe(200);
    const missing = await request(app)
      .get('/api/v1/passengers/missing/history')
      .set('X-Actor-Id', CREW.ada);
    expect(missing.status).toBe(404);
    const blocked = await request(app).get('/api/v1/me/history').set('X-Actor-Id', CREW.ada);
    expect(blocked.status).toBe(403);

    const tiers = await request(app)
      .get('/api/v1/reports/usage-by-tier')
      .set('X-Actor-Id', CREW.bao);
    expect(tiers.status).toBe(200);
    expect((tiers.body as { tiers: { tier: string; sessions: number }[] }).tiers).toEqual([
      expect.objectContaining({ tier: 'SILVER', sessions: 1, passengerCount: 1 }),
      expect.objectContaining({ tier: 'GOLD', sessions: 0, passengerCount: 0 }),
      expect.objectContaining({ tier: 'PLATINUM', sessions: 0, passengerCount: 0 }),
    ]);

    const demand = await request(app)
      .get('/api/v1/reports/resource-demand')
      .set('X-Actor-Id', CREW.ada);
    expect(demand.status).toBe(200);
    const foodDemand = (demand.body as { data: { name: string; demandLevel: string }[] }).data.find(
      (row) => row.name === 'Food Station Alpha',
    );
    expect(foodDemand?.demandLevel).toBe('HIGH');

    const live = await request(app).get('/api/v1/reports/active-usage').set('X-Actor-Id', CREW.ada);
    expect(live.status).toBe(200);
    const rows = (live.body as { resources: { name: string; occupancy: { active: number } }[] })
      .resources;
    expect(rows.find((row) => row.name === 'Food Station Alpha')?.occupancy.active).toBe(1);

    const range = await request(app)
      .get(
        '/api/v1/reports/usage-by-tier?from=2026-06-02T00:00:00.000Z&to=2026-06-01T00:00:00.000Z',
      )
      .set('X-Actor-Id', CREW.ada);
    expect(range.status).toBe(400);
    expect((range.body as ErrorBody).error.code).toBe('INVALID_TIME_RANGE');
    const passengerReport = await request(app)
      .get('/api/v1/reports/active-usage')
      .set('X-Actor-Id', jonahId);
    expect(passengerReport.status).toBe(403);
  });
});
