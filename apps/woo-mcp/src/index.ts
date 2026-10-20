import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { addTools } from './tools.js'
import { ping } from './woo.js'

const port = Number(process.env.PORT || 3000)
const token = process.env.WOO_MCP_TOKEN || ''
if (!token) {
  console.error('WOO_MCP_TOKEN is not set, refusing to start')
  process.exit(1)
}

// only the gateway knows this token; the NetworkPolicy is the first fence, this is the second
function authorized(header: string | undefined) {
  const want = Buffer.from(`Bearer ${token}`)
  const got = Buffer.from(header || '')
  return got.length === want.length && timingSafeEqual(got, want)
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

async function readJson(req: http.IncomingMessage) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : undefined
}

async function handleMcp(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!authorized(req.headers.authorization)) {
    return send(res, 401, { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
  }
  if (req.method !== 'POST') {
    return send(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null })
  }
  // stateless: a fresh server per request, so any replica can answer any call
  const server = new McpServer({ name: 'woo-mcp', version: '0.1.0' })
  addTools(server)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, await readJson(req))
}

http
  .createServer(async (req, res) => {
    const path = (req.url || '/').split('?')[0]
    try {
      if (path === '/mcp') return await handleMcp(req, res)
      if (path === '/healthz') return send(res, 200, { ok: true })
      if (path === '/readyz') {
        const up = await ping().catch(() => false)
        return send(res, up ? 200 : 503, { ok: up })
      }
      send(res, 404, { error: 'not found' })
    } catch (err) {
      console.error('request failed:', (err as Error).message)
      if (!res.headersSent) send(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
    }
  })
  .listen(port, () => console.log(`woo-mcp listening on ${port}`))
