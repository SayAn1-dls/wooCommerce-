import { useEffect, useState, type FormEvent } from 'react'
import { api, when, type Me } from '../api'
import { Copy } from './Copy'

type Key = {
  id: number
  userId: number
  owner: string
  label: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export function Keys({ me }: { me: Me }) {
  const isAdmin = me.role === 'admin'
  const [keys, setKeys] = useState<Key[]>([])
  const [members, setMembers] = useState<Me[]>([])
  const [label, setLabel] = useState('')
  const [owner, setOwner] = useState(String(me.id))
  const [fresh, setFresh] = useState('')
  const [error, setError] = useState('')
  const endpoint = `${location.origin}/mcp`

  const load = () => api<Key[]>('/api/keys').then(setKeys).catch((err) => setError(err.message))
  useEffect(() => {
    load()
    if (isAdmin) api<Me[]>('/api/members').then(setMembers).catch(() => {})
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const res = await api<{ key: string }>('/api/keys', { body: { label, userId: Number(owner) } })
      setFresh(res.key)
      setLabel('')
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function revoke(k: Key) {
    if (!confirm(`Revoke "${k.label}"? Clients using it stop working right away.`)) return
    try {
      await api(`/api/keys/${k.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const command = `claude mcp add --transport http team-gateway ${endpoint} --header "Authorization: Bearer ${fresh || 'mcpg_xxx'}"`

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isAdmin ? 'API keys' : 'My keys'}</h1>
          <p>One key gives an MCP client every enabled server's tools.</p>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <form className="card" onSubmit={create}>
          <h2>Create a key</h2>
          <div className="row">
            <input placeholder="label, e.g. laptop" value={label} onChange={(e) => setLabel(e.target.value)} required />
            {isAdmin && (
              <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    for {m.email}
                  </option>
                ))}
              </select>
            )}
            <button type="submit" className="primary">
              Create
            </button>
          </div>
          {fresh && (
            <div className="notice">
              Copy this key now. It will not be shown again.
              <div className="secret-box">
                <code>{fresh}</code>
                <Copy text={fresh} />
              </div>
            </div>
          )}
        </form>
        <div className="card">
          <h2>Connect Claude Code</h2>
          <pre>{command}</pre>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Cursor: add a server with URL <code>{endpoint}</code> and the header <code>Authorization: Bearer &lt;key&gt;</code>.
          </p>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="card flush" style={{ marginTop: 20 }}>
        {keys.length === 0 ? (
          <div className="empty">No keys yet. Create one above to connect a client.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Key</th>
                  {isAdmin && <th>Owner</th>}
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td style={{ fontWeight: 600 }}>{k.label}</td>
                    <td>
                      <span className="chip">{k.prefix}...</span>
                    </td>
                    {isAdmin && <td>{k.owner}</td>}
                    <td className="muted">{when(k.createdAt)}</td>
                    <td className="muted">{when(k.lastUsedAt) || 'never'}</td>
                    <td>{k.revokedAt ? <span className="pill gray">Revoked</span> : <span className="pill green">Active</span>}</td>
                    <td>
                      {!k.revokedAt && (
                        <button className="small danger" onClick={() => revoke(k)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
