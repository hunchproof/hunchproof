import { useCountdown } from '../../hooks/useCountdown'
import { fmtCountdown } from '../../lib/format'

export function Countdown({ targetMs, prefix = 'slate locks' }: { targetMs: number | null; prefix?: string }) {
  const left = useCountdown(targetMs)
  return (
    <span className="whitespace-nowrap text-[11px] text-ink-dim">
      {prefix} <b className="tnum text-signal">{left == null ? '—' : fmtCountdown(left)}</b>
    </span>
  )
}
