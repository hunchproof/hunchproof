/**
 * Scoring primitives — a faithful TypeScript port of research/engine.py and the JS in
 * the original hunchproof_app.html (same definitions as phase1.py).
 *
 * IMPORTANT: client-side scoring is DISPLAY-ONLY. The backend / ingestion pipeline is
 * authoritative for RPS / CLV / alpha. These functions exist to render previews
 * (deviation bars, demo-mode crowds, the live display-only oracle) — never as truth.
 *
 * Definitions that are load-bearing for the mechanism (see docs/MECHANISM.md):
 *  - RPS is the strictly-proper, ordinal primary metric (H>D>A).
 *  - CLV is measured in cross-entropy to the closing line q_close (outcome-INDEPENDENT).
 *  - excess CLV is benchmarked vs the SUBMIT-TIME market (latency-arb defense), never opening.
 *  - the crowd aggregate is a log-opinion pool (geometric mean in clr space), robustly weighted.
 */

const EPS = 1e-6

/** Clamp away zeros and renormalize to a valid probability vector. */
export const clamp = (p: readonly number[]): number[] => {
  const c = p.map((x) => Math.max(x, EPS))
  const s = c.reduce((a, b) => a + b, 0)
  return c.map((x) => x / s)
}

const meanlog = (p: readonly number[]): number =>
  p.reduce((a, b) => a + Math.log(b), 0) / p.length

/** Centered log-ratio: the natural space for averaging/interpolating distributions. */
export const clr = (p: readonly number[]): number[] => {
  const c = clamp(p)
  const m = meanlog(c)
  return c.map((x) => Math.log(x) - m)
}

/** Inverse of clr (up to a constant). */
export const softmax = (z: readonly number[]): number[] => {
  const mx = Math.max(...z)
  const e = z.map((x) => Math.exp(x - mx))
  const s = e.reduce((a, b) => a + b, 0)
  return e.map((x) => x / s)
}

/** Cross-entropy H(qref, p) in nats. */
export const crossEnt = (qref: readonly number[], p: readonly number[]): number => {
  const q = clamp(qref)
  const pp = clamp(p)
  return -q.reduce((a, qi, i) => a + qi * Math.log(pp[i]), 0)
}

/** Ranked Probability Score for the 3-outcome ordinal case (H,D,A). Lower is better. */
export function rpsOrd(p: readonly number[], yi: number): number {
  const o = [0, 0, 0]
  o[yi] = 1
  const cp = [p[0], p[0] + p[1], 1]
  const co = [o[0], o[0] + o[1], 1]
  return 0.5 * ((cp[0] - co[0]) ** 2 + (cp[1] - co[1]) ** 2)
}

/** Log-loss (proper but not ordinal); secondary diagnostic. */
export const logLoss = (p: readonly number[], yi: number): number =>
  -Math.log(Math.max(clamp(p)[yi], EPS))

/**
 * Excess CLV vs the submit-time market — the latency-arb-resistant individual reward.
 *   excess = CE(q_close, q_submit) − CE(q_close, p_user)
 * A copycat who submits exactly q_submit scores exactly 0 (an identity).
 */
export const excessCLV = (
  p: readonly number[],
  qSubmit: readonly number[],
  qClose: readonly number[],
): number => crossEnt(qClose, qSubmit) - crossEnt(qClose, p)

/** Realized alpha vs the close, on the actual result. High variance — display-only/secondary. */
export const realizedAlpha = (
  p: readonly number[],
  qClose: readonly number[],
  yi: number,
): number => rpsOrd(qClose, yi) - rpsOrd(p, yi)

/** Weighted log-opinion pool (geometric mean in clr space). Equal weights if w omitted. */
export function logPool(preds: number[][], w?: readonly number[]): number[] {
  const n = preds.length
  const Z = preds.map((p) => clr(p))
  const zbar = [0, 0, 0]
  let W = 0
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i] : 1
    W += wi
    for (let k = 0; k < 3; k++) zbar[k] += wi * Z[i][k]
  }
  return softmax(zbar.map((x) => x / (W || 1)))
}

/** Expected Calibration Error over flattened per-class (predicted, observed) pairs. */
export function ece(preds: number[][], ys: number[], bins = 10): number {
  const pp: number[] = []
  const oo: number[] = []
  preds.forEach((p, i) => {
    const c = clamp(p)
    const o = [0, 0, 0]
    o[ys[i]] = 1
    for (let k = 0; k < 3; k++) {
      pp.push(c[k])
      oo.push(o[k])
    }
  })
  let e = 0
  const N = pp.length
  for (let b = 0; b < bins; b++) {
    const lo = b / bins
    const hi = (b + 1) / bins
    const idx = pp
      .map((v, i) => (v >= lo && v < hi + (b === bins - 1 ? 1e-9 : 0) ? i : -1))
      .filter((i) => i >= 0)
    if (idx.length) {
      const mp = idx.reduce((a, i) => a + pp[i], 0) / idx.length
      const mo = idx.reduce((a, i) => a + oo[i], 0) / idx.length
      e += (idx.length / N) * Math.abs(mp - mo)
    }
  }
  return e
}

/** Reliability-curve points [meanPredicted, meanObserved] per bin (≥5 samples). */
export function calibBins(preds: number[][], ys: number[], bins = 10): Array<[number, number]> {
  const pp: number[] = []
  const oo: number[] = []
  preds.forEach((p, i) => {
    const c = clamp(p)
    const o = [0, 0, 0]
    o[ys[i]] = 1
    for (let k = 0; k < 3; k++) {
      pp.push(c[k])
      oo.push(o[k])
    }
  })
  const pts: Array<[number, number]> = []
  for (let b = 0; b < bins; b++) {
    const lo = b / bins
    const hi = (b + 1) / bins
    const idx = pp
      .map((v, i) => (v >= lo && v < hi + (b === bins - 1 ? 1e-9 : 0) ? i : -1))
      .filter((i) => i >= 0)
    if (idx.length > 4) {
      pts.push([
        idx.reduce((a, i) => a + pp[i], 0) / idx.length,
        idx.reduce((a, i) => a + oo[i], 0) / idx.length,
      ])
    }
  }
  return pts
}

export const mean = (a: readonly number[]): number =>
  a.reduce((x, y) => x + y, 0) / (a.length || 1)

export const sd = (a: readonly number[]): number => {
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(a.length - 1, 1))
}

/** Lower-confidence bound: mean − 1.64·SE. Used to gate/weight oracle contributors (clip ≥ 0). */
export const lcb = (samples: readonly number[]): number => {
  const m = mean(samples)
  const se = sd(samples) / Math.sqrt(Math.max(samples.length, 1))
  return m - 1.64 * se
}
