import type { UsageSession } from '../../domain/usage/UsageSession.js';

export interface SessionSearch {
  passengerId?: string;
  resourceId?: string;
  status?: 'active' | 'ended';
  from?: Date;
  to?: Date;
}

export interface TimeWindow {
  from?: Date;
  to?: Date;
}

export interface UsageSessionReader {
  findById(id: string): Promise<UsageSession | null>;
  search(filter: SessionSearch): Promise<UsageSession[]>;
  listActive(): Promise<UsageSession[]>;
  listOverlapping(window: TimeWindow, now: Date): Promise<UsageSession[]>;
}

export interface UsageSessionRepository extends UsageSessionReader {
  save(session: UsageSession): Promise<void>;
  findActiveByPassengerAndResource(
    passengerId: string,
    resourceId: string,
  ): Promise<UsageSession | null>;
  countActive(resourceId: string): Promise<number>;
  listActiveByPassenger(passengerId: string): Promise<UsageSession[]>;
  listActiveByResource(resourceId: string): Promise<UsageSession[]>;
}
