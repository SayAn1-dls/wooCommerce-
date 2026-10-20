import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

// A tiny second upstream. Notes live in memory and are gone on restart.
// The tool is called plain "search" on purpose, so it would clash with any other
// server's search without the gateway's slug prefix.

const token = process.env.NOTES_MCP_TOKEN || ''
if (!token) {
  console.error('NOTES_MCP_TOKEN is not set, refusing to start')
  process.exit(1)
}

const notes: { id: number; text: string; createdAt: string }[] = []

function text(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function buildServer() {
  const server = new McpServer({ name: 'notes-mcp', version: '0.1.0' })
  server.registerTool(
    'add_note',
    { description: 'Save a short note for the team.', inputSchema: { text: z.string().min(1).max(2000) } },
    ({ text: body }) => {
      const note = { id: notes.length + 1, text: body, createdAt: new Date().toISOString() }
      notes.push(note)
      return text(note)
    },
  )
  server.registerTool('list_notes', { description: 'List all saved notes.' }, () => text(notes))
  server.registerTool(
    'search',
    { description: 'Find notes containing some text.', inputSchema: { query: z.string().min(1) } },
    ({ query }) => text(notes.filter((n) => n.text.toLowerCase().includes(query.toLowerCase()))),
  )
  return server
}

function authorized(header: string | undefined) {
  const want = Buffer.from(`Bearer ${token}`)
  const got = Buffer.from(header || '')
  return got.length === want.length && timingSafeEqual(got, want)
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

http
  .createServer(async (req, res) => {
    const path = (req.url || '/').split('?')[0]
    if (path === '/healthz') return send(res, 200, { ok: true })
    if (path !== '/mcp') return send(res, 404, { error: 'not found' })
    if (!authorized(req.headers.authorization)) {
      return send(res, 401, { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
    }
    if (req.method !== 'POST') return send(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null })
    try {
      let raw = ''
      for await (const chunk of req) raw += chunk
      const server = buildServer()
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      res.on('close', () => transport.close())
      await server.connect(transport)
      await transport.handleRequest(req, res, raw ? JSON.parse(raw) : undefined)
    } catch (err) {
      console.error('request failed:', (err as Error).message)
      if (!res.headersSent) send(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: 'Bad request' }, id: null })
    }
  })
  .listen(Number(process.env.PORT || 3000), () => console.log('notes-mcp listening'))

// we run as PID 1 in the container, which gets no default SIGTERM handler;
// without this the pod keeps answering for the whole grace period
process.on('SIGTERM', () => process.exit(0))
