import { DomainError } from './DomainError.js';

export class ConflictError extends DomainError {
  readonly code: string;

  constructor(message: string, code: string, details?: Readonly<Record<string, unknown>>) {
    super(message, details);
    this.code = code;
  }
}

export class CapacityExceededError extends ConflictError {
  constructor(resourceName: string, capacity: number, active: number) {
    super(
      `Resource '${resourceName}' is at capacity (${active}/${capacity}).`,
      'CAPACITY_EXCEEDED',
      { resourceName, capacity, active },
    );
  }
}

export class SessionAlreadyActiveError extends ConflictError {
  constructor(resourceName: string, sessionId: string) {
    super(
      `Passenger already has an active session on resource '${resourceName}'.`,
      'SESSION_ALREADY_ACTIVE',
      { resourceName, sessionId },
    );
  }
}

export class SessionAlreadyEndedError extends ConflictError {
  constructor(sessionId: string) {
    super(`Session '${sessionId}' has already ended.`, 'SESSION_ALREADY_ENDED', { sessionId });
  }
}

export class ResourceInUseError extends ConflictError {
  constructor(resourceName: string, active: number) {
    const noun = active === 1 ? 'session is' : 'sessions are';
    super(
      `Resource '${resourceName}' cannot be decommissioned while ${active} ${noun} active.`,
      'RESOURCE_IN_USE',
      { resourceName, active },
    );
  }
}

export class ResourceDecommissionedError extends ConflictError {
  constructor(resourceName: string) {
    super(`Resource '${resourceName}' is decommissioned.`, 'RESOURCE_DECOMMISSIONED', {
      resourceName,
    });
  }
}

export class PassengerInactiveError extends ConflictError {
  constructor(passengerName: string) {
    super(`Passenger '${passengerName}' is inactive.`, 'PASSENGER_INACTIVE', { passengerName });
  }
}

export class TierUnchangedError extends ConflictError {
  constructor(passengerName: string, tier: string) {
    super(`Passenger '${passengerName}' is already ${tier}.`, 'TIER_UNCHANGED', {
      passengerName,
      tier,
    });
  }
}
