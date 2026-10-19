import { DomainError } from './DomainError.js';

export class ValidationError extends DomainError {
  readonly code: string;

  constructor(
    message: string,
    code = 'VALIDATION_ERROR',
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message, details);
    this.code = code;
  }
}

export class InvalidTierError extends ValidationError {
  constructor(value: string) {
    super(`Unknown membership tier '${value}'.`, 'INVALID_TIER', { value });
  }
}

export class InvalidCapacityError extends ValidationError {
  constructor(capacity: number) {
    super('Capacity must be an integer greater than or equal to 1.', 'INVALID_CAPACITY', {
      capacity,
    });
  }
}

export class InvalidResourceTypeError extends ValidationError {
  constructor(value: string) {
    super(`Unknown resource type '${value}'.`, 'INVALID_RESOURCE_TYPE', { value });
  }
}

export class InvalidNameError extends ValidationError {
  constructor(label = 'Name') {
    super(`${label} must be between 1 and 100 characters.`, 'INVALID_NAME', { label });
  }
}

export class InvalidTimestampError extends ValidationError {
  constructor(message = 'Timestamp must not be earlier than the session start.') {
    super(message, 'INVALID_TIMESTAMP');
  }
}

export class InvalidTimeRangeError extends ValidationError {
  constructor(from: string, to: string) {
    super(
      "Invalid time range: 'from' must be earlier than or equal to 'to'.",
      'INVALID_TIME_RANGE',
      { from, to },
    );
  }
}
