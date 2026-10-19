export class InvalidTierError extends Error {
  readonly code = 'INVALID_TIER';
  readonly details: { readonly value: string };

  constructor(value: string) {
    super(`Unknown membership tier '${value}'.`);
    this.name = 'InvalidTierError';
    this.details = { value };
  }
}
