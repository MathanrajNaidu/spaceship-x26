import type { AuditLogRepository } from '../ports/AuditLogRepository.js';
import type { EventHandler } from '../ports/EventPublisher.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import { AuditEntry } from '../../domain/audit/AuditEntry.js';
import type { DomainEvent } from '../../domain/events/DomainEvent.js';

export class AuditLogSubscriber implements EventHandler {
  constructor(
    private readonly log: AuditLogRepository,
    private readonly ids: IdGenerator,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const detail = describe(event);
    await this.log.append(
      AuditEntry.record({
        id: this.ids.next('aud'),
        occurredAt: event.occurredAt,
        actorId: event.actor.id,
        actorRole: event.actor.role,
        action: event.type,
        outcome: event.type === 'UsageDenied' ? 'DENIED' : 'SUCCESS',
        ...detail,
      }),
    );
  }
}

function describe(event: DomainEvent): {
  passengerId?: string;
  resourceId?: string;
  sessionId?: string;
  reason?: string;
  metadata: Record<string, string>;
} {
  switch (event.type) {
    case 'PassengerCreated':
      return {
        passengerId: event.passengerId,
        metadata: { name: event.name, tier: event.tier },
      };
    case 'PassengerUpdated':
      return { passengerId: event.passengerId, metadata: { name: event.name } };
    case 'PassengerDeactivated':
      return { passengerId: event.passengerId, metadata: {} };
    case 'PassengerTierChanged':
      return {
        passengerId: event.passengerId,
        metadata: { from: event.from, to: event.to, direction: event.direction },
      };
    case 'ResourceProvisioned':
      return {
        resourceId: event.resourceId,
        metadata: {
          name: event.name,
          resourceType: event.resourceType,
          minimumTier: event.minimumTier,
        },
      };
    case 'ResourceDecommissioned':
      return { resourceId: event.resourceId, metadata: {} };
    case 'UsageStarted':
      return {
        passengerId: event.passengerId,
        resourceId: event.resourceId,
        sessionId: event.sessionId,
        metadata: { tierAtStart: event.tierAtStart },
      };
    case 'UsageEnded':
      return {
        passengerId: event.passengerId,
        resourceId: event.resourceId,
        sessionId: event.sessionId,
        reason: event.endReason,
        metadata: {},
      };
    case 'UsageDenied':
      return {
        passengerId: event.passengerId,
        resourceId: event.resourceId,
        reason: event.reason,
        metadata: {},
      };
  }
}
