import { ErrorCode, McpError, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js'
import { writeAudit, type Outcome } from './audit.js'
import * as upstreams from './upstreams.js'

// One path for both the /mcp endpoint and the chat agent, so permissions
// and auditing can't drift apart.

const CALL_TIMEOUT = 20_000

export type Caller = {
  userId: number
  apiKeyId: number | null
  source: 'mcp' | 'chat'
}

// prefix even without a collision so names don't change when a server is added
export function listTools(_caller: Caller): Tool[] {
  const out: Tool[] = []
  for (const u of upstreams.all()) {
    if (!u.row.enabled || u.status !== 'connected') continue
    for (const t of u.tools) {
      out.push({
        name: `${u.row.slug}__${t.name}`,
        description: `[${u.row.slug}] ${t.description ?? ''}`.trim(),
        inputSchema: t.inputSchema,
        ...(t.annotations ? { annotations: t.annotations } : {}),
      })
    }
  }
  return out
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

export async function callTool(caller: Caller, name: string, args: Record<string, unknown> | undefined) {
  const startedAt = new Date()
  const t0 = performance.now()
  const split = name.indexOf('__')
  const slug = split > 0 ? name.slice(0, split) : null
  const tool = split > 0 ? name.slice(split + 2) : name

  let outcome: Outcome = 'ok'
  let errorMessage: string | null = null
  let result: CallToolResult

  const u = slug ? upstreams.bySlug(slug) : undefined
  if (!u) {
    outcome = 'tool_error'
    errorMessage = `unknown tool ${name}`
    result = errorResult(errorMessage)
  } else if (!u.row.enabled) {
    outcome = 'denied'
    errorMessage = `${slug} is disabled`
    result = errorResult(errorMessage)
  } else if (u.status !== 'connected' || !u.client) {
    outcome = 'upstream_error'
    errorMessage = `${slug} is unreachable (${u.lastError ?? 'no connection'})`
    result = errorResult(errorMessage)
  } else if (!u.tools.some((t) => t.name === tool)) {
    outcome = 'tool_error'
    errorMessage = `${slug} has no tool called ${tool}`
    result = errorResult(errorMessage)
  } else {
    try {
      result = (await u.client.callTool({ name: tool, arguments: args }, undefined, {
        timeout: CALL_TIMEOUT,
      })) as CallToolResult
      if (result.isError) {
        outcome = 'tool_error'
        const first = result.content?.find((c) => c.type === 'text')
        errorMessage = first && first.type === 'text' ? first.text : 'tool returned an error'
      }
    } catch (err) {
      const timedOut = err instanceof McpError && err.code === ErrorCode.RequestTimeout
      outcome = timedOut ? 'timeout' : 'upstream_error'
      errorMessage = timedOut
        ? `${slug} is unreachable (timeout after ${CALL_TIMEOUT / 1000}s)`
        : `${slug} failed: ${(err as Error).message}`
      result = errorResult(errorMessage)
      // find out now instead of at the next health tick
      upstreams.check(u)
    }
  }

  await writeAudit({
    userId: caller.userId,
    apiKeyId: caller.apiKeyId,
    source: caller.source,
    serverSlug: slug,
    toolName: tool,
    startedAt,
    durationMs: Math.round(performance.now() - t0),
    outcome,
    errorMessage,
  })
  return result
}
