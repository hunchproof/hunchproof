/** Oracle contributor weight: a small filled bar + the percentage. */
export function WeightBar({ frac, weightPct }: { frac: number; weightPct: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block h-1.5 w-[60px] overflow-hidden rounded-[4px] border border-line bg-[#06090b] align-middle">
        <i className="block h-full bg-signal" style={{ width: `${Math.max(frac * 100, 2)}%` }} />
      </span>
      <span className="tnum">{weightPct.toFixed(1)}%</span>
    </span>
  )
}
