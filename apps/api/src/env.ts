// Single source of truth for runtime env vars. Zod-validated at startup so a
// misconfig surfaces immediately rather than at the first DB connection.
//
// dotenv/config loads .env from the current working directory before Zod
// sees process.env. tsx watch does NOT do this automatically.

import 'dotenv/config';
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

  /** HS256 JWT signing key. ≥ 32 bytes random (e.g. `openssl rand -hex 32`).
   *  Dev default is short on purpose so a missing prod env is loud, not silent. */
  SESSION_JWT_SECRET: z
    .string()
    .min(16, 'SESSION_JWT_SECRET must be ≥ 16 chars (≥ 32 for prod)')
    .default('dev-only-not-for-prod-please-rotate-me'),

  /** Set to `true` in prod so the session cookie gets the Secure flag. */
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((s) => s.toLowerCase() === 'true'),

  // ---- Phase J.5 Builder Code -------------------------------------------
  /** Builder EOA, per network. Phase J.5 /trade-forward rejects any order
   *  whose `action.builder.b` doesn't match the network-appropriate value. */
  BUILDER_ADDR_TESTNET: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'BUILDER_ADDR_TESTNET must be 0x + 40 hex')
    .default('0x0000000000000000000000000000000000000000'),
  BUILDER_ADDR_MAINNET: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'BUILDER_ADDR_MAINNET must be 0x + 40 hex')
    .default('0x0000000000000000000000000000000000000000'),
  /** Max builder fee in human bps (basis points) we will accept.
   *  HL hard caps at 10 bps (0.1%) for perp / 100 bps (1%) for spot.
   *  5 = 5 bps = 0.05% which is our default. Backend multiplies by 10
   *  internally to compare against the HL action's `f` (tenths-of-bps). */
  BUILDER_MAX_FEE_BPS: z.coerce.number().int().min(0).max(100).default(5),
});

export const env = Schema.parse(process.env);

export type Env = typeof env;
