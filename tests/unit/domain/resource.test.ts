import { describe, expect, it } from 'vitest';

import { ResourceDecommissionedError } from '../../../src/domain/errors/ConflictError.js';
import {
  InvalidCapacityError,
  InvalidResourceTypeError,
  ValidationError,
} from '../../../src/domain/errors/ValidationError.js';
import { Resource, assertCapacity } from '../../../src/domain/resource/Resource.js';
import {
  DEFAULT_MINIMUM_TIER,
  RESOURCE_TYPES,
  parseResourceType,
} from '../../../src/domain/resource/ResourceType.js';
import { MembershipTier } from '../../../src/domain/tier/MembershipTier.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const LATER = new Date('2026-06-01T00:00:00.000Z');

describe('Resource types', () => {
  it.each(RESOURCE_TYPES)('defaults the minimum tier for %s', (type) => {
    const resource = Resource.provision({
      id: `res-${type}`,
      name: type,
      type,
      capacity: 1,
      now: NOW,
    });
    expect(resource.minimumTier).toBe(MembershipTier.from(DEFAULT_MINIMUM_TIER[type]));
    expect(DEFAULT_MINIMUM_TIER.FITNESS_CENTER).toBe('SILVER');
  });

  it('rejects an unknown resource type', () => {
    expect(() => parseResourceType('WARP_DRIVE')).toThrow(InvalidResourceTypeError);
  });
});

describe('Resource', () => {
  it('provisions an active resource and lets a crew lead override the minimum tier', () => {
    const resource = Resource.provision({
      id: ' res-fitness ',
      name: '  Fitness Center  ',
      type: 'FITNESS_CENTER',
      capacity: 10,
      minimumTier: MembershipTier.PLATINUM,
      now: NOW,
    });
    expect(resource.id).toBe('res-fitness');
    expect(resource.name).toBe('Fitness Center');
    expect(resource.minimumTier).toBe(MembershipTier.PLATINUM);
    expect(resource.status).toBe('ACTIVE');
    expect(resource.decommissionedAt).toBeUndefined();
    expect(resource.isAccessibleTo(MembershipTier.PLATINUM)).toBe(true);
    expect(resource.isAccessibleTo(MembershipTier.GOLD)).toBe(false);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects capacity %s', (capacity) => {
    expect(() => assertCapacity(capacity)).toThrow(InvalidCapacityError);
    expect(() =>
      Resource.provision({
        id: 'res-1',
        name: 'Food Station',
        type: 'FOOD_STATION',
        capacity,
        now: NOW,
      }),
    ).toThrow(InvalidCapacityError);
  });

  it('accepts a capacity of 1', () => {
    expect(assertCapacity(1)).toBe(1);
  });

  it('rejects a blank id or an invalid name', () => {
    expect(() =>
      Resource.provision({ id: ' ', name: 'Pod', type: 'SLEEPING_POD', capacity: 1, now: NOW }),
    ).toThrow(/Resource id/);
    expect(() =>
      Resource.provision({ id: 'res-1', name: ' ', type: 'SLEEPING_POD', capacity: 1, now: NOW }),
    ).toThrow(ValidationError);
  });

  it('grants access when the passenger tier covers the minimum', () => {
    const silver = Resource.provision({
      id: 'res-food',
      name: 'Food Station Alpha',
      type: 'FOOD_STATION',
      capacity: 4,
      now: NOW,
    });
    expect(silver.isAccessibleTo(MembershipTier.SILVER)).toBe(true);
    expect(silver.isAccessibleTo(MembershipTier.GOLD)).toBe(true);
    expect(silver.isAccessibleTo(MembershipTier.PLATINUM)).toBe(true);
  });

  it('decommissions once and keeps the timestamp', () => {
    const resource = Resource.provision({
      id: 'res-vip',
      name: 'VIP Rec Deck',
      type: 'VIP_REC_DECK',
      capacity: 4,
      now: NOW,
    });
    resource.decommission(LATER);
    expect(resource.status).toBe('DECOMMISSIONED');
    expect(resource.decommissionedAt).toEqual(LATER);
    expect(() => resource.decommission(LATER)).toThrow(ResourceDecommissionedError);
  });

  it('round-trips an active and a decommissioned resource', () => {
    const active = Resource.provision({
      id: 'res-o2',
      name: 'Oxygen Refill',
      type: 'OXYGEN_REFILL',
      capacity: 4,
      now: NOW,
    });
    expect(Resource.reconstitute(active.toSnapshot()).toSnapshot()).toEqual(active.toSnapshot());

    active.decommission(LATER);
    const restored = Resource.reconstitute(active.toSnapshot());
    expect(restored.status).toBe('DECOMMISSIONED');
    expect(restored.decommissionedAt).toEqual(LATER);
    expect(restored.toSnapshot()).toEqual(active.toSnapshot());
  });

  it('rejects an inconsistent snapshot', () => {
    const snapshot = Resource.provision({
      id: 'res-1',
      name: 'Food Station',
      type: 'FOOD_STATION',
      capacity: 2,
      now: NOW,
    }).toSnapshot();

    expect(() => Resource.reconstitute({ ...snapshot, status: 'BROKEN' })).toThrow(
      /Unknown resource status/,
    );
    expect(() => Resource.reconstitute({ ...snapshot, type: 'WARP_DRIVE' })).toThrow(
      InvalidResourceTypeError,
    );
    expect(() => Resource.reconstitute({ ...snapshot, capacity: 0 })).toThrow(InvalidCapacityError);
    expect(() => Resource.reconstitute({ ...snapshot, provisionedAt: 'nope' })).toThrow(
      /provisionedAt/,
    );
    expect(() =>
      Resource.reconstitute({ ...snapshot, decommissionedAt: LATER.toISOString() }),
    ).toThrow(/active resource cannot have/);

    const decommissioned = {
      ...snapshot,
      status: 'DECOMMISSIONED',
      decommissionedAt: null,
    };
    expect(() => Resource.reconstitute(decommissioned)).toThrow(/requires a decommissioned/);
    expect(() => Resource.reconstitute({ ...decommissioned, decommissionedAt: 'nope' })).toThrow(
      /decommissionedAt/,
    );
  });
});
