import type { Request, Response } from 'express';

import type { ResourceService } from '../../application/services/ResourceService.js';
import type { Resource } from '../../domain/resource/Resource.js';
import { idParamsSchema } from '../schemas/common.js';
import {
  discoverySchema,
  provisionResourceSchema,
  resourceListSchema,
} from '../schemas/resource.schema.js';
import { requireActor } from '../requireActor.js';

export function resourceController(service: ResourceService) {
  return {
    provision: async (req: Request, res: Response): Promise<void> => {
      const body = provisionResourceSchema.parse(req.body);
      const resource = await service.provision(requireActor(req), body);
      res
        .status(201)
        .location(`/api/v1/resources/${resource.id}`)
        .json({ resource: toResourceDto(resource) });
    },

    list: async (req: Request, res: Response): Promise<void> => {
      const query = resourceListSchema.parse(req.query);
      const page = await service.list(requireActor(req), query);
      res.json({
        data: page.items.map(toResourceDto),
        page: { limit: page.limit, offset: page.offset, total: page.total },
      });
    },

    get: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params);
      const details = await service.get(requireActor(req), id);
      res.json({
        resource: toResourceDto(details.resource),
        occupancy: details.occupancy,
      });
    },

    decommission: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params);
      const resource = await service.decommission(requireActor(req), id);
      res.json({ resource: toResourceDto(resource) });
    },

    discover: async (req: Request, res: Response): Promise<void> => {
      const query = discoverySchema.parse(req.query);
      const page = await service.discover(requireActor(req), query);
      res.json({
        data: page.items.map((item) => ({
          ...toResourceDto(item.resource),
          availableSlots: item.availableSlots,
        })),
        page: { limit: page.limit, offset: page.offset, total: page.total },
      });
    },
  };
}

function toResourceDto(resource: Resource) {
  return {
    id: resource.id,
    name: resource.name,
    type: resource.type,
    minimumTier: resource.minimumTier.name,
    capacity: resource.capacity,
    status: resource.status,
    provisionedAt: resource.provisionedAt.toISOString(),
    decommissionedAt: resource.decommissionedAt?.toISOString() ?? null,
  };
}
