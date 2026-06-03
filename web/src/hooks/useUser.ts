import { useState } from 'react'

/**
 * Local user identity. Mirrors the original SPA's localStorage `pof_uid`.
 *
 * NOTE: this is a stand-in. Roadmap T1 replaces it with real auth (magic-link or
 * wallet); the backend must then key predictions on a *verified* id. The rest of the
 * app already treats `userId` as opaque, so swapping the source is a one-file change.
 */
const KEY = 'pof_uid'

function readOrCreate(): string {
  try {
    let u = localStorage.getItem(KEY)
    if (!u) {
      u = 'u_' + Math.random().toString(36).slice(2, 10)
      localStorage.setItem(KEY, u)
    }
    return u
  } catch {
    return 'demo-user'
  }
}

export function useUser(): { userId: string } {
  const [userId] = useState(readOrCreate)
  return { userId }
}
