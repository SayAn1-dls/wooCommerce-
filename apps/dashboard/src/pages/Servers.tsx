import { useEffect, useState } from 'react'
import { api, type Me } from '../api'
import { Link } from '../router'
import { Icon } from '../icons'
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

export function StatusPill({ status }: { status: Server['status'] }) {
  const look = { connected: 'green', unreachable: 'red', disabled: 'gray' }[status]
  const word = { connected: 'Connected', unreachable: 'Unreachable', disabled: 'Disabled' }[status]
  return <span className={`pill ${look}`}>{word}</span>
}

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

  const list = servers ?? []
  const connected = list.filter((s) => s.status === 'connected')
  const tools = connected.reduce((n, s) => n + s.toolCount, 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Servers</h1>
          <p>MCP servers the whole team can use through {location.origin}/mcp</p>
        </div>
        {isAdmin && !editing && (
          <button className="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> Add server
          </button>
        )}
      </div>

      <div className="stats">
        <div className="card stat">
          <span className="badge-icon">
            <Icon name="servers" />
          </span>
          <div>
            <div className="value">
              {connected.length}/{list.length}
            </div>
            <div className="label">servers connected</div>
          </div>
        </div>
        <div className="card stat">
          <span className="badge-icon">
            <Icon name="tool" />
          </span>
          <div>
            <div className="value">{tools}</div>
            <div className="label">tools available</div>
          </div>
        </div>
        <div className="card stat">
          <span className="badge-icon">
            <Icon name="shield" />
          </span>
          <div>
            <div className="value">{list.filter((s) => s.hasSecret).length}</div>
            <div className="label">credentials held by the gateway</div>
          </div>
        </div>
      </div>

      {editing && (
        <ServerForm
          server={editing === 'new' ? undefined : editing}
          onDone={() => {
            setEditing(null)
            load()
          }}
        />
      )}
      {error && <div className="alert">{error}</div>}
      {servers && servers.length === 0 && <div className="card empty">No servers yet.</div>}

      <div className="grid">
        {list.map((s) => (
          <div key={s.id} className="card server-card">
            <div className="top">
              <div>
                <Link to={`/servers/${s.id}`} className="name">
                  {s.name}
                </Link>
                <div className="url">{s.url}</div>
              </div>
              <StatusPill status={s.status} />
            </div>
            <div className="meta">
              <span className="chip">{s.slug}__*</span>
              <span className="pill indigo">{s.toolCount} tools</span>
              {s.authType !== 'none' && <span className="pill gray">{s.hasSecret ? 'credential set' : 'no credential'}</span>}
            </div>
            {s.status === 'unreachable' && s.lastError && <div className="error">{s.lastError}</div>}
            <div className="actions">
              <Link to={`/servers/${s.id}`} className="btn small">
                View tools
              </Link>
              {isAdmin && (
                <>
                  <button
                    className="small"
                    onClick={() => act(() => api(`/api/servers/${s.id}`, { method: 'PATCH', body: { enabled: !s.enabled } }))}
                  >
                    {s.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button className="small" onClick={() => setEditing(s)}>
                    Edit
                  </button>
                  <button
                    className="small danger"
                    onClick={() => {
                      if (confirm(`Remove ${s.slug}? Its tools disappear for everyone.`)) {
                        act(() => api(`/api/servers/${s.id}`, { method: 'DELETE' }))
                      }
                    }}
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
