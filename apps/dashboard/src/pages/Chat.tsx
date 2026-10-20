import { useState, type FormEvent } from 'react'
import { api } from '../api'

type ToolCall = { name: string; durationMs: number; ok: boolean }
type Message = { role: 'user' | 'assistant'; content: string; toolCalls?: ToolCall[] }

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    const next: Message[] = [...messages, { role: 'user', content: input.trim() }]
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

  return (
    <>
      <h1>Chat</h1>
      <p className="muted">Ask about the store or notes. The agent calls tools through the gateway as you.</p>
      <div className="chat">
        {messages.length === 0 && <p>No messages yet.</p>}
        {messages.map((m, i) => (
          <div key={i} className="msg">
            <div className="who">{m.role === 'user' ? 'You' : 'Agent'}</div>
            <div>{m.content}</div>
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div className="muted small">
                {m.toolCalls.map((t) => `called ${t.name} (${t.durationMs} ms)${t.ok ? '' : ' failed'}`).join(', ')}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="muted">Thinking...</p>}
      </div>
      {error && <div className="error">{error}</div>}
      <form onSubmit={send} className="row">
        <input
          style={{ flex: 1 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='e.g. "what orders came in today?"'
          disabled={busy}
        />
        <button type="submit" disabled={busy}>
          Send
        </button>
      </form>
    </>
  )
}
