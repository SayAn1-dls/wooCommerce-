// Small inline icons (stroke style), so the app needs no icon library.
const paths = {
  servers: 'M4 5h16v5H4zM4 14h16v5H4zM8 7.5h.01M8 16.5h.01',
  chat: 'M4 5h16v11H9l-5 4z',
  key: 'M14 7a4 4 0 1 1-3.9 4.9L4 18v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 14 7zM16 9h.01',
  audit: 'M7 4h10v16H7zM10 8h4M10 12h4M10 16h2',
  members: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a3 3 0 1 0 0-6M21 20c0-2.6-1.6-4.8-4-5.6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  plus: 'M12 5v14M5 12h14',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6z',
  tool: 'M14 6a4 4 0 0 0-5 5l-5 5 3 3 5-5a4 4 0 0 0 5-5l-2 2-2-2z',
  shield: 'M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z',
  send: 'M4 12 20 4l-6 16-3-7z',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  store: 'M4 9l1-4h14l1 4M4 9h16v10H4zM9 19v-5h6v5',
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
