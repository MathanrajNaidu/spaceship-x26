import { DomainError } from './DomainError.js';

export class AuthenticationError extends DomainError {
  readonly code = 'UNAUTHENTICATED';

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- re-exposes the protected base constructor
  constructor(message: string) {
    super(message);
  }
}
