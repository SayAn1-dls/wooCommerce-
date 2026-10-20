import { useState, type FormEvent } from 'react'
import { api, type Me } from '../api'

export function Login({ onDone }: { onDone: (me: Me) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      onDone(await api<Me>('/api/auth/login', { body: { email, password } }))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="narrow">
      <h1>MCP Gateway</h1>
      <form className="box" onSubmit={submit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="error">{error}</div>}
        <div>
          <button type="submit">Log in</button>
        </div>
      </form>
    </div>
  )
}
