export interface OccupancyInterval {
  readonly start: Date;
  readonly end: Date;
}

/**
 * Maximum number of intervals open at once. When a start and an end share a
 * timestamp, the end is applied first, so a session that ends as another
 * begins does not count as overlap, and a zero-length session does not raise
 * the peak.
 */
export function peakConcurrency(intervals: readonly OccupancyInterval[]): number {
  const events: { time: number; order: number; delta: number }[] = [];
  for (const interval of intervals) {
    const start = interval.start.getTime();
    const end = interval.end.getTime();
    if (end < start) {
      continue;
    }
    events.push({ time: start, order: 1, delta: 1 }, { time: end, order: 0, delta: -1 });
  }
  events.sort((left, right) => left.time - right.time || left.order - right.order);
  let current = 0;
  let peak = 0;
  for (const event of events) {
    current += event.delta;
    if (current > peak) {
      peak = current;
    }
  }
  return peak;
}
