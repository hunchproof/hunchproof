import { pct } from '../../lib/format'

/** Home/Draw/Away distribution bar. `dist` is a probability triple (0..1). */
export function DistBar({ dist, className = '' }: { dist: readonly number[]; className?: string }) {
  const s = dist[0] + dist[1] + dist[2] || 1
  const [h, d, a] = [dist[0] / s, dist[1] / s, dist[2] / s]
  return (
    <div
      role="img"
      aria-label={`Distribution — Home ${pct(h)}, Draw ${pct(d)}, Away ${pct(a)}`}
      className={`flex h-2 overflow-hidden rounded-[5px] border border-line ${className}`}
    >
      <i className="block h-full bg-home" style={{ width: `${h * 100}%` }} />
      <i className="block h-full bg-draw" style={{ width: `${d * 100}%` }} />
      <i className="block h-full bg-away" style={{ width: `${a * 100}%` }} />
    </div>
  )
}
