import { useState, type FormEvent } from 'react'
import { api } from '../api'
import type { Server } from './Servers'

// Used for both add and edit. The credential is write-only: when one is saved we
// only show "set" and a Replace button, never the value.
export function ServerForm({ server, onDone }: { server?: Server; onDone: () => void }) {
  const [slug, setSlug] = useState(server?.slug ?? '')
  const [name, setName] = useState(server?.name ?? '')
  const [url, setUrl] = useState(server?.url ?? '')
  const [authType, setAuthType] = useState(server?.authType ?? 'none')
  const [headerName, setHeaderName] = useState(server?.authHeaderName ?? '')
  const [secret, setSecret] = useState('')
  const [replacing, setReplacing] = useState(!server?.hasSecret)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const body: Record<string, unknown> = { name, url, authType }
    if (authType === 'header') body.authHeaderName = headerName
    if (authType !== 'none' && replacing && secret) body.secret = secret
    try {
      if (server) await api(`/api/servers/${server.id}`, { method: 'PATCH', body })
      else await api('/api/servers', { body: { ...body, slug } })
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card form" onSubmit={submit} style={{ marginBottom: 20, maxWidth: 620 }}>
      <h2>{server ? `Edit ${server.slug}` : 'Add a server'}</h2>
      <label>
        Slug <span className="hint">tools show up as slug__tool; cannot be changed later</span>
        <input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={Boolean(server)} pattern="[a-z][a-z0-9_]{1,20}" required />
      </label>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        URL <span className="hint">Streamable HTTP endpoint</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/mcp" required />
      </label>
      <label>
        Credential
        <select value={authType} onChange={(e) => setAuthType(e.target.value as Server['authType'])}>
          <option value="none">None</option>
          <option value="bearer">Bearer token</option>
          <option value="header">Custom header</option>
        </select>
      </label>
      {authType === 'header' && (
        <label>
          Header name
          <input value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder="X-API-Key" required />
        </label>
      )}
      {authType !== 'none' &&
        (replacing ? (
          <label>
            Secret
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
          </label>
        ) : (
          <div className="row">
            <span className="pill green">Secret set</span>
            <span className="muted small">stored encrypted, never shown again</span>
            <button type="button" className="small" onClick={() => setReplacing(true)}>
              Replace
            </button>
          </div>
        ))}
      {error && <div className="alert">{error}</div>}
      <div className="row">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}
