import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../api'
import { Icon } from '../icons'

type ToolCall = { name: string; durationMs: number; ok: boolean }
type Message = { role: 'user' | 'assistant'; content: string; toolCalls?: ToolCall[] }

const suggestions = ['What orders came in today?', 'List our products', 'Create a product called "Test Mug" priced at 299', 'Save a note: restock tote bags']

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  async function send(text: string) {
    if (!text.trim() || busy) return
    const next: Message[] = [...messages, { role: 'user', content: text.trim() }]
    setMessages(next)
    setInput('')
    setError('')
    setBusy(true)
    try {
      // the server keeps no chat history; we send the whole conversation each time
      const res = await api<{ reply: string; toolCalls: ToolCall[] }>('/api/chat', {
        body: { messages: next.map(({ role, content }) => ({ role, content })) },
      })
      setMessages([...next, { role: 'assistant', content: res.reply, toolCalls: res.toolCalls }])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    send(input)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Chat</h1>
          <p>Ask about the store or the team notes. The agent calls tools through the gateway as you.</p>
        </div>
        {messages.length > 0 && (
          <button className="small" onClick={() => setMessages([])}>
            New chat
          </button>
        )}
      </div>
      <div className="card chat">
        <div className="chat-log">
          {messages.length === 0 && (
            <div className="empty">
              <div className="bot" style={{ margin: '0 auto 12px', width: 44, height: 44 }}>
                <Icon name="bolt" size={22} />
              </div>
              <p>Try one of these:</p>
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button key={s} className="small" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`bubble-row ${m.role}`}>
              {m.role === 'assistant' && (
                <span className="bot">
                  <Icon name="bolt" size={15} />
                </span>
              )}
              <div className="bubble">
                {m.content}
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="tools-used">
                    {m.toolCalls.map((t, j) => (
                      <span key={j} className={`pill ${t.ok ? 'green' : 'red'}`}>
                        called {t.name} ({t.durationMs} ms)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="bubble-row assistant">
              <span className="bot">
                <Icon name="bolt" size={15} />
              </span>
              <div className="bubble typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
          <div ref={bottom} />
        </div>
        {error && (
          <div className="alert" style={{ margin: '0 16px' }}>
            {error}
          </div>
        )}
        <form onSubmit={submit} className="chat-input">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder='Ask something, e.g. "what orders came in today?"' disabled={busy} />
          <button type="submit" className="primary" disabled={busy || !input.trim()}>
            <Icon name="send" size={16} /> Send
          </button>
        </form>
      </div>
    </>
  )
}
