import { SessionAlreadyEndedError } from '../errors/ConflictError.js';
import { ValidationError, InvalidTimestampError } from '../errors/ValidationError.js';
import { MembershipTier } from '../tier/MembershipTier.js';

export const END_REASONS = [
  'PASSENGER_ENDED',
  'CREW_ENDED',
  'TIER_DOWNGRADED',
  'PASSENGER_DEACTIVATED',
] as const;

export type EndReason = (typeof END_REASONS)[number];

export interface UsageSessionSnapshot {
  id: string;
  passengerId: string;
  resourceId: string;
  tierAtStart: string;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
}

export class UsageSession {
  private constructor(
    readonly id: string,
    readonly passengerId: string,
    readonly resourceId: string,
    readonly tierAtStart: MembershipTier,
    readonly startedAt: Date,
    private _endedAt: Date | undefined,
    private _endReason: EndReason | undefined,
  ) {}

  get endedAt(): Date | undefined {
    return this._endedAt;
  }

  get endReason(): EndReason | undefined {
    return this._endReason;
  }

  get isActive(): boolean {
    return this._endedAt === undefined;
  }

  static start(props: {
    id: string;
    passengerId: string;
    resourceId: string;
    tierAtStart: MembershipTier;
    now: Date;
  }): UsageSession {
    const id = props.id.trim();
    const passengerId = props.passengerId.trim();
    const resourceId = props.resourceId.trim();
    if (id.length === 0 || passengerId.length === 0 || resourceId.length === 0) {
      throw new ValidationError('Session id, passenger id and resource id must not be blank.');
    }
    return new UsageSession(
      id,
      passengerId,
      resourceId,
      props.tierAtStart,
      props.now,
      undefined,
      undefined,
    );
  }

  static reconstitute(snapshot: UsageSessionSnapshot): UsageSession {
    const endedAt =
      snapshot.endedAt === null ? undefined : parseInstant(snapshot.endedAt, 'endedAt');
    const endReason = parseEndReason(snapshot.endReason);
    if ((endedAt === undefined) !== (endReason === undefined)) {
      throw new ValidationError('A session end timestamp and end reason must be set together.');
    }
    if (
      endedAt !== undefined &&
      endedAt.getTime() < parseInstant(snapshot.startedAt, 'startedAt').getTime()
    ) {
      throw new InvalidTimestampError('Session end cannot be earlier than its start.');
    }
    return new UsageSession(
      snapshot.id,
      snapshot.passengerId,
      snapshot.resourceId,
      MembershipTier.from(snapshot.tierAtStart),
      parseInstant(snapshot.startedAt, 'startedAt'),
      endedAt,
      endReason,
    );
  }

  toSnapshot(): UsageSessionSnapshot {
    return {
      id: this.id,
      passengerId: this.passengerId,
      resourceId: this.resourceId,
      tierAtStart: this.tierAtStart.name,
      startedAt: this.startedAt.toISOString(),
      endedAt: this._endedAt?.toISOString() ?? null,
      endReason: this._endReason ?? null,
    };
  }

  end(now: Date, reason: EndReason): void {
    if (!this.isActive) {
      throw new SessionAlreadyEndedError(this.id);
    }
    if (now.getTime() < this.startedAt.getTime()) {
      throw new InvalidTimestampError();
    }
    this._endedAt = now;
    this._endReason = reason;
  }

  durationMs(now: Date): number {
    const end = this._endedAt ?? now;
    return end.getTime() - this.startedAt.getTime();
  }
}

function parseEndReason(value: string | null): EndReason | undefined {
  if (value === null) {
    return undefined;
  }
  if ((END_REASONS as readonly string[]).includes(value)) {
    return value as EndReason;
  }
  throw new ValidationError(`Unknown session end reason '${value}'.`);
}

function parseInstant(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${label} is not a valid timestamp.`);
  }
  return parsed;
}
