import { describe, expect, it } from 'vitest';

import { peakConcurrency } from '../../src/application/reporting/peakConcurrency.js';

const at = (iso: string): Date => new Date(iso);

describe('peakConcurrency', () => {
  it('is zero when nothing overlaps, including a zero-length session', () => {
    expect(peakConcurrency([])).toBe(0);
    expect(
      peakConcurrency([
        { start: at('2026-06-01T10:00:00.000Z'), end: at('2026-06-01T10:00:00.000Z') },
      ]),
    ).toBe(0);
    expect(
      peakConcurrency([
        { start: at('2026-06-01T11:00:00.000Z'), end: at('2026-06-01T10:00:00.000Z') },
      ]),
    ).toBe(0);
  });

  it('counts simultaneous use and treats a touching boundary as free', () => {
    const peak = peakConcurrency([
      { start: at('2026-06-01T10:00:00.000Z'), end: at('2026-06-01T12:00:00.000Z') },
      { start: at('2026-06-01T11:00:00.000Z'), end: at('2026-06-01T13:00:00.000Z') },
      { start: at('2026-06-01T12:00:00.000Z'), end: at('2026-06-01T14:00:00.000Z') },
    ]);
    expect(peak).toBe(2);
  });
});
