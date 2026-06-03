/**
 * Live-mode producers — turn backend responses into the same view-models the demo
 * producers emit, so views are mode-agnostic.
 *
 * Honesty boundary (docs/STATUS.md / ROADMAP): the backend doesn't yet expose the
 * robust crowd aggregate or gates P2–P4 (those run server-side in ingestion), so the
 * live Oracle surfaces only what the audited feed supports — reveal reliability and the
 * robustly-weighted eligible-contributor set. We never fabricate the rest.
 */
import { calibBins, lcb as lcbOf, mean } from '../lib/scoring'
import { code3 } from '../lib/format'
import { MIN_MATCHES_FOR_CALIBRATION } from '../config'
import type { ApiLeaderboard, ApiOpenSlate, ApiPredictionRow, Slate, Triple } from './types'
import type { BoardsVM, OracleVM, PortfolioVM, SettledRowVM, TileVM } from '../models'
import type { VaultEntry } from '../hooks/useCommitVault'

const RES_INDEX: Record<string, number> = { H: 0, D: 1, A: 2 }
const tone = (v: number): TileVM['tone'] => (v >= 0 ? 'sig' : 'bad')
const ELIGIBLE_MIN_SAMPLES = 2 // need at least a couple of scored CLVs before an LCB means anything

export function liveSlate(open: ApiOpenSlate): Slate {
  const matches = (open.slate || []).map((f) => ({
    id: f.match_id,
    competition: f.competition || '',
    home: f.home,
    away: f.away,
    homeCode: code3(f.home || ''),
    awayCode: code3(f.away || ''),
    kickoffMs: f.kickoff_at ?? null,
    lockMs: f.lock_at ?? null,
    market: (f.q_submit && f.q_submit.length === 3 ? f.q_submit : [0.34, 0.33, 0.33]) as Triple,
  }))
  const locks = matches.map((m) => m.lockMs).filter((x): x is number => x != null)
  return {
    id: 'live',
    label: matches[0]?.competition || 'Live slate',
    live: true,
    matches,
    lockMs: locks.length ? Math.min(...locks) : null,
  }
}

export function livePortfolio(rows: ApiPredictionRow[], vaultEntries: VaultEntry[]): PortfolioVM {
  const vaultByMatch = new Map(vaultEntries.map((v) => [v.matchId, v]))
  const scored = rows.filter((r) => r.rps != null)

  const settled: SettledRowVM[] = scored.map((r) => {
    const v = vaultByMatch.get(r.match_id)
    const home = r.home || v?.home || `#${r.match_id}`
    const away = r.away || v?.away || ''
    const permille =
      r.p_h != null ? [r.p_h, r.p_d ?? 0, r.p_a ?? 0] : v ? v.permille : [0, 0, 0]
    const resultIndex = r.result ? (RES_INDEX[r.result] ?? null) : null
    return {
      matchId: r.match_id,
      label: `${code3(home)}–${away ? code3(away) : '???'}`,
      pctDist: [
        Math.round(permille[0] / 10),
        Math.round(permille[1] / 10),
        Math.round(permille[2] / 10),
      ],
      resultIndex,
      rps: r.rps,
      clv: r.clv,
      status: 'scored',
    }
  })

  const clvs = scored.map((r) => r.clv).filter((x): x is number => x != null)
  const rpss = scored.map((r) => r.rps).filter((x): x is number => x != null)
  const alphas = scored.map((r) => r.alpha_close).filter((x): x is number => x != null)

  // calibration only if outcomes + revealed distributions are present
  const calibInputs = scored.filter((r) => r.p_h != null && r.result && RES_INDEX[r.result] != null)
  const preds = calibInputs.map((r) => [r.p_h! / 1000, r.p_d! / 1000, r.p_a! / 1000])
  const ys = calibInputs.map((r) => RES_INDEX[r.result!])
  const calibPts = preds.length ? calibBins(preds, ys, 6) : []

  const total = rows.length
  const revealedValid = rows.filter((r) => r.reveal_flag && r.valid_commit).length

  const tiles: TileVM[] = [
    {
      value: clvs.length ? `${mean(clvs) >= 0 ? '+' : ''}${mean(clvs).toFixed(4)}` : '—',
      tone: 'sig',
      label: 'mean CLV vs submit',
      sub: 'your edge over the line you faced',
    },
    {
      value: rpss.length ? mean(rpss).toFixed(4) : '—',
      tone: 'blue',
      label: 'mean RPS',
      sub: 'absolute accuracy (lower better)',
    },
    {
      value: alphas.length ? `${mean(alphas) >= 0 ? '+' : ''}${mean(alphas).toFixed(4)}` : '—',
      tone: alphas.length ? tone(mean(alphas)) : 'plain',
      label: 'realized α vs close',
      sub: 'outcome-based (high variance)',
    },
    { value: `${scored.length}`, tone: 'plain', label: 'settled picks', sub: 'scored to date' },
  ]

  return {
    revealReliabilityPct: total ? (revealedValid / total) * 100 : null,
    tiles,
    settled,
    calibPts,
    hasSettled: scored.length > 0,
  }
}

