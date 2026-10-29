import type { DatabaseSync } from 'node:sqlite';

import type {
  PassengerRepository,
  PassengerSearch,
} from '../../../application/ports/PassengerRepository.js';
import { Passenger, type PassengerSnapshot } from '../../../domain/passenger/Passenger.js';

interface PassengerRow {
  id: string;
  name: string;
  tier: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export class SqlitePassengerRepository implements PassengerRepository {
  constructor(private readonly db: DatabaseSync) {}

  save(passenger: Passenger): Promise<void> {
    const snapshot = passenger.toSnapshot();
    this.db
      .prepare(
        `INSERT INTO passengers (id, name, tier, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           tier = excluded.tier,
           status = excluded.status,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
      )
      .run(
        snapshot.id,
        snapshot.name,
        snapshot.tier,
        snapshot.status,
        snapshot.createdAt,
        snapshot.updatedAt,
      );
    return Promise.resolve();
  }

  findById(id: string): Promise<Passenger | null> {
    const row = this.db.prepare('SELECT * FROM passengers WHERE id = ?').get(id) as
      PassengerRow | undefined;
    return Promise.resolve(row ? Passenger.reconstitute(toSnapshot(row)) : null);
  }

  search(filter: PassengerSearch): Promise<Passenger[]> {
    const clauses: string[] = [];
    const params: string[] = [];
    if (filter.tier !== undefined) {
      clauses.push('tier = ?');
      params.push(filter.tier);
    }
    if (filter.status !== undefined) {
      clauses.push('status = ?');
      params.push(filter.status);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM passengers ${where} ORDER BY created_at ASC, id ASC`)
      .all(...params) as unknown as PassengerRow[];
    return Promise.resolve(rows.map((row) => Passenger.reconstitute(toSnapshot(row))));
  }
}

function toSnapshot(row: PassengerRow): PassengerSnapshot {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
