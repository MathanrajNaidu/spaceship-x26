import type { Passenger } from '../../domain/passenger/Passenger.js';

export function toPassengerDto(passenger: Passenger) {
  return {
    id: passenger.id,
    name: passenger.name,
    tier: passenger.tier.name,
    status: passenger.status,
    createdAt: passenger.createdAt.toISOString(),
    updatedAt: passenger.updatedAt.toISOString(),
  };
}
