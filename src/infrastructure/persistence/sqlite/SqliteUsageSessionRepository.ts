import type { DatabaseSync } from 'node:sqlite';

import type {
  SessionSearch,
  TimeWindow,
  UsageSessionRepository,
} from '../../../application/ports/UsageSessionRepository.js';
import { UsageSession, type UsageSessionSnapshot } from '../../../domain/usage/UsageSession.js';

interface SessionRow {
  id: string;
  passenger_id: string;
  resource_id: string;
  tier_at_start: string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
}

export class SqliteUsageSessionRepository implements UsageSessionRepository {
  constructor(private readonly db: DatabaseSync) {}

  save(session: UsageSession): Promise<void> {
    const snapshot = session.toSnapshot();
    this.db
      .prepare(
        `INSERT INTO usage_sessions (
           id, passenger_id, resource_id, tier_at_start, started_at, ended_at, end_reason
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           passenger_id = excluded.passenger_id,
           resource_id = excluded.resource_id,
           tier_at_start = excluded.tier_at_start,
           started_at = excluded.started_at,
           ended_at = excluded.ended_at,
           end_reason = excluded.end_reason`,
      )
      .run(
        snapshot.id,
        snapshot.passengerId,
        snapshot.resourceId,
        snapshot.tierAtStart,
        snapshot.startedAt,
        snapshot.endedAt,
        snapshot.endReason,
      );
    return Promise.resolve();
  }

  findById(id: string): Promise<UsageSession | null> {
    const row = this.db.prepare('SELECT * FROM usage_sessions WHERE id = ?').get(id) as
      SessionRow | undefined;
    return Promise.resolve(row ? UsageSession.reconstitute(toSnapshot(row)) : null);
  }

  search(filter: SessionSearch): Promise<UsageSession[]> {
    return Promise.resolve(
      this.matching(filter).map((snapshot) => UsageSession.reconstitute(snapshot)),
    );
  }

  findActiveByPassengerAndResource(
    passengerId: string,
    resourceId: string,
  ): Promise<UsageSession | null> {
    const [first] = this.matching({ passengerId, resourceId, status: 'active' });
    return Promise.resolve(first ? UsageSession.reconstitute(first) : null);
  }

  countActive(resourceId: string): Promise<number> {
    return Promise.resolve(this.matching({ resourceId, status: 'active' }).length);
  }

  listActiveByPassenger(passengerId: string): Promise<UsageSession[]> {
    return this.search({ passengerId, status: 'active' });
  }

  listActiveByResource(resourceId: string): Promise<UsageSession[]> {
    return this.search({ resourceId, status: 'active' });
  }

  listActive(): Promise<UsageSession[]> {
    return this.search({ status: 'active' });
  }

  listOverlapping(window: TimeWindow, now: Date): Promise<UsageSession[]> {
    const from = window.from?.toISOString() ?? '0000-01-01T00:00:00.000Z';
    const to = window.to?.toISOString() ?? '9999-12-31T23:59:59.999Z';
    const nowIso = now.toISOString();
    const rows = this.db
      .prepare(
        `SELECT * FROM usage_sessions
         WHERE started_at < ?
           AND COALESCE(ended_at, ?) > ?
         ORDER BY started_at DESC, id DESC`,
      )
      .all(to, nowIso, from) as unknown as SessionRow[];
    return Promise.resolve(rows.map((row) => UsageSession.reconstitute(toSnapshot(row))));
  }

  private matching(filter: SessionSearch): UsageSessionSnapshot[] {
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
    if (filter.status === 'active') {
      clauses.push('ended_at IS NULL');
    }
    if (filter.status === 'ended') {
      clauses.push('ended_at IS NOT NULL');
    }
    if (filter.from !== undefined) {
      clauses.push('started_at >= ?');
      params.push(filter.from.toISOString());
    }
    if (filter.to !== undefined) {
      clauses.push('started_at < ?');
      params.push(filter.to.toISOString());
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM usage_sessions ${where} ORDER BY started_at DESC, id DESC`)
      .all(...params) as unknown as SessionRow[];
    return rows.map(toSnapshot);
  }
}

function toSnapshot(row: SessionRow): UsageSessionSnapshot {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    resourceId: row.resource_id,
    tierAtStart: row.tier_at_start,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
  };
}
