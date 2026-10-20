import type { FastifyInstance } from 'fastify'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invites, users } from '../db/schema.js'
import { checkPassword, hashPassword, sha256 } from '../crypto.js'
import { endSession, publicUser, requireUser, startSession } from '../session.js'
import { allow } from '../ratelimit.js'

export function authRoutes(app: FastifyInstance) {
  app.post(
    '/api/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: { email: { type: 'string' }, password: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      if (!allow(`login:${req.ip}`, 10)) return reply.code(429).send({ error: 'too many login attempts, wait a minute' })
      const { email, password } = req.body as { email: string; password: string }
      const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()))
      const ok = user && !user.disabledAt && (await checkPassword(password, user.passwordHash))
      if (!ok) return reply.code(401).send({ error: 'wrong email or password' })
      startSession(reply, user.id)
      return publicUser(user)
    },
  )

  app.post('/api/auth/logout', async (_req, reply) => {
    endSession(reply)
    return { ok: true }
  })

  app.get('/api/me', { preHandler: requireUser }, async (req) => publicUser(req.user!))

  app.post(
    '/api/invites/accept',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token', 'name', 'password'],
          properties: {
            token: { type: 'string', minLength: 10 },
            name: { type: 'string', minLength: 1, maxLength: 100 },
            password: { type: 'string', minLength: 8, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!allow(`invite:${req.ip}`, 10)) return reply.code(429).send({ error: 'too many attempts, wait a minute' })
      const { token, name, password } = req.body as { token: string; name: string; password: string }
      const [invite] = await db
        .select()
        .from(invites)
        .where(and(eq(invites.tokenHash, sha256(token)), isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
      if (!invite) return reply.code(400).send({ error: 'this invite link is invalid, used or expired' })
      const [taken] = await db.select().from(users).where(eq(users.email, invite.email))
      if (taken) return reply.code(409).send({ error: 'an account with this email already exists' })

      const user = await db.transaction(async (tx) => {
        await tx.update(invites).set({ usedAt: new Date() }).where(eq(invites.id, invite.id))
        const [u] = await tx
          .insert(users)
          .values({ email: invite.email, name, role: invite.role, passwordHash: await hashPassword(password) })
          .returning()
        return u
      })
      startSession(reply, user.id)
      return publicUser(user)
    },
  )
}
