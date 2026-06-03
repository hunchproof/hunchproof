import type { Triple } from './commitment'

/**
 * Slider math for the Slate. The three sliders always normalize to 100%: moving one
 * rebalances the other two proportionally (each kept ≥ 1). The committed value is later
 * quantized to permille by the canonical scheme — this layer is just the tactile UX.
 */

/** Market probabilities → integer percents summing to exactly 100 (largest remainder). */
export function marketToPct(market: readonly number[]): Triple {
  const s = (market[0] + market[1] + market[2]) || 1
  const raw = [(market[0] / s) * 100, (market[1] / s) * 100, (market[2] / s) * 100]
  const fl = raw.map(Math.floor)
  const rem = 100 - fl.reduce((a, b) => a + b, 0)
  const order = raw
    .map((v, i): [number, number] => [v - fl[i], i])
    .sort((a, b) => b[0] - a[0])
  for (let k = 0; k < rem; k++) fl[order[k][1]]++
  return [fl[0], fl[1], fl[2]]
}

/** Set slider `idx` to `raw`, proportionally rebalancing the other two so the triple sums to 100. */
export function rebalance(prev: readonly number[], idx: number, raw: number): Triple {
  const v = Math.max(1, Math.min(98, Math.round(raw)))
  const others = [0, 1, 2].filter((i) => i !== idx) as [number, number]
  const [j, k] = others
  const remaining = 100 - v // split between the two others, each ≥ 1
  const prevSum = prev[j] + prev[k]
  const pj = prevSum <= 0 ? remaining / 2 : (prev[j] / prevSum) * remaining
  let rj = Math.max(1, Math.round(pj))
  let rk = remaining - rj
  if (rk < 1) {
    rk = 1
    rj = remaining - 1
  }
  const out: Triple = [0, 0, 0]
  out[idx] = v
  out[j] = rj
  out[k] = rk
  return out
}

/** Even split, used by the "reset" helper. */
export const EVEN: Triple = [34, 33, 33]
