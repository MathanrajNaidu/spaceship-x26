export abstract class DomainError extends Error {
  abstract readonly code: string;
  readonly details?: Readonly<Record<string, unknown>>;

  protected constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = new.target.name;
    if (details !== undefined) {
      this.details = details;
    }
  }
}
