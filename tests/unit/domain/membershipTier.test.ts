import { describe, expect, it } from 'vitest';

import { InvalidTierError } from '../../../src/domain/errors/InvalidTierError.js';
import { MembershipTier } from '../../../src/domain/tier/MembershipTier.js';

describe('MembershipTier', () => {
  it('ranks silver below gold below platinum', () => {
    expect(MembershipTier.SILVER.rank).toBe(1);
    expect(MembershipTier.GOLD.rank).toBe(2);
    expect(MembershipTier.PLATINUM.rank).toBe(3);
    expect(MembershipTier.SILVER.isLowerThan(MembershipTier.GOLD)).toBe(true);
    expect(MembershipTier.GOLD.isLowerThan(MembershipTier.PLATINUM)).toBe(true);
    expect(MembershipTier.PLATINUM.isHigherThan(MembershipTier.SILVER)).toBe(true);
    expect(MembershipTier.GOLD.isHigherThan(MembershipTier.GOLD)).toBe(false);
    expect(MembershipTier.GOLD.isLowerThan(MembershipTier.GOLD)).toBe(false);
    expect(MembershipTier.GOLD.equals(MembershipTier.GOLD)).toBe(true);
    expect(MembershipTier.GOLD.equals(MembershipTier.SILVER)).toBe(false);
  });

  it.each([
    ['SILVER', 'SILVER', true],
    ['SILVER', 'GOLD', false],
    ['SILVER', 'PLATINUM', false],
    ['GOLD', 'SILVER', true],
    ['GOLD', 'GOLD', true],
    ['GOLD', 'PLATINUM', false],
    ['PLATINUM', 'SILVER', true],
    ['PLATINUM', 'GOLD', true],
    ['PLATINUM', 'PLATINUM', true],
  ] as const)('%s includes a %s minimum: %s', (holder, required, allowed) => {
    expect(MembershipTier.from(holder).includes(MembershipTier.from(required))).toBe(allowed);
  });

  it('returns the canonical instance for a known tier name', () => {
    expect(MembershipTier.from('SILVER')).toBe(MembershipTier.SILVER);
    expect(MembershipTier.from('GOLD')).toBe(MembershipTier.GOLD);
    expect(MembershipTier.from('PLATINUM')).toBe(MembershipTier.PLATINUM);
  });

  it('rejects an unknown tier name', () => {
    expect(() => MembershipTier.from('DIAMOND')).toThrow(InvalidTierError);
    expect(() => MembershipTier.from('gold')).toThrow(InvalidTierError);

    try {
      MembershipTier.from('DIAMOND');
      expect.fail('expected InvalidTierError');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTierError);
      const invalid = error as InvalidTierError;
      expect(invalid.code).toBe('INVALID_TIER');
      expect(invalid.message).toBe("Unknown membership tier 'DIAMOND'.");
      expect(invalid.details).toEqual({ value: 'DIAMOND' });
    }
  });
});
