import { useState, type FormEvent } from 'react'
import { api, type Me } from '../api'

export function AcceptInvite({ token, onDone }: { token: string; onDone: (me: Me) => void }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      onDone(await api<Me>('/api/invites/accept', { body: { token, name, password } }))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="narrow">
      <h1>Join the team</h1>
      <p className="muted">Pick your name and a password. You will be logged in right after.</p>
      <form className="box" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label>
          Password (at least 8 characters)
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </label>
        {error && <div className="error">{error}</div>}
        <div>
          <button type="submit">Create account</button>
        </div>
      </form>
    </div>
  )
}
