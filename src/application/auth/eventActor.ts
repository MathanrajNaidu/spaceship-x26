import type { EventActor } from '../../domain/events/DomainEvent.js';
import type { Actor } from './Actor.js';

export function toEventActor(actor: Actor): EventActor {
  return { id: actor.id, role: actor.role };
}
