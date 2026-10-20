import { useEffect, useState } from 'react'
import { api, ApiError, type Me } from './api'
import { Link, navigate, usePath } from './router'
import { Icon, type IconName } from './icons'
import { Login } from './pages/Login'
import { AcceptInvite } from './pages/AcceptInvite'
import { Servers } from './pages/Servers'
import { ServerDetail } from './pages/ServerDetail'
import { Members } from './pages/Members'
import { Keys } from './pages/Keys'
import { Audit } from './pages/Audit'
import { Chat } from './pages/Chat'

export function initials(nameOrEmail: string) {
  const parts = nameOrEmail.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

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

  const nav: [string, string, IconName][] = [
    ['/', 'Servers', 'servers'],
    ['/chat', 'Chat', 'chat'],
    ['/keys', isAdmin ? 'API keys' : 'My keys', 'key'],
    ['/audit', 'Audit log', 'audit'],
  ]
  if (isAdmin) nav.push(['/members', 'Members', 'members'])
  const current = detail ? '/' : nav.some(([to]) => to === path) ? path : '/'

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">
            <Icon name="bolt" />
          </span>
          MCP Gateway
        </div>
        {nav.map(([to, label, icon]) => (
          <Link key={to} to={to} className={`nav-link${current === to ? ' active' : ''}`}>
            <Icon name={icon} />
            {label}
          </Link>
        ))}
        <a className="nav-link" href={`${location.protocol}//${location.host.replace(/^app\./, 'shop.')}`} target="_blank" rel="noreferrer">
          <Icon name="store" />
          Open store
        </a>
        <div className="spacer" />
        <div className="me">
          <span className="avatar">{initials(me.name || me.email)}</span>
          <div className="who">
            <div>{me.name || me.email}</div>
            <span>
              {me.email} - {me.role}
            </span>
          </div>
          <button className="icon-btn" onClick={logout} title="Log out" aria-label="Log out">
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <main className="content">{page}</main>
    </div>
  )
}
