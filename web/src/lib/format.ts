/** Display formatting helpers + the flag color map (ported from hunchproof_app.html). */

export const RES = ['H', 'D', 'A'] as const
export type ResultIndex = 0 | 1 | 2
export const RES_LABEL: Record<string, string> = { H: 'Home', D: 'Draw', A: 'Away' }

/** Probability as a percent string. */
export const pct = (x: number, digits = 0): string => `${(x * 100).toFixed(digits)}%`

/** Signed fixed-precision number, e.g. "+0.0042" / "-0.0011" (for CLV/alpha in nats). */
export const signed = (x: number, digits = 4): string =>
  `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`

/** Truncate a long hash for compact display while keeping head + tail visible. */
export const truncHash = (h: string, head = 10, tail = 6): string =>
  h.length > head + tail ? `${h.slice(0, head)}…${h.slice(-tail)}` : h

/** First three letters, upper-cased — a compact team code (e.g. "Spain" → "SPA"). */
export const code3 = (name: string): string => name.slice(0, 3).toUpperCase()

/** Countdown like "3d 4h 12m"; "LOCKED" once elapsed. */
export function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'LOCKED'
  const d = Math.floor(ms / 864e5)
  const h = Math.floor((ms % 864e5) / 36e5)
  const m = Math.floor((ms % 36e5) / 6e4)
  if (d > 0) return `${d}d ${h}h ${m}m`
  const s = Math.floor((ms % 6e4) / 1e3)
  return `${h}h ${m}m ${s}s`
}

/** Absolute kickoff timestamp (ms) → short local datetime. */
export function fmtKickoff(ms: number): string {
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Two-tone flag swatches — `linear-gradient(90deg, a 50%, b 50%)`.
const FLAG: Record<string, string> = {
  ESP: '#c60b1e,#ffc400', CRO: '#171796,#ff0000', BRA: '#009b3a,#ffdf00', CMR: '#007a5e,#fcd116',
  ARG: '#74acdf,#ffffff', NGA: '#008751,#ffffff', ENG: '#ffffff,#ce1124', USA: '#3c3b6e,#b22234',
  FRA: '#0055a4,#ef4135', DEN: '#c8102e,#ffffff', GER: '#000000,#dd0000', JPN: '#ffffff,#bc002d',
  MEX: '#006847,#ce1126', POL: '#ffffff,#dc143c', NED: '#21468b,#ae1c28', ECU: '#ffd100,#0072ce',
  POR: '#006600,#ff0000', GHA: '#006b3f,#fcd116', BEL: '#000000,#fdda24', CAN: '#ff0000,#ffffff',
  MAR: '#c1272d,#006233',
}

/** Inline style for a small flag swatch given a 3-letter country code. */
export function flagStyle(code: string): { backgroundImage: string } {
  const [a, b] = (FLAG[code?.toUpperCase()] || '#3a444f,#566273').split(',')
  return { backgroundImage: `linear-gradient(90deg, ${a} 50%, ${b} 50%)` }
}

/** L1 deviation between a distribution and the market, in percentage points (0–100). */
export const deviationPts = (p: readonly number[], q: readonly number[]): number =>
  (100 * (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]))) / 2
