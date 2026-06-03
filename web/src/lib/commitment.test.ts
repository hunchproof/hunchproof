import { describe, it, expect } from 'vitest'
import { quantizePermille, preimage, commitmentHash, randSalt } from './commitment'

// Gold vector captured from product/commitment_reference.py (run with python3.12).
// This assertion IS the re-proof that the browser scheme == the backend scheme.
const KNOWN_SALT = 'a3f1' + '00'.repeat(30)
const KNOWN_HASH = 'c9e215923c4957a059001ce52134eef0fc898c9e61fad803c5938e098142b309'

describe('canonical commitment scheme (PoF|v1) — Python==JS parity', () => {
  it('reproduces the Python reference vector byte-for-byte', async () => {
    const perm = quantizePermille(45, 27, 28)
    expect(perm).toEqual([450, 270, 280])
    expect(preimage(2026001, perm, KNOWN_SALT)).toBe(`PoF|v1|2026001|450-270-280|${KNOWN_SALT}`)
    expect(await commitmentHash(2026001, perm, KNOWN_SALT)).toBe(KNOWN_HASH)
  })

  it('quantizes to permille summing to exactly 1000 (largest-remainder edge cases)', () => {
    const cases: Array<[number, number, number]> = [
      [33, 33, 33], [1, 1, 1], [98, 1, 1], [50, 49, 1], [17, 17, 66],
    ]
    for (const [h, d, a] of cases) {
      const p = quantizePermille(h, d, a)
      expect(p[0] + p[1] + p[2]).toBe(1000)
      expect(Math.min(...p)).toBeGreaterThanOrEqual(0)
    }
  })

  it('quantization holds (sum=1000) over many random inputs', () => {
    let seed = 0x6d2b79f5
    const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let i = 0; i < 20000; i++) {
      const h = 1 + Math.floor(rng() * 98)
      const d = 1 + Math.floor(rng() * 98)
      const a = 1 + Math.floor(rng() * 98)
      const p = quantizePermille(h, d, a)
      expect(p[0] + p[1] + p[2]).toBe(1000)
    }
  })

  it('a permille triple is idempotent under re-quantization (reveal sends permille back)', () => {
    // The reveal flow re-submits the stored permille; the backend re-quantizes it.
    // It must map to itself so the recomputed hash matches.
    expect(quantizePermille(550, 250, 200)).toEqual([550, 250, 200])
    expect(quantizePermille(450, 270, 280)).toEqual([450, 270, 280])
  })

  it('salt is 64 hex chars (32 random bytes)', () => {
    const s = randSalt()
    expect(s).toMatch(/^[0-9a-f]{64}$/)
    expect(randSalt()).not.toBe(s) // overwhelmingly unlikely to collide
  })
})
