import type { FastifyInstance } from 'fastify'
import { desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { apiKeys, users } from '../db/schema.js'
import { createKey, publicKey } from '../keys.js'
import { requireUser } from '../session.js'

export function keyRoutes(app: FastifyInstance) {
  // members see their own keys, admins see everyone's
  app.get('/api/keys', { onRequest: requireUser }, async (req) => {
    const me = req.user!
    const rows = await db
      .select({ key: apiKeys, email: users.email })
      .from(apiKeys)
      .innerJoin(users, eq(users.id, apiKeys.userId))
      .where(me.role === 'admin' ? undefined : eq(apiKeys.userId, me.id))
      .orderBy(desc(apiKeys.id))
    return rows.map((r) => ({ ...publicKey(r.key), owner: r.email }))
  })

  app.post(
    '/api/keys',
    {
      onRequest: requireUser,
      schema: {
        body: {
          type: 'object',
          required: ['label'],
          properties: { label: { type: 'string', minLength: 1, maxLength: 100 }, userId: { type: 'integer' } },
        },
      },
    },
    async (req, reply) => {
      const me = req.user!
      const { label, userId } = req.body as { label: string; userId?: number }
      const owner = userId ?? me.id
      if (owner !== me.id && me.role !== 'admin') return reply.code(403).send({ error: 'you can only create your own keys' })
      const [user] = await db.select().from(users).where(eq(users.id, owner))
      if (!user || user.disabledAt) return reply.code(404).send({ error: 'no such active user' })
      return { ...(await createKey(owner, label)), owner: user.email }
    },
  )

  app.delete('/api/keys/:id', { onRequest: requireUser }, async (req, reply) => {
    const me = req.user!
    const id = Number((req.params as { id: string }).id)
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id))
    // a member asking for someone else's key gets the same answer as a missing one
    if (!row || (row.userId !== me.id && me.role !== 'admin')) return reply.code(404).send({ error: 'no such key' })
    if (!row.revokedAt) await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id))
    return { ok: true }
  })
}
