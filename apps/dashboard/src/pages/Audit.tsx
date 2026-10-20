import { useEffect, useState } from 'react'
import { api, when, type Me } from '../api'

type Row = {
  id: number
  user: string
  source: string
  serverSlug: string | null
  toolName: string | null
  startedAt: string
  durationMs: number
  outcome: string
  errorMessage: string | null
}

const outcomes = ['ok', 'tool_error', 'upstream_error', 'timeout', 'denied']

export function Audit({ me }: { me: Me }) {
  const isAdmin = me.role === 'admin'
  const [rows, setRows] = useState<Row[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [user, setUser] = useState('')
  const [server, setServer] = useState('')
  const [outcome, setOutcome] = useState('')
  const [members, setMembers] = useState<Me[]>([])
  const [slugs, setSlugs] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ slug: string }[]>('/api/servers').then((s) => setSlugs(s.map((x) => x.slug))).catch(() => {})
    if (isAdmin) api<Me[]>('/api/members').then(setMembers).catch(() => {})
  }, [])

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page) })
    if (user) q.set('user', user)
    if (server) q.set('server', server)
    if (outcome) q.set('outcome', outcome)
    api<{ rows: Row[]; hasMore: boolean }>(`/api/audit?${q}`)
      .then((res) => {
        setRows(res.rows)
        setHasMore(res.hasMore)
      })
      .catch((err) => setError(err.message))
  }, [page, user, server, outcome])

  function filter(set: (v: string) => void) {
    return (e: { target: { value: string } }) => {
      set(e.target.value)
      setPage(1)
    }
  }

  const look: Record<string, string> = { ok: 'green', tool_error: 'amber', upstream_error: 'red', timeout: 'red', denied: 'red' }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>{isAdmin ? 'Every tool call through the gateway, newest first.' : 'Your own tool calls, newest first.'}</p>
        </div>
      </div>
      <div className="filters">
        {isAdmin && (
          <select value={user} onChange={filter(setUser)}>
            <option value="">All users</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.email}
              </option>
            ))}
          </select>
        )}
        <select value={server} onChange={filter(setServer)}>
          <option value="">All servers</option>
          {slugs.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={outcome} onChange={filter(setOutcome)}>
          <option value="">All outcomes</option>
          {outcomes.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="card flush">
        {rows.length === 0 ? (
          <div className="empty">Nothing logged yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Via</th>
                  <th>Tool</th>
                  <th>Duration</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="muted">{when(r.startedAt)}</td>
                    <td>{r.user}</td>
                    <td>
                      <span className={`pill ${r.source === 'chat' ? 'indigo' : 'gray'}`}>{r.source}</span>
                    </td>
                    <td>
                      <span className="chip">{r.serverSlug ? `${r.serverSlug}__${r.toolName}` : r.toolName}</span>
                    </td>
                    <td className="muted">{r.durationMs} ms</td>
                    <td>
                      <span className={`pill ${look[r.outcome] ?? 'gray'}`}>{r.outcome}</span>
                      {r.errorMessage && <div className="muted small" style={{ marginTop: 4 }}>{r.errorMessage}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pager">
          <button className="small" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Newer
          </button>
          <span className="muted small">Page {page}</span>
          <button className="small" disabled={!hasMore} onClick={() => setPage(page + 1)}>
            Older
          </button>
        </div>
      </div>
    </>
  )
}
