import type {
  AuditFilter,
  AuditLogRepository,
} from '../../../application/ports/AuditLogRepository.js';
import { AuditEntry, type AuditEntrySnapshot } from '../../../domain/audit/AuditEntry.js';

export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly items: AuditEntrySnapshot[] = [];

  append(entry: AuditEntry): Promise<void> {
    this.items.push(entry.toSnapshot());
    return Promise.resolve();
  }

  query(filter: AuditFilter): Promise<AuditEntry[]> {
    const from = filter.from?.getTime();
    const to = filter.to?.getTime();
    const matched = this.items
      .filter((snapshot) => matches(snapshot, filter, from, to))
      .sort(byOccurredDesc)
      .map((snapshot) => AuditEntry.reconstitute(snapshot));
    return Promise.resolve(matched);
  }
}

function matches(
  snapshot: AuditEntrySnapshot,
  filter: AuditFilter,
  from: number | undefined,
  to: number | undefined,
): boolean {
  if (filter.passengerId !== undefined && snapshot.passengerId !== filter.passengerId) {
    return false;
  }
  if (filter.resourceId !== undefined && snapshot.resourceId !== filter.resourceId) {
    return false;
  }
  if (filter.action !== undefined && snapshot.action !== filter.action) {
    return false;
  }
  if (filter.outcome !== undefined && snapshot.outcome !== filter.outcome) {
    return false;
  }
  const occurred = Date.parse(snapshot.occurredAt);
  if (from !== undefined && occurred < from) {
    return false;
  }
  if (to !== undefined && occurred >= to) {
    return false;
  }
  return true;
}

function byOccurredDesc(left: AuditEntrySnapshot, right: AuditEntrySnapshot): number {
  const byTime = right.occurredAt.localeCompare(left.occurredAt);
  return byTime !== 0 ? byTime : right.id.localeCompare(left.id);
}
