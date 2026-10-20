import type { TierName } from '../../domain/tier/MembershipTier.js';
import type { ResourceType } from '../../domain/resource/ResourceType.js';

export interface CrewLeadSeed {
  readonly id: string;
  readonly name: string;
}

export interface PassengerSeed {
  readonly id: string;
  readonly name: string;
  readonly tier: TierName;
}

export interface ResourceSeed {
  readonly id: string;
  readonly name: string;
  readonly type: ResourceType;
  readonly capacity: number;
}

export const DEFAULT_CREW_LEADS: readonly CrewLeadSeed[] = [
  { id: 'crew-ada', name: 'Ada Okonkwo' },
  { id: 'crew-bao', name: 'Bao Chen' },
  { id: 'crew-mira', name: 'Mira Santos' },
];

export const DEMO_PASSENGERS: readonly PassengerSeed[] = [
  { id: 'pas-jonah', name: 'Jonah Hale', tier: 'SILVER' },
  { id: 'pas-priya', name: 'Priya Nair', tier: 'GOLD' },
  { id: 'pas-elena', name: 'Elena Voss', tier: 'PLATINUM' },
];

export const BASE_INVENTORY: readonly ResourceSeed[] = [
  { id: 'res-food-1', name: 'Food Station Alpha', type: 'FOOD_STATION', capacity: 8 },
  { id: 'res-food-2', name: 'Food Station Beta', type: 'FOOD_STATION', capacity: 8 },
  { id: 'res-sleep-1', name: 'Sleeping Pod Bay A', type: 'SLEEPING_POD', capacity: 12 },
  { id: 'res-sleep-2', name: 'Sleeping Pod Bay B', type: 'SLEEPING_POD', capacity: 12 },
  { id: 'res-hygiene-1', name: 'Hygiene Pod', type: 'BASIC_HYGIENE', capacity: 6 },
  { id: 'res-o2-1', name: 'Oxygen Refill', type: 'OXYGEN_REFILL', capacity: 4 },
  { id: 'res-fitness-1', name: 'Fitness Center', type: 'FITNESS_CENTER', capacity: 10 },
  { id: 'res-cabin-1', name: 'Private Cabin 1', type: 'PRIVATE_CABIN', capacity: 2 },
  { id: 'res-med-1', name: 'Advanced Medical Bay', type: 'ADVANCED_MEDICAL_BAY', capacity: 2 },
  { id: 'res-lux-o2-1', name: 'Luxury O2 Pod A', type: 'LUXURY_O2_POD', capacity: 1 },
  { id: 'res-vip-1', name: 'VIP Rec Deck', type: 'VIP_REC_DECK', capacity: 4 },
];
