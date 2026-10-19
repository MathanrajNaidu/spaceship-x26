export class CrewLead {
  private constructor(
    readonly id: string,
    readonly name: string,
  ) {}

  static create(id: string, name: string): CrewLead {
    const trimmedId = id.trim();
    const trimmedName = name.trim();
    if (trimmedId.length === 0) {
      throw new Error('Crew lead id must not be blank.');
    }
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      throw new Error('Crew lead name must be between 1 and 100 characters.');
    }
    return new CrewLead(trimmedId, trimmedName);
  }
}
