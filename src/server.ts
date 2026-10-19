import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';

import type { Express } from 'express';

import { buildApplication } from './compositionRoot.js';
import { SERVICE_NAME } from './version.js';

export function startServer(app: Express, port: number, host: string): Promise<Server> {
  const server = createServer(app);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

async function main(): Promise<void> {
  try {
    const runtime = await buildApplication(process.env);
    const server = await startServer(runtime.app, runtime.config.port, runtime.config.host);
    const address = server.address();
    const port =
      typeof address === 'object' && address !== null ? address.port : runtime.config.port;
    process.stdout.write(`${SERVICE_NAME} listening on ${runtime.config.host}:${port}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Boot failed.';
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  void main();
}
