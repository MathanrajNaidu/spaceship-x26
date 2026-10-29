import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApplication } from '../../src/compositionRoot.js';
import { ConfigError } from '../../src/infrastructure/config/env.js';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function tempSqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spaceship-x26-'));
  dirs.push(dir);
  return join(dir, 'mission.sqlite');
}

describe('sqlite persistence', () => {
  it('rejects an unknown STORAGE value', async () => {
    await expect(
      buildApplication({ STORAGE: 'postgres', LOG_LEVEL: 'silent' }),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it('persists seeded data across restarts and skips reseeding', async () => {
    const sqlitePath = tempSqlitePath();
    const env = {
      STORAGE: 'sqlite',
      SQLITE_PATH: sqlitePath,
      SEED_DEMO_PASSENGERS: 'true',
      LOG_LEVEL: 'silent',
    };

    const first = await buildApplication(env);
    const firstResources = await request(first.app)
      .get('/api/v1/resources')
      .set('X-Actor-Id', 'crew-ada');
    expect(firstResources.status).toBe(200);
    expect((firstResources.body as { page: { total: number } }).page.total).toBe(11);

    const created = await request(first.app)
      .post('/api/v1/passengers')
      .set('X-Actor-Id', 'crew-ada')
      .send({ name: 'Nova Reed', tier: 'GOLD' });
    expect(created.status).toBe(201);
    const createdId = (created.body as { passenger: { id: string } }).passenger.id;

    const second = await buildApplication(env);
    expect(second.config.storage).toBe('sqlite');

    const resources = await request(second.app)
      .get('/api/v1/resources')
      .set('X-Actor-Id', 'crew-ada');
    expect((resources.body as { page: { total: number } }).page.total).toBe(11);

    const passengers = await request(second.app)
      .get('/api/v1/passengers')
      .set('X-Actor-Id', 'crew-ada');
    const ids = (passengers.body as { data: { id: string }[] }).data.map((item) => item.id);
    expect(ids).toHaveLength(4);
    expect(ids).toEqual(expect.arrayContaining(['pas-jonah', 'pas-priya', 'pas-elena', createdId]));
  });
});
