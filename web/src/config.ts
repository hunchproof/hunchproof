/**
 * Resolve the backend base URL and the resulting connection mode.
 *
 * Precedence (first non-empty wins), mirroring the original SPA:
 *   1. ?api=<url>            query param   (one-off overrides / demos)
 *   2. window.POF_API_BASE   global        (ops can inject without rebuilding)
 *   3. VITE_API_BASE         build-time env
 *   null  => self-contained DEMO mode (synthetic data, clearly labeled in the UI).
 *
 * In live mode the backend is authoritative: it snapshots q_submit at commit time,
 * verifies reveals byte-for-byte, and scores. The client never sends a market price.
 */
declare global {
  interface Window {
    POF_API_BASE?: string
  }
}

function resolveApiBase(): string | null {
  // 1. ?api= query param
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('api')
    if (fromQuery) return stripTrailingSlash(fromQuery)
  } catch {
    /* SSR / non-browser — ignore */
  }
  // 2. window global
  if (typeof window !== 'undefined' && window.POF_API_BASE) {
    return stripTrailingSlash(window.POF_API_BASE)
  }
  // 3. build-time env
  const fromEnv = import.meta.env?.VITE_API_BASE
  if (fromEnv && String(fromEnv).trim()) return stripTrailingSlash(String(fromEnv).trim())

  return null
}

function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, '')
}

export const API_BASE: string | null = resolveApiBase()
export const IS_LIVE: boolean = API_BASE !== null
export const MODE: 'live' | 'demo' = IS_LIVE ? 'live' : 'demo'

/** Short host label for the connection badge (e.g. "127.0.0.1:8000"). */
export const API_LABEL: string = API_BASE
  ? API_BASE.replace(/^https?:\/\//, '')
  : 'synthetic data'

/** The mechanism scheme version — must match pof_backend.py / commitment_reference.py. */
export const SCHEME = 'PoF|v1' as const

/** Oracle calibration (P4) needs a meaningful sample; below this we show PENDING, never fake it. */
export const MIN_MATCHES_FOR_CALIBRATION = 60
