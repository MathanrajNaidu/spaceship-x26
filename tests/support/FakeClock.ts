import type { Clock } from '../../src/application/ports/Clock.js';

export class FakeClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }

  set(value: Date): void {
    this.current = new Date(value.getTime());
  }
}
