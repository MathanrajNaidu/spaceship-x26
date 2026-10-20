import { describe, expect, it } from 'vitest';

import { KeyedMutex } from '../../src/application/concurrency/KeyedMutex.js';

describe('KeyedMutex', () => {
  it('runs tasks for the same key one at a time, in arrival order', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = mutex.runExclusive('pod', async () => {
      order.push('first-start');
      await firstGate;
      order.push('first-end');
      return 'a';
    });
    const second = mutex.runExclusive('pod', () => {
      order.push('second');
      return Promise.resolve('b');
    });

    await Promise.resolve();
    expect(order).toEqual(['first-start']);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(['a', 'b']);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });

  it('lets different keys proceed together', async () => {
    const mutex = new KeyedMutex();
    const seen: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const oxygen = mutex.runExclusive('oxygen', async () => {
      seen.push('oxygen');
      await gate;
    });
    const food = mutex.runExclusive('food', () => {
      seen.push('food');
      return Promise.resolve();
    });

    await Promise.resolve();
    expect(seen).toEqual(['oxygen', 'food']);
    release();
    await Promise.all([oxygen, food]);
  });

  it('still runs the next task after one fails', async () => {
    const mutex = new KeyedMutex();
    const first = mutex.runExclusive('pod', () => Promise.reject(new Error('boom')));
    const second = mutex.runExclusive('pod', () => Promise.resolve('ok'));
    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBe('ok');
  });
});
