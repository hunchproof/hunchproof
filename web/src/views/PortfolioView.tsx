import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ViewHead } from '../components/ui/ViewHead'
import { Pill } from '../components/ui/Pill'
import { Card, CardHeader } from '../components/ui/Card'
import { TileGrid } from '../components/ui/Tile'
import { CalibrationChart } from '../components/ui/CalibrationChart'
import { ErrorState, LoadingState } from '../components/ui/states'
import { SettledTable } from '../components/portfolio/SettledTable'
import { OpenCommitments } from '../components/portfolio/OpenCommitments'
import { RevealDialog } from '../components/portfolio/RevealDialog'
import { usePortfolioModel, usePredictions } from '../api/queries'
import { useUser } from '../hooks/useUser'
import { useVault, type VaultEntry } from '../hooks/useCommitVault'
import { IS_LIVE } from '../config'

export default function PortfolioView() {
  const { userId } = useUser()
  const { model, isLoading, error } = usePortfolioModel(userId)
  const preds = usePredictions(userId)
  const vaultEntries = useVault(userId)
  const [revealEntry, setRevealEntry] = useState<VaultEntry | null>(null)
  const qc = useQueryClient()
  const rows = preds.data?.predictions ?? []

  const rel = model.revealReliabilityPct
  const pill = (
    <Pill className={rel == null ? '' : rel >= 95 ? 'border-signal text-signal' : 'border-away text-away'}>
      {rel == null ? 'reveal reliability —' : `reveal reliability ${rel.toFixed(0)}%`}
    </Pill>
  )

  return (
    <section className="animate-fade">
      <ViewHead title="Your portfolio" pill={pill}>
        Every prediction you’ve committed, its sealed hash, and — once matches settle — your scores. The
        metric that matters is <b className="text-ink">CLV vs your submit-time market</b>: were you closer to
        the closing line than the market was when you called it?
      </ViewHead>

      {isLoading && (
        <Card>
          <LoadingState rows={4} label="Loading your predictions…" />
        </Card>
      )}

      {error && !isLoading && (
        <ErrorState
          error={error}
          onRetry={() => void qc.invalidateQueries({ queryKey: ['predictions'] })}
          title="Couldn’t load your portfolio"
        />
      )}

      {!isLoading && !error && (
        <>
          <TileGrid tiles={model.tiles} />
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Settled predictions" sub="scored against the closing line" />
              <SettledTable rows={model.settled} />
            </Card>
            <Card>
              <CardHeader
                title="Your calibration"
                sub="predicted probability vs observed frequency — are your numbers honest?"
              />
              <CalibrationChart pts={model.calibPts} />
              <p className="mt-2 text-[11px] text-ink-faint">
                On the diagonal = well-calibrated. Above = underconfident, below = overconfident.
              </p>
            </Card>
          </div>
          <Card className="mt-3.5">
            <CardHeader
              title="Open commitments (awaiting lock / reveal)"
              sub="sealed; reveal opens after each match locks"
            />
            <OpenCommitments entries={vaultEntries} rows={rows} userId={userId} onReveal={setRevealEntry} />
          </Card>
        </>
      )}

      <RevealDialog
        open={!!revealEntry}
        entry={revealEntry}
        userId={userId}
        onClose={() => setRevealEntry(null)}
        onRevealed={() => {
          if (IS_LIVE) void qc.invalidateQueries({ queryKey: ['predictions'] })
        }}
      />
    </section>
  )
}
