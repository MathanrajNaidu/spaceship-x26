import type { Actor } from '../auth/Actor.js';
import type { Authorizer } from '../auth/Authorizer.js';
import { toEventActor } from '../auth/eventActor.js';
import type { KeyedMutex } from '../concurrency/KeyedMutex.js';
import { slicePage, type Page } from '../pagination.js';
import type { Clock } from '../ports/Clock.js';
import type { EventPublisher } from '../ports/EventPublisher.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import type { PassengerRepository, PassengerSearch } from '../ports/PassengerRepository.js';
import type { ResourceRepository } from '../ports/ResourceRepository.js';
import type { UsageSessionRepository } from '../ports/UsageSessionRepository.js';
import { PassengerNotFoundError } from '../../domain/errors/NotFoundError.js';
import {
  Passenger,
  type PassengerStatus,
  type TierChange,
} from '../../domain/passenger/Passenger.js';
import type { Resource } from '../../domain/resource/Resource.js';
import { assertName } from '../../domain/shared/assertName.js';
import { MembershipTier } from '../../domain/tier/MembershipTier.js';
import type { UsageSession } from '../../domain/usage/UsageSession.js';

export interface TierChangeResult {
  readonly passenger: Passenger;
  readonly change: TierChange;
  readonly endedSessions: readonly UsageSession[];
}

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
    private readonly events: EventPublisher,
    private readonly sessions: UsageSessionRepository,
    private readonly resources: ResourceRepository,
    private readonly mutex: KeyedMutex,
  ) {}

  async create(
    actor: Actor,
    input: { id?: string; name: string; tier: string },
  ): Promise<Passenger> {
    this.authorizer.requireCrewLead(actor);
    const tier = MembershipTier.from(input.tier);
    const name = assertName(input.name, 'Passenger name');
    const passenger = Passenger.create({
      id: input.id ?? this.ids.next('pas'),
      name,
      tier,
      now: this.clock.now(),
    });
    await this.passengers.save(passenger);
    await this.events.publish({
      type: 'PassengerCreated',
      occurredAt: passenger.createdAt,
      actor: toEventActor(actor),
      passengerId: passenger.id,
      name: passenger.name,
      tier: passenger.tier.name,
    });
    return passenger;
  }

  async updateName(actor: Actor, id: string, name: string): Promise<Passenger> {
    this.authorizer.requireCrewLead(actor);
    const passenger = await this.requirePassenger(id);
    passenger.rename(name, this.clock.now());
    await this.passengers.save(passenger);
    await this.events.publish({
      type: 'PassengerUpdated',
      occurredAt: passenger.updatedAt,
      actor: toEventActor(actor),
      passengerId: passenger.id,
      name: passenger.name,
    });
    return passenger;
  }

  async changeTier(actor: Actor, id: string, tierName: string): Promise<TierChangeResult> {
    this.authorizer.requireCrewLead(actor);
    const passenger = await this.requirePassenger(id);
    const change = passenger.changeTier(MembershipTier.from(tierName), this.clock.now());
    await this.passengers.save(passenger);
    const endedSessions =
      change.direction === 'DOWNGRADE' ? await this.endInaccessibleSessions(actor, passenger) : [];
    await this.events.publish({
      type: 'PassengerTierChanged',
      occurredAt: passenger.updatedAt,
      actor: toEventActor(actor),
      passengerId: passenger.id,
      from: change.from.name,
      to: change.to.name,
      direction: change.direction,
    });
    return { passenger, change, endedSessions };
  }

  async deactivate(
    actor: Actor,
    id: string,
  ): Promise<{ passenger: Passenger; endedSessions: readonly UsageSession[] }> {
    this.authorizer.requireCrewLead(actor);
    const passenger = await this.requirePassenger(id);
    passenger.deactivate(this.clock.now());
    await this.passengers.save(passenger);
    const endedSessions: UsageSession[] = [];
    for (const candidate of await this.sessions.listActiveByPassenger(passenger.id)) {
      const closed = await this.mutex.runExclusive(candidate.resourceId, async () => {
        const session = await this.sessions.findById(candidate.id);
        if (!session?.isActive) {
          return null;
        }
        const endedAt = this.clock.now();
        session.end(endedAt, 'PASSENGER_DEACTIVATED');
        await this.sessions.save(session);
        await this.events.publish({
          type: 'UsageEnded',
          occurredAt: endedAt,
          actor: toEventActor(actor),
          passengerId: session.passengerId,
          resourceId: session.resourceId,
          sessionId: session.id,
          endReason: 'PASSENGER_DEACTIVATED',
        });
        return session;
      });
      if (closed) {
        endedSessions.push(closed);
      }
    }
    await this.events.publish({
      type: 'PassengerDeactivated',
      occurredAt: passenger.updatedAt,
      actor: toEventActor(actor),
      passengerId: passenger.id,
    });
    return { passenger, endedSessions };
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

  private async endInaccessibleSessions(
    actor: Actor,
    passenger: Passenger,
  ): Promise<UsageSession[]> {
    const ended: UsageSession[] = [];
    for (const candidate of await this.sessions.listActiveByPassenger(passenger.id)) {
      const resource = await this.resources.findById(candidate.resourceId);
      if (!this.stillInaccessible(resource, passenger)) {
        continue;
      }
      const closed = await this.mutex.runExclusive(candidate.resourceId, async () => {
        const session = await this.sessions.findById(candidate.id);
        if (!session?.isActive) {
          return null;
        }
        const current = await this.resources.findById(session.resourceId);
        if (!this.stillInaccessible(current, passenger)) {
          return null;
        }
        const endedAt = this.clock.now();
        session.end(endedAt, 'TIER_DOWNGRADED');
        await this.sessions.save(session);
        await this.events.publish({
          type: 'UsageEnded',
          occurredAt: endedAt,
          actor: toEventActor(actor),
          passengerId: session.passengerId,
          resourceId: session.resourceId,
          sessionId: session.id,
          endReason: 'TIER_DOWNGRADED',
        });
        return session;
      });
      if (closed) {
        ended.push(closed);
      }
    }
    return ended;
  }

  private stillInaccessible(resource: Resource | null, passenger: Passenger): resource is Resource {
    return resource !== null && !resource.isAccessibleTo(passenger.tier);
  }

  private async requirePassenger(id: string): Promise<Passenger> {
    const passenger = await this.passengers.findById(id);
    if (!passenger) {
      throw new PassengerNotFoundError(id);
    }
    return passenger;
  }
}
