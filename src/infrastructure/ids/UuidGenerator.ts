import type { IdGenerator } from '../../application/ports/IdGenerator.js';

export class UuidGenerator implements IdGenerator {
  next(_prefix: string): string {
    return crypto.randomUUID();
  }
}
