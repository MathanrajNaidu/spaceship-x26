import { ValidationError } from '../errors/ValidationError.js';
import { assertName } from '../shared/assertName.js';

export class CrewLead {
  private constructor(
    readonly id: string,
    readonly name: string,
  ) {}

  static create(id: string, name: string): CrewLead {
    const trimmedId = id.trim();
    if (trimmedId.length === 0) {
      throw new ValidationError('Crew lead id must not be blank.');
    }
    return new CrewLead(trimmedId, assertName(name, 'Crew lead name'));
  }
}
