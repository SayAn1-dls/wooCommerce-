import { useState } from 'react'

export function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setDone(true)
      }}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}
