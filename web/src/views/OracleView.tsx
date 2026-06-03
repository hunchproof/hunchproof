import { ViewHead } from '../components/ui/ViewHead'
import { Pill } from '../components/ui/Pill'
import { Card, CardHeader } from '../components/ui/Card'
import { TileGrid } from '../components/ui/Tile'
import { GateCard } from '../components/ui/GateCard'
import { BarsChart } from '../components/ui/BarsChart'
import { CalibrationChart } from '../components/ui/CalibrationChart'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states'
import { useOracleModel } from '../api/queries'

export default function OracleView() {
  const { model, isLoading, error } = useOracleModel()

  return (
    <section className="animate-fade">
      <ViewHead
        title="The crowd oracle"
        pill={<Pill>{model.serverComputed ? 'live · audited feed' : 'last settled slate'}</Pill>}
      >
        The robust-weighted crowd aggregate vs the market — does the crowd anticipate the closing line before
        lock? Equal-weight pooling dies on noise; weighting by audited CLV is the oracle.
      </ViewHead>

      {isLoading && (
        <Card>
          <LoadingState rows={5} label="Loading the oracle…" />
        </Card>
      )}
      {error && !isLoading && <ErrorState error={error} title="Couldn’t load the oracle" />}

      {!isLoading && !error && (
        <>
          <TileGrid tiles={model.tiles} />

          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Acceptance gates" sub="the four checks an MVP must clear on real users" />
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {model.gates.map((g) => (
                  <GateCard key={g.id} gate={g} />
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">{model.note}</p>
            </Card>

            <Card>
              <CardHeader title="Crowd vs market" sub="RPS of each market line vs the robust crowd aggregate" />
              {model.bars.length ? (
                <BarsChart rows={model.bars} />
              ) : (
                <EmptyState title="Aggregate computed server-side">
                  Crowd-vs-market RPS needs the closing line and result, aggregated in the ingestion pipeline
                  — not yet surfaced via the API.
                </EmptyState>
              )}
              {model.eqCompare && (
                <div className="mt-3 rounded-tile border border-[#243650] bg-gradient-to-b from-home/[0.07] to-home/[0.02] px-[15px] py-3 text-[12px] text-ink-dim">
                  <b className="text-[#cfe0ff]">Equal-weight dies; robust weighting is the oracle.</b>{' '}
                  {model.eqCompare}
                </div>
              )}
            </Card>
          </div>

          <Card className="mt-3.5">
            <CardHeader title="Crowd calibration" sub="robust-weighted aggregate" />
            <CalibrationChart pts={model.calibPts} />
          </Card>
        </>
      )}
    </section>
  )
}
