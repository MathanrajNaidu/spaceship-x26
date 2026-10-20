import type { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';

import { openApiDocument } from './openapi/document.js';

export function mountDocs(app: Express): void {
  app.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(openApiDocument);
  });
  app.get('/docs', (_req: Request, res: Response) => {
    const html = swaggerUi.generateHTML(openApiDocument, {
      customSiteTitle: 'Spaceship X26 PRMS',
    });
    res.type('html').send(html.replace('<head>', '<head><base href="/docs/">'));
  });
  app.use('/docs', ...swaggerUi.serve);
}
