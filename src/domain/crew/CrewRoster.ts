import { CrewRosterInvariantError } from '../errors/InvariantViolationError.js';
import type { CrewLead } from './CrewLead.js';

export class CrewRoster {
  private constructor(readonly leads: readonly [CrewLead, CrewLead, CrewLead]) {}

  static of(leads: readonly CrewLead[]): CrewRoster {
    const [first, second, third, ...extra] = leads;
    if (!first || !second || !third || extra.length > 0) {
      throw new CrewRosterInvariantError(
        `Crew roster must contain exactly 3 crew leads (received ${leads.length}).`,
        { received: leads.length },
      );
    }
    const ids = new Set([first.id, second.id, third.id]);
    if (ids.size !== 3) {
      throw new CrewRosterInvariantError('Crew lead ids must be unique.', {
        ids: [first.id, second.id, third.id],
      });
    }
    return new CrewRoster([first, second, third]);
  }

  has(id: string): boolean {
    return this.find(id) !== undefined;
  }

  find(id: string): CrewLead | undefined {
    return this.leads.find((lead) => lead.id === id);
  }
}
