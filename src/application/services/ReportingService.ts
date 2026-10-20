import type { Actor } from '../auth/Actor.js';
import type { Authorizer } from '../auth/Authorizer.js';
import { assertTimeRange } from '../timeRange.js';
import type { Clock } from '../ports/Clock.js';
import type { PassengerRepository } from '../ports/PassengerRepository.js';
import type { ResourceRepository } from '../ports/ResourceRepository.js';
import type { UsageSessionReader } from '../ports/UsageSessionRepository.js';
import { AuthenticationError } from '../../domain/errors/AuthenticationError.js';
import { PassengerNotFoundError } from '../../domain/errors/NotFoundError.js';
import { RESOURCE_TYPES, type ResourceType } from '../../domain/resource/ResourceType.js';
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

export class ReportingService {
  constructor(
    private readonly authorizer: Authorizer,
    private readonly passengers: PassengerRepository,
    private readonly resources: ResourceRepository,
    private readonly sessions: UsageSessionReader,
    private readonly clock: Clock,
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
