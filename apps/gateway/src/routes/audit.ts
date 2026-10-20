import type { FastifyInstance } from 'fastify'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { auditLog, users } from '../db/schema.js'
import { requireUser } from '../session.js'

const PAGE_SIZE = 50
const outcomes = ['ok', 'tool_error', 'upstream_error', 'timeout', 'denied'] as const

export function auditRoutes(app: FastifyInstance) {
  app.get('/api/audit', { preHandler: requireUser }, async (req) => {
    const me = req.user!
    const q = req.query as { user?: string; server?: string; outcome?: string; page?: string }
    const page = Math.max(1, Number(q.page) || 1)

    const where: SQL[] = []
    // members only ever see their own rows, whatever they put in the query
    if (me.role !== 'admin') where.push(eq(auditLog.userId, me.id))
    else if (q.user) where.push(eq(auditLog.userId, Number(q.user)))
    if (q.server) where.push(eq(auditLog.serverSlug, q.server))
    if (q.outcome && (outcomes as readonly string[]).includes(q.outcome)) {
      where.push(eq(auditLog.outcome, q.outcome as (typeof outcomes)[number]))
    }

    const rows = await db
      .select({ row: auditLog, email: users.email })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLog.startedAt), desc(auditLog.id))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE)

    return {
      page,
      hasMore: rows.length > PAGE_SIZE,
      rows: rows.slice(0, PAGE_SIZE).map((r) => ({ ...r.row, user: r.email ?? '(unknown key)' })),
    }
  })
}
