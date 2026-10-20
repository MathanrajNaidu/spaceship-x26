import type { Request, Response } from 'express';

import type { ReportingService } from '../../application/services/ReportingService.js';
import { requireActor } from '../requireActor.js';
import { idParamsSchema } from '../schemas/common.js';
import { windowQuerySchema } from '../schemas/report.schema.js';
import {
  toActiveUsageDto,
  toDemandDto,
  toHistoryDto,
  toTierReportDto,
} from '../presenters/reportPresenter.js';

export function reportController(service: ReportingService) {
  return {
    ownHistory: async (req: Request, res: Response): Promise<void> => {
      const history = await service.ownHistory(requireActor(req), windowOf(req));
      res.json(toHistoryDto(history));
    },

    passengerHistory: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params);
      const history = await service.passengerHistory(requireActor(req), id, windowOf(req));
      res.json(toHistoryDto(history));
    },

    usageByTier: async (req: Request, res: Response): Promise<void> => {
      const groups = await service.usageByTier(requireActor(req), windowOf(req));
      res.json(toTierReportDto(groups));
    },

    resourceDemand: async (req: Request, res: Response): Promise<void> => {
      const rows = await service.resourceDemand(requireActor(req), windowOf(req));
      res.json(toDemandDto(rows));
    },

    activeUsage: async (req: Request, res: Response): Promise<void> => {
      const snapshot = await service.activeUsage(requireActor(req));
      res.json(toActiveUsageDto(snapshot));
    },
  };
}

function windowOf(req: Request): { from?: Date; to?: Date } {
  const query = windowQuerySchema.parse(req.query);
  return {
    ...(query.from === undefined ? {} : { from: new Date(query.from) }),
    ...(query.to === undefined ? {} : { to: new Date(query.to) }),
  };
}
