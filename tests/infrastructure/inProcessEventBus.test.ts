import { describe, expect, it } from 'vitest';

import { InProcessEventBus } from '../../src/infrastructure/events/InProcessEventBus.js';
import type { DomainEvent } from '../../src/domain/events/DomainEvent.js';

const started: DomainEvent = {
  type: 'UsageStarted',
  occurredAt: new Date('2026-06-01T12:00:00.000Z'),
  actor: { id: 'pas-1', role: 'PASSENGER' },
  passengerId: 'pas-1',
  resourceId: 'res-1',
  sessionId: 'ses-1',
  tierAtStart: 'SILVER',
};

describe('InProcessEventBus', () => {
  it('awaits handlers in subscription order', async () => {
    const bus = new InProcessEventBus();
    const seen: string[] = [];
    bus.subscribe({
      handle: async () => {
        seen.push('first');
        await Promise.resolve();
      },
    });
    bus.subscribe({
      handle: () => {
        seen.push('second');
        return Promise.resolve();
      },
    });
    await bus.publish(started);
    expect(seen).toEqual(['first', 'second']);
  });

  it('resolves when nobody is listening', async () => {
    await expect(new InProcessEventBus().publish(started)).resolves.toBeUndefined();
  });

  it('stops later handlers when an earlier one fails', async () => {
    const bus = new InProcessEventBus();
    const seen: string[] = [];
    bus.subscribe({
      handle: () => Promise.reject(new Error('audit down')),
    });
    bus.subscribe({
      handle: () => {
        seen.push('second');
        return Promise.resolve();
      },
    });
    await expect(bus.publish(started)).rejects.toThrow('audit down');
    expect(seen).toEqual([]);
  });
});
