// Single source of truth for runtime env vars. Zod-validated at startup so a
// misconfig surfaces immediately rather than at the first DB connection.

import { z } from 'zod';

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.string().url().default('postgres://hl_gov:dev@localhost:5432/hl_gov'),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  INDEXER_INTERVAL_CRON: z.string().default('*/1 * * * *'), // every minute
  INDEXER_ENABLED: z
    .string()
    .default('true')
    .transform((s) => s.toLowerCase() === 'true'),
});

export const env = Schema.parse(process.env);

export type Env = typeof env;
