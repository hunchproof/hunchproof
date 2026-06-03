import { useState } from 'react'
import { truncHash } from '../../lib/format'

/**
 * The commitment hash as a first-class trust artifact: monospace, signal-tinted,
 * copyable. This is what makes a sealed call auditable — show it proudly.
 */
export function HashChip({
  hash,
  full = false,
  label = 'commitment hash',
}: {
  hash: string
  full?: boolean
  label?: string
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hash)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-line bg-[#06090b] px-2 py-1">
      <code className={`hp-hash text-[11px] text-signal/90 ${full ? '' : 'truncate'}`}>
        {full ? hash : truncHash(hash)}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="hp-label shrink-0 rounded px-1.5 py-0.5 text-[9px] text-ink-faint transition hover:text-ink"
      >
        {copied ? '✓ copied' : 'copy'}
      </button>
    </span>
  )
}
