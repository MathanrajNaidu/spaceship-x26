import { optionalInstantSchema } from './common.js';
import { z } from 'zod';

export const windowQuerySchema = z.object({
  from: optionalInstantSchema,
  to: optionalInstantSchema,
});
