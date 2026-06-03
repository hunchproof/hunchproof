import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ViewHead } from '../components/ui/ViewHead'
import { Pill } from '../components/ui/Pill'
import { Card } from '../components/ui/Card'
import { ErrorState, LoadingState } from '../components/ui/states'
import { MatchCard } from '../components/slate/MatchCard'
import { CoverageBar } from '../components/slate/CoverageBar'
import { SealCeremony, type Pick } from '../components/slate/SealCeremony'
import { useSlate } from '../api/queries'
import { useUser } from '../hooks/useUser'
import { useVault, vault } from '../hooks/useCommitVault'
import { useToast } from '../hooks/useToast'
import { useCountdown } from '../hooks/useCountdown'
import { marketToPct } from '../lib/slate'
import { fmtCountdown } from '../lib/format'
import { IS_LIVE } from '../config'
import type { SealRecord, Triple } from '../api/types'

export default function SlateView() {
  const { slate, isLoading, error, refetch } = useSlate()
  const { userId } = useUser()
  const vaultEntries = useVault(userId)
  const toast = useToast()
  const qc = useQueryClient()
  const [picks, setPicks] = useState<Record<number, Triple>>({})
  const [ceremonyOpen, setCeremonyOpen] = useState(false)

  const matches = slate?.matches ?? []
  const matchKey = matches.map((m) => m.id).join(',')

  // Seed slider state for any unseen match (preserves the user's existing edits).
  useEffect(() => {
    if (!matches.length) return
    setPicks((prev) => {
      let changed = false
      const next = { ...prev }
      for (const m of matches) {
        if (!next[m.id]) {
          next[m.id] = marketToPct(m.market)
          changed = true
        }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchKey])

  const committedIds = useMemo(() => new Set(vaultEntries.map((e) => e.matchId)), [vaultEntries])
  const sealed = matches.length > 0 && matches.every((m) => committedIds.has(m.id))

  const left = useCountdown(slate?.lockMs ?? null)
  const locked = left != null && left <= 0

  const onSeal = () => {
    if (!matches.length) return toast('No open slate to commit.')
    if (locked) return toast('This slate has locked — submissions are closed.', 'error')
    setCeremonyOpen(true)
  }

  const onComplete = (records: SealRecord[]) => {
    vault.sealSlate(userId, records)
    if (IS_LIVE) void qc.invalidateQueries({ queryKey: ['predictions'] })
    toast(`Slate sealed · ${records.length} predictions committed${IS_LIVE ? ' to server' : ''}`, 'success')
  }

  const ceremonyPicks: Pick[] = matches.map((m) => ({ match: m, pct: picks[m.id] ?? marketToPct(m.market) }))

  const pill = sealed ? (
    <Pill className="border-signal text-signal">sealed · awaiting lock</Pill>
  ) : locked ? (
    <Pill className="border-away text-away">locked</Pill>
  ) : (
    <Pill>open · locks in {left == null ? '—' : fmtCountdown(left)}</Pill>
  )

  return (
    <section className="animate-fade">
      <ViewHead title="This week’s slate" pill={pill}>
        Predict <b className="text-ink">every</b> match, then seal the whole slate at once. Committing the
        full slate up front is what makes your record auditable — no cherry-picking which games to grade
        later. It’s a belief market: you’re proving foresight, not staking money.
      </ViewHead>

      {isLoading && (
        <Card>
          <LoadingState label="Loading the open slate…" rows={4} />
        </Card>
      )}

      {error && !isLoading && (
        <ErrorState error={error} onRetry={refetch} title="Couldn’t load the slate from the backend" />
      )}

      {!isLoading && !error && matches.length === 0 && (
        <Card>
          <p className="text-[13px] text-ink-dim">
            No open slate right now. The next slate appears here when fixtures open for the upcoming matchday.
          </p>
        </Card>
      )}

      {matches.length > 0 && (
        <>
          <div>
            {matches.map((m, i) => (
              <MatchCard
                key={m.id}
                match={m}
                index={i}
                value={picks[m.id] ?? marketToPct(m.market)}
                sealed={sealed}
                onChange={(v) => setPicks((p) => ({ ...p, [m.id]: v }))}
              />
            ))}
          </div>

          <CoverageBar covered={matches.length} total={matches.length} sealed={sealed} locked={locked} onSeal={onSeal} />

          <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
            Each pick is hashed with a private salt (SHA-256) and sealed. After kickoff you reveal the salts
            in <b className="text-ink-dim">Portfolio</b>; anyone can recompute the hashes and verify you never
            changed a call. Your distribution is scored against the market’s <b className="text-ink-dim">closing
            line</b>, benchmarked to the market at your submit time.
          </p>
        </>
      )}

      <SealCeremony
        open={ceremonyOpen}
        onClose={() => setCeremonyOpen(false)}
        picks={ceremonyPicks}
        userId={userId}
        slateId={slate?.id ?? 'slate'}
        onComplete={onComplete}
      />
    </section>
  )
}
