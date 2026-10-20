import type {
  SessionSearch,
  TimeWindow,
  UsageSessionRepository,
} from '../../../application/ports/UsageSessionRepository.js';
import { UsageSession, type UsageSessionSnapshot } from '../../../domain/usage/UsageSession.js';

export class InMemoryUsageSessionRepository implements UsageSessionRepository {
  private readonly items = new Map<string, UsageSessionSnapshot>();

  save(session: UsageSession): Promise<void> {
    this.items.set(session.id, session.toSnapshot());
    return Promise.resolve();
  }

  findById(id: string): Promise<UsageSession | null> {
    const snapshot = this.items.get(id);
    return Promise.resolve(snapshot ? UsageSession.reconstitute(snapshot) : null);
  }

  search(filter: SessionSearch): Promise<UsageSession[]> {
    return Promise.resolve(
      this.matching(filter)
        .sort(byStartedDesc)
        .map((snapshot) => UsageSession.reconstitute(snapshot)),
    );
  }

  findActiveByPassengerAndResource(
    passengerId: string,
    resourceId: string,
  ): Promise<UsageSession | null> {
    const snapshot = this.matching({ passengerId, resourceId, status: 'active' })[0];
    return Promise.resolve(snapshot ? UsageSession.reconstitute(snapshot) : null);
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
    const from = window.from?.getTime() ?? Number.NEGATIVE_INFINITY;
    const to = window.to?.getTime() ?? Number.POSITIVE_INFINITY;
    const matches = [...this.items.values()]
      .filter((snapshot) => overlaps(snapshot, from, to, now.getTime()))
      .sort(byStartedDesc)
      .map((snapshot) => UsageSession.reconstitute(snapshot));
    return Promise.resolve(matches);
  }

  private matching(filter: SessionSearch): UsageSessionSnapshot[] {
    return [...this.items.values()].filter((snapshot) => matches(snapshot, filter));
  }
}

function matches(snapshot: UsageSessionSnapshot, filter: SessionSearch): boolean {
  if (filter.passengerId !== undefined && snapshot.passengerId !== filter.passengerId) {
    return false;
  }
  if (filter.resourceId !== undefined && snapshot.resourceId !== filter.resourceId) {
    return false;
  }
  if (filter.status === 'active' && snapshot.endedAt !== null) {
    return false;
  }
  if (filter.status === 'ended' && snapshot.endedAt === null) {
    return false;
  }
  const started = Date.parse(snapshot.startedAt);
  if (filter.from !== undefined && started < filter.from.getTime()) {
    return false;
  }
  if (filter.to !== undefined && started >= filter.to.getTime()) {
    return false;
  }
  return true;
}

function overlaps(snapshot: UsageSessionSnapshot, from: number, to: number, now: number): boolean {
  const started = Date.parse(snapshot.startedAt);
  const ended = snapshot.endedAt === null ? now : Date.parse(snapshot.endedAt);
  return started < to && ended > from;
}

function byStartedDesc(left: UsageSessionSnapshot, right: UsageSessionSnapshot): number {
  const byTime = right.startedAt.localeCompare(left.startedAt);
  return byTime !== 0 ? byTime : right.id.localeCompare(left.id);
}
