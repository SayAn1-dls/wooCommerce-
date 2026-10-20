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
      <h1>{isAdmin ? 'API keys' : 'My keys'}</h1>
      <p className="muted">
        One key gives an MCP client every enabled server's tools through <code>{endpoint}</code>.
      </p>
      <form className="box" onSubmit={create}>
        <strong>Create key</strong>
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
          <button type="submit">Create</button>
        </div>
        {fresh && (
          <div>
            <p>Copy this key now. It will not be shown again.</p>
            <div className="row">
              <code>{fresh}</code>
              <Copy text={fresh} />
            </div>
          </div>
        )}
      </form>
      <h2>Connect Claude Code</h2>
      <pre>{command}</pre>
      <p className="muted small">Cursor: add a server with URL {endpoint} and the header Authorization: Bearer &lt;key&gt;.</p>
      {error && <div className="error">{error}</div>}
      <h2>Keys</h2>
      {keys.length === 0 ? (
        <p>No keys yet.</p>
      ) : (
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
                <td>{k.label}</td>
                <td>
                  <code>{k.prefix}...</code>
                </td>
                {isAdmin && <td>{k.owner}</td>}
                <td>{when(k.createdAt)}</td>
                <td>{when(k.lastUsedAt) || 'never'}</td>
                <td>{k.revokedAt ? 'Revoked' : 'Active'}</td>
                <td>{!k.revokedAt && <button onClick={() => revoke(k)}>Revoke</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
