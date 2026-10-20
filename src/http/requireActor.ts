import type { Request } from 'express';

import type { Actor } from '../application/auth/Actor.js';
import { AuthenticationError } from '../domain/errors/AuthenticationError.js';

export function requireActor(req: Request): Actor {
  if (!req.actor) {
    throw new AuthenticationError('Missing X-Actor-Id header.');
  }
  return req.actor;
}
