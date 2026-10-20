import { DomainError } from './DomainError.js';

export class NotFoundError extends DomainError {
  readonly code: string;

  constructor(message: string, code: string, details?: Readonly<Record<string, unknown>>) {
    super(message, details);
    this.code = code;
  }
}

export class PassengerNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Passenger '${id}' was not found.`, 'PASSENGER_NOT_FOUND', { passengerId: id });
  }
}

export class ResourceNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Resource '${id}' was not found.`, 'RESOURCE_NOT_FOUND', { resourceId: id });
  }
}

export class SessionNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Session '${id}' was not found.`, 'SESSION_NOT_FOUND', { sessionId: id });
  }
}
