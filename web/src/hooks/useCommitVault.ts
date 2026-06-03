import { useSyncExternalStore } from 'react'
import type { SealRecord } from '../api/types'

/**
 * The client-side commit vault.
 *
 * Holds the SECRETS the server never sees before reveal — each sealed prediction's
 * salt and quantized distribution — keyed by (userId, matchId), persisted in
 * localStorage. Salts are the ONLY way to reveal later, so this is load-bearing.
 *
 * The server remains the source of truth for status/scores; `revealedAt` here is a
 * local cache so the UI can reflect a reveal immediately. A failed reveal NEVER
 * writes here (we only stamp revealedAt on a server-confirmed valid_commit), mirroring
 * the backend's "a fulfilled commitment is immutable" invariant.
 */
export interface VaultEntry extends SealRecord {
  revealedAt?: string // ISO, set only after a server-confirmed valid reveal
  localResultIndex?: number // demo-mode only: outcome index for local scoring
}

type VaultData = Record<string /* userId */, Record<string /* matchId */, VaultEntry>>

const KEY = 'pof_vault_v1'
const EMPTY: VaultEntry[] = []

let cache: VaultData | null = null
let version = 0
const listeners = new Set<() => void>()
const snapCache = new Map<string, { v: number; arr: VaultEntry[] }>()

function read(): VaultData {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || '{}') as VaultData
  } catch {
    cache = {}
  }
  return cache
}

function write(next: VaultData) {
  cache = next
  version++
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage full / unavailable — keep the in-memory copy */
  }
  listeners.forEach((l) => l())
}

function snapshotFor(userId: string): VaultEntry[] {
  const cached = snapCache.get(userId)
  if (cached && cached.v === version) return cached.arr
  const arr = Object.values(read()[userId] || {}).sort((a, b) =>
    a.submittedAt < b.submittedAt ? 1 : -1,
  )
  snapCache.set(userId, { v: version, arr })
  return arr
}

export const vault = {
  entriesFor(userId: string): VaultEntry[] {
    return snapshotFor(userId)
  },
  get(userId: string, matchId: number): VaultEntry | undefined {
    return read()[userId]?.[String(matchId)]
  },
  /** Persist a whole sealed slate at once (the unit of commitment). */
  sealSlate(userId: string, records: SealRecord[]) {
    const data = read()
    const userMap = { ...(data[userId] || {}) }
    for (const r of records) userMap[String(r.matchId)] = { ...r }
    write({ ...data, [userId]: userMap })
  },
  /** Stamp a server-confirmed reveal (or demo-local reveal). Immutable on the secret fields. */
  markRevealed(userId: string, matchId: number, patch?: Partial<VaultEntry>) {
    const data = read()
    const entry = data[userId]?.[String(matchId)]
    if (!entry) return
    const userMap = {
      ...data[userId],
      [String(matchId)]: { ...entry, revealedAt: new Date().toISOString(), ...patch },
    }
    write({ ...data, [userId]: userMap })
  },
  clearUser(userId: string) {
    const data = read()
    if (!data[userId]) return
    const next = { ...data }
    delete next[userId]
    write(next)
  },
  subscribe(l: () => void): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

/** Reactive list of the user's vault entries (re-renders on seal/reveal/clear). */
export function useVault(userId: string): VaultEntry[] {
  return useSyncExternalStore(
    vault.subscribe,
    () => (userId ? snapshotFor(userId) : EMPTY),
    () => EMPTY,
  )
}
