import type { Actor } from '../auth/Actor.js';
import type { Authorizer } from '../auth/Authorizer.js';
import type { AuditLogRepository } from '../ports/AuditLogRepository.js';
import type { Clock } from '../ports/Clock.js';
import type { PassengerRepository } from '../ports/PassengerRepository.js';
import type { ResourceRepository } from '../ports/ResourceRepository.js';
import type { UsageSessionReader } from '../ports/UsageSessionRepository.js';
import {
  classifyDemand,
  compareDemand,
  type DemandLevel,
  type DemandThresholds,
} from '../reporting/DemandClassifier.js';
import { peakConcurrency } from '../reporting/peakConcurrency.js';
import { assertTimeRange } from '../timeRange.js';
import { AuthenticationError } from '../../domain/errors/AuthenticationError.js';
import { PassengerNotFoundError } from '../../domain/errors/NotFoundError.js';
import type { Resource, ResourceStatus } from '../../domain/resource/Resource.js';
import { RESOURCE_TYPES, type ResourceType } from '../../domain/resource/ResourceType.js';
import { TIERS, type TierName } from '../../domain/tier/MembershipTier.js';
import type { UsageSession } from '../../domain/usage/UsageSession.js';

export interface HistoryQuery {
  from?: Date;
  to?: Date;
}

export interface TypeTotal {
  readonly type: ResourceType;
  readonly sessions: number;
  readonly totalDurationMs: number;
}

export interface DailyTotal {
  readonly date: string;
  readonly sessions: number;
  readonly totalDurationMs: number;
}

export interface UsageHistory {
  readonly passengerId: string;
  readonly sessions: readonly UsageSession[];
  readonly totalsByResourceType: readonly TypeTotal[];
  readonly daily: readonly DailyTotal[];
}

export interface TopResource {
  readonly resourceId: string;
  readonly name: string;
  readonly sessions: number;
  readonly totalDurationMs: number;
}

export interface TierUsageGroup {
  readonly tier: TierName;
  readonly passengerCount: number;
  readonly sessions: number;
  readonly totalDurationMs: number;
  readonly topResources: readonly TopResource[];
}

export interface ActiveUsageResource {
  readonly resource: Resource;
  readonly occupancy: {
    readonly active: number;
    readonly capacity: number;
    readonly availableSlots: number;
  };
  readonly sessions: readonly UsageSession[];
}

export interface ActiveUsageSnapshot {
  readonly generatedAt: Date;
  readonly resources: readonly ActiveUsageResource[];
}

export interface ResourceDemandRow {
  readonly resourceId: string;
  readonly name: string;
  readonly status: ResourceStatus;
  readonly sessions: number;
  readonly totalDurationMs: number;
  readonly currentUtilisation: number;
  readonly peakUtilisation: number;
  readonly capacityDenials: number;
  readonly demandLevel: DemandLevel;
}

interface TierBucket {
  passengers: Set<string>;
  sessions: number;
  totalDurationMs: number;
  resources: Map<string, TopResource>;
}

export class ReportingService {
  constructor(
    private readonly authorizer: Authorizer,
    private readonly passengers: PassengerRepository,
    private readonly resources: ResourceRepository,
    private readonly sessions: UsageSessionReader,
    private readonly clock: Clock,
    private readonly audit: AuditLogRepository,
    private readonly thresholds: DemandThresholds,
  ) {}

  async ownHistory(actor: Actor, query: HistoryQuery): Promise<UsageHistory> {
    this.authorizer.requirePassenger(actor);
    assertTimeRange(query.from, query.to);
    const passenger = await this.passengers.findById(actor.id);
    if (!passenger || passenger.status !== 'ACTIVE') {
      throw new AuthenticationError('Unknown or inactive actor.');
    }
    return this.assemble(actor.id, query);
  }

  async passengerHistory(
    actor: Actor,
    passengerId: string,
    query: HistoryQuery,
  ): Promise<UsageHistory> {
    this.authorizer.requireCrewLead(actor);
    assertTimeRange(query.from, query.to);
    const passenger = await this.passengers.findById(passengerId);
    if (!passenger) {
      throw new PassengerNotFoundError(passengerId);
    }
    return this.assemble(passengerId, query);
  }

  async usageByTier(actor: Actor, query: HistoryQuery): Promise<readonly TierUsageGroup[]> {
    this.authorizer.requireCrewLead(actor);
    assertTimeRange(query.from, query.to);
    const sessions = await this.sessions.search({
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
    });
    const resources = new Map(
      (await this.resources.search({})).map((resource) => [resource.id, resource]),
    );
    const buckets = new Map<TierName, TierBucket>(
      TIERS.map((tier) => [
        tier,
        { passengers: new Set(), sessions: 0, totalDurationMs: 0, resources: new Map() },
      ]),
    );
    const now = this.clock.now();
    for (const session of sessions) {
      const bucket = buckets.get(session.tierAtStart.name);
      if (!bucket) {
        continue;
      }
      const duration = session.durationMs(now);
      bucket.passengers.add(session.passengerId);
      bucket.sessions += 1;
      bucket.totalDurationMs += duration;
      const resource = resources.get(session.resourceId);
      const current = bucket.resources.get(session.resourceId) ?? {
        resourceId: session.resourceId,
        name: resource?.name ?? session.resourceId,
        sessions: 0,
        totalDurationMs: 0,
      };
      bucket.resources.set(session.resourceId, {
        ...current,
        sessions: current.sessions + 1,
        totalDurationMs: current.totalDurationMs + duration,
      });
    }
    return TIERS.map((tier) => {
      const bucket = buckets.get(tier);
      const topResources = [...(bucket?.resources.values() ?? [])].sort(byDemand).slice(0, 3);
      return {
        tier,
        passengerCount: bucket?.passengers.size ?? 0,
        sessions: bucket?.sessions ?? 0,
        totalDurationMs: bucket?.totalDurationMs ?? 0,
        topResources,
      };
    });
  }

