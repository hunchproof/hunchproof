import type { ReactNode } from 'react'

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`hp-label whitespace-nowrap rounded-full border border-signal-dim px-[11px] py-1 text-[10px] text-signal-dim ${className}`}
    >
      {children}
    </span>
  )
}
