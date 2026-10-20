import pino from 'pino';

import { SERVICE_NAME } from '../../version.js';

export function createLogger(level: string): pino.Logger {
  return pino({
    level,
    base: { service: SERVICE_NAME },
  });
}
