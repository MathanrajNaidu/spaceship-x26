import { InvalidTimeRangeError } from '../domain/errors/ValidationError.js';

export function assertTimeRange(from: Date | undefined, to: Date | undefined): void {
  if (from !== undefined && to !== undefined && from.getTime() > to.getTime()) {
    throw new InvalidTimeRangeError(from.toISOString(), to.toISOString());
  }
}
