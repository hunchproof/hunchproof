import { HashChip } from '../ui/HashChip'
import { IS_LIVE } from '../../config'
import type { SealRecord } from '../../api/types'

/** The sealed slate as an auditable artifact: every commitment hash, shown in full. */
export function SealedReceipt({ records }: { records: SealRecord[] }) {
  return (
    <div>
      <p className="text-[12px] text-ink-dim">
        {records.length} prediction{records.length === 1 ? '' : 's'} hashed and committed
        {IS_LIVE ? ' to the server' : ' (demo — local only)'}. Your distribution stays invisible until you
        reveal — only these hashes are public.
      </p>
      <ul className="mt-3 space-y-2">
        {records.map((r) => (
          <li key={r.matchId} className="rounded-lg border border-line bg-[#06090b] p-2.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold">
                {r.home} <span className="text-ink-faint">vs</span> {r.away}
              </span>
              <span className="hp-label text-[10px] text-signal">sealed</span>
            </div>
            <div className="mt-1.5">
              <HashChip hash={r.commitmentHash} full label={`${r.home}–${r.away} commitment`} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Salts are held only in your browser. At reveal, the server recomputes each SHA-256
        byte-for-byte and accepts only an exact match — a sealed call can’t be altered.
      </p>
    </div>
  )
}
