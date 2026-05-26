import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '@/env';
import * as schema from './schema';

const sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  prepare: false,
});

export const db = drizzle(sql, { schema });

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
