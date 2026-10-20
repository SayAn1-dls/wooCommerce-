import type { FastifyReply, FastifyRequest } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from './db/index.js'
import { users } from './db/schema.js'
import { config } from './config.js'

export type User = typeof users.$inferSelect

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null
  }
}

const COOKIE = 'mcpg_session'
const MAX_AGE = 12 * 60 * 60

// The cookie is "<userId>.<expiry>" signed with SESSION_SECRET. The user row is
// loaded on every request, so disabling a user locks them out right away.
export function startSession(reply: FastifyReply, userId: number) {
  const value = `${userId}.${Date.now() + MAX_AGE * 1000}`
  reply.setCookie(COOKIE, value, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
    maxAge: MAX_AGE,
  })
}

export function endSession(reply: FastifyReply) {
  reply.clearCookie(COOKIE, { path: '/' })
}

async function loadUser(req: FastifyRequest) {
  const raw = req.cookies[COOKIE]
  if (!raw) return null
  const unsigned = req.unsignCookie(raw)
  if (!unsigned.valid || !unsigned.value) return null
  const [id, expires] = unsigned.value.split('.').map(Number)
  if (!id || Date.now() > expires) return null
  const [user] = await db.select().from(users).where(eq(users.id, id))
  if (!user || user.disabledAt) return null
  return user
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  req.user = await loadUser(req)
  if (!req.user) return reply.code(401).send({ error: 'not logged in' })
}

// role checks live on the server; hiding buttons in the UI is only cosmetic
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  req.user = await loadUser(req)
  if (!req.user) return reply.code(401).send({ error: 'not logged in' })
  if (req.user.role !== 'admin') return reply.code(403).send({ error: 'admins only' })
}

export function publicUser(u: User) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt, disabledAt: u.disabledAt }
}
