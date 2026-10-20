import { eq, sql } from 'drizzle-orm'
import { db } from './db/index.js'
import { servers, users } from './db/schema.js'
import { config } from './config.js'
import { encrypt, hashPassword } from './crypto.js'

export async function seed() {
  // only on first boot: once any admin exists, a changed SEED_ADMIN_EMAIL must not add another one
  if (config.seedAdminEmail && config.seedAdminPassword) {
    const email = config.seedAdminEmail.toLowerCase()
    const admins = await db.select().from(users).where(eq(users.role, 'admin'))
    if (admins.length === 0) {
      await db.insert(users).values({
        email,
        name: 'Admin',
        role: 'admin',
        passwordHash: await hashPassword(config.seedAdminPassword),
      })
      console.log(`seeded admin ${email}`)
    }
  }

  // Only on an empty table. If an admin later removes a seeded server it stays removed.
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(servers)
  if (count > 0) return
  await db.insert(servers).values([
    {
      slug: 'woo',
      name: 'WooCommerce',
      url: 'http://woo-mcp:3000/mcp',
      authType: 'bearer',
      authSecretEnc: config.wooToken ? encrypt(config.wooToken) : null,
    },
    {
      slug: 'notes',
      name: 'Team notes',
      url: 'http://notes-mcp:3000/mcp',
      authType: 'bearer',
      authSecretEnc: config.notesToken ? encrypt(config.notesToken) : null,
    },
    { slug: config.remote.slug, name: config.remote.name, url: config.remote.url, authType: 'none' },
  ])
  console.log('seeded 3 upstream servers')
}
