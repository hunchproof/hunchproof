/**
 * Canonical commitment scheme (PoF|v1) — a BYTE-FOR-BYTE TypeScript port of the
 * scheme in product/pof_backend.py and product/commitment_reference.py.
 *
 * Commit-reveal only works if the browser and the Python server serialize the
 * preimage identically, so DO NOT change anything here without re-proving Python==JS
 * (see commitment.test.ts) and bumping the `v1` version tag in config.ts + the backend.
 *
 *   1. quantize p to integer permille via largest-remainder (sums to exactly 1000)
 *   2. preimage = `PoF|v1|{match_id}|{H}-{D}-{A}|{salt_hex}`   (salt = 32 random bytes hex)
 *   3. commitment = SHA-256(utf8(preimage)) hex
 */
import { SCHEME } from '../config'

export type Triple = [number, number, number]

/** Largest-remainder quantization to integer permille. Result always sums to exactly 1000. */
export function quantizePermille(h: number, d: number, a: number): Triple {
  const s = h + d + a
  const raw = [(h / s) * 1000, (d / s) * 1000, (a / s) * 1000]
  const fl = raw.map(Math.floor)
  const rem = 1000 - fl.reduce((x, y) => x + y, 0)
  const order = raw
    .map((v, i): [number, number] => [v - fl[i], i])
    .sort((x, y) => y[0] - x[0])
  for (let k = 0; k < rem; k++) fl[order[k][1]]++
  return [fl[0], fl[1], fl[2]]
}

const toHex = (b: ArrayBuffer | Uint8Array): string =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

/** 32 cryptographically-random bytes, hex-encoded (64 chars). */
export function randSalt(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return toHex(b)
}

/** The exact preimage string that gets hashed. Order and separators are part of the scheme. */
export const preimage = (matchId: number, perm: Triple, saltHex: string): string =>
  `${SCHEME}|${matchId}|${perm[0]}-${perm[1]}-${perm[2]}|${saltHex}`

/** SHA-256 of a UTF-8 string, hex. Uses Web Crypto (browser + Node 20+). */
export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return toHex(digest)
}

/** The committed hash for a (match, quantized distribution, salt). */
export async function commitmentHash(
  matchId: number,
  perm: Triple,
  saltHex: string,
): Promise<string> {
  return sha256Hex(preimage(matchId, perm, saltHex))
}
