import { describe, expect, it } from 'vitest';

import {
  PassengerInactiveError,
  TierUnchangedError,
} from '../../../src/domain/errors/ConflictError.js';
import { ValidationError } from '../../../src/domain/errors/ValidationError.js';
import { Passenger, type PassengerSnapshot } from '../../../src/domain/passenger/Passenger.js';
import { MembershipTier } from '../../../src/domain/tier/MembershipTier.js';

const CREATED = new Date('2026-01-15T08:00:00.000Z');
const LATER = new Date('2026-02-01T08:00:00.000Z');

function createPassenger(tier = MembershipTier.SILVER): Passenger {
  return Passenger.create({ id: 'pas-1', name: '  Jonah Hale  ', tier, now: CREATED });
}

describe('Passenger', () => {
  it('creates an active passenger with a trimmed name', () => {
    const passenger = createPassenger();
    expect(passenger.id).toBe('pas-1');
    expect(passenger.name).toBe('Jonah Hale');
    expect(passenger.tier).toBe(MembershipTier.SILVER);
    expect(passenger.status).toBe('ACTIVE');
    expect(passenger.createdAt).toEqual(CREATED);
    expect(passenger.updatedAt).toEqual(CREATED);
  });

  it('rejects a blank id or an invalid name', () => {
    expect(() =>
      Passenger.create({ id: '  ', name: 'Jonah', tier: MembershipTier.GOLD, now: CREATED }),
    ).toThrow(ValidationError);
    expect(() =>
      Passenger.create({ id: 'pas-1', name: '   ', tier: MembershipTier.GOLD, now: CREATED }),
    ).toThrow(/Passenger name/);
    expect(() =>
      Passenger.create({
        id: 'pas-1',
        name: 'A'.repeat(101),
        tier: MembershipTier.GOLD,
        now: CREATED,
      }),
    ).toThrow(/Passenger name/);
    const max = Passenger.create({
      id: ' pas-1 ',
      name: 'A'.repeat(100),
      tier: MembershipTier.GOLD,
      now: CREATED,
    });
    expect(max.id).toBe('pas-1');
    expect(max.name).toHaveLength(100);
  });

  it('renames an active passenger', () => {
    const passenger = createPassenger();
    passenger.rename('  Priya Nair ', LATER);
    expect(passenger.name).toBe('Priya Nair');
    expect(passenger.updatedAt).toEqual(LATER);
  });

  it('upgrades and downgrades membership', () => {
    const passenger = createPassenger();
    const upgrade = passenger.changeTier(MembershipTier.PLATINUM, LATER);
    expect(upgrade).toEqual({
      from: MembershipTier.SILVER,
      to: MembershipTier.PLATINUM,
      direction: 'UPGRADE',
    });
    expect(passenger.tier).toBe(MembershipTier.PLATINUM);
    expect(passenger.updatedAt).toEqual(LATER);

    const downgrade = passenger.changeTier(
      MembershipTier.GOLD,
      new Date('2026-03-01T00:00:00.000Z'),
    );
    expect(downgrade.direction).toBe('DOWNGRADE');
    expect(downgrade.from).toBe(MembershipTier.PLATINUM);
    expect(downgrade.to).toBe(MembershipTier.GOLD);
  });

  it('rejects a change to the same tier', () => {
    const passenger = createPassenger(MembershipTier.GOLD);
    expect(() => passenger.changeTier(MembershipTier.GOLD, LATER)).toThrow(TierUnchangedError);
    expect(passenger.tier).toBe(MembershipTier.GOLD);
    expect(passenger.updatedAt).toEqual(CREATED);
  });

  it('deactivates once and then rejects further changes', () => {
    const passenger = createPassenger();
    passenger.deactivate(LATER);
    expect(passenger.status).toBe('INACTIVE');
    expect(passenger.updatedAt).toEqual(LATER);
    expect(() => passenger.deactivate(LATER)).toThrow(PassengerInactiveError);
    expect(() => passenger.rename('Other', LATER)).toThrow(PassengerInactiveError);
    expect(() => passenger.changeTier(MembershipTier.GOLD, LATER)).toThrow(PassengerInactiveError);
  });

  it('round-trips through a snapshot, including an inactive passenger', () => {
    const passenger = createPassenger(MembershipTier.PLATINUM);
    passenger.rename('Elena Voss', LATER);
    const restored = Passenger.reconstitute(passenger.toSnapshot());
    expect(restored.toSnapshot()).toEqual(passenger.toSnapshot());
    expect(restored.tier).toBe(MembershipTier.PLATINUM);

    passenger.deactivate(new Date('2026-04-01T00:00:00.000Z'));
    const inactive = Passenger.reconstitute(passenger.toSnapshot());
    expect(inactive.status).toBe('INACTIVE');
    expect(inactive.name).toBe('Elena Voss');
  });

  it('rejects a snapshot with an unknown status or a bad timestamp', () => {
    const snapshot = createPassenger().toSnapshot();
    expect(() => Passenger.reconstitute({ ...snapshot, status: 'GONE' })).toThrow(
      /Unknown passenger status/,
    );
    expect(() => Passenger.reconstitute({ ...snapshot, createdAt: 'not-a-date' })).toThrow(
      /createdAt/,
    );
    expect(() => Passenger.reconstitute({ ...snapshot, updatedAt: 'not-a-date' })).toThrow(
      /updatedAt/,
    );
    expect(() =>
      Passenger.reconstitute({ ...snapshot, name: '   ' } satisfies PassengerSnapshot),
    ).toThrow(/Passenger name/);
  });
});
