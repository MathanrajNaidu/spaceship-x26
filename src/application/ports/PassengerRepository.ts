import type { Passenger, PassengerStatus } from '../../domain/passenger/Passenger.js';
import type { TierName } from '../../domain/tier/MembershipTier.js';

export interface PassengerSearch {
  tier?: TierName;
  status?: PassengerStatus;
}

export interface PassengerRepository {
  save(passenger: Passenger): Promise<void>;
  findById(id: string): Promise<Passenger | null>;
  search(filter: PassengerSearch): Promise<Passenger[]>;
}
