import type { Express } from 'express';
import type { OpenAPIV3 } from 'openapi-types';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface RouteLayer {
  route?: {
    path: string | string[];
    methods: Record<string, boolean>;
  };
}

export function registeredOperations(app: Express): string[] {
  const router = (app as Express & { router: { stack: RouteLayer[] } }).router;
  const operations: string[] = [];
  for (const layer of router.stack) {
    const route = layer.route;
    if (!route) {
      continue;
    }
    const paths = Array.isArray(route.path) ? route.path : [route.path];
    for (const path of paths) {
      for (const [method, enabled] of Object.entries(route.methods)) {
        if (!enabled || method === 'head') {
          continue;
        }
        operations.push(`${method.toUpperCase()} ${toOpenApiPath(path)}`);
      }
    }
  }
  return operations.sort();
}

export function documentedOperations(document: OpenAPIV3.Document): string[] {
  const operations: string[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    if (!item) {
      continue;
    }
    for (const method of HTTP_METHODS) {
      if (item[method]) {
        operations.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return operations.sort();
}

function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}
