import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { buildApplication } from '../../src/compositionRoot.js';
import { CrewRosterInvariantError } from '../../src/domain/errors/InvariantViolationError.js';
import { ConfigError } from '../../src/infrastructure/config/env.js';
import { closeServer, shutdownHandler, startServer } from '../../src/server.js';

const baseEnv = { SEED_DEMO_PASSENGERS: 'true', LOG_LEVEL: 'silent' };

describe('boot', () => {
  it('seeds three crew leads, the base inventory and the demo passengers', async () => {
    const { app } = await buildApplication(baseEnv);
    const leads = await request(app).get('/api/v1/crew-leads').set('X-Actor-Id', 'crew-ada');
    expect(leads.status).toBe(200);
    expect(leads.body).toEqual({
      data: [
        { id: 'crew-ada', name: 'Ada Okonkwo' },
        { id: 'crew-bao', name: 'Bao Chen' },
        { id: 'crew-mira', name: 'Mira Santos' },
      ],
    });

    const resources = await request(app).get('/api/v1/resources').set('X-Actor-Id', 'crew-ada');
    expect(resources.status).toBe(200);
    expect((resources.body as { page: { total: number } }).page.total).toBe(11);

    const passengers = await request(app).get('/api/v1/passengers').set('X-Actor-Id', 'crew-mira');
    const rows = (passengers.body as { data: { id: string; tier: string }[] }).data.map((item) => [
      item.id,
      item.tier,
    ]);
    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        ['pas-jonah', 'SILVER'],
        ['pas-priya', 'GOLD'],
        ['pas-elena', 'PLATINUM'],
      ]),
    );

    const discovered = await request(app)
      .get('/api/v1/me/resources')
      .set('X-Actor-Id', 'pas-jonah');
    const names = (discovered.body as { data: { name: string; minimumTier: string }[] }).data.map(
      (item) => item.minimumTier,
    );
    expect(names.every((tier) => tier === 'SILVER')).toBe(true);
    expect(names.length).toBeGreaterThan(0);
  });

  it('skips demo passengers when the flag is false and still loads inventory', async () => {
    const { app } = await buildApplication({ SEED_DEMO_PASSENGERS: 'false' });
    const passengers = await request(app).get('/api/v1/passengers').set('X-Actor-Id', 'crew-ada');
    expect((passengers.body as { page: { total: number } }).page.total).toBe(0);
    const resources = await request(app).get('/api/v1/resources').set('X-Actor-Id', 'crew-ada');
    expect((resources.body as { page: { total: number } }).page.total).toBe(11);
  });

  it.each([
    [
      [
        { id: 'crew-ada', name: 'Ada Okonkwo' },
        { id: 'crew-bao', name: 'Bao Chen' },
      ],
    ],
    [
      [
        { id: 'crew-ada', name: 'Ada Okonkwo' },
        { id: 'crew-bao', name: 'Bao Chen' },
        { id: 'crew-mira', name: 'Mira Santos' },
        { id: 'crew-nio', name: 'Nia Ortiz' },
      ],
    ],
    [
      [
        { id: 'crew-ada', name: 'Ada Okonkwo' },
        { id: 'crew-ada', name: 'Ada Two' },
        { id: 'crew-mira', name: 'Mira Santos' },
      ],
    ],
  ])('refuses to boot with an invalid crew roster', async (leads) => {
    await expect(buildApplication({ CREW_LEADS: JSON.stringify(leads) })).rejects.toBeInstanceOf(
      CrewRosterInvariantError,
    );
  });

  it('rejects a crew lead value that is not JSON', async () => {
    await expect(buildApplication({ CREW_LEADS: 'ada,bao,mira' })).rejects.toBeInstanceOf(
      ConfigError,
    );
    await expect(buildApplication({ CREW_LEADS: '[1, 2, 3]' })).rejects.toBeInstanceOf(ConfigError);
    const { roster } = await buildApplication({ CREW_LEADS: '   ' });
    expect(roster.leads.map((lead) => lead.id)).toEqual(['crew-ada', 'crew-bao', 'crew-mira']);
    await expect(buildApplication({ PORT: 'nope' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('listens and answers a health check', async () => {
    const { app } = await buildApplication({ SEED_DEMO_PASSENGERS: 'false' });
    const server = await startServer(app, 0, '127.0.0.1');
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a tcp address');
    }
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
    expect(response.status).toBe(200);
    await closeServer(server);
    await closeServer(server);
  });

  it('closes the listener once when shutdown runs twice', async () => {
    const { app } = await buildApplication({ SEED_DEMO_PASSENGERS: 'false', LOG_LEVEL: 'silent' });
    const server = await startServer(app, 0, '127.0.0.1');
    const codes: number[] = [];
    let release: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stop = shutdownHandler(server, (code) => {
      codes.push(code);
      release();
    });
    stop();
    stop();
    await closed;
    expect(codes).toEqual([0]);
    expect(server.listening).toBe(false);
  });
});
