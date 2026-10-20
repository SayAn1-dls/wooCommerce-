import { useEffect, useState, type FormEvent } from 'react'
import { api, when, type Me } from '../api'
import { Copy } from './Copy'

type Member = Me & { createdAt: string; disabledAt: string | null }

export function Members({ me }: { me: Me }) {
  const [members, setMembers] = useState<Member[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [link, setLink] = useState('')
  const [error, setError] = useState('')

  const load = () => api<Member[]>('/api/members').then(setMembers).catch((err) => setError(err.message))
  useEffect(() => {
    load()
  }, [])

  async function invite(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLink('')
    try {
      const res = await api<{ link: string }>('/api/invites', { body: { email, role } })
      setLink(res.link)
      setEmail('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function update(id: number, body: object) {
    setError('')
    try {
      await api(`/api/members/${id}`, { method: 'PATCH', body })
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <>
      <h1>Members</h1>
      <form className="box" onSubmit={invite}>
        <strong>Invite someone</strong>
        <div className="row">
          <input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit">Create invite link</button>
        </div>
        {link && (
          <div>
            <p className="muted">Send this link yourself. It works once and expires in 72 hours.</p>
            <div className="row">
              <code>{link}</code>
              <Copy text={link} />
            </div>
          </div>
        )}
      </form>
      {error && <div className="error">{error}</div>}
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Role</th>
            <th>Joined</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.email}</td>
              <td>{m.name}</td>
              <td>{m.role}</td>
              <td>{when(m.createdAt)}</td>
              <td>{m.disabledAt ? 'Disabled' : 'Active'}</td>
              <td>
                {m.id !== me.id && (
                  <div className="row">
                    <button onClick={() => update(m.id, { role: m.role === 'admin' ? 'member' : 'admin' })}>
                      Make {m.role === 'admin' ? 'member' : 'admin'}
                    </button>
                    <button onClick={() => update(m.id, { disabled: !m.disabledAt })}>{m.disabledAt ? 'Enable' : 'Disable'}</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
