import { ValidationError } from '../errors/ValidationError.js';

export const AUDIT_OUTCOMES = ['SUCCESS', 'DENIED'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const AUDIT_ROLES = ['CREW_LEAD', 'PASSENGER'] as const;
export type AuditRole = (typeof AUDIT_ROLES)[number];

export interface AuditEntrySnapshot {
  id: string;
  occurredAt: string;
  actorId: string;
  actorRole: string;
  action: string;
  outcome: string;
  passengerId: string | null;
  resourceId: string | null;
  sessionId: string | null;
  reason: string | null;
  metadata: Readonly<Record<string, unknown>>;
}

export interface RecordAuditProps {
  id: string;
  occurredAt: Date;
  actorId: string;
  actorRole: AuditRole;
  action: string;
  outcome: AuditOutcome;
  passengerId?: string;
  resourceId?: string;
  sessionId?: string;
  reason?: string;
  metadata?: Readonly<Record<string, string>>;
}

export class AuditEntry {
  private constructor(
    readonly id: string,
    readonly occurredAt: Date,
    readonly actorId: string,
    readonly actorRole: AuditRole,
    readonly action: string,
    readonly outcome: AuditOutcome,
    readonly passengerId: string | undefined,
    readonly resourceId: string | undefined,
    readonly sessionId: string | undefined,
    readonly reason: string | undefined,
    readonly metadata: Readonly<Record<string, string>>,
  ) {}

  static record(props: RecordAuditProps): AuditEntry {
    return new AuditEntry(
      requireText(props.id, 'Audit id'),
      props.occurredAt,
      requireText(props.actorId, 'Actor id'),
      props.actorRole,
      requireText(props.action, 'Audit action'),
      props.outcome,
      props.passengerId,
      props.resourceId,
      props.sessionId,
      props.reason,
      { ...(props.metadata ?? {}) },
    );
  }

  static reconstitute(snapshot: AuditEntrySnapshot): AuditEntry {
    return new AuditEntry(
      requireText(snapshot.id, 'Audit id'),
      parseInstant(snapshot.occurredAt),
      requireText(snapshot.actorId, 'Actor id'),
      parseRole(snapshot.actorRole),
      requireText(snapshot.action, 'Audit action'),
      parseOutcome(snapshot.outcome),
      snapshot.passengerId ?? undefined,
      snapshot.resourceId ?? undefined,
      snapshot.sessionId ?? undefined,
      snapshot.reason ?? undefined,
      parseMetadata(snapshot.metadata),
    );
  }

  toSnapshot(): AuditEntrySnapshot {
    return {
      id: this.id,
      occurredAt: this.occurredAt.toISOString(),
      actorId: this.actorId,
      actorRole: this.actorRole,
      action: this.action,
      outcome: this.outcome,
      passengerId: this.passengerId ?? null,
      resourceId: this.resourceId ?? null,
      sessionId: this.sessionId ?? null,
      reason: this.reason ?? null,
      metadata: { ...this.metadata },
    };
  }
}

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} must not be blank.`);
  }
  return trimmed;
}

function parseInstant(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError('occurredAt is not a valid timestamp.');
  }
  return parsed;
}

function parseRole(value: string): AuditRole {
  if ((AUDIT_ROLES as readonly string[]).includes(value)) {
    return value as AuditRole;
  }
  throw new ValidationError(`Unknown audit actor role '${value}'.`);
}

function parseOutcome(value: string): AuditOutcome {
  if ((AUDIT_OUTCOMES as readonly string[]).includes(value)) {
    return value as AuditOutcome;
  }
  throw new ValidationError(`Unknown audit outcome '${value}'.`);
}

function parseMetadata(value: Readonly<Record<string, unknown>>): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      throw new ValidationError('Audit metadata values must be strings.');
    }
    metadata[key] = entry;
  }
  return metadata;
}
