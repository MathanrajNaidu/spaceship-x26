import type { Actor } from '../auth/Actor.js';
import type { Authorizer } from '../auth/Authorizer.js';
import type { KeyedMutex } from '../concurrency/KeyedMutex.js';
import type { Clock } from '../ports/Clock.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import type { PassengerRepository } from '../ports/PassengerRepository.js';
import type { ResourceRepository } from '../ports/ResourceRepository.js';
import type { UsageSessionRepository } from '../ports/UsageSessionRepository.js';
import type { AccessPolicy } from '../../domain/access/AccessPolicy.js';
import { AccessDeniedError } from '../../domain/errors/AccessDeniedError.js';
import { AuthenticationError } from '../../domain/errors/AuthenticationError.js';
import {
  CapacityExceededError,
  ResourceDecommissionedError,
  SessionAlreadyActiveError,
} from '../../domain/errors/ConflictError.js';
import { ResourceNotFoundError } from '../../domain/errors/NotFoundError.js';
import type { Passenger } from '../../domain/passenger/Passenger.js';
import type { Resource } from '../../domain/resource/Resource.js';
import { UsageSession } from '../../domain/usage/UsageSession.js';

export class UsageService {
  constructor(
    private readonly authorizer: Authorizer,
    private readonly passengers: PassengerRepository,
    private readonly resources: ResourceRepository,
    private readonly sessions: UsageSessionRepository,
    private readonly policy: AccessPolicy,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly mutex: KeyedMutex,
  ) {}

  async startUsage(actor: Actor, resourceId: string): Promise<UsageSession> {
    this.authorizer.requirePassenger(actor);
    return this.mutex.runExclusive(resourceId, () => this.startUsageUnlocked(actor, resourceId));
  }

  private async startUsageUnlocked(actor: Actor, resourceId: string): Promise<UsageSession> {
    const resource = await this.requireResource(resourceId);
    const passenger = await this.requireActivePassenger(actor.id);
    if (resource.status === 'DECOMMISSIONED') {
      throw new ResourceDecommissionedError(resource.name);
    }
    const decision = this.policy.evaluate(passenger, resource);
    if (!decision.allowed) {
      throw new AccessDeniedError(decision.message, decision.details);
    }
    const existing = await this.sessions.findActiveByPassengerAndResource(
      passenger.id,
      resource.id,
    );
    if (existing) {
      throw new SessionAlreadyActiveError(resource.name, existing.id);
    }
    const active = await this.sessions.countActive(resource.id);
    if (active >= resource.capacity) {
      throw new CapacityExceededError(resource.name, resource.capacity, active);
    }
    const session = UsageSession.start({
      id: this.ids.next('ses'),
      passengerId: passenger.id,
      resourceId: resource.id,
      tierAtStart: passenger.tier,
      now: this.clock.now(),
    });
    await this.sessions.save(session);
    return session;
  }

  private async requireResource(id: string): Promise<Resource> {
    const resource = await this.resources.findById(id);
    if (!resource) {
      throw new ResourceNotFoundError(id);
    }
    return resource;
  }

  private async requireActivePassenger(id: string): Promise<Passenger> {
    const passenger = await this.passengers.findById(id);
    if (!passenger || passenger.status !== 'ACTIVE') {
      throw new AuthenticationError('Unknown or inactive actor.');
    }
    return passenger;
  }
}
