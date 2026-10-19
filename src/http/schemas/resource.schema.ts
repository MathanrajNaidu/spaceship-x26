import { z } from 'zod';

import {
  optionalResourceStatusSchema,
  optionalResourceTypeSchema,
  optionalTierSchema,
  paginationSchema,
} from './common.js';

export const provisionResourceSchema = z.strictObject({
  name: z.string(),
  type: z.string().min(1),
  capacity: z.number(),
  minimumTier: z.string().min(1).optional(),
});

export const resourceListSchema = paginationSchema.extend({
  status: optionalResourceStatusSchema,
  minimumTier: optionalTierSchema,
  type: optionalResourceTypeSchema,
});

export const discoverySchema = paginationSchema;
