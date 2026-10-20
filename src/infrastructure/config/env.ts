import { z } from 'zod';

const crewLeadSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
});

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4317),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SEED_DEMO_PASSENGERS: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  CREW_LEADS: z.string().optional(),
  DEMAND_HIGH_UTILISATION: z.coerce.number().min(0).max(1).default(0.8),
  DEMAND_HIGH_DENIALS: z.coerce.number().int().min(1).default(3),
  DEMAND_LOW_UTILISATION: z.coerce.number().min(0).max(1).default(0.2),
});

export interface AppConfig {
  port: number;
  host: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  seedDemoPassengers: boolean;
  crewLeads: readonly { id: string; name: string }[];
  demand: {
    highUtilisation: number;
    highDenials: number;
    lowUtilisation: number;
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(
  env: NodeJS.ProcessEnv,
  defaultCrewLeads: readonly { id: string; name: string }[],
): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((issue) => issue.message).join('; '));
  }
  return {
    port: parsed.data.PORT,
    host: parsed.data.HOST,
    logLevel: parsed.data.LOG_LEVEL,
    seedDemoPassengers: parsed.data.SEED_DEMO_PASSENGERS,
    crewLeads: resolveCrewLeads(parsed.data.CREW_LEADS, defaultCrewLeads),
    demand: {
      highUtilisation: parsed.data.DEMAND_HIGH_UTILISATION,
      highDenials: parsed.data.DEMAND_HIGH_DENIALS,
      lowUtilisation: parsed.data.DEMAND_LOW_UTILISATION,
    },
  };
}

export function resolveCrewLeads(
  raw: string | undefined,
  defaults: readonly { id: string; name: string }[],
): { id: string; name: string }[] {
  if (raw === undefined || raw.trim() === '') {
    return defaults.map((lead) => ({ ...lead }));
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ConfigError('CREW_LEADS must be a JSON array of { id, name }.');
  }
  const parsed = z.array(crewLeadSchema).safeParse(json);
  if (!parsed.success) {
    throw new ConfigError('CREW_LEADS must be a JSON array of { id, name }.');
  }
  return parsed.data;
}
