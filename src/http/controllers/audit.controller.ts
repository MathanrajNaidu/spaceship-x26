import type { Request, Response } from 'express';

import type { AuditService } from '../../application/services/AuditService.js';
import { toAuditDto } from '../presenters/auditPresenter.js';
import { requireActor } from '../requireActor.js';
import { auditQuerySchema } from '../schemas/audit.schema.js';

export function auditController(service: AuditService) {
  return {
    list: async (req: Request, res: Response): Promise<void> => {
      const query = auditQuerySchema.parse(req.query);
      const page = await service.query(requireActor(req), {
        limit: query.limit,
        offset: query.offset,
        ...(query.passengerId === undefined ? {} : { passengerId: query.passengerId }),
        ...(query.resourceId === undefined ? {} : { resourceId: query.resourceId }),
        ...(query.action === undefined ? {} : { action: query.action }),
        ...(query.outcome === undefined ? {} : { outcome: query.outcome }),
        ...(query.from === undefined ? {} : { from: new Date(query.from) }),
        ...(query.to === undefined ? {} : { to: new Date(query.to) }),
      });
      res.json({
        data: page.items.map(toAuditDto),
        page: { limit: page.limit, offset: page.offset, total: page.total },
      });
    },
  };
}
