import { useEffect, useState } from 'react'
import { api, ApiError, type Me } from './api'
import { Link, navigate, usePath } from './router'
import { Login } from './pages/Login'
import { AcceptInvite } from './pages/AcceptInvite'
import { Servers } from './pages/Servers'
import { ServerDetail } from './pages/ServerDetail'
import { Members } from './pages/Members'
import { Keys } from './pages/Keys'
import { Audit } from './pages/Audit'
import { Chat } from './pages/Chat'

export function App() {
  const path = usePath()
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<Me>('/api/me')
      .then(setMe)
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) console.error(err)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null

  const invite = path.match(/^\/invite\/(.+)$/)
  if (invite) return <AcceptInvite token={invite[1]} onDone={(u) => (setMe(u), navigate('/keys'))} />
  if (!me) return <Login onDone={(u) => (setMe(u), navigate('/'))} />

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    setMe(null)
    navigate('/')
  }

  const isAdmin = me.role === 'admin'
  const detail = path.match(/^\/servers\/(\d+)$/)
  let page
  if (detail) page = <ServerDetail id={Number(detail[1])} />
  else if (path === '/keys') page = <Keys me={me} />
  else if (path === '/audit') page = <Audit me={me} />
  else if (path === '/chat') page = <Chat />
  else if (path === '/members' && isAdmin) page = <Members me={me} />
  else page = <Servers me={me} />

  return (
    <>
      <header>
        <strong>MCP Gateway</strong>
        <Link to="/">Servers</Link>
        <Link to="/chat">Chat</Link>
        <Link to="/keys">My keys</Link>
        <Link to="/audit">Audit log</Link>
        {isAdmin && <Link to="/members">Members</Link>}
        <span className="who">
          {me.email} ({me.role})
        </span>
        <button onClick={logout}>Log out</button>
      </header>
      <main>{page}</main>
    </>
  )
}
