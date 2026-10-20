import type { Actor } from '../auth/Actor.js';
import type { Authorizer } from '../auth/Authorizer.js';
import { toEventActor } from '../auth/eventActor.js';
import type { KeyedMutex } from '../concurrency/KeyedMutex.js';
import type { Clock } from '../ports/Clock.js';
import type { EventPublisher } from '../ports/EventPublisher.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import type { PassengerRepository } from '../ports/PassengerRepository.js';
import type { ResourceRepository } from '../ports/ResourceRepository.js';
import type { UsageSessionRepository } from '../ports/UsageSessionRepository.js';
import type { AccessPolicy } from '../../domain/access/AccessPolicy.js';
import { AccessDeniedError } from '../../domain/errors/AccessDeniedError.js';
import { AuthenticationError } from '../../domain/errors/AuthenticationError.js';
import type { DomainError } from '../../domain/errors/DomainError.js';
import {
  CapacityExceededError,
  ResourceDecommissionedError,
  SessionAlreadyActiveError,
} from '../../domain/errors/ConflictError.js';
import { ResourceNotFoundError, SessionNotFoundError } from '../../domain/errors/NotFoundError.js';
import type { Resource } from '../../domain/resource/Resource.js';
import { UsageSession, type EndReason } from '../../domain/usage/UsageSession.js';

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
    private readonly events: EventPublisher,
  ) {}

  async startUsage(actor: Actor, resourceId: string): Promise<UsageSession> {
    this.authorizer.requirePassenger(actor);
    return this.mutex.runExclusive(resourceId, () => this.startUsageUnlocked(actor, resourceId));
  }

  private async startUsageUnlocked(actor: Actor, resourceId: string): Promise<UsageSession> {
    const resource = await this.requireResource(resourceId);
    const passenger = await this.passengers.findById(actor.id);
    if (!passenger || passenger.status !== 'ACTIVE') {
      return this.deny(
        actor,
        actor.id,
        resource.id,
        new AuthenticationError('Unknown or inactive actor.'),
      );
    }
    if (resource.status === 'DECOMMISSIONED') {
      return this.deny(
        actor,
        passenger.id,
        resource.id,
        new ResourceDecommissionedError(resource.name),
      );
    }
    const decision = this.policy.evaluate(passenger, resource);
    if (!decision.allowed) {
      return this.deny(
        actor,
        passenger.id,
        resource.id,
        new AccessDeniedError(decision.message, decision.details),
      );
    }
    const existing = await this.sessions.findActiveByPassengerAndResource(
      passenger.id,
      resource.id,
    );
    if (existing) {
      return this.deny(
        actor,
        passenger.id,
        resource.id,
        new SessionAlreadyActiveError(resource.name, existing.id),
      );
    }
    const active = await this.sessions.countActive(resource.id);
    if (active >= resource.capacity) {
      return this.deny(
        actor,
        passenger.id,
        resource.id,
        new CapacityExceededError(resource.name, resource.capacity, active),
      );
    }
    const session = UsageSession.start({
      id: this.ids.next('ses'),
      passengerId: passenger.id,
      resourceId: resource.id,
      tierAtStart: passenger.tier,
      now: this.clock.now(),
    });
    await this.sessions.save(session);
    await this.events.publish({
      type: 'UsageStarted',
      occurredAt: session.startedAt,
      actor: toEventActor(actor),
      passengerId: passenger.id,
      resourceId: resource.id,
      sessionId: session.id,
      tierAtStart: passenger.tier.name,
    });
    return session;
  }

  private async deny(
    actor: Actor,
    passengerId: string,
    resourceId: string,
    error: DomainError,
  ): Promise<never> {
    await this.events.publish({
      type: 'UsageDenied',
      occurredAt: this.clock.now(),
      actor: toEventActor(actor),
      passengerId,
      resourceId,
      reason: error.code,
    });
    throw error;
  }

  async listOwn(actor: Actor, status?: 'active' | 'ended'): Promise<UsageSession[]> {
    this.authorizer.requirePassenger(actor);
    return this.sessions.search({
      passengerId: actor.id,
      ...(status === undefined ? {} : { status }),
    });
  }

  async endOwn(actor: Actor, sessionId: string): Promise<UsageSession> {
    const passenger = this.authorizer.requirePassenger(actor);
    return this.endSession(actor, sessionId, 'PASSENGER_ENDED', passenger.id);
  }

  async endByCrew(actor: Actor, sessionId: string): Promise<UsageSession> {
    this.authorizer.requireCrewLead(actor);
    return this.endSession(actor, sessionId, 'CREW_ENDED');
  }

  private async endSession(
    actor: Actor,
    sessionId: string,
    reason: EndReason,
    ownerId?: string,
  ): Promise<UsageSession> {
    const located = await this.sessions.findById(sessionId);
    if (!located || (ownerId !== undefined && located.passengerId !== ownerId)) {
      throw new SessionNotFoundError(sessionId);
    }
    return this.mutex.runExclusive(located.resourceId, async () => {
      const session = await this.sessions.findById(sessionId);
      if (!session || (ownerId !== undefined && session.passengerId !== ownerId)) {
        throw new SessionNotFoundError(sessionId);
      }
      const endedAt = this.clock.now();
      session.end(endedAt, reason);
      await this.sessions.save(session);
      await this.events.publish({
        type: 'UsageEnded',
        occurredAt: endedAt,
        actor: toEventActor(actor),
        passengerId: session.passengerId,
        resourceId: session.resourceId,
        sessionId: session.id,
        endReason: reason,
      });
      return session;
    });
  }

  private async requireResource(id: string): Promise<Resource> {
    const resource = await this.resources.findById(id);
    if (!resource) {
      throw new ResourceNotFoundError(id);
    }
    return resource;
  }
}
