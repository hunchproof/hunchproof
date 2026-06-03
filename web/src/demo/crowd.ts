/**
 * Demo-mode compute — ported from the original SPA's synthetic-crowd section.
 * Builds the seeded crowd once and derives the Portfolio / Leaderboards / Oracle
 * view-models. SYNTHETIC and labeled as such everywhere it surfaces.
 */
import {
  ARCHES,
  DEMO_LOCK_MS,
  DEMO_LOAD_MS,
  OPEN_SLATE,
  SETTLED,
  gauss,
  pathPt,
  rnd,
  sharpen,
} from './data'
import {
  calibBins,
  clamp,
  clr,
  crossEnt,
  ece,
  excessCLV,
  logPool,
  mean,
  rpsOrd,
  sd,
  softmax,
} from '../lib/scoring'
import { code3 } from '../lib/format'
import { CHART } from '../lib/theme'
import { MIN_MATCHES_FOR_CALIBRATION } from '../config'
import type { Slate } from '../api/types'
import type { BoardsVM, OracleVM, PortfolioVM, TileVM } from '../models'

interface UserScore {
  meanRps: number
  meanClv: number
  seClv: number
  lcb: number
  meanAlpha: number
  reveal: number
  rpsArr: number[]
}
interface DemoUser {
  id: number
  name: string
  arche: string
  preds: number[][]
  qsub: number[][]
  reveal: boolean
  me?: boolean
  s: UserScore
}

const ys = SETTLED.matches.map((m) => m.res)

function scoreUser(u: { preds: number[][]; qsub: number[][]; reveal: boolean }): UserScore {
  const rps: number[] = []
  const clv: number[] = []
  const alpha: number[] = []
  SETTLED.matches.forEach((m, j) => {
    rps.push(rpsOrd(u.preds[j], m.res))
    clv.push(excessCLV(u.preds[j], u.qsub[j], m.qc))
    alpha.push(rpsOrd(m.qc, m.res) - rpsOrd(u.preds[j], m.res))
  })
  const meanClv = mean(clv)
  const seClv = sd(clv) / Math.sqrt(clv.length)
  return {
    meanRps: mean(rps),
    meanClv,
    seClv,
    lcb: meanClv - 1.64 * seClv,
    meanAlpha: mean(alpha),
    reveal: u.reveal ? 1 : 0,
    rpsArr: rps,
  }
}

function buildCrowd(): DemoUser[] {
  const raw: Array<Omit<DemoUser, 's'>> = []
  let uid = 0
  for (const A of ARCHES) {
    for (let i = 0; i < A.n; i++) {
      const t = A.t[0] + rnd() * (A.t[1] - A.t[0])
      const preds: number[][] = []
      const qsub: number[][] = []
      for (const m of SETTLED.matches) {
        const qs = pathPt(m.qo, m.qc, t)
        let p: number[]
        if (A.key === 'informed')
          p = softmax(clr(qs).map((z, k) => (1 - A.skill!) * z + A.skill! * (clr(m.qc)[k] + gauss() * 0.1)))
        else if (A.key === 'copy') p = qs.slice()
        else p = sharpen(qs, A.g!)
        preds.push(clamp(p))
        qsub.push(qs)
      }
      raw.push({ id: uid++, name: A.name(i + 1), arche: A.key, preds, qsub, reveal: rnd() < 0.985 })
    }
  }
  // the human player ("you") — a decent informed-ish predictor
  const youPreds: number[][] = []
  const youQsub: number[][] = []
  for (const m of SETTLED.matches) {
    const t = 0.25
    const qs = pathPt(m.qo, m.qc, t)
    youQsub.push(qs)
    youPreds.push(softmax(clr(qs).map((z, k) => 0.7 * z + 0.3 * (clr(m.qc)[k] + gauss() * 0.13))))
  }
  raw.push({ id: uid++, name: 'you', arche: 'you', preds: youPreds, qsub: youQsub, reveal: true, me: true })
  return raw.map((u) => ({ ...u, s: scoreUser(u) }))
}

const CROWD = buildCrowd()

const crowdAgg = (weights?: number[]): number[][] =>
  SETTLED.matches.map((_m, j) => logPool(CROWD.map((u) => u.preds[j]), weights))

const W = CROWD.map((u) => (u.reveal && u.s.lcb > 0 ? u.s.lcb : 0))
const eligibleCount = W.filter((x) => x > 0).length
const crowdRobust = crowdAgg(W)
const crowdEqual = crowdAgg(CROWD.map(() => 1))

