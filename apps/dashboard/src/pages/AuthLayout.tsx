import type { ReactNode } from 'react'
import { Icon } from '../icons'

// Shared split screen for login and invite pages: a short pitch on the left, the form on the right.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="brand">
          <span className="logo">
            <Icon name="bolt" />
          </span>
          MCP Gateway
        </div>
        <div>
          <h1>Every MCP server your team needs, behind one key.</h1>
          <p>Connect servers once. Everyone gets one endpoint, a personal key and a chat that can use the tools.</p>
          <div className="features">
            <div className="feature">
              <span className="badge-icon">
                <Icon name="tool" />
              </span>
              <div>
                <strong>One endpoint, all tools</strong>
                <span>WooCommerce, notes and remote servers through a single URL.</span>
              </div>
            </div>
            <div className="feature">
              <span className="badge-icon">
                <Icon name="shield" />
              </span>
              <div>
                <strong>Credentials stay put</strong>
                <span>Upstream secrets are encrypted and never leave the gateway.</span>
              </div>
            </div>
            <div className="feature">
              <span className="badge-icon">
                <Icon name="audit" />
              </span>
              <div>
                <strong>Every call audited</strong>
                <span>Who called what, when, and how it went.</span>
              </div>
            </div>
          </div>
        </div>
        <span className="small" style={{ color: '#64748b' }}>
          WooCommerce hosting with a team MCP gateway
        </span>
      </section>
      <section className="auth-form">{children}</section>
    </div>
  )
}
