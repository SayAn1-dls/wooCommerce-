import { useState } from 'react'
import { Icon } from '../icons'

export function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="small"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >
      <Icon name="copy" size={14} /> {done ? 'Copied' : 'Copy'}
    </button>
  )
}
