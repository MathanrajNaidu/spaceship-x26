import type { Actor } from '../auth/Actor.js';
import type { Authorizer } from '../auth/Authorizer.js';
import { slicePage, type Page } from '../pagination.js';
import type { Clock } from '../ports/Clock.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import type { PassengerRepository, PassengerSearch } from '../ports/PassengerRepository.js';
import { PassengerNotFoundError } from '../../domain/errors/NotFoundError.js';
import { Passenger, type PassengerStatus } from '../../domain/passenger/Passenger.js';
import { MembershipTier } from '../../domain/tier/MembershipTier.js';

export interface PassengerListQuery {
  tier?: string;
  status?: PassengerStatus;
  limit: number;
  offset: number;
}

export class PassengerService {
  constructor(
    private readonly authorizer: Authorizer,
    private readonly passengers: PassengerRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async create(actor: Actor, input: { name: string; tier: string }): Promise<Passenger> {
    this.authorizer.requireCrewLead(actor);
    const passenger = Passenger.create({
      id: this.ids.next('pas'),
      name: input.name,
      tier: MembershipTier.from(input.tier),
      now: this.clock.now(),
    });
    await this.passengers.save(passenger);
    return passenger;
  }

  async updateName(actor: Actor, id: string, name: string): Promise<Passenger> {
    this.authorizer.requireCrewLead(actor);
    const passenger = await this.requirePassenger(id);
    passenger.rename(name, this.clock.now());
    await this.passengers.save(passenger);
    return passenger;
  }

  async get(actor: Actor, id: string): Promise<Passenger> {
    this.authorizer.requireCrewLead(actor);
    return this.requirePassenger(id);
  }

  async getOwn(actor: Actor): Promise<Passenger> {
    this.authorizer.requirePassenger(actor);
    return this.requirePassenger(actor.id);
  }

  async list(actor: Actor, query: PassengerListQuery): Promise<Page<Passenger>> {
    this.authorizer.requireCrewLead(actor);
    const filter: PassengerSearch = {};
    if (query.tier !== undefined) {
      filter.tier = MembershipTier.from(query.tier).name;
    }
    if (query.status !== undefined) {
      filter.status = query.status;
    }
    const matches = await this.passengers.search(filter);
    return slicePage(matches, query.limit, query.offset);
  }

  private async requirePassenger(id: string): Promise<Passenger> {
    const passenger = await this.passengers.findById(id);
    if (!passenger) {
      throw new PassengerNotFoundError(id);
    }
    return passenger;
  }
}
