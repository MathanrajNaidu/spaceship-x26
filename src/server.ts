import { pathToFileURL } from 'node:url';

import { SERVICE_NAME } from './version.js';

export function describeService(): string {
  return SERVICE_NAME;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.stdout.write(`${describeService()}\n`);
}
