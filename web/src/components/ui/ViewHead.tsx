import type { ReactNode } from 'react'

/** Shared view header: display title, optional description, optional right-aligned pill. */
export function ViewHead({
  title,
  children,
  pill,
}: {
  title: string
  children?: ReactNode
  pill?: ReactNode
}) {
  return (
    <div>
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-disp text-[27px] font-semibold leading-tight tracking-[-0.02em]">
            {title}
          </h2>
          {children && <p className="mt-1 max-w-[62ch] text-[12.5px] text-ink-dim">{children}</p>}
        </div>
        {pill}
      </div>
      <hr className="my-5 border-line" />
    </div>
  )
}
