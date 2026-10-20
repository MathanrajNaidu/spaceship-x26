import type { AuditEntry, AuditOutcome } from '../../domain/audit/AuditEntry.js';

export interface AuditFilter {
  passengerId?: string;
  resourceId?: string;
  action?: string;
  outcome?: AuditOutcome;
  from?: Date;
  to?: Date;
}

export interface AuditLogRepository {
  append(entry: AuditEntry): Promise<void>;
  query(filter: AuditFilter): Promise<AuditEntry[]>;
}
