import { useEffect, useState } from 'react'
import { api } from '../api'
import { Link } from '../router'
import type { Server } from './Servers'

type Tool = { name: string; exposedAs: string; description: string; inputSchema: unknown }

export function ServerDetail({ id }: { id: number }) {
  const [data, setData] = useState<{ server: Server; tools: Tool[] } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/api/servers/${id}/tools`)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [id])

  if (error) return <div className="error">{error}</div>
  if (!data) return null
  const { server, tools } = data

  return (
    <>
      <p>
        <Link to="/">Servers</Link> / {server.slug}
      </p>
      <h1>{server.name}</h1>
      <p className="muted">
        {server.url} - {server.status}
        {server.lastError ? ` (${server.lastError})` : ''}
      </p>
      {tools.length === 0 ? (
        <p>No tools right now.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Exposed as</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((t) => (
              <tr key={t.name}>
                <td>
                  <code>{t.exposedAs}</code>
                </td>
                <td>
                  {t.description}
                  <details>
                    <summary className="muted small">input schema</summary>
                    <pre>{JSON.stringify(t.inputSchema, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