const clvVsSubmit = (arr: number[][]) =>
  mean(SETTLED.matches.map((m, j) => excessCLV(arr[j], logPool(CROWD.map((u) => u.qsub[j])), m.qc)))
const clvVsLock = (arr: number[][]) =>
  mean(SETTLED.matches.map((m, j) => crossEnt(m.qc, m.ql) - crossEnt(m.qc, arr[j])))
const rpsOf = (arr: number[][]) => mean(SETTLED.matches.map((m, j) => rpsOrd(arr[j], m.res)))

const pubModel = SETTLED.matches.map((m) => softmax(clr(m.qo).map((z, k) => 0.6 * z + 0.4 * clr(m.qc)[k])))

const M = {
  rps_open: rpsOf(SETTLED.matches.map((m) => m.qo)),
  rps_lock: rpsOf(SETTLED.matches.map((m) => m.ql)),
  rps_close: rpsOf(SETTLED.matches.map((m) => m.qc)),
  rps_crowd: rpsOf(crowdRobust),
  clv_submit_robust: clvVsSubmit(crowdRobust),
  clv_submit_equal: clvVsSubmit(crowdEqual),
  clv_lock_robust: clvVsLock(crowdRobust),
  clv_lock_pub: clvVsLock(pubModel),
  reveal_rel: mean(CROWD.map((u) => (u.reveal ? 1 : 0))),
  ece_crowd: ece(crowdRobust, ys),
}

const tone = (v: number): TileVM['tone'] => (v >= 0 ? 'sig' : 'bad')

/* ---------------------------------------------------------------- producers ---- */

export function demoSlate(): Slate {
  return {
    id: OPEN_SLATE.id,
    label: OPEN_SLATE.label,
    live: false,
    lockMs: DEMO_LOCK_MS,
    matches: OPEN_SLATE.matches.map((m) => ({
      id: m.id,
      competition: m.comp,
      home: m.h,
      away: m.a,
      homeCode: m.hc,
      awayCode: m.ac,
      kickoffMs: DEMO_LOAD_MS + m.ko_h * 36e5,
      lockMs: DEMO_LOCK_MS,
      market: m.q,
    })),
  }
}

export function demoPortfolio(): PortfolioVM {
  const you = CROWD.find((u) => u.me)!
  const s = you.s
  return {
    revealReliabilityPct: s.reveal * 100,
    tiles: [
      { value: `${s.meanClv >= 0 ? '+' : ''}${s.meanClv.toFixed(4)}`, tone: 'sig', label: 'mean CLV vs submit', sub: 'your edge over the line you faced' },
      { value: s.meanRps.toFixed(4), tone: 'blue', label: 'mean RPS', sub: 'absolute accuracy (lower better)' },
      { value: `${s.meanAlpha >= 0 ? '+' : ''}${s.meanAlpha.toFixed(4)}`, tone: tone(s.meanAlpha), label: 'realized α vs close', sub: 'outcome-based (high variance)' },
      { value: `${SETTLED.matches.length}`, tone: 'plain', label: 'settled picks', sub: 'scored to date' },
    ],
    settled: SETTLED.matches.map((m, j) => {
      const p = you.preds[j]
      return {
        matchId: m.id,
        label: `${code3(m.h)}–${code3(m.a)}`,
        pctDist: [Math.round(p[0] * 100), Math.round(p[1] * 100), Math.round(p[2] * 100)],
        resultIndex: m.res,
        rps: rpsOrd(p, m.res),
        clv: excessCLV(p, you.qsub[j], m.qc),
        status: 'scored',
      }
    }),
    calibPts: calibBins(you.preds, ys, 6),
    hasSettled: true,
  }
}

