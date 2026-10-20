import { describe, expect, it } from 'vitest';

import { CompositeAccessPolicy } from '../../../src/domain/access/CompositeAccessPolicy.js';
import type { AccessPolicy } from '../../../src/domain/access/AccessPolicy.js';
import { TierAccessPolicy } from '../../../src/domain/access/TierAccessPolicy.js';
import { Passenger } from '../../../src/domain/passenger/Passenger.js';
import { Resource } from '../../../src/domain/resource/Resource.js';
import { MembershipTier, TIERS, type TierName } from '../../../src/domain/tier/MembershipTier.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const policy = new TierAccessPolicy();

function passenger(tier: TierName): Passenger {
  return Passenger.create({
    id: `pas-${tier}`,
    name: 'Jonah Hale',
    tier: MembershipTier.from(tier),
    now: NOW,
  });
}

function resource(minimumTier: TierName): Resource {
  return Resource.provision({
    id: `res-${minimumTier}`,
    name: minimumTier === 'PLATINUM' ? 'Luxury O2 Pod A' : `${minimumTier} resource`,
    type: 'FOOD_STATION',
    capacity: 1,
    minimumTier: MembershipTier.from(minimumTier),
    now: NOW,
  });
}

describe('TierAccessPolicy', () => {
  it.each(TIERS.flatMap((holder) => TIERS.map((required) => [holder, required] as const)))(
    '%s passenger against a %s resource',
    (holder, required) => {
      const decision = policy.evaluate(passenger(holder), resource(required));
      const allowed = MembershipTier.from(holder).includes(MembershipTier.from(required));
      if (allowed) {
        expect(decision).toEqual({ allowed: true });
        return;
      }
      expect(decision).toEqual({
        allowed: false,
        code: 'TIER_ACCESS_DENIED',
        message: `Passenger tier ${holder} cannot access resource '${resource(required).name}' (requires ${required}).`,
        details: { requiredTier: required, passengerTier: holder },
      });
    },
  );

  it('ignores resource status; tier is the only question this policy answers', () => {
    const luxury = resource('PLATINUM');
    luxury.decommission(NOW);
    expect(policy.evaluate(passenger('PLATINUM'), luxury)).toEqual({ allowed: true });
  });
});

describe('CompositeAccessPolicy', () => {
  const allow: AccessPolicy = { evaluate: () => ({ allowed: true }) };
  const deny: AccessPolicy = {
    evaluate: () => ({
      allowed: false,
      code: 'TIER_ACCESS_DENIED',
      message: 'denied',
      details: { reason: 'test' },
    }),
  };

  it('allows when every policy allows', () => {
    const decision = new CompositeAccessPolicy([allow, new TierAccessPolicy()]).evaluate(
      passenger('GOLD'),
      resource('SILVER'),
    );
    expect(decision).toEqual({ allowed: true });
  });

  it('returns the first denial and does not consult later policies', () => {
    const later: AccessPolicy = {
      evaluate: () => {
        throw new Error('later policy should not run');
      },
    };
    const decision = new CompositeAccessPolicy([deny, later]).evaluate(
      passenger('SILVER'),
      resource('SILVER'),
    );
    expect(decision).toMatchObject({ allowed: false, code: 'TIER_ACCESS_DENIED' });
  });

  it('allows when there are no policies', () => {
    expect(new CompositeAccessPolicy([]).evaluate(passenger('SILVER'), resource('GOLD'))).toEqual({
      allowed: true,
    });
  });
});
