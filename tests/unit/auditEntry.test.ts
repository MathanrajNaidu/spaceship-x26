import { describe, expect, it } from 'vitest';

import { AuditEntry } from '../../src/domain/audit/AuditEntry.js';
import { ValidationError } from '../../src/domain/errors/ValidationError.js';

const when = new Date('2026-06-01T12:00:00.000Z');

describe('AuditEntry', () => {
  it('records an immutable snapshot and copies metadata', () => {
    const metadata = { tier: 'GOLD' };
    const entry = AuditEntry.record({
      id: 'aud-1',
      occurredAt: when,
      actorId: 'crew-ada',
      actorRole: 'CREW_LEAD',
      action: 'PassengerCreated',
      outcome: 'SUCCESS',
      passengerId: 'pas-1',
      metadata,
    });
    metadata.tier = 'SILVER';
    const snapshot = entry.toSnapshot();
    expect(snapshot.metadata).toEqual({ tier: 'GOLD' });
    expect(snapshot.resourceId).toBeNull();
    expect(snapshot.sessionId).toBeNull();
    expect(snapshot.reason).toBeNull();
    const restored = AuditEntry.reconstitute(snapshot);
    expect(restored.passengerId).toBe('pas-1');
    expect(restored.metadata).toEqual({ tier: 'GOLD' });
  });

  it('rejects blank fields, unknown roles and outcomes, bad timestamps and non-string metadata', () => {
    expect(() =>
      AuditEntry.record({
        id: '  ',
        occurredAt: when,
        actorId: 'crew-ada',
        actorRole: 'CREW_LEAD',
        action: 'PassengerCreated',
        outcome: 'SUCCESS',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      AuditEntry.reconstitute({
        id: 'aud-1',
        occurredAt: 'not-a-date',
        actorId: 'crew-ada',
        actorRole: 'CREW_LEAD',
        action: 'PassengerCreated',
        outcome: 'SUCCESS',
        passengerId: null,
        resourceId: null,
        sessionId: null,
        reason: null,
        metadata: {},
      }),
    ).toThrow(ValidationError);
    expect(() =>
      AuditEntry.reconstitute({
        id: 'aud-1',
        occurredAt: when.toISOString(),
        actorId: 'crew-ada',
        actorRole: 'GUEST',
        action: 'PassengerCreated',
        outcome: 'SUCCESS',
        passengerId: null,
        resourceId: null,
        sessionId: null,
        reason: null,
        metadata: {},
      }),
    ).toThrow(/role/);
    expect(() =>
      AuditEntry.record({
        id: 'aud-1',
        occurredAt: when,
        actorId: 'crew-ada',
        actorRole: 'CREW_LEAD',
        action: ' ',
        outcome: 'SUCCESS',
      }),
    ).toThrow(/action/);
    expect(() =>
      AuditEntry.reconstitute({
        id: 'aud-1',
        occurredAt: when.toISOString(),
        actorId: 'crew-ada',
        actorRole: 'PASSENGER',
        action: 'UsageDenied',
        outcome: 'MAYBE',
        passengerId: null,
        resourceId: null,
        sessionId: null,
        reason: null,
        metadata: {},
      }),
    ).toThrow(/outcome/);
    expect(() =>
      AuditEntry.reconstitute({
        id: 'aud-1',
        occurredAt: when.toISOString(),
        actorId: 'crew-ada',
        actorRole: 'PASSENGER',
        action: 'UsageDenied',
        outcome: 'DENIED',
        passengerId: null,
        resourceId: null,
        sessionId: null,
        reason: 'CAPACITY_EXCEEDED',
        metadata: { count: 1 },
      }),
    ).toThrow(/metadata/);
  });
});
