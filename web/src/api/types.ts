import type { Triple } from '../lib/commitment'
export type { Triple }

/* ===========================================================================
   Raw backend shapes — exactly as product/pof_backend.py serializes them.
   (snake_case kept on the wire; we normalize at the client boundary.)
   =========================================================================== */

export interface ApiFixture {
  match_id: number
  competition: string
  home: string
  away: string
  kickoff_at: number // epoch ms
  lock_at: number // epoch ms
  q_submit: number[] // parsed no-vig market [H,D,A] (reference only)
}

export interface ApiOpenSlate {
  count: number
  slate: ApiFixture[]
}

export interface ApiCommitResponse {
  ok: boolean
  prediction_id: number
  q_submit: number[]
  server_received_at: number
  status: string // "SEALED"
}

export interface ApiRevealResponse {
  ok: boolean
  valid_commit: boolean
  permille: number[]
  rps: number | null
  log_loss: number | null
}

export interface ApiPredictionRow {
  prediction_id: number
  user_id: string
  match_id: number
  submitted_at: number | null
  revealed_at: number | null
  commitment_hash: string
  reveal_flag: number // 0 | 1
  valid_commit: number // 0 | 1
  p_h: number | null // permille, set at reveal
  p_d: number | null
  p_a: number | null
  q_submit: string | null // NOTE: a JSON string here (DB text column), parse client-side
  rps: number | null
  log_loss: number | null
  clv: number | null // server-authoritative excess CLV vs submit (additive backend field)
  alpha_close: number | null // realized alpha vs close (high variance, secondary)
  // Optional match-join fields (additive backend change). The client degrades
  // gracefully if an un-modified backend omits them.
  competition?: string | null
  home?: string | null
  away?: string | null
  result?: string | null // 'H' | 'D' | 'A' | null
  q_close?: string | null // JSON string of the no-vig closing line
}

export interface ApiPredictions {
  count: number
  predictions: ApiPredictionRow[]
}

export interface ApiLeaderboardRow {
  user_id: string
  n: number
  mean_rps: number
  mean_log_loss: number
  reveal_reliability: number
}

export interface ApiLeaderboard {
  slate_id: number
  leaderboard: ApiLeaderboardRow[]
}

/* ===========================================================================
   Normalized client model — what the views actually consume (mode-agnostic).
   =========================================================================== */

export interface SlateMatch {
  id: number
  competition: string
  home: string
  away: string
  homeCode: string
  awayCode: string
  kickoffMs: number | null
  lockMs: number | null
  market: Triple // no-vig market the user predicts against (display reference)
}

export interface Slate {
  id: string
  label: string
  live: boolean
  matches: SlateMatch[]
  lockMs: number | null // earliest lock across the slate
}

/** A single sealed prediction the client retains locally (salt lives here — needed to reveal). */
export interface SealRecord {
  matchId: number
  home: string
  away: string
  homeCode: string
  awayCode: string
  competition: string
  permille: Triple
  salt: string
  commitmentHash: string
  qSubmit: Triple // the market at seal time (display only; server snapshots the authoritative one)
  submittedAt: string // ISO
  slateId: string
  lockMs: number | null // when this match locks (gates the reveal action client-side)
}

/** Normalized error surfaced from the client (live mode). */
export interface ApiError {
  status: number
  detail: string
}

/** Connection status for the badge. */
export type ConnMode = 'live' | 'demo'
