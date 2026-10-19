import type { Actor } from './Actor.js';
import { AuthorizationError } from '../../domain/errors/AuthorizationError.js';

export class Authorizer {
  requireCrewLead(actor: Actor): Actor & { role: 'CREW_LEAD' } {
    if (actor.role !== 'CREW_LEAD') {
      throw new AuthorizationError('Crew lead access is required.');
    }
    return actor;
  }

  requirePassenger(actor: Actor): Actor & { role: 'PASSENGER' } {
    if (actor.role !== 'PASSENGER') {
      throw new AuthorizationError('Passenger access is required.');
    }
    return actor;
  }
}
