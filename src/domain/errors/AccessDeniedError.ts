import { DomainError } from './DomainError.js';

export class AccessDeniedError extends DomainError {
  readonly code = 'TIER_ACCESS_DENIED';

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- re-exposes the protected base constructor
  constructor(message: string, details: Readonly<Record<string, unknown>>) {
    super(message, details);
  }
}
