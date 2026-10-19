export class CrewRosterInvariantError extends Error {
  readonly code = 'CREW_ROSTER_INVALID';
  readonly details: Readonly<Record<string, unknown>>;

  constructor(message: string, details: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'CrewRosterInvariantError';
    this.details = details;
  }
}
