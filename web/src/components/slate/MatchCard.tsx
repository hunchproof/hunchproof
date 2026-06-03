import { deviationPts, flagStyle, fmtKickoff } from '../../lib/format'
import { marketToPct, EVEN } from '../../lib/slate'
import { DistBar } from '../ui/DistBar'
import { ProbSliders } from './ProbSliders'
import type { SlateMatch, Triple } from '../../api/types'

const Flag = ({ code }: { code: string }) => (
  <span
    aria-hidden
    className="inline-block h-[15px] w-[22px] shrink-0 rounded-sm border border-line"
    style={flagStyle(code)}
  />
)

export function MatchCard({
  match,
  value,
  onChange,
  sealed,
  index,
}: {
  match: SlateMatch
  value: Triple
  onChange: (v: Triple) => void
  sealed: boolean
  index: number
}) {
  const probs = [value[0] / 100, value[1] / 100, value[2] / 100]
  const dev = deviationPts(probs, match.market)
  const matchName = `${match.home} vs ${match.away}`
  return (
    <div
      className="mb-3.5 animate-rise glass-panel rounded-panel p-[18px]"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div className="flex items-center justify-between gap-2.5">
        <span className="hp-label text-[10px] text-signal-dim">
          {match.competition || 'match'}
        </span>
        <span className="text-[11px] text-ink-faint">
          {match.kickoffMs ? `kickoff ${fmtKickoff(match.kickoffMs)}` : ''}
        </span>
      </div>

      <div className="my-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-disp text-[19px] font-semibold">
        <Flag code={match.homeCode} />
        <span>{match.home}</span>
        <span className="font-mono text-[11px] font-normal text-ink-faint">vs</span>
        <span>{match.away}</span>
        <Flag code={match.awayCode} />
      </div>

      <ProbSliders
        value={value}
        onChange={onChange}
        disabled={sealed}
        matchId={match.id}
        matchName={matchName}
      />

      <DistBar dist={probs} className="mt-3" />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-ink-faint">
        <span>vs no-vig market {match.market.map((x) => Math.round(x * 100)).join(' / ')}</span>
        <span className="flex items-center gap-2.5">
          {!sealed && (
            <>
              <button
                type="button"
                onClick={() => onChange(marketToPct(match.market))}
                className="rounded px-1.5 py-0.5 text-ink-dim underline-offset-2 transition hover:text-ink hover:underline"
              >
                match market
              </button>
              <button
                type="button"
                onClick={() => onChange([...EVEN])}
                className="rounded px-1.5 py-0.5 text-ink-dim underline-offset-2 transition hover:text-ink hover:underline"
              >
                reset
              </button>
            </>
          )}
          <span className={dev > 8 ? 'text-signal' : 'text-ink-dim'}>deviation {dev.toFixed(1)} pts</span>
        </span>
      </div>
    </div>
  )
}
