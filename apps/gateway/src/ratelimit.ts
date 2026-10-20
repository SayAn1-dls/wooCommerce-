// Fixed one-minute window per key (client IP). In memory, which is fine for one replica.
const hits = new Map<string, { count: number; resetAt: number }>()

export function allow(key: string, limit: number) {
  const now = Date.now()
  const entry = hits.get(key)
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + 60_000 })
    return true
  }
  entry.count++
  return entry.count <= limit
}

setInterval(() => {
  const now = Date.now()
  for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k)
}, 60_000).unref()
