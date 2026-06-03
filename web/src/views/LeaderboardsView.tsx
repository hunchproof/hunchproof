import { ViewHead } from '../components/ui/ViewHead'
import { Card, CardHeader } from '../components/ui/Card'
import { WeightBar } from '../components/ui/WeightBar'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states'
import { useBoardsModel } from '../api/queries'
import { useUser } from '../hooks/useUser'
import { IS_LIVE } from '../config'

const TH = 'hp-label border-b border-line-2 px-2.5 py-2 text-left text-[10px] font-medium text-ink-faint'
const TD = 'tnum border-b border-line px-2.5 py-2.5'
const RANK = `${TD} w-7 text-ink-faint`

function meRow(isMe: boolean) {
  return isMe ? 'bg-signal/[0.05]' : ''
}
function YouTag() {
  return (
    <span className="ml-1.5 rounded-[4px] bg-signal px-1.5 py-px align-middle text-[9px] tracking-[0.1em] text-[#04130d]">
      you
    </span>
  )
}
function Flag({ label }: { label: string }) {
  return (
    <span className="ml-1.5 rounded-[4px] border border-[#5a4626] px-1.5 py-px align-middle text-[9px] text-away">
      {label}
    </span>
  )
}

export default function LeaderboardsView() {
  const { userId } = useUser()
  const { model, isLoading, error } = useBoardsModel(userId)

  return (
    <section className="animate-fade">
      <ViewHead title="Two leaderboards, on purpose">
        Absolute skill is for the community. <b className="text-ink">Oracle weight</b> is the product: it
        rewards contributing information the market hadn’t priced — not hugging a sharp line. A market-copier
        can top the left board and carry near-zero weight on the right.
      </ViewHead>

      {isLoading && (
        <Card>
          <LoadingState rows={6} label="Loading the leaderboards…" />
        </Card>
      )}
      {error && !isLoading && <ErrorState error={error} title="Couldn’t load the leaderboards" />}

      {!isLoading && !error && (
        <>
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            {/* ---- absolute skill ---- */}
            <Card>
              <CardHeader
                title="Absolute skill"
                sub="mean RPS over settled slate (lower = better) · engagement & bragging rights"
              />
              {model.absolute.length === 0 ? (
                <EmptyState title="No settled scores yet">
                  The board fills in as committed slates settle.
                </EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr>
                        <th className={TH}>#</th>
                        <th className={TH}>user</th>
                        <th className={TH}>mean RPS</th>
                        <th className={TH}>CLV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.absolute.map((r, i) => (
                        <tr key={r.userId} className={meRow(r.isMe)}>
                          <td className={RANK}>{i + 1}</td>
                          <td className={`${TD} font-medium`}>
                            {r.name}
                            {r.isMe && <YouTag />}
                            {r.isCopy && <Flag label="market-hugger" />}
                          </td>
                          <td className={TD}>{r.meanRps.toFixed(4)}</td>
                          <td className={`${TD} ${r.meanClv == null ? '' : r.meanClv >= 0 ? 'text-signal' : 'text-bad'}`}>
                            {r.meanClv == null ? '—' : `${r.meanClv >= 0 ? '+' : ''}${r.meanClv.toFixed(4)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* ---- oracle weight ---- */}
            <Card>
              <CardHeader
                title="Oracle weight"
                sub="CLV-driven, LCB-gated, reliability-checked · what powers the crowd forecast"
              />
              {model.oracle.length === 0 ? (
                <EmptyState title="No eligible contributors yet">
                  Oracle weight requires a positive excess-CLV lower-bound and ≥95% reveal reliability.
                  Until a forecaster clears that bar, they carry zero weight.
                </EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr>
                        <th className={TH}>#</th>
                        <th className={TH}>user</th>
                        <th className={TH}>CLV (LCB)</th>
                        <th className={TH}>weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.oracle.map((r, i) => (
                        <tr key={r.userId} className={meRow(r.isMe)}>
                          <td className={RANK}>{i + 1}</td>
                          <td className={`${TD} font-medium`}>
                            {r.name}
                            {r.isMe && <YouTag />}
                            {!r.revealed && <Flag label="unrevealed" />}
                          </td>
                          <td className={`${TD} text-signal`}>
                            +{r.meanClv.toFixed(4)}{' '}
                            <span className="text-ink-faint">({r.lcb.toFixed(4)})</span>
                          </td>
                          <td className={TD}>
                            <WeightBar frac={r.weightFrac} weightPct={r.weightPct} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2.5 text-[11px] text-ink-faint">
                {model.eligibleCount}/{model.total} contributors eligible (positive CLV lower-bound + reveal
                reliability). Everyone else carries zero oracle weight.
              </p>
            </Card>
          </div>

          <div className="mt-3.5 rounded-tile border border-[#243650] bg-gradient-to-b from-home/[0.07] to-home/[0.02] px-[15px] py-3.5 text-[12px] text-ink-dim">
            {model.insight ? (
              <>
                <b className="text-[#cfe0ff]">The two boards disagree on purpose.</b> {model.insight}
              </>
            ) : (
              <>
                <b className="text-[#cfe0ff]">Edge ≠ accuracy.</b> The left board rewards being close to the
                truth; the right rewards adding information the market hadn’t priced. A copier who hugs the
                closing line can score well on accuracy yet earn ~zero oracle weight.
                {IS_LIVE && (
                  <span className="text-ink-faint">
                    {' '}
                    Oracle weight here is derived client-side (display-only) from audited per-prediction CLV;
                    authoritative aggregation runs server-side in ingestion.
                  </span>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
