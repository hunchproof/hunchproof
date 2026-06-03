/**
 * Seeded synthetic demo data — ported verbatim from hunchproof_app.html.
 *
 * This is the self-contained showcase used when no backend is configured. It is
 * SYNTHETIC BY CONSTRUCTION (it contains informed archetypes that were handed
 * information) and is clearly labeled as such in the UI. It validates that the ruler
 * and the gates compute and discriminate — NOT that a real crowd has edge. Never
 * present demo numbers as evidence of real foresight (docs/STATUS.md).
 */
import { clamp, clr, softmax } from '../lib/scoring'
import type { Triple } from '../lib/commitment'

export function mulberry32(seed: number): () => number {
  let s = seed
  return function () {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// One shared deterministic stream, consumed in a fixed order so the demo is reproducible.
export const rnd = mulberry32(20260611)
export const gauss = (): number => {
  let u = 0
  let v = 0
  while (!u) u = rnd()
  while (!v) v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export interface OpenMatch {
  id: number
  comp: string
  h: string
  a: string
  hc: string
  ac: string
  ko_h: number
  q: Triple
}
export interface OpenSlateData {
  id: string
  label: string
  locks_in_h: number
  matches: OpenMatch[]
}

// open slate (the user predicts) — World Cup Matchday 2
export const OPEN_SLATE: OpenSlateData = {
  id: 'WC26-G-MD2',
  label: 'World Cup 2026 · Group Stage · Matchday 2',
  locks_in_h: 9.4 * 24,
  matches: [
    { id: 520201, comp: 'GROUP E', h: 'Spain', a: 'Croatia', hc: 'ESP', ac: 'CRO', ko_h: 9.5 * 24, q: [0.58, 0.24, 0.18] },
    { id: 520202, comp: 'GROUP G', h: 'Brazil', a: 'Cameroon', hc: 'BRA', ac: 'CMR', ko_h: 9.6 * 24, q: [0.74, 0.17, 0.09] },
    { id: 520203, comp: 'GROUP D', h: 'Argentina', a: 'Nigeria', hc: 'ARG', ac: 'NGA', ko_h: 9.7 * 24, q: [0.66, 0.21, 0.13] },
    { id: 520204, comp: 'GROUP B', h: 'England', a: 'USA', hc: 'ENG', ac: 'USA', ko_h: 9.8 * 24, q: [0.55, 0.27, 0.18] },
    { id: 520205, comp: 'GROUP F', h: 'France', a: 'Denmark', hc: 'FRA', ac: 'DEN', ko_h: 9.9 * 24, q: [0.52, 0.28, 0.2] },
  ],
}

export interface SettledMatch {
  id: number
  h: string
  a: string
  hc: string
  ac: string
  qo: Triple
  ql: Triple
  qc: Triple
  res: number // 0=H,1=D,2=A
}

// settled slate (powers Portfolio history + Leaderboards + Oracle) — Matchdays 1+2 settled
export const SETTLED: { id: string; label: string; matches: SettledMatch[] } = {
  id: 'WC26-G-MD1-2',
  label: 'World Cup 2026 · Group Stage · settled to date',
  matches: [
    { id: 520101, h: 'Germany', a: 'Japan', hc: 'GER', ac: 'JPN', qo: [0.62, 0.22, 0.16], ql: [0.56, 0.24, 0.2], qc: [0.52, 0.25, 0.23], res: 2 },
    { id: 520102, h: 'Mexico', a: 'Poland', hc: 'MEX', ac: 'POL', qo: [0.45, 0.29, 0.26], ql: [0.43, 0.3, 0.27], qc: [0.42, 0.3, 0.28], res: 1 },
    { id: 520103, h: 'Netherlands', a: 'Ecuador', hc: 'NED', ac: 'ECU', qo: [0.6, 0.25, 0.15], ql: [0.55, 0.27, 0.18], qc: [0.5, 0.28, 0.22], res: 1 },
    { id: 520104, h: 'Portugal', a: 'Ghana', hc: 'POR', ac: 'GHA', qo: [0.64, 0.22, 0.14], ql: [0.66, 0.21, 0.13], qc: [0.67, 0.21, 0.12], res: 0 },
    { id: 520105, h: 'Belgium', a: 'Canada', hc: 'BEL', ac: 'CAN', qo: [0.61, 0.24, 0.15], ql: [0.63, 0.23, 0.14], qc: [0.64, 0.23, 0.13], res: 0 },
    { id: 520106, h: 'Morocco', a: 'Croatia', hc: 'MAR', ac: 'CRO', qo: [0.3, 0.33, 0.37], ql: [0.31, 0.34, 0.35], qc: [0.32, 0.34, 0.34], res: 1 },
    { id: 520107, h: 'Spain', a: 'Croatia', hc: 'ESP', ac: 'CRO', qo: [0.55, 0.26, 0.19], ql: [0.57, 0.25, 0.18], qc: [0.59, 0.24, 0.17], res: 0 },
    { id: 520108, h: 'Brazil', a: 'Serbia', hc: 'BRA', ac: 'CRO', qo: [0.7, 0.2, 0.1], ql: [0.72, 0.18, 0.1], qc: [0.73, 0.18, 0.09], res: 0 },
    { id: 520109, h: 'France', a: 'Australia', hc: 'FRA', ac: 'DEN', qo: [0.71, 0.19, 0.1], ql: [0.73, 0.18, 0.09], qc: [0.74, 0.18, 0.08], res: 0 },
    { id: 520110, h: 'Argentina', a: 'Mexico', hc: 'ARG', ac: 'MEX', qo: [0.55, 0.27, 0.18], ql: [0.56, 0.27, 0.17], qc: [0.58, 0.26, 0.16], res: 0 },
    { id: 520111, h: 'England', a: 'Iran', hc: 'ENG', ac: 'USA', qo: [0.72, 0.18, 0.1], ql: [0.74, 0.17, 0.09], qc: [0.75, 0.17, 0.08], res: 0 },
    { id: 520112, h: 'Japan', a: 'Costa Rica', hc: 'JPN', ac: 'CRO', qo: [0.52, 0.28, 0.2], ql: [0.5, 0.29, 0.21], qc: [0.48, 0.3, 0.22], res: 2 },
  ],
}

// path point between q_open and q_close at fraction t (clr-geodesic) — q_submit per user
export const pathPt = (qo: readonly number[], qc: readonly number[], t: number): number[] =>
  softmax(clr(qo).map((z, i) => (1 - t) * z + t * clr(qc)[i]))

export const sharpen = (p: readonly number[], g: number): number[] => {
  const q = clamp(p).map((x) => x ** g)
  const s = q.reduce((a, b) => a + b, 0)
  return q.map((x) => x / s)
}

export interface Archetype {
  key: 'informed' | 'copy' | 'noise'
  n: number
  t: [number, number]
  skill?: number
  g?: number
  name: (i: number) => string
}

export const ARCHES: Archetype[] = [
  { key: 'informed', n: 14, t: [0.05, 0.35], skill: 0.45, name: (i) => `sharp_scout_${i}` },
  { key: 'informed', n: 10, t: [0.55, 0.8], skill: 0.4, name: (i) => `late_analyst_${i}` },
  { key: 'copy', n: 12, t: [0.7, 0.88], name: (i) => `line_hugger_${i}` }, // copies a sharp late market → low RPS, ~0 CLV
  { key: 'copy', n: 8, t: [0.05, 0.2], name: (i) => `market_echo_${i}` },
  { key: 'noise', n: 10, g: 2.4, t: [0.2, 0.5], name: (i) => `hot_take_${i}` },
]

// A fixed demo lock target, computed once at module load (stable across re-renders).
export const DEMO_LOAD_MS = Date.now()
export const DEMO_LOCK_MS = DEMO_LOAD_MS + OPEN_SLATE.locks_in_h * 36e5
