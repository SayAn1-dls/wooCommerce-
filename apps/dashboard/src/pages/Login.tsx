import { useState, type FormEvent } from 'react'
import { api, type Me } from '../api'
import { AuthLayout } from './AuthLayout'

export function Login({ onDone }: { onDone: (me: Me) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      onDone(await api<Me>('/api/auth/login', { body: { email, password } }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <div className="card">
        <h2>Welcome back</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Log in to manage servers, keys and chat.
        </p>
        <form className="form" onSubmit={submit}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="alert">{error}</div>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        <p className="muted small" style={{ marginBottom: 0, marginTop: 18 }}>
          New here? Accounts are invite-only. Ask an admin for an invite link and open it to create your account.
        </p>
      </div>
    </AuthLayout>
  )
}
