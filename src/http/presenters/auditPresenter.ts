import type { AuditEntry } from '../../domain/audit/AuditEntry.js';

export function toAuditDto(entry: AuditEntry) {
  return {
    id: entry.id,
    occurredAt: entry.occurredAt.toISOString(),
    actor: { id: entry.actorId, role: entry.actorRole },
    action: entry.action,
    outcome: entry.outcome,
    passengerId: entry.passengerId ?? null,
    resourceId: entry.resourceId ?? null,
    sessionId: entry.sessionId ?? null,
    reason: entry.reason ?? null,
    metadata: entry.metadata,
  };
}
