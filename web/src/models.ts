/** View-models shared by demo-mode and live-mode producers, so the views stay mode-agnostic. */
import type { Triple } from './lib/commitment'

export type Tone = 'sig' | 'blue' | 'warn' | 'bad' | 'violet' | 'plain'

export interface TileVM {
  value: string
  tone: Tone
  label: string
  sub: string
}

export type PredictionStatus = 'scored' | 'revealed' | 'sealed' | 'locked'

export interface SettledRowVM {
  matchId: number
  label: string // e.g. "SPA–CRO"
  pctDist: Triple // [H,D,A] as 0–100 ints (display)
  resultIndex: number | null
  rps: number | null
  clv: number | null
  status: PredictionStatus
}

export interface PortfolioVM {
  revealReliabilityPct: number | null
  tiles: TileVM[]
  settled: SettledRowVM[]
  calibPts: Array<[number, number]>
  hasSettled: boolean
}

export interface AbsoluteRowVM {
  userId: string
  name: string
  isMe: boolean
  meanRps: number
  meanClv: number | null
  isCopy?: boolean
}

export interface OracleRowVM {
  userId: string
  name: string
  isMe: boolean
  meanClv: number
  lcb: number
  weightPct: number
  weightFrac: number // 0..1 relative to top weight (for the bar)
  revealed: boolean
}

export interface BoardsVM {
  absolute: AbsoluteRowVM[]
  oracle: OracleRowVM[]
  eligibleCount: number
  total: number
  insight: string | null
}

export interface GateVM {
  id: string
  title: string
  detail: string
  ok: boolean
  pending: boolean
}

export interface BarVM {
  label: string
  val: number
  color: string
  hl?: boolean
}

export interface OracleVM {
  tiles: TileVM[]
  gates: GateVM[]
  bars: BarVM[]
  eqCompare: string | null
  calibPts: Array<[number, number]>
  eligibleCount: number
  total: number
  serverComputed: boolean // live mode: the gated parts run server-side (ingestion), not here
  note: string
}
