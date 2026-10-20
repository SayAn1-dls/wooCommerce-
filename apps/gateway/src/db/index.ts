import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import * as schema from './schema.js'

// connection comes from the standard PGHOST / PGUSER / PGPASSWORD / PGDATABASE env vars
export const pool = new pg.Pool({ max: 10 })
export const db = drizzle(pool, { schema })

export async function runMigrations() {
  const folder = fileURLToPath(new URL('../../drizzle', import.meta.url))
  await migrate(db, { migrationsFolder: folder })
}
