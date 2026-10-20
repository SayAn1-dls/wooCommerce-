import { useEffect, useState, type FormEvent } from 'react'
import { api, when, type Me } from '../api'
import { initials } from '../App'
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
      <div className="page-head">
        <div>
          <h1>Members</h1>
          <p>Invite teammates and manage their roles.</p>
        </div>
      </div>
      <form className="card" onSubmit={invite}>
        <h2>Invite someone</h2>
        <div className="row">
          <input type="email" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" className="primary">
            Create invite link
          </button>
        </div>
        {link && (
          <div className="notice">
            Invite link ready. Send it yourself; it works once and expires in 72 hours.
            <div className="secret-box">
              <code>{link}</code>
              <Copy text={link} />
            </div>
          </div>
        )}
      </form>
      {error && <div className="alert">{error}</div>}
      <div className="card flush" style={{ marginTop: 20 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="person">
                      <span className="avatar">{initials(m.name || m.email)}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{m.name}</div>
                        <div className="muted small">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${m.role === 'admin' ? 'indigo' : 'gray'}`}>{m.role}</span>
                  </td>
                  <td className="muted">{when(m.createdAt)}</td>
                  <td>{m.disabledAt ? <span className="pill red">Disabled</span> : <span className="pill green">Active</span>}</td>
                  <td>
                    {m.id !== me.id && (
                      <div className="row">
                        <button className="small" onClick={() => update(m.id, { role: m.role === 'admin' ? 'member' : 'admin' })}>
                          Make {m.role === 'admin' ? 'member' : 'admin'}
                        </button>
                        <button className={`small${m.disabledAt ? '' : ' danger'}`} onClick={() => update(m.id, { disabled: !m.disabledAt })}>
                          {m.disabledAt ? 'Enable' : 'Disable'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
