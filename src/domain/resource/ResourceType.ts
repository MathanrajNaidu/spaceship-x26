import { InvalidResourceTypeError } from '../errors/ValidationError.js';
import type { TierName } from '../tier/MembershipTier.js';

export const RESOURCE_TYPES = [
  'FOOD_STATION',
  'SLEEPING_POD',
  'BASIC_HYGIENE',
  'OXYGEN_REFILL',
  'FITNESS_CENTER',
  'PRIVATE_CABIN',
  'ADVANCED_MEDICAL_BAY',
  'LUXURY_O2_POD',
  'VIP_REC_DECK',
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const DEFAULT_MINIMUM_TIER: Record<ResourceType, TierName> = {
  FOOD_STATION: 'SILVER',
  SLEEPING_POD: 'SILVER',
  BASIC_HYGIENE: 'SILVER',
  OXYGEN_REFILL: 'SILVER',
  FITNESS_CENTER: 'SILVER',
  PRIVATE_CABIN: 'GOLD',
  ADVANCED_MEDICAL_BAY: 'GOLD',
  LUXURY_O2_POD: 'PLATINUM',
  VIP_REC_DECK: 'PLATINUM',
};

export function parseResourceType(value: string): ResourceType {
  if (!isResourceType(value)) {
    throw new InvalidResourceTypeError(value);
  }
  return value;
}

function isResourceType(value: string): value is ResourceType {
  return (RESOURCE_TYPES as readonly string[]).includes(value);
}
