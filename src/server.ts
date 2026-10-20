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

export function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export function shutdownHandler(
  server: Server,
  exit: (code: number) => void = (code) => {
    process.exit(code);
  },
): () => void {
  let started = false;
  return () => {
    if (started) {
      return;
    }
    started = true;
    void closeServer(server).then(
      () => exit(0),
      () => exit(1),
    );
  };
}

async function main(): Promise<void> {
  try {
    const runtime = await buildApplication(process.env);
    const server = await startServer(runtime.app, runtime.config.port, runtime.config.host);
    const stop = shutdownHandler(server);
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
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
