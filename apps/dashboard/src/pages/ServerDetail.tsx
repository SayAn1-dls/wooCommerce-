import { useEffect, useState } from 'react'
import { api } from '../api'
import { Link } from '../router'
import { StatusPill, type Server } from './Servers'

type Tool = { name: string; exposedAs: string; description: string; inputSchema: unknown }

export function ServerDetail({ id }: { id: number }) {
  const [data, setData] = useState<{ server: Server; tools: Tool[] } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/api/servers/${id}/tools`)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [id])

  if (error) return <div className="alert">{error}</div>
  if (!data) return null
  const { server, tools } = data

  return (
    <>
      <p className="small">
        <Link to="/">Servers</Link> <span className="muted">/ {server.slug}</span>
      </p>
      <div className="page-head">
        <div>
          <h1>{server.name}</h1>
          <p>{server.url}</p>
        </div>
        <StatusPill status={server.status} />
      </div>
      {server.lastError && <div className="alert">{server.lastError}</div>}
      {tools.length === 0 ? (
        <div className="card empty">No tools right now.</div>
      ) : (
        <div className="grid">
          {tools.map((t) => (
            <div key={t.name} className="card">
              <span className="chip">{t.exposedAs}</span>
              <p style={{ margin: '10px 0 0' }}>{t.description}</p>
              <details>
                <summary>Input schema</summary>
                <pre>{JSON.stringify(t.inputSchema, null, 2)}</pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
