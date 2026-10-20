import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { config } from './config.js'
import { pool, runMigrations } from './db/index.js'
import { seed } from './seed.js'
import * as upstreams from './upstreams.js'
import { mcpRoutes } from './mcp.js'
import { authRoutes } from './routes/auth.js'
import { serverRoutes } from './routes/servers.js'
import { memberRoutes } from './routes/members.js'
import { keyRoutes } from './routes/keys.js'
import { auditRoutes } from './routes/audit.js'
import { chatRoutes } from './routes/chat.js'

// only Traefik can reach us (NetworkPolicy), so its X-Forwarded-* headers are trusted
const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 1024 * 1024 })

await app.register(cookie, { secret: config.sessionSecret })
app.decorateRequest('user', null)

app.get('/healthz', async () => ({ ok: true }))
app.get('/readyz', async (_req, reply) => {
  try {
    await pool.query('select 1')
    return { ok: true }
  } catch {
    return reply.code(503).send({ ok: false, error: 'database unreachable' })
  }
})

mcpRoutes(app)
authRoutes(app)
serverRoutes(app)
memberRoutes(app)
keyRoutes(app)
auditRoutes(app)
chatRoutes(app)

// postgres may still be starting when we do; give it a minute instead of crash-looping
for (let i = 0; ; i++) {
  try {
    await pool.query('select 1')
    break
  } catch (err) {
    if (i >= 30) {
      console.error('database not reachable:', (err as Error).message)
      process.exit(1)
    }
    console.log('waiting for database')
    await new Promise((r) => setTimeout(r, 2000))
  }
}

try {
  await runMigrations()
  await seed()
} catch (err) {
  console.error('startup failed:', (err as Error).message)
  process.exit(1)
}

await app.listen({ port: config.port, host: '0.0.0.0' })
// connect upstreams after we are listening; a slow remote server must not delay startup
upstreams.start().catch((err) => console.error('upstream start failed:', (err as Error).message))

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    await app.close()
    await pool.end()
    process.exit(0)
  })
}
