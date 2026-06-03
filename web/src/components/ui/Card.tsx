import type { CSSProperties, ReactNode } from 'react'

export function Card({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      style={style}
      className={`glass-panel rounded-panel p-[18px] ${className}`}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="font-disp text-[16px] font-semibold text-ink">{title}</h3>
      {sub && <p className="mt-0.5 text-[11.5px] text-ink-faint">{sub}</p>}
    </div>
  )
}
