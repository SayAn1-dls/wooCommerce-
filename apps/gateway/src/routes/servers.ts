import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { servers } from '../db/schema.js'
import { encrypt } from '../crypto.js'
import { config } from '../config.js'
import { checkUrl } from '../ssrf.js'
import { requireAdmin, requireUser } from '../session.js'
import * as upstreams from '../upstreams.js'

type Row = typeof servers.$inferSelect

// Never includes the credential, only whether one is set.
function view(row: Row) {
  const u = upstreams.byId(row.id)
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    url: row.url,
    authType: row.authType,
    authHeaderName: row.authHeaderName,
    hasSecret: Boolean(row.authSecretEnc),
    enabled: row.enabled,
    status: row.enabled ? (u?.status ?? 'unreachable') : 'disabled',
    lastError: u?.lastError ?? null,
    lastCheckedAt: u?.lastCheckedAt ?? null,
    toolCount: u?.tools.length ?? 0,
  }
}

const fields = {
  name: { type: 'string', minLength: 1, maxLength: 100 },
  url: { type: 'string', minLength: 1, maxLength: 500 },
  authType: { type: 'string', enum: ['none', 'bearer', 'header'] },
  authHeaderName: { type: ['string', 'null'], pattern: '^[A-Za-z0-9-]{1,60}$' },
  secret: { type: 'string', maxLength: 4000 },
  enabled: { type: 'boolean' },
}

type Body = {
  slug?: string
  name?: string
  url?: string
  authType?: 'none' | 'bearer' | 'header'
  authHeaderName?: string | null
  secret?: string
  enabled?: boolean
}

export function serverRoutes(app: FastifyInstance) {
  app.get('/api/servers', { onRequest: requireUser }, async () => {
    const rows = await db.select().from(servers).orderBy(servers.id)
    return rows.map(view)
  })

  app.get('/api/servers/:id/tools', { onRequest: requireUser }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const [row] = await db.select().from(servers).where(eq(servers.id, id))
    if (!row) return reply.code(404).send({ error: 'no such server' })
    const u = upstreams.byId(id)
    return {
      server: view(row),
      tools: (u?.tools ?? []).map((t) => ({
        name: t.name,
        exposedAs: `${row.slug}__${t.name}`,
        description: t.description ?? '',
        inputSchema: t.inputSchema,
      })),
    }
  })

  app.post(
    '/api/servers',
    {
      onRequest: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['slug', 'name', 'url'],
          additionalProperties: false,
          properties: { slug: { type: 'string', pattern: '^[a-z][a-z0-9_]{1,20}$' }, ...fields },
        },
      },
    },
    async (req, reply) => {
      const b = req.body as Body
      if (b.slug!.includes('__')) return reply.code(400).send({ error: 'slug cannot contain "__"' })
      try {
        await checkUrl(b.url!, config.allowedInternalHosts)
      } catch (err) {
        return reply.code(400).send({ error: `URL not allowed: ${(err as Error).message}` })
      }
      const [taken] = await db.select().from(servers).where(eq(servers.slug, b.slug!))
      if (taken) return reply.code(409).send({ error: `slug ${b.slug} is already used` })
      const authType = b.authType ?? 'none'
      const [row] = await db
        .insert(servers)
        .values({
          slug: b.slug!,
          name: b.name!,
          url: b.url!,
          authType,
          authHeaderName: authType === 'header' ? (b.authHeaderName ?? null) : null,
          authSecretEnc: authType !== 'none' && b.secret ? encrypt(b.secret) : null,
          enabled: b.enabled ?? true,
        })
        .returning()
      req.log.info(`server ${row.slug} added by ${req.user!.email}`)
      await upstreams.reload(row.id)
      return view(row)
    },
  )

  app.patch(
    '/api/servers/:id',
    {
      onRequest: requireAdmin,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { slug: { type: 'string' }, ...fields },
        },
      },
    },
    async (req, reply) => {
      const id = Number((req.params as { id: string }).id)
      const b = req.body as Body
      const [row] = await db.select().from(servers).where(eq(servers.id, id))
      if (!row) return reply.code(404).send({ error: 'no such server' })
      // tool names are built from the slug, so changing it would silently rename tools
      if (b.slug !== undefined && b.slug !== row.slug) return reply.code(400).send({ error: 'slug cannot be changed' })
      if (b.url !== undefined && b.url !== row.url) {
        try {
          await checkUrl(b.url, config.allowedInternalHosts)
        } catch (err) {
          return reply.code(400).send({ error: `URL not allowed: ${(err as Error).message}` })
        }
      }
      const authType = b.authType ?? row.authType
      const changes: Partial<Row> = { updatedAt: new Date() }
      if (b.name !== undefined) changes.name = b.name
      if (b.url !== undefined) changes.url = b.url
      if (b.enabled !== undefined) changes.enabled = b.enabled
      changes.authType = authType
      changes.authHeaderName = authType === 'header' ? (b.authHeaderName ?? row.authHeaderName) : null
      // write-only: an empty or missing secret keeps the old one, a new one replaces it
      if (authType === 'none') changes.authSecretEnc = null
      else if (b.secret) changes.authSecretEnc = encrypt(b.secret)

      const [updated] = await db.update(servers).set(changes).where(eq(servers.id, id)).returning()
      req.log.info(`server ${row.slug} changed by ${req.user!.email}`)
      await upstreams.reload(id)
      return view(updated)
    },
  )

  app.delete('/api/servers/:id', { onRequest: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const [row] = await db.delete(servers).where(eq(servers.id, id)).returning()
    if (!row) return reply.code(404).send({ error: 'no such server' })
    upstreams.remove(id)
    req.log.info(`server ${row.slug} removed by ${req.user!.email}`)
    return { ok: true }
  })
}
