import { useEffect, useState } from 'react'
import { api, type Me } from '../api'
import { Link } from '../router'
import { ServerForm } from './ServerForm'

export type Server = {
  id: number
  slug: string
  name: string
  url: string
  authType: 'none' | 'bearer' | 'header'
  authHeaderName: string | null
  hasSecret: boolean
  enabled: boolean
  status: 'connected' | 'unreachable' | 'disabled'
  lastError: string | null
  toolCount: number
}

const words = { connected: 'Connected', unreachable: 'Unreachable', disabled: 'Disabled' }

export function Servers({ me }: { me: Me }) {
  const [servers, setServers] = useState<Server[] | null>(null)
  const [editing, setEditing] = useState<Server | 'new' | null>(null)
  const [error, setError] = useState('')
  const isAdmin = me.role === 'admin'

  async function load() {
    try {
      setServers(await api<Server[]>('/api/servers'))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  useEffect(() => {
    load()
    // status changes on its own as the gateway health-checks, so keep it fresh
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  async function act(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <>
      <h1>Servers</h1>
      {isAdmin && !editing && <button onClick={() => setEditing('new')}>Add server</button>}
      {editing && (
        <ServerForm
          server={editing === 'new' ? undefined : editing}
          onDone={() => {
            setEditing(null)
            load()
          }}
        />
      )}
      {error && <div className="error">{error}</div>}
      {servers && servers.length === 0 && <p>No servers yet.</p>}
      {servers && servers.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>URL</th>
              <th>Status</th>
              <th>Tools</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link to={`/servers/${s.id}`}>{s.name}</Link>
                </td>
                <td>
                  <code>{s.slug}</code>
                </td>
                <td className="small">{s.url}</td>
                <td>
                  {words[s.status]}
                  {s.status === 'unreachable' && s.lastError && <div className="muted small">{s.lastError}</div>}
                </td>
                <td>{s.toolCount}</td>
                {isAdmin && (
                  <td>
                    <div className="row">
                      <button onClick={() => act(() => api(`/api/servers/${s.id}`, { method: 'PATCH', body: { enabled: !s.enabled } }))}>
                        {s.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => setEditing(s)}>Edit</button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${s.slug}? Its tools disappear for everyone.`)) {
                            act(() => api(`/api/servers/${s.id}`, { method: 'DELETE' }))
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
