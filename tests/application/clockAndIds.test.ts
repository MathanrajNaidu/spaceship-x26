import { describe, expect, it } from 'vitest';

import { UuidGenerator } from '../../src/infrastructure/ids/UuidGenerator.js';
import { SystemClock } from '../../src/infrastructure/time/SystemClock.js';
import { FakeClock } from '../support/FakeClock.js';
import { SequentialIdGenerator } from '../support/SequentialIdGenerator.js';

describe('FakeClock', () => {
  it('returns the injected instant and moves only when asked', () => {
    const clock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    clock.advance(5_000);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:05.000Z');
    clock.set(new Date('2026-05-01T12:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2026-05-01T12:00:00.000Z');
    const first = clock.now();
    first.setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-05-01T12:00:00.000Z');
  });
});

describe('SequentialIdGenerator', () => {
  it('issues independent sequences per prefix', () => {
    const ids = new SequentialIdGenerator();
    expect(ids.next('pas')).toBe('pas-1');
    expect(ids.next('res')).toBe('res-1');
    expect(ids.next('pas')).toBe('pas-2');
  });
});

describe('SystemClock', () => {
  it('returns the current time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});

describe('UuidGenerator', () => {
  it('returns distinct uuid values and ignores the prefix', () => {
    const generator = new UuidGenerator();
    const first = generator.next('pas');
    const second = generator.next('res');
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });
});
