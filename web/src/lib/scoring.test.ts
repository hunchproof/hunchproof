import { describe, it, expect } from 'vitest'
import { rpsOrd, excessCLV, crossEnt, logPool, clamp, softmax, clr, mean, sd, lcb } from './scoring'

describe('scoring primitives', () => {
  it('rpsOrd matches the backend reference value (0.55/0.25/0.20, result H)', () => {
    // pof_e2e_test.py asserts the server scores this at ~0.1212.
    expect(rpsOrd([0.55, 0.25, 0.2], 0)).toBeCloseTo(0.1212, 4)
  })

  it('rpsOrd rewards a confident correct call over a diffuse one', () => {
    expect(rpsOrd([0.8, 0.15, 0.05], 0)).toBeLessThan(rpsOrd([0.34, 0.33, 0.33], 0))
  })

  it('LATENCY-ARB IDENTITY: a copycat who mirrors q_submit earns exactly 0 excess CLV', () => {
    const qSubmit = [0.52, 0.28, 0.2]
    const qClose = [0.58, 0.24, 0.18]
    expect(excessCLV(qSubmit, qSubmit, qClose)).toBeCloseTo(0, 12)
  })

  it('moving toward the closing line earns positive excess CLV; away earns negative', () => {
    const qSubmit = [0.5, 0.3, 0.2]
    const qClose = [0.62, 0.22, 0.16]
    const closer = [0.6, 0.24, 0.16]
    const farther = [0.4, 0.35, 0.25]
    expect(excessCLV(closer, qSubmit, qClose)).toBeGreaterThan(0)
    expect(excessCLV(farther, qSubmit, qClose)).toBeLessThan(0)
  })

  it('crossEnt is minimized at the reference distribution', () => {
    const q = [0.6, 0.25, 0.15]
    expect(crossEnt(q, q)).toBeLessThan(crossEnt(q, [0.34, 0.33, 0.33]))
  })

  it('logPool of identical predictions returns that prediction', () => {
    const p = [0.5, 0.3, 0.2]
    const pooled = logPool([p, p, p])
    pooled.forEach((v, i) => expect(v).toBeCloseTo(p[i], 10))
  })

  it('logPool weighting shifts the aggregate toward the heavily-weighted member', () => {
    const a = [0.7, 0.2, 0.1]
    const b = [0.2, 0.3, 0.5]
    const towardA = logPool([a, b], [10, 1])
    expect(towardA[0]).toBeGreaterThan(0.5)
  })

  it('clamp / softmax / clr produce valid normalized vectors', () => {
    ;[clamp([0, 1, 0]), softmax([1, 2, 3]), softmax(clr([0.3, 0.4, 0.3]))].forEach((v) => {
      expect(v.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 10)
      v.forEach((x) => expect(x).toBeGreaterThan(0))
    })
  })

  it('lcb is below the mean and penalizes noisy samples more', () => {
    const tight = [0.01, 0.012, 0.009, 0.011, 0.01]
    const noisy = [0.05, -0.04, 0.06, -0.03, 0.01]
    expect(lcb(tight)).toBeLessThan(mean(tight))
    expect(lcb(noisy)).toBeLessThan(lcb(tight)) // same-ish mean, far more spread → lower LCB
    expect(sd(noisy)).toBeGreaterThan(sd(tight))
  })
})
