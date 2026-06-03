import { API_BASE } from '../config'
import type {
  ApiCommitResponse,
  ApiLeaderboard,
  ApiOpenSlate,
  ApiPredictions,
  ApiRevealResponse,
} from './types'

/** Normalized error for the UI. `data` carries the raw detail (e.g. reveal-mismatch info). */
export class ApiError extends Error {
  status: number
  detail: string
  data: unknown
  constructor(status: number, detail: string, data?: unknown) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.data = data
  }
}

export interface CommitBody {
  user_id: string
  match_id: number
  commitment_hash: string
  slate_id?: number
}
export interface RevealBody {
  user_id: string
  match_id: number
  p: number[] // raw H,D,A (any positive scale; server quantizes to permille)
  salt_hex: string
  slate_id?: number
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new ApiError(0, 'No backend configured (demo mode)')
  let resp: Response
  try {
    resp = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new ApiError(0, 'Network error — backend unreachable')
  }
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`
    let data: unknown
    try {
      const j = (await resp.json()) as { detail?: unknown }
      data = j?.detail ?? j
      if (typeof j?.detail === 'string') detail = j.detail
      else if (j?.detail && typeof j.detail === 'object') {
        const d = j.detail as { reason?: string }
        detail = d.reason || JSON.stringify(j.detail)
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(resp.status, detail, data)
  }
  return resp.json() as Promise<T>
}

export const api = {
  getOpenSlate: () => req<ApiOpenSlate>('/api/fixtures/open'),

  commit: (body: CommitBody) =>
    req<ApiCommitResponse>('/api/predictions', { method: 'POST', body: JSON.stringify(body) }),

  reveal: (body: RevealBody) =>
    req<ApiRevealResponse>('/api/predictions/reveal', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listPredictions: (params?: { user_id?: string; match_id?: number }) => {
    const q = new URLSearchParams()
    if (params?.user_id) q.set('user_id', params.user_id)
    if (params?.match_id != null) q.set('match_id', String(params.match_id))
    const qs = q.toString()
    return req<ApiPredictions>('/api/predictions' + (qs ? `?${qs}` : ''))
  },

  getLeaderboard: (slateId = 1) => req<ApiLeaderboard>(`/api/leaderboard?slate_id=${slateId}`),
}
