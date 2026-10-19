import { InvalidTierError } from '../errors/InvalidTierError.js';

export const TIERS = ['SILVER', 'GOLD', 'PLATINUM'] as const;
export type TierName = (typeof TIERS)[number];

const BY_NAME = new Map<TierName, MembershipTier>();

export class MembershipTier {
  static readonly SILVER = new MembershipTier('SILVER', 1);
  static readonly GOLD = new MembershipTier('GOLD', 2);
  static readonly PLATINUM = new MembershipTier('PLATINUM', 3);

  private constructor(
    readonly name: TierName,
    readonly rank: number,
  ) {
    BY_NAME.set(name, this);
  }

  static from(name: string): MembershipTier {
    const tier = BY_NAME.get(name as TierName);
    if (!tier) {
      throw new InvalidTierError(name);
    }
    return tier;
  }

  includes(required: MembershipTier): boolean {
    return this.rank >= required.rank;
  }

  isHigherThan(other: MembershipTier): boolean {
    return this.rank > other.rank;
  }

  isLowerThan(other: MembershipTier): boolean {
    return this.rank < other.rank;
  }

  equals(other: MembershipTier): boolean {
    return this.name === other.name;
  }
}
