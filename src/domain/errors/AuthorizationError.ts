import { DomainError } from './DomainError.js';

export class AuthorizationError extends DomainError {
  readonly code = 'FORBIDDEN';

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- re-exposes the protected base constructor
  constructor(message: string) {
    super(message);
  }
}
