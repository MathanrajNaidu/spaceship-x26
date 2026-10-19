import type { Actor } from '../auth/Actor.js';

export interface ActorResolver {
  resolve(actorId: string | undefined): Promise<Actor>;
}
