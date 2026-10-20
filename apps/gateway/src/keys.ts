import { eq } from 'drizzle-orm'
import { db } from './db/index.js'
import { apiKeys, users } from './db/schema.js'
import { randomToken, sameHex, sha256 } from './crypto.js'

const PREFIX = 'mcpg_'

// the 8 characters after "mcpg_", enough to recognise a key in the UI and to find it in the db
function shortPrefix(key: string) {
  return key.slice(PREFIX.length, PREFIX.length + 8)
}

export async function createKey(userId: number, label: string) {
  const key = PREFIX + randomToken()
  const [row] = await db
    .insert(apiKeys)
    .values({ userId, label, prefix: shortPrefix(key), keyHash: sha256(key) })
    .returning()
  // the full key is returned this once and never stored
  return { ...publicKey(row), key }
}

export function publicKey(row: typeof apiKeys.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    prefix: PREFIX + row.prefix,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  }
}

type Check =
  | { ok: true; user: typeof users.$inferSelect; keyId: number }
  | { ok: false; reason: string; userId: number | null; keyId: number | null }

// No cache on purpose: every request hits the db, so a revoke works on the very next call.
export async function checkKey(key: string): Promise<Check> {
  if (!key.startsWith(PREFIX)) return { ok: false, reason: 'unknown key', userId: null, keyId: null }
  const hash = sha256(key)
  const rows = await db
    .select({ key: apiKeys, user: users })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(eq(apiKeys.prefix, shortPrefix(key)))
  const match = rows.find((r) => sameHex(r.key.keyHash, hash))
  if (!match) return { ok: false, reason: 'unknown key', userId: null, keyId: null }
  if (match.key.revokedAt) return { ok: false, reason: 'key revoked', userId: match.user.id, keyId: match.key.id }
  if (match.user.disabledAt) return { ok: false, reason: 'user disabled', userId: match.user.id, keyId: match.key.id }
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, match.key.id))
  return { ok: true, user: match.user, keyId: match.key.id }
}