export function demoBoards(): BoardsVM {
  const ranked = CROWD.map((u) => ({ u, ...u.s, wt: u.reveal && u.s.lcb > 0 ? u.s.lcb : 0 }))
  const absolute = [...ranked]
    .sort((a, b) => a.meanRps - b.meanRps)
    .slice(0, 10)
    .map((r) => ({
      userId: String(r.u.id),
      name: r.u.name,
      isMe: !!r.u.me,
      meanRps: r.meanRps,
      meanClv: r.meanClv,
      isCopy: r.u.arche === 'copy',
    }))
  const elig = ranked.filter((r) => r.wt > 0).sort((a, b) => b.lcb - a.lcb)
  const wsum = elig.reduce((a, r) => a + r.wt, 0)
  const topWt = elig[0]?.wt || 1
  const oracle = elig.slice(0, 10).map((r) => ({
    userId: String(r.u.id),
    name: r.u.name,
    isMe: !!r.u.me,
    meanClv: r.meanClv,
    lcb: r.lcb,
    weightPct: (r.wt / wsum) * 100,
    weightFrac: r.wt / topWt,
    revealed: r.u.reveal,
  }))
  const hugger = ranked.filter((r) => r.u.arche === 'copy').sort((a, b) => a.meanRps - b.meanRps)[0]
  const absRank = absolute.findIndex((r) => r.userId === String(hugger?.u.id))
  const insight = hugger
    ? `${hugger.u.name} hugs the sharp closing line — ${absRank >= 0 ? `#${absRank + 1} on absolute skill (RPS ${hugger.meanRps.toFixed(4)})` : 'strong on absolute skill'}, yet its CLV is ${hugger.meanClv.toFixed(4)} and its oracle weight is ~0. Copying a sharp market scores well on accuracy but adds no information, so it earns nothing in the oracle. Edge ≠ accuracy.`
    : null
  return { absolute, oracle, eligibleCount, total: CROWD.length, insight }
}

export function demoOracle(): OracleVM {
  const enough = SETTLED.matches.length >= MIN_MATCHES_FOR_CALIBRATION
  return {
    tiles: [
      { value: `${M.clv_submit_robust >= 0 ? '+' : ''}${M.clv_submit_robust.toFixed(4)}`, tone: tone(M.clv_submit_robust), label: 'crowd CLV vs submit', sub: 'robust-weighted aggregate' },
      { value: `${M.clv_lock_robust >= 0 ? '+' : ''}${M.clv_lock_robust.toFixed(4)}`, tone: tone(M.clv_lock_robust), label: 'crowd CLV vs lock', sub: 'beats the lock market?' },
      { value: M.rps_crowd.toFixed(4), tone: 'blue', label: 'crowd RPS', sub: `vs close ${M.rps_close.toFixed(4)}` },
      { value: `${eligibleCount}/${CROWD.length}`, tone: 'plain', label: 'eligible contributors', sub: 'LCB>0 & revealed' },
    ],
    gates: [
      { id: 'P1', title: 'Reveal reliability ≥ 95%', ok: M.reveal_rel >= 0.95, pending: false, detail: `${(M.reveal_rel * 100).toFixed(1)}% revealed · non-revealers worst-cased` },
      { id: 'P2', title: 'Crowd excess CLV vs submit > 0', ok: M.clv_submit_robust > 0, pending: false, detail: `mean ${M.clv_submit_robust >= 0 ? '+' : ''}${M.clv_submit_robust.toFixed(4)} nats` },
      { id: 'P3', title: 'Crowd beats a public model vs lock', ok: M.clv_lock_robust > M.clv_lock_pub, pending: false, detail: `crowd ${M.clv_lock_robust.toFixed(4)} vs model ${M.clv_lock_pub.toFixed(4)}` },
      {
        id: 'P4',
        title: 'Calibration holds',
        ok: M.ece_crowd <= 0.08,
        pending: !enough,
        detail: enough
          ? `ECE ${M.ece_crowd.toFixed(3)}`
          : `needs ≥${MIN_MATCHES_FOR_CALIBRATION} settled matches to judge; have ${SETTLED.matches.length} (small-sample ECE ${M.ece_crowd.toFixed(2)} is noise, not miscalibration)`,
      },
    ],
    bars: [
      { label: 'opening', val: M.rps_open, color: CHART.home },
      { label: 'lock', val: M.rps_lock, color: CHART.draw },
      { label: 'closing (bar)', val: M.rps_close, color: CHART.signal },
      { label: 'crowd (robust)', val: M.rps_crowd, color: CHART.violet, hl: true },
    ],
    eqCompare: `An equal-weight crowd scores CLV-vs-submit ${M.clv_submit_equal.toFixed(4)} (dragged down by noise & copycats). Gating + weighting by audited CLV recovers ${M.clv_submit_robust >= 0 ? '+' : ''}${M.clv_submit_robust.toFixed(4)} with ECE ${M.ece_crowd.toFixed(4)}. The weighting is the product.`,
    calibPts: calibBins(crowdRobust, ys, 6),
    eligibleCount,
    total: CROWD.length,
    serverComputed: false,
    note: 'In this demo the synthetic crowd contains informed archetypes by construction — this shows the gates compute and discriminate (a copycat-only crowd fails them), not that a real crowd has edge.',
  }
}
