import type { DatabaseSync } from 'node:sqlite';

import type {
  ResourceRepository,
  ResourceSearch,
} from '../../../application/ports/ResourceRepository.js';
import { Resource, type ResourceSnapshot } from '../../../domain/resource/Resource.js';

interface ResourceRow {
  id: string;
  name: string;
  type: string;
  minimum_tier: string;
  capacity: number;
  status: string;
  provisioned_at: string;
  decommissioned_at: string | null;
}

export class SqliteResourceRepository implements ResourceRepository {
  constructor(private readonly db: DatabaseSync) {}

  save(resource: Resource): Promise<void> {
    const snapshot = resource.toSnapshot();
    this.db
      .prepare(
        `INSERT INTO resources (
           id, name, type, minimum_tier, capacity, status, provisioned_at, decommissioned_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           type = excluded.type,
           minimum_tier = excluded.minimum_tier,
           capacity = excluded.capacity,
           status = excluded.status,
           provisioned_at = excluded.provisioned_at,
           decommissioned_at = excluded.decommissioned_at`,
      )
      .run(
        snapshot.id,
        snapshot.name,
        snapshot.type,
        snapshot.minimumTier,
        snapshot.capacity,
        snapshot.status,
        snapshot.provisionedAt,
        snapshot.decommissionedAt,
      );
    return Promise.resolve();
  }

  findById(id: string): Promise<Resource | null> {
    const row = this.db.prepare('SELECT * FROM resources WHERE id = ?').get(id) as
      ResourceRow | undefined;
    return Promise.resolve(row ? Resource.reconstitute(toSnapshot(row)) : null);
  }

  search(filter: ResourceSearch): Promise<Resource[]> {
    const clauses: string[] = [];
    const params: Array<string> = [];
    if (filter.status !== undefined) {
      clauses.push('status = ?');
      params.push(filter.status);
    }
    if (filter.minimumTier !== undefined) {
      clauses.push('minimum_tier = ?');
      params.push(filter.minimumTier);
    }
    if (filter.type !== undefined) {
      clauses.push('type = ?');
      params.push(filter.type);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM resources ${where} ORDER BY provisioned_at ASC, id ASC`)
      .all(...params) as unknown as ResourceRow[];
    return Promise.resolve(rows.map((row) => Resource.reconstitute(toSnapshot(row))));
  }
}

function toSnapshot(row: ResourceRow): ResourceSnapshot {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    minimumTier: row.minimum_tier,
    capacity: row.capacity,
    status: row.status,
    provisionedAt: row.provisioned_at,
    decommissionedAt: row.decommissioned_at,
  };
}
