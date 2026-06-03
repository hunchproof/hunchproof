import { RES } from '../../lib/format'
import { StatusBadge } from '../ui/StatusBadge'
import { EmptyState } from '../ui/states'
import type { SettledRowVM } from '../../models'

const TH = 'hp-label border-b border-line-2 px-2.5 py-2 text-left text-[10px] font-medium text-ink-faint'
const TD = 'tnum border-b border-line px-2.5 py-2.5'

export function SettledTable({ rows }: { rows: SettledRowVM[] }) {
  if (!rows.length) {
    return (
      <EmptyState title="No settled predictions yet">
        Once your committed matches finish and settle, your scored calls appear here — benchmarked
        against the closing line.
      </EmptyState>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            <th className={TH}>match</th>
            <th className={TH}>your H/D/A</th>
            <th className={TH}>result</th>
            <th className={TH}>RPS</th>
            <th className={TH}>CLV</th>
            <th className={TH} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.matchId}>
              <td className={TD}>{r.label}</td>
              <td className={TD}>{r.pctDist.join('/')}</td>
              <td className={TD}>
                {r.resultIndex == null ? '—' : <b className="text-ink">{RES[r.resultIndex]}</b>}
              </td>
              <td className={TD}>{r.rps == null ? '—' : r.rps.toFixed(3)}</td>
              <td className={`${TD} ${r.clv == null ? '' : r.clv >= 0 ? 'text-signal' : 'text-bad'}`}>
                {r.clv == null ? '—' : `${r.clv >= 0 ? '+' : ''}${r.clv.toFixed(4)}`}
              </td>
              <td className={`${TD} text-right`}>
                <StatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
