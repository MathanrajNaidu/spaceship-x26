import { expect, it } from 'vitest';

import type { UsageSessionRepository } from '../../../src/application/ports/UsageSessionRepository.js';
import { MembershipTier } from '../../../src/domain/tier/MembershipTier.js';
import { UsageSession } from '../../../src/domain/usage/UsageSession.js';

const T0 = new Date('2026-06-01T10:00:00.000Z');
const T1 = new Date('2026-06-01T11:00:00.000Z');
const T2 = new Date('2026-06-01T12:00:00.000Z');

function session(id: string, resourceId: string, passengerId: string, now: Date): UsageSession {
  return UsageSession.start({
    id,
    passengerId,
    resourceId,
    tierAtStart: MembershipTier.SILVER,
    now,
  });
}

export function describeUsageSessionRepositoryContract(
  createRepository: () => UsageSessionRepository,
): void {
  it('returns null for a missing session and ignores unsaved mutations', async () => {
    const repository = createRepository();
    expect(await repository.findById('missing')).toBeNull();
    const original = session('ses-1', 'res-1', 'pas-1', T0);
    await repository.save(original);
    original.end(T1, 'PASSENGER_ENDED');
    expect((await repository.findById('ses-1'))?.isActive).toBe(true);
  });

  it('finds the active session for a passenger and resource, and counts occupancy', async () => {
    const repository = createRepository();
    const active = session('ses-1', 'res-1', 'pas-1', T0);
    const ended = session('ses-2', 'res-1', 'pas-2', T0);
    ended.end(T1, 'CREW_ENDED');
    await repository.save(ended);
    await repository.save(active);
    await repository.save(session('ses-3', 'res-2', 'pas-1', T1));

    expect((await repository.findActiveByPassengerAndResource('pas-1', 'res-1'))?.id).toBe('ses-1');
    expect(await repository.findActiveByPassengerAndResource('pas-2', 'res-1')).toBeNull();
    expect(await repository.countActive('res-1')).toBe(1);
    expect((await repository.listActiveByPassenger('pas-1')).map((item) => item.id)).toEqual([
      'ses-3',
      'ses-1',
    ]);
    expect((await repository.listActiveByResource('res-1')).map((item) => item.id)).toEqual([
      'ses-1',
    ]);
    expect((await repository.listActive()).map((item) => item.id).sort()).toEqual([
      'ses-1',
      'ses-3',
    ]);
  });

  it('filters by start window, treating from as inclusive and to as exclusive', async () => {
    const repository = createRepository();
    await repository.save(session('ses-early', 'res-1', 'pas-1', T0));
    await repository.save(session('ses-mid', 'res-1', 'pas-1', T1));
    await repository.save(session('ses-late', 'res-1', 'pas-1', T2));
    const page = await repository.search({ from: T0, to: T2, status: 'active' });
    expect(page.map((item) => item.id)).toEqual(['ses-mid', 'ses-early']);
    const ended = session('ses-done', 'res-1', 'pas-2', T1);
    ended.end(T2, 'PASSENGER_ENDED');
    await repository.save(ended);
    expect((await repository.search({ status: 'ended' })).map((item) => item.id)).toEqual([
      'ses-done',
    ]);
  });

  it('returns sessions that overlap a half-open window', async () => {
    const repository = createRepository();
    const before = session('ses-before', 'res-1', 'pas-1', new Date('2026-06-01T08:00:00.000Z'));
    before.end(T0, 'PASSENGER_ENDED');
    const spanning = session('ses-span', 'res-1', 'pas-2', new Date('2026-06-01T09:00:00.000Z'));
    spanning.end(T2, 'PASSENGER_ENDED');
    const open = session('ses-open', 'res-1', 'pas-3', T1);
    await repository.save(before);
    await repository.save(spanning);
    await repository.save(open);
    const overlapping = await repository.listOverlapping({ from: T0, to: T2 }, T1);
    expect(overlapping.map((item) => item.id)).toEqual(['ses-open', 'ses-span']);
  });
}
