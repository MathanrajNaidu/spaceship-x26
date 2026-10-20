import type {
  ActiveUsageSnapshot,
  ResourceDemandRow,
  TierUsageGroup,
  UsageHistory,
} from '../../application/services/ReportingService.js';
import { toResourceDto } from './resourcePresenter.js';
import { toSessionDto } from './sessionPresenter.js';

export function toHistoryDto(history: UsageHistory) {
  return {
    passengerId: history.passengerId,
    sessions: history.sessions.map(toSessionDto),
    totalsByResourceType: history.totalsByResourceType,
    daily: history.daily,
  };
}

export function toTierReportDto(groups: readonly TierUsageGroup[]) {
  return { tiers: groups };
}

export function toDemandDto(rows: readonly ResourceDemandRow[]) {
  return { data: rows };
}

export function toActiveUsageDto(snapshot: ActiveUsageSnapshot) {
  return {
    generatedAt: snapshot.generatedAt.toISOString(),
    resources: snapshot.resources.map((row) => ({
      ...toResourceDto(row.resource),
      occupancy: row.occupancy,
      sessions: row.sessions.map(toSessionDto),
    })),
  };
}
