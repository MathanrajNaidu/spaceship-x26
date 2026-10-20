import type { Actor } from '../application/auth/Actor.js';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
    actor?: Actor;
  }
}

export {};
