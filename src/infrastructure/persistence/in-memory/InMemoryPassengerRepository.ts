import type {
  PassengerRepository,
  PassengerSearch,
} from '../../../application/ports/PassengerRepository.js';
import { Passenger } from '../../../domain/passenger/Passenger.js';

export class InMemoryPassengerRepository implements PassengerRepository {
  private readonly items = new Map<string, ReturnType<Passenger['toSnapshot']>>();

  save(passenger: Passenger): Promise<void> {
    this.items.set(passenger.id, passenger.toSnapshot());
    return Promise.resolve();
  }

  findById(id: string): Promise<Passenger | null> {
    const snapshot = this.items.get(id);
    return Promise.resolve(snapshot ? Passenger.reconstitute(snapshot) : null);
  }

  search(filter: PassengerSearch): Promise<Passenger[]> {
    const matches = [...this.items.values()]
      .filter((snapshot) => matchesPassenger(snapshot, filter))
      .sort(byCreatedThenId)
      .map((snapshot) => Passenger.reconstitute(snapshot));
    return Promise.resolve(matches);
  }
}

function matchesPassenger(
  snapshot: ReturnType<Passenger['toSnapshot']>,
  filter: PassengerSearch,
): boolean {
  if (filter.tier !== undefined && snapshot.tier !== filter.tier) {
    return false;
  }
  if (filter.status !== undefined && snapshot.status !== filter.status) {
    return false;
  }
  return true;
}

function byCreatedThenId(
  left: ReturnType<Passenger['toSnapshot']>,
  right: ReturnType<Passenger['toSnapshot']>,
): number {
  const byTime = left.createdAt.localeCompare(right.createdAt);
  return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
}
