import { z } from 'zod';

import { blankToUndefined } from './common.js';

export const startSessionSchema = z.strictObject({
  resourceId: z.string().min(1),
});

export const sessionListSchema = z.object({
  status: z.preprocess(blankToUndefined, z.enum(['active', 'ended']).optional()),
});
