import type { Actor } from '../auth/Actor.js';
import type { Authorizer } from '../auth/Authorizer.js';
import { slicePage, type Page } from '../pagination.js';
import type { AuditFilter, AuditLogRepository } from '../ports/AuditLogRepository.js';
import { assertTimeRange } from '../timeRange.js';
import type { AuditEntry } from '../../domain/audit/AuditEntry.js';

export class AuditService {
  constructor(
    private readonly authorizer: Authorizer,
    private readonly log: AuditLogRepository,
  ) {}

  async query(
    actor: Actor,
    filter: AuditFilter & { limit: number; offset: number },
  ): Promise<Page<AuditEntry>> {
    this.authorizer.requireCrewLead(actor);
    assertTimeRange(filter.from, filter.to);
    const { limit, offset, ...criteria } = filter;
    return slicePage(await this.log.query(criteria), limit, offset);
  }
}
