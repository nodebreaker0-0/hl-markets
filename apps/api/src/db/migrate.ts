// Run pending Drizzle migrations against the configured DATABASE_URL.
// Invoked from `npm run db:migrate`. Operator runs this once on first deploy.

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { env } from '@/env';

async function main(): Promise<void> {
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql);
  console.info(`[migrate] applying migrations to ${env.DATABASE_URL}`);
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  console.info('[migrate] done');
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
