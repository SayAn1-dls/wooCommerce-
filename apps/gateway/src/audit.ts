import { db } from './db/index.js'
import { auditLog } from './db/schema.js'

export type Outcome = 'ok' | 'tool_error' | 'upstream_error' | 'timeout' | 'denied'

type Entry = {
  userId: number | null
  apiKeyId: number | null
  source: 'mcp' | 'chat'
  serverSlug: string | null
  toolName: string | null
  startedAt: Date
  durationMs: number
  outcome: Outcome
  errorMessage?: string | null
}

// Tool arguments are never stored: they can hold customer data.
export async function writeAudit(e: Entry) {
  try {
    await db.insert(auditLog).values({ ...e, errorMessage: e.errorMessage?.slice(0, 500) ?? null })
  } catch (err) {
    // a broken audit write should not fail the user's call, but it must be visible
    console.error('audit write failed:', (err as Error).message)
  }
}
