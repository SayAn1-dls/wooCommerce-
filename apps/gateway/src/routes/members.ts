import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invites, users } from '../db/schema.js'
import { randomToken, sha256 } from '../crypto.js'
import { publicUser, requireAdmin } from '../session.js'

const INVITE_HOURS = 72

export function memberRoutes(app: FastifyInstance) {
  app.get('/api/members', { onRequest: requireAdmin }, async () => {
    const rows = await db.select().from(users).orderBy(users.id)
    return rows.map(publicUser)
  })

  app.post(
    '/api/invites',
    {
      onRequest: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['email', 'role'],
          properties: {
            email: { type: 'string', pattern: '^[^@\\s]+@[^@\\s]+$', maxLength: 200 },
            role: { type: 'string', enum: ['admin', 'member'] },
          },
        },
      },
    },
    async (req, reply) => {
      const { email, role } = req.body as { email: string; role: 'admin' | 'member' }
      const clean = email.trim().toLowerCase()
      const [taken] = await db.select().from(users).where(eq(users.email, clean))
      if (taken) return reply.code(409).send({ error: 'that person already has an account' })
      const token = randomToken()
      await db.insert(invites).values({
        email: clean,
        role,
        tokenHash: sha256(token),
        invitedBy: req.user!.id,
        expiresAt: new Date(Date.now() + INVITE_HOURS * 3600 * 1000),
      })
      // no email sending: the admin copies this link and sends it themselves
      return { email: clean, role, link: `${req.protocol}://${req.host}/invite/${token}`, expiresInHours: INVITE_HOURS }
    },
  )

  app.patch(
    '/api/members/:id',
    {
      onRequest: requireAdmin,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { role: { type: 'string', enum: ['admin', 'member'] }, disabled: { type: 'boolean' } },
        },
      },
    },
    async (req, reply) => {
      const id = Number((req.params as { id: string }).id)
      const b = req.body as { role?: 'admin' | 'member'; disabled?: boolean }
      // stops an admin from locking the team out by demoting or disabling themselves
      if (id === req.user!.id) return reply.code(400).send({ error: 'you cannot change your own account here' })
      const changes: Partial<typeof users.$inferInsert> = {}
      if (b.role) changes.role = b.role
      if (b.disabled !== undefined) changes.disabledAt = b.disabled ? new Date() : null
      if (Object.keys(changes).length === 0) return reply.code(400).send({ error: 'nothing to change' })
      const [row] = await db.update(users).set(changes).where(eq(users.id, id)).returning()
      if (!row) return reply.code(404).send({ error: 'no such member' })
      return publicUser(row)
    },
  )
}
