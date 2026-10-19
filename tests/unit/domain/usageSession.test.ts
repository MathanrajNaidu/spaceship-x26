import { describe, expect, it } from 'vitest';

import { SessionAlreadyEndedError } from '../../../src/domain/errors/ConflictError.js';
import {
  InvalidTimestampError,
  ValidationError,
} from '../../../src/domain/errors/ValidationError.js';
import { MembershipTier } from '../../../src/domain/tier/MembershipTier.js';
import { UsageSession } from '../../../src/domain/usage/UsageSession.js';

const START = new Date('2026-06-01T10:00:00.000Z');
const LATER = new Date('2026-06-01T10:05:00.000Z');

function startSession(): UsageSession {
  return UsageSession.start({
    id: ' ses-1 ',
    passengerId: ' pas-1 ',
    resourceId: ' res-1 ',
    tierAtStart: MembershipTier.GOLD,
    now: START,
  });
}

describe('UsageSession', () => {
  it('starts an active session and grows its duration with the clock', () => {
    const session = startSession();
    expect(session.id).toBe('ses-1');
    expect(session.passengerId).toBe('pas-1');
    expect(session.resourceId).toBe('res-1');
    expect(session.tierAtStart).toBe(MembershipTier.GOLD);
    expect(session.isActive).toBe(true);
    expect(session.endedAt).toBeUndefined();
    expect(session.endReason).toBeUndefined();
    expect(session.durationMs(START)).toBe(0);
    expect(session.durationMs(LATER)).toBe(5 * 60 * 1000);
  });

  it('ends once and then rejects a second end', () => {
    const session = startSession();
    session.end(LATER, 'PASSENGER_ENDED');
    expect(session.isActive).toBe(false);
    expect(session.endReason).toBe('PASSENGER_ENDED');
    expect(session.endedAt).toEqual(LATER);
    expect(session.durationMs(new Date('2026-06-01T12:00:00.000Z'))).toBe(5 * 60 * 1000);
    expect(() => session.end(LATER, 'CREW_ENDED')).toThrow(SessionAlreadyEndedError);
  });

  it('rejects an end timestamp before the start', () => {
    const session = startSession();
    expect(() => session.end(new Date('2026-06-01T09:00:00.000Z'), 'CREW_ENDED')).toThrow(
      InvalidTimestampError,
    );
    expect(session.isActive).toBe(true);
  });

  it('allows a zero-length session', () => {
    const session = startSession();
    session.end(START, 'TIER_DOWNGRADED');
    expect(session.durationMs(LATER)).toBe(0);
  });

  it('rejects blank identifiers', () => {
    const base = {
      id: 'ses-1',
      passengerId: 'pas-1',
      resourceId: 'res-1',
      tierAtStart: MembershipTier.SILVER,
      now: START,
    };
    expect(() => UsageSession.start({ ...base, id: ' ' })).toThrow(ValidationError);
    expect(() => UsageSession.start({ ...base, passengerId: ' ' })).toThrow(ValidationError);
    expect(() => UsageSession.start({ ...base, resourceId: ' ' })).toThrow(ValidationError);
  });

  it('round-trips an active and an ended session', () => {
    const active = startSession();
    expect(UsageSession.reconstitute(active.toSnapshot()).toSnapshot()).toEqual(
      active.toSnapshot(),
    );
    active.end(LATER, 'PASSENGER_DEACTIVATED');
    const restored = UsageSession.reconstitute(active.toSnapshot());
    expect(restored.isActive).toBe(false);
    expect(restored.endReason).toBe('PASSENGER_DEACTIVATED');
    expect(restored.durationMs(LATER)).toBe(active.durationMs(LATER));
  });

  it('rejects an inconsistent or unknown snapshot', () => {
    const snapshot = startSession().toSnapshot();
    expect(() => UsageSession.reconstitute({ ...snapshot, startedAt: 'nope' })).toThrow(
      /startedAt/,
    );
    expect(() =>
      UsageSession.reconstitute({ ...snapshot, endedAt: LATER.toISOString(), endReason: null }),
    ).toThrow(/set together/);
    expect(() =>
      UsageSession.reconstitute({ ...snapshot, endedAt: null, endReason: 'CREW_ENDED' }),
    ).toThrow(/set together/);
    expect(() =>
      UsageSession.reconstitute({
        ...snapshot,
        endedAt: LATER.toISOString(),
        endReason: 'BOGUS',
      }),
    ).toThrow(/end reason/);
    expect(() =>
      UsageSession.reconstitute({
        ...snapshot,
        endedAt: '2026-06-01T09:00:00.000Z',
        endReason: 'CREW_ENDED',
      }),
    ).toThrow(InvalidTimestampError);
    expect(() =>
      UsageSession.reconstitute({
        ...snapshot,
        endedAt: 'not-a-date',
        endReason: 'CREW_ENDED',
      }),
    ).toThrow(/endedAt/);
  });
});
