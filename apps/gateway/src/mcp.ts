import type { FastifyInstance } from 'fastify'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { checkKey } from './keys.js'
import { writeAudit } from './audit.js'
import { callTool, listTools, type Caller } from './tools.js'

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', error: { code, message }, id: id ?? null }
}

export function mcpRoutes(app: FastifyInstance) {
  app.post('/mcp', async (req, reply) => {
    const body = req.body as any
    const header = req.headers.authorization || ''
    const key = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    const check = await checkKey(key)

    if (!check.ok) {
      // record what they tried, so a leaked or revoked key shows up in the audit log
      const tried = body?.method === 'tools/call' ? String(body.params?.name ?? '') : String(body?.method ?? '')
      const split = tried.indexOf('__')
      await writeAudit({
        userId: check.userId,
        apiKeyId: check.keyId,
        source: 'mcp',
        serverSlug: split > 0 ? tried.slice(0, split) : null,
        toolName: split > 0 ? tried.slice(split + 2) : tried || null,
        startedAt: new Date(),
        durationMs: 0,
        outcome: 'denied',
        errorMessage: check.reason,
      })
      return reply.code(401).send(rpcError(body?.id, -32001, `Unauthorized: ${check.reason}`))
    }

    const caller: Caller = { userId: check.user.id, apiKeyId: check.keyId, source: 'mcp' }
    // stateless: a fresh MCP server per HTTP request, bound to this caller.
    // No session state lives in this process, so more replicas can be added later.
    const server = new Server({ name: 'mcp-gateway', version: '0.1.0' }, { capabilities: { tools: {} } })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools(caller) }))
    server.setRequestHandler(CallToolRequestSchema, async (r) => callTool(caller, r.params.name, r.params.arguments))

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    reply.hijack()
    reply.raw.on('close', () => {
      transport.close()
      server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req.raw, reply.raw, body)
  })

  // no server-initiated streams in stateless mode
  const notAllowed = async (_req: unknown, reply: any) => reply.code(405).send(rpcError(null, -32000, 'Method not allowed'))
  app.get('/mcp', notAllowed)
  app.delete('/mcp', notAllowed)
}
