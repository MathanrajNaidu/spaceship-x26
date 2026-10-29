import type { DatabaseSync } from 'node:sqlite';

import type {
  AuditFilter,
  AuditLogRepository,
} from '../../../application/ports/AuditLogRepository.js';
import { AuditEntry, type AuditEntrySnapshot } from '../../../domain/audit/AuditEntry.js';

interface AuditRow {
  id: string;
  occurred_at: string;
  actor_id: string;
  actor_role: string;
  action: string;
  outcome: string;
  passenger_id: string | null;
  resource_id: string | null;
  session_id: string | null;
  reason: string | null;
  metadata: string;
}

export class SqliteAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: DatabaseSync) {}

  append(entry: AuditEntry): Promise<void> {
    const snapshot = entry.toSnapshot();
    this.db
      .prepare(
        `INSERT INTO audit_entries (
           id, occurred_at, actor_id, actor_role, action, outcome,
           passenger_id, resource_id, session_id, reason, metadata
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        snapshot.id,
        snapshot.occurredAt,
        snapshot.actorId,
        snapshot.actorRole,
        snapshot.action,
        snapshot.outcome,
        snapshot.passengerId,
        snapshot.resourceId,
        snapshot.sessionId,
        snapshot.reason,
        JSON.stringify(snapshot.metadata),
      );
    return Promise.resolve();
  }

  query(filter: AuditFilter): Promise<AuditEntry[]> {
    const clauses: string[] = [];
    const params: Array<string> = [];
    if (filter.passengerId !== undefined) {
      clauses.push('passenger_id = ?');
      params.push(filter.passengerId);
    }
    if (filter.resourceId !== undefined) {
      clauses.push('resource_id = ?');
      params.push(filter.resourceId);
    }
    if (filter.action !== undefined) {
      clauses.push('action = ?');
      params.push(filter.action);
    }
    if (filter.outcome !== undefined) {
      clauses.push('outcome = ?');
      params.push(filter.outcome);
    }
    if (filter.from !== undefined) {
      clauses.push('occurred_at >= ?');
      params.push(filter.from.toISOString());
    }
    if (filter.to !== undefined) {
      clauses.push('occurred_at < ?');
      params.push(filter.to.toISOString());
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM audit_entries ${where} ORDER BY occurred_at DESC, id DESC`)
      .all(...params) as unknown as AuditRow[];
    return Promise.resolve(rows.map((row) => AuditEntry.reconstitute(toSnapshot(row))));
  }
}

function toSnapshot(row: AuditRow): AuditEntrySnapshot {
  const parsed: unknown = JSON.parse(row.metadata);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Audit metadata must be a JSON object.');
  }
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    outcome: row.outcome,
    passengerId: row.passenger_id,
    resourceId: row.resource_id,
    sessionId: row.session_id,
    reason: row.reason,
    metadata: parsed as Readonly<Record<string, unknown>>,
  };
}
