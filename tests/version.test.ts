import { describe, expect, it } from 'vitest';

import { SERVICE_NAME } from '../src/version.js';

describe('service identity', () => {
  it('names the passenger resource management system', () => {
    expect(SERVICE_NAME).toBe('spaceship-x26-prms');
  });
});
