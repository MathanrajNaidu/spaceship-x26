import type { IdGenerator } from '../../src/application/ports/IdGenerator.js';

export class SequentialIdGenerator implements IdGenerator {
  private readonly counts = new Map<string, number>();

  next(prefix: string): string {
    const next = (this.counts.get(prefix) ?? 0) + 1;
    this.counts.set(prefix, next);
    return `${prefix}-${next}`;
  }
}
