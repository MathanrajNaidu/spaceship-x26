import type { Actor } from '../auth/Actor.js';
import type { Authorizer } from '../auth/Authorizer.js';
import type { CrewRoster } from '../../domain/crew/CrewRoster.js';

export interface CrewLeadSummary {
  readonly id: string;
  readonly name: string;
}

export class CrewLeadQuery {
  constructor(
    private readonly roster: CrewRoster,
    private readonly authorizer: Authorizer,
  ) {}

  list(actor: Actor): CrewLeadSummary[] {
    this.authorizer.requireCrewLead(actor);
    return this.roster.leads.map((lead) => ({ id: lead.id, name: lead.name }));
  }
}
