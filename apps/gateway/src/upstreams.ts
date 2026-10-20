import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ErrorCode, McpError, ToolListChangedNotificationSchema, type Tool } from '@modelcontextprotocol/sdk/types.js'
import { eq } from 'drizzle-orm'
import { db } from './db/index.js'
import { servers } from './db/schema.js'
import { decrypt } from './crypto.js'
import { config } from './config.js'
import { checkUrl } from './ssrf.js'

type Row = typeof servers.$inferSelect

export type Upstream = {
  row: Row
  status: 'connected' | 'unreachable' | 'disabled'
  lastError: string | null
  lastCheckedAt: Date | null
  tools: Tool[]
  client: Client | null
  failures: number
  checking: boolean
}

const CHECK_EVERY = 15_000
// after one failed check we look again sooner, so a dead server shows up well inside 30s
const RECHECK_AFTER = 5_000
const PING_TIMEOUT = 3_000
const CONNECT_TIMEOUT = 10_000

const upstreams = new Map<number, Upstream>()

// Builds the fetch the MCP client uses for this server. The stored credential is
// decrypted right here, per request, and nothing from the caller is forwarded.
function fetchFor(row: Row) {
  return (url: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    headers.delete('authorization')
    if (row.authType !== 'none' && row.authSecretEnc) {
      const secret = decrypt(row.authSecretEnc)
      if (row.authType === 'bearer') headers.set('authorization', `Bearer ${secret}`)
      else headers.set(row.authHeaderName || 'x-api-key', secret)
    }
    // a redirect could send us (and the credential) somewhere the SSRF check never saw
    return fetch(url, { ...init, headers, redirect: 'error' })
  }
}

async function listAllTools(client: Client, timeout: number) {
  const tools: Tool[] = []
  let cursor: string | undefined
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined, { timeout })
    tools.push(...page.tools)
    cursor = page.nextCursor
  } while (cursor)
  return tools
}

function closeClient(u: Upstream) {
  const client = u.client
  u.client = null
  if (client) client.close().catch(() => {})
}

async function connect(u: Upstream) {
  closeClient(u)
  // DNS can change after the admin saved the URL, so check again on every connect
  await checkUrl(u.row.url, config.allowedInternalHosts)
  const client = new Client({ name: 'mcp-gateway', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(new URL(u.row.url), { fetch: fetchFor(u.row) })
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    try {
      u.tools = await listAllTools(client, CONNECT_TIMEOUT)
    } catch (err) {
      console.error(`${u.row.slug}: tool refresh failed: ${(err as Error).message}`)
    }
  })
  try {
    await client.connect(transport, { timeout: CONNECT_TIMEOUT })
    u.tools = await listAllTools(client, CONNECT_TIMEOUT)
  } catch (err) {
    client.close().catch(() => {})
    throw err
  }
  u.client = client
}

async function ping(client: Client) {
  try {
    await client.ping({ timeout: PING_TIMEOUT })
  } catch (err) {
    // not every server implements ping
    if (err instanceof McpError && err.code === ErrorCode.MethodNotFound) {
      await client.listTools(undefined, { timeout: PING_TIMEOUT })
    } else {
      throw err
    }
  }
}

export async function check(u: Upstream) {
  if (!u.row.enabled || u.checking) return
  u.checking = true
  try {
    if (u.client && u.status === 'connected') {
      try {
        await ping(u.client)
      } catch {
        // the server may just have dropped our session; a fresh connect tells us if it is really down
        await connect(u)
      }
    } else {
      await connect(u)
    }
    if (u.status !== 'connected') console.log(`${u.row.slug}: connected, ${u.tools.length} tools`)
    u.status = 'connected'
    u.failures = 0
    u.lastError = null
  } catch (err) {
    u.failures++
    u.lastError = (err as Error).message || String(err)
    // a server that was never up is unreachable straight away; a live one gets a second chance
    if (u.failures >= 2 || u.status !== 'connected') {
      if (u.status !== 'unreachable') console.log(`${u.row.slug}: unreachable: ${u.lastError}`)
      u.status = 'unreachable'
      closeClient(u)
    } else {
      setTimeout(() => check(u), RECHECK_AFTER)
    }
  } finally {
    u.lastCheckedAt = new Date()
    u.checking = false
  }
}

function fresh(row: Row): Upstream {
  return {
    row,
    status: row.enabled ? 'unreachable' : 'disabled',
    lastError: row.enabled ? 'not checked yet' : null,
    lastCheckedAt: null,
    tools: [],
    client: null,
    failures: 0,
    checking: false,
  }
}

// Called on boot and after any add/edit/enable/disable. Waits for the first
// check so the API can return the real status.
export async function reload(id: number) {
  const old = upstreams.get(id)
  if (old) closeClient(old)
  const [row] = await db.select().from(servers).where(eq(servers.id, id))
  if (!row) {
    upstreams.delete(id)
    return
  }
  const u = fresh(row)
  upstreams.set(id, u)
  await check(u)
}

export function remove(id: number) {
  const u = upstreams.get(id)
  if (u) closeClient(u)
  upstreams.delete(id)
}

export function all() {
  return [...upstreams.values()]
}

export function bySlug(slug: string) {
  return all().find((u) => u.row.slug === slug)
}

export function byId(id: number) {
  return upstreams.get(id)
}

export async function start() {
  const rows = await db.select().from(servers)
  await Promise.all(rows.map((r) => reload(r.id)))
  setInterval(() => {
    for (const u of upstreams.values()) check(u)
  }, CHECK_EVERY).unref()
}
