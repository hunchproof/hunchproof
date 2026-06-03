import { rebalance } from '../../lib/slate'
import type { Triple } from '../../api/types'

const ROWS = [
  { k: 0 as const, key: 'h', label: 'Home', color: 'text-home' },
  { k: 1 as const, key: 'd', label: 'Draw', color: 'text-draw' },
  { k: 2 as const, key: 'a', label: 'Away', color: 'text-away' },
]

/**
 * Three probability sliders that always normalize to 100%. Tactile by design:
 * drag, keyboard arrows (native range), and tap-to-type via the number field.
 * Each control is labeled for screen readers with the match context.
 */
export function ProbSliders({
  value,
  onChange,
  disabled = false,
  matchId,
  matchName,
}: {
  value: Triple
  onChange: (v: Triple) => void
  disabled?: boolean
  matchId: number
  matchName: string
}) {
  const set = (idx: number, raw: number) => onChange(rebalance(value, idx, raw))
  return (
    <div className="mt-3.5 flex flex-col gap-[11px]">
      {ROWS.map(({ k, key, label, color }) => (
        <div
          key={key}
          className="grid grid-cols-[60px_1fr_58px] items-center gap-3 sm:grid-cols-[74px_1fr_60px]"
        >
          <span className={`hp-label text-[11px] ${color}`}>{label}</span>
          <input
            type="range"
            min={1}
            max={98}
            value={value[k]}
            disabled={disabled}
            className={`hp-range ${key}`}
            aria-label={`${label} win probability — ${matchName}`}
            aria-valuetext={`${value[k]} percent`}
            onChange={(e) => set(k, Number(e.target.value))}
          />
          <label className="sr-only" htmlFor={`pct-${matchId}-${key}`}>
            {label} percent for {matchName}
          </label>
          <input
            id={`pct-${matchId}-${key}`}
            type="number"
            min={1}
            max={98}
            value={value[k]}
            disabled={disabled}
            inputMode="numeric"
            className="tnum w-full rounded-md border border-line bg-[#0c1014] px-1.5 py-1 text-right text-[14px] font-semibold text-ink disabled:opacity-70"
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isNaN(n)) set(k, n)
            }}
          />
        </div>
      ))}
    </div>
  )
}
