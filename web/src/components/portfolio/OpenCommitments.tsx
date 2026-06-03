import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { HashChip } from '../ui/HashChip'
import { StatusBadge, type Status } from '../ui/StatusBadge'
import { EmptyState } from '../ui/states'
import { code3, fmtCountdown } from '../../lib/format'
import { IS_LIVE } from '../../config'
import { vault, type VaultEntry } from '../../hooks/useCommitVault'
import type { ApiPredictionRow } from '../../api/types'

const TH = 'hp-label border-b border-line-2 px-2.5 py-2 text-left text-[10px] font-medium text-ink-faint'
const TD = 'tnum border-b border-line px-2.5 py-2.5'

export function OpenCommitments({
  entries,
  rows,
  userId,
  onReveal,
}: {
  entries: VaultEntry[]
  rows: ApiPredictionRow[]
  userId: string
  onReveal: (e: VaultEntry) => void
}) {
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [demoUnlock, setDemoUnlock] = useState(false)
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const rowByMatch = new Map(rows.map((r) => [r.match_id, r]))
  const open = entries.filter((e) => {
    const sr = rowByMatch.get(e.matchId)
    return !(sr && sr.rps != null) // scored ones live in the settled table
  })

  if (!open.length) {
    return (
      <EmptyState title="No open commitments yet">
        Head to the <span className="text-signal">Slate</span> and seal this week’s predictions.
      </EmptyState>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr>
              <th className={TH}>match</th>
              <th className={TH}>your H/D/A</th>
              <th className={TH}>commitment hash</th>
              <th className={TH}>status</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {open.map((e) => {
              const sr = rowByMatch.get(e.matchId)
              const revealed = (sr ? !!(sr.reveal_flag && sr.valid_commit) : false) || !!e.revealedAt
              const isLocked = e.lockMs == null ? demoUnlock : nowTick >= e.lockMs
              const status: Status = revealed ? 'revealed' : isLocked ? 'locked' : 'sealed'
              const left = e.lockMs != null ? e.lockMs - nowTick : null
              return (
                <tr key={e.matchId}>
                  <td className={TD}>
                    {code3(e.home)}–{code3(e.away)}
                  </td>
                  <td className={TD}>{e.permille.map((x) => Math.round(x / 10)).join('/')}</td>
                  <td className={`${TD} max-w-[220px]`}>
                    <HashChip hash={e.commitmentHash} label={`${e.home}–${e.away} commitment`} />
                  </td>
                  <td className={TD}>
                    <StatusBadge status={status} />
                  </td>
                  <td className={`${TD} text-right`}>
                    {revealed ? (
                      <span className="text-ink-faint">verified</span>
                    ) : isLocked ? (
                      <Button sm onClick={() => onReveal(e)}>
                        Reveal
                      </Button>
                    ) : (
                      <span className="text-ink-faint">reveal in {left != null ? fmtCountdown(left) : '—'}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!IS_LIVE && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!demoUnlock && (
            <Button sm variant="ghost" onClick={() => setDemoUnlock(true)}>
              ▸ simulate lock (demo)
            </Button>
          )}
          <Button sm variant="ghost" onClick={() => vault.clearUser(userId)}>
            reset demo commits
          </Button>
          <span className="text-[10.5px] text-ink-faint">
            demo · in production, reveal opens automatically once a match locks
          </span>
        </div>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        Salts are held by your client and revealed after each match locks. Reveal recomputes each hash on
        the server byte-for-byte; a sealed call can’t be altered.
      </p>
    </>
  )
}