  async resourceDemand(actor: Actor, query: HistoryQuery): Promise<readonly ResourceDemandRow[]> {
    this.authorizer.requireCrewLead(actor);
    assertTimeRange(query.from, query.to);
    const now = this.clock.now();
    const resources = await this.resources.search({});
    const overlapping = await this.sessions.listOverlapping(
      {
        ...(query.from === undefined ? {} : { from: query.from }),
        ...(query.to === undefined ? {} : { to: query.to }),
      },
      now,
    );
    const denials = await this.audit.query({
      action: 'UsageDenied',
      outcome: 'DENIED',
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
    });
    const denialCount = new Map<string, number>();
    for (const entry of denials) {
      if (entry.reason !== 'CAPACITY_EXCEEDED' || entry.resourceId === undefined) {
        continue;
      }
      denialCount.set(entry.resourceId, (denialCount.get(entry.resourceId) ?? 0) + 1);
    }
    const rows: ResourceDemandRow[] = [];
    for (const resource of resources) {
      const mine = overlapping.filter((session) => session.resourceId === resource.id);
      const intervals = mine.flatMap((session) => {
        const clipped = clipToWindow(
          session.startedAt,
          session.endedAt ?? now,
          query.from,
          query.to,
        );
        return clipped === null ? [] : [clipped];
      });
      const peak = peakConcurrency(intervals);
      const active = (await this.sessions.search({ resourceId: resource.id, status: 'active' }))
        .length;
      const capacityDenials = denialCount.get(resource.id) ?? 0;
      const peakUtilisation = peak / resource.capacity;
      const row: ResourceDemandRow = {
        resourceId: resource.id,
        name: resource.name,
        status: resource.status,
        sessions: mine.length,
        totalDurationMs: intervals.reduce(
          (sum, interval) => sum + (interval.end.getTime() - interval.start.getTime()),
          0,
        ),
        currentUtilisation: active / resource.capacity,
        peakUtilisation,
        capacityDenials,
        demandLevel: classifyDemand({ peakUtilisation, capacityDenials }, this.thresholds),
      };
      rows.push(row);
    }
    return rows.sort(compareDemand);
  }

  async activeUsage(actor: Actor): Promise<ActiveUsageSnapshot> {
    this.authorizer.requireCrewLead(actor);
    const resources = await this.resources.search({ status: 'ACTIVE' });
    const active = await this.sessions.listActive();
    return {
      generatedAt: this.clock.now(),
      resources: resources.map((resource) => {
        const sessions = active.filter((session) => session.resourceId === resource.id);
        return {
          resource,
          occupancy: {
            active: sessions.length,
            capacity: resource.capacity,
            availableSlots: resource.capacity - sessions.length,
          },
          sessions,
        };
      }),
    };
  }

  private async assemble(passengerId: string, query: HistoryQuery): Promise<UsageHistory> {
    const sessions = await this.sessions.search({
      passengerId,
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
    });
    const resources = new Map(
      (await this.resources.search({})).map((resource) => [resource.id, resource]),
    );
    const now = this.clock.now();
    const totals = new Map<ResourceType, TypeTotal>(
      RESOURCE_TYPES.map((type) => [type, { type, sessions: 0, totalDurationMs: 0 }]),
    );
    const days = new Map<string, DailyTotal>();
    for (const session of sessions) {
      const duration = session.durationMs(now);
      const resource = resources.get(session.resourceId);
      if (resource) {
        const current = totals.get(resource.type);
        if (current) {
          totals.set(resource.type, {
            type: resource.type,
            sessions: current.sessions + 1,
            totalDurationMs: current.totalDurationMs + duration,
          });
        }
      }
      const date = session.startedAt.toISOString().slice(0, 10);
      const day = days.get(date) ?? { date, sessions: 0, totalDurationMs: 0 };
      days.set(date, {
        date,
        sessions: day.sessions + 1,
        totalDurationMs: day.totalDurationMs + duration,
      });
    }
    return {
      passengerId,
      sessions,
      totalsByResourceType: RESOURCE_TYPES.map((type) => totals.get(type)).filter(
        (total): total is TypeTotal => total !== undefined,
      ),
      daily: [...days.values()].sort((left, right) => left.date.localeCompare(right.date)),
    };
  }
}

function clipToWindow(
  start: Date,
  end: Date,
  from: Date | undefined,
  to: Date | undefined,
): { start: Date; end: Date } | null {
  const windowStart = from?.getTime() ?? Number.NEGATIVE_INFINITY;
  const windowEnd = to?.getTime() ?? Number.POSITIVE_INFINITY;
  const clippedStart = Math.max(start.getTime(), windowStart);
  const clippedEnd = Math.min(end.getTime(), windowEnd);
  if (clippedEnd <= clippedStart) {
    return null;
  }
  return { start: new Date(clippedStart), end: new Date(clippedEnd) };
}

function byDemand(left: TopResource, right: TopResource): number {
  return (
    right.totalDurationMs - left.totalDurationMs ||
    right.sessions - left.sessions ||
    left.name.localeCompare(right.name)
  );
}
