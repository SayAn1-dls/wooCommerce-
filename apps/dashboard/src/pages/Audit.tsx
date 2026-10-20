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

  return (
    <>
      <h1>Audit log</h1>
      {!isAdmin && <p className="muted">You see your own calls only.</p>}
      <div className="row" style={{ marginBottom: 12 }}>
        {isAdmin && (
          <select value={user} onChange={filter(setUser)}>
            <option value="">all users</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.email}
              </option>
            ))}
          </select>
        )}
        <select value={server} onChange={filter(setServer)}>
          <option value="">all servers</option>
          {slugs.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={outcome} onChange={filter(setOutcome)}>
          <option value="">all outcomes</option>
          {outcomes.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      {rows.length === 0 ? (
        <p>Nothing logged yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Via</th>
              <th>Server</th>
              <th>Tool</th>
              <th>Duration (ms)</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{when(r.startedAt)}</td>
                <td>{r.user}</td>
                <td>{r.source}</td>
                <td>{r.serverSlug}</td>
                <td>{r.toolName}</td>
                <td>{r.durationMs}</td>
                <td>
                  {r.outcome}
                  {r.errorMessage && <div className="muted small">{r.errorMessage}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Newer
        </button>
        <span className="muted">page {page}</span>
        <button disabled={!hasMore} onClick={() => setPage(page + 1)}>
          Older
        </button>
      </div>
    </>
  )
}
