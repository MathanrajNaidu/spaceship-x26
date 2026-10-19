import { InvalidNameError, ValidationError } from '../errors/ValidationError.js';

export class CrewLead {
  private constructor(
    readonly id: string,
    readonly name: string,
  ) {}

  static create(id: string, name: string): CrewLead {
    const trimmedId = id.trim();
    const trimmedName = name.trim();
    if (trimmedId.length === 0) {
      throw new ValidationError('Crew lead id must not be blank.');
    }
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      throw new InvalidNameError('Crew lead name');
    }
    return new CrewLead(trimmedId, trimmedName);
  }
}
