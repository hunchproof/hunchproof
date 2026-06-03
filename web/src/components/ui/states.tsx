import type { ReactNode } from 'react'
import { Button } from './Button'

/** Generic empty state for a card/section. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-inner border border-dashed border-line bg-[#06090b]/40 px-4 py-8 text-center">
      <p className="text-[13px] text-ink-dim">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-[44ch] text-[11.5px] text-ink-faint">{children}</p>}
    </div>
  )
}

/** Inline skeleton loader. */
export function LoadingState({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-line/60" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  )
}

/** Full-view skeleton used as the lazy-route Suspense fallback. */
export function ViewLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-3 h-7 w-1/3 rounded bg-line/60" />
      <div className="mb-6 h-4 w-2/3 rounded bg-line/40" />
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-tile bg-line/40" />
        ))}
      </div>
      <div className="mt-4 h-40 rounded-panel bg-line/30" />
    </div>
  )
}

/** Error state with optional retry. Accepts an ApiError-shaped object or Error. */
export function ErrorState({
  error,
  onRetry,
  title = 'Couldn’t load this from the backend',
}: {
  error: { detail?: string; message?: string; status?: number } | null
  onRetry?: () => void
  title?: string
}) {
  const detail = error?.detail || error?.message || 'Unknown error'
  return (
    <div
      role="alert"
      className="rounded-inner border border-bad/40 bg-bad/[0.06] px-4 py-5 text-center"
    >
      <p className="text-[13px] text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[48ch] text-[11.5px] text-ink-dim">
        {detail}
        {error?.status ? ` (HTTP ${error.status})` : ''}
      </p>
      {onRetry && (
        <Button sm variant="ghost" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}
