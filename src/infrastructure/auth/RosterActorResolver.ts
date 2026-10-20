import type { Actor } from '../../application/auth/Actor.js';
import type { ActorResolver } from '../../application/ports/ActorResolver.js';
import type { PassengerRepository } from '../../application/ports/PassengerRepository.js';
import type { CrewRoster } from '../../domain/crew/CrewRoster.js';
import { AuthenticationError } from '../../domain/errors/AuthenticationError.js';

export class RosterActorResolver implements ActorResolver {
  constructor(
    private readonly roster: CrewRoster,
    private readonly passengers: PassengerRepository,
  ) {}

  async resolve(actorId: string | undefined): Promise<Actor> {
    if (actorId === undefined || actorId.trim() === '') {
      throw new AuthenticationError('Missing X-Actor-Id header.');
    }
    const lead = this.roster.find(actorId);
    if (lead) {
      return { role: 'CREW_LEAD', id: lead.id, name: lead.name };
    }
    const passenger = await this.passengers.findById(actorId);
    if (!passenger || passenger.status !== 'ACTIVE') {
      throw new AuthenticationError('Unknown or inactive actor.');
    }
    return { role: 'PASSENGER', id: passenger.id, name: passenger.name };
  }
}
