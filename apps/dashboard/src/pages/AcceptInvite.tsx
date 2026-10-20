import { useState, type FormEvent } from 'react'
import { api, type Me } from '../api'
import { AuthLayout } from './AuthLayout'

export function AcceptInvite({ token, onDone }: { token: string; onDone: (me: Me) => void }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      onDone(await api<Me>('/api/invites/accept', { body: { token, name, password } }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <div className="card">
        <h2>Create your account</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          You were invited to the team. Pick a name and password and you're in.
        </p>
        <form className="form" onSubmit={submit}>
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ravi Kumar" required autoFocus />
          </label>
          <label>
            Password <span className="hint">at least 8 characters</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </label>
          {error && <div className="alert">{error}</div>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>
    </AuthLayout>
  )
}
