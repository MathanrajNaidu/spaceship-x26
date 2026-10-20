import type { NextFunction, Request, Response } from 'express';

import { HttpProblem } from '../errors/HttpProblem.js';

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new HttpProblem(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}.`));
}