interface UserAgg {
  clvs: number[]
  total: number
  revealed: number
}
function aggregateByUser(rows: ApiPredictionRow[]): Map<string, UserAgg> {
  const byUser = new Map<string, UserAgg>()
  for (const r of rows) {
    const u = byUser.get(r.user_id) || { clvs: [], total: 0, revealed: 0 }
    u.total++
    if (r.reveal_flag && r.valid_commit) u.revealed++
    if (r.clv != null) u.clvs.push(r.clv)
    byUser.set(r.user_id, u)
  }
  return byUser
}

export function liveBoards(
  allRows: ApiPredictionRow[],
  leaderboard: ApiLeaderboard | undefined,
  meId: string,
): BoardsVM {
  const absolute = (leaderboard?.leaderboard || []).slice(0, 10).map((r) => ({
    userId: r.user_id,
    name: r.user_id,
    isMe: r.user_id === meId,
    meanRps: r.mean_rps,
    meanClv: null,
  }))

  const byUser = aggregateByUser(allRows)
  const ranked = [...byUser.entries()].map(([userId, v]) => {
    const reliab = v.total ? v.revealed / v.total : 0
    const meanClv = v.clvs.length ? mean(v.clvs) : 0
    const lcbVal = v.clvs.length >= ELIGIBLE_MIN_SAMPLES ? lcbOf(v.clvs) : meanClv
    const wt = reliab >= 0.95 && v.clvs.length >= ELIGIBLE_MIN_SAMPLES ? Math.max(lcbVal, 0) : 0
    return { userId, meanClv, lcb: lcbVal, wt, revealed: reliab >= 0.95 }
  })
  const elig = ranked.filter((r) => r.wt > 0).sort((a, b) => b.lcb - a.lcb)
  const wsum = elig.reduce((a, r) => a + r.wt, 0)
  const topWt = elig[0]?.wt || 1
  const oracle = elig.slice(0, 10).map((r) => ({
    userId: r.userId,
    name: r.userId,
    isMe: r.userId === meId,
    meanClv: r.meanClv,
    lcb: r.lcb,
    weightPct: wsum ? (r.wt / wsum) * 100 : 0,
    weightFrac: r.wt / topWt,
    revealed: r.revealed,
  }))

  return { absolute, oracle, eligibleCount: elig.length, total: byUser.size, insight: null }
}

export function liveOracle(allRows: ApiPredictionRow[]): OracleVM {
  const byUser = aggregateByUser(allRows)
  const totalPreds = allRows.length
  const revealedValid = allRows.filter((r) => r.reveal_flag && r.valid_commit).length
  const revealRel = totalPreds ? revealedValid / totalPreds : 0

  let eligible = 0
  for (const v of byUser.values()) {
    const reliab = v.total ? v.revealed / v.total : 0
    if (reliab >= 0.95 && v.clvs.length >= ELIGIBLE_MIN_SAMPLES && lcbOf(v.clvs) > 0) eligible++
  }

  return {
    tiles: [
      { value: `${eligible}/${byUser.size}`, tone: 'plain', label: 'eligible contributors', sub: 'reveal ≥95% & CLV LCB>0' },
      { value: `${(revealRel * 100).toFixed(1)}%`, tone: revealRel >= 0.95 ? 'sig' : 'warn', label: 'reveal reliability', sub: 'audited across the feed' },
      { value: 'server', tone: 'plain', label: 'crowd aggregate', sub: 'computed in ingestion' },
      { value: 'server', tone: 'plain', label: 'gates P2–P4', sub: 'computed in ingestion' },
    ],
    gates: [
      { id: 'P1', title: 'Reveal reliability ≥ 95%', ok: revealRel >= 0.95, pending: totalPreds === 0, detail: totalPreds ? `${(revealRel * 100).toFixed(1)}% revealed across ${totalPreds} predictions` : 'no predictions yet' },
      { id: 'P2', title: 'Crowd excess CLV vs submit > 0', ok: false, pending: true, detail: 'authoritative crowd aggregation runs server-side (ingestion); not yet exposed via the API' },
      { id: 'P3', title: 'Crowd beats a public model vs lock', ok: false, pending: true, detail: 'computed server-side at settle' },
      { id: 'P4', title: 'Calibration holds', ok: false, pending: true, detail: `needs ≥${MIN_MATCHES_FOR_CALIBRATION} settled matches and server-side aggregation` },
    ],
    bars: [],
    eqCompare: null,
    calibPts: [],
    eligibleCount: eligible,
    total: byUser.size,
    serverComputed: true,
    note: 'Live mode: the robust crowd aggregate and gates P2–P4 are computed authoritatively in the ingestion pipeline (server-side) and are not yet surfaced through the API. Shown here is what the audited prediction feed supports directly — reveal reliability and the robustly-weighted eligible-contributor set. The full mechanism demonstration (with the synthetic crowd) is in demo mode.',
  }
}
