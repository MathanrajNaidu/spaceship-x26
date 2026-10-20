import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { ActorResolver } from '../../application/ports/ActorResolver.js';

export function resolveActor(resolver: ActorResolver): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('x-actor-id');
    return resolver.resolve(header).then(
      (actor) => {
        req.actor = actor;
        next();
      },
      (error: unknown) => {
        next(error);
      },
    );
  };
}
