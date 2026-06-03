import { CHART } from '../../lib/theme'
import type { BarVM } from '../../models'

/** Horizontal RPS bars (lower = sharper). Ported from the original barsSVG. */
export function BarsChart({ rows }: { rows: BarVM[] }) {
  if (!rows.length) return null
  const W = 320
  const H = 40 + rows.length * 30
  const pad = 120
  const vals = rows.map((r) => r.val)
  const max = Math.max(...vals) * 1.04
  const min = Math.min(...vals) * 0.985
  const span = max - min || 1
  const x = (v: number) => pad + ((v - min) / span) * (W - pad - 44)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="RPS comparison (lower is better)">
      {rows.map((r, i) => {
        const yy = 22 + i * 30
        return (
          <g key={r.label}>
            <text x={pad - 8} y={yy + 12} fill={r.hl ? CHART.signal : CHART.inkDim} fontSize={10.5} textAnchor="end">
              {r.label}
            </text>
            <rect x={pad} y={yy + 3} width={Math.max(x(r.val) - pad, 2)} height={13} rx={3} fill={r.color} />
            <text x={x(r.val) + 5} y={yy + 13} fill={CHART.ink} fontSize={10} fontWeight={600} className="tnum">
              {r.val.toFixed(4)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
