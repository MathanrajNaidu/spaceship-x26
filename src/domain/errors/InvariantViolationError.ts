import { DomainError } from './DomainError.js';

export class InvariantViolationError extends DomainError {
  readonly code: string;

  constructor(message: string, code: string, details?: Readonly<Record<string, unknown>>) {
    super(message, details);
    this.code = code;
  }
}

export class CrewRosterInvariantError extends InvariantViolationError {
  constructor(message: string, details: Readonly<Record<string, unknown>>) {
    super(message, 'CREW_ROSTER_INVALID', details);
  }
}
