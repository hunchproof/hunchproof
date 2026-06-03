import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { HashChip } from '../ui/HashChip'
import { commitmentHash } from '../../lib/commitment'
import { IS_LIVE } from '../../config'
import { api, ApiError } from '../../api/client'
import { vault, type VaultEntry } from '../../hooks/useCommitVault'
import type { ApiRevealResponse } from '../../api/types'

type Phase = 'confirm' | 'verifying' | 'verified' | 'immutable' | 'failed'

/**
 * The real reveal flow. The client sends its stored permille + salt; the SERVER recomputes
 * the SHA-256 byte-for-byte and accepts only an exact match (it never trusts the client).
 *  - success            → server stores p/salt, marks revealed, scores if settled
 *  - 409 already-revealed → a fulfilled commitment is immutable (we surface, not error)
 *  - 400 mismatch        → rejected; NOTHING mutates server- or client-side
 * Demo mode verifies the hash locally (no server) and shows the same trust artifact.
 */
export function RevealDialog({
  open,
  onClose,
  entry,
  userId,
  onRevealed,
}: {
  open: boolean
  onClose: () => void
  entry: VaultEntry | null
  userId: string
  onRevealed: () => void
}) {
  const [phase, setPhase] = useState<Phase>('confirm')
  const [result, setResult] = useState<ApiRevealResponse | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [recomputed, setRecomputed] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPhase('confirm')
      setResult(null)
      setErrMsg(null)
      setRecomputed(null)
    }
  }, [open, entry?.matchId])

  if (!entry) return null
  const pctDist = entry.permille.map((x) => Math.round(x / 10))

  async function doReveal() {
    if (!entry) return
    setPhase('verifying')
    setErrMsg(null)
    // display-only client recompute (in live mode the server is the authority)
    const rc = await commitmentHash(entry.matchId, entry.permille, entry.salt)
    setRecomputed(rc)

    if (!IS_LIVE) {
      await new Promise((r) => setTimeout(r, 320))
      if (rc === entry.commitmentHash) {
        vault.markRevealed(userId, entry.matchId)
        setPhase('verified')
        onRevealed()
      } else {
        setErrMsg('Recomputed hash does not match the sealed commitment.')
        setPhase('failed')
      }
      return
    }

    try {
      const resp = await api.reveal({
        user_id: userId,
        match_id: entry.matchId,
        p: entry.permille,
        salt_hex: entry.salt,
      })
      setResult(resp)
      vault.markRevealed(userId, entry.matchId)
      setPhase('verified')
      onRevealed()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        if (/before lock/i.test(e.detail)) {
          setErrMsg(e.detail)
          setPhase('failed')
          return
        }
        // already revealed — fulfilled commitment is immutable
        vault.markRevealed(userId, entry.matchId)
        setPhase('immutable')
        onRevealed()
        return
      }
      setErrMsg(e instanceof ApiError ? e.detail : 'network error')
      setPhase('failed')
    }
  }

  const matchName = `${entry.home} vs ${entry.away}`
  const dismissable = phase !== 'verifying'

  return (
    <Modal open={open} onClose={onClose} labelledBy="reveal-title" dismissable={dismissable}>
      <h2 id="reveal-title" className="font-disp text-[20px] font-semibold">
        Reveal — {matchName}
      </h2>

      {phase === 'confirm' && (
        <>
          <p className="mt-1 text-[12px] text-ink-dim">
            Revealing sends your distribution and salt. The server recomputes the commitment hash
            byte-for-byte and accepts only an exact match — proof you never changed your call.
          </p>
          <dl className="mt-4 space-y-2 text-[12px]">
            <Row k="your distribution">
              <span className="tnum">{pctDist.join(' / ')} %</span>{' '}
              <span className="text-ink-faint">(permille {entry.permille.join('-')})</span>
            </Row>
            <Row k="salt">
              <code className="hp-hash text-[11px] text-ink-dim">{entry.salt.slice(0, 18)}…</code>
            </Row>
            <Row k="sealed commitment">
              <HashChip hash={entry.commitmentHash} label="sealed commitment" />
            </Row>
          </dl>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void doReveal()}>Reveal &amp; verify</Button>
          </div>
        </>
      )}

      {phase === 'verifying' && (
        <p className="mt-4 animate-pulseglow text-[13px] text-away">
          {IS_LIVE ? 'Server recomputing SHA-256…' : 'Recomputing SHA-256…'}
        </p>
      )}

      {(phase === 'verified' || phase === 'immutable') && (
        <div className="mt-3">
          <div className="flex items-center gap-2 text-signal">
            <span aria-hidden className="text-[18px]">
              ✓
            </span>
            <span className="font-disp text-[17px] font-semibold">
              {phase === 'immutable' ? 'Already revealed' : 'Verified — commitment matches byte-for-byte'}
            </span>
          </div>
          {phase === 'immutable' && (
            <p className="mt-1 text-[12px] text-ink-dim">
              A fulfilled commitment is immutable — it can’t be revealed again or altered.
            </p>
          )}
          <dl className="mt-3 space-y-2 text-[12px]">
            <Row k="committed">
              <HashChip hash={entry.commitmentHash} label="committed hash" />
            </Row>
            {recomputed && (
              <Row k="recomputed">
                <HashChip hash={recomputed} label="recomputed hash" />
              </Row>
            )}
          </dl>
          {result && result.rps != null ? (
            <div className="mt-3 rounded-lg border border-line bg-[#06090b] p-3 text-[12px]">
              <span className="text-ink-faint">RPS </span>
              <b className="tnum text-ink">{result.rps.toFixed(4)}</b>
              <span className="ml-2 text-ink-faint">
                · CLV vs the closing line is scored when the match settles.
              </span>
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-ink-faint">
              Scores (RPS, CLV vs the closing line) appear once the match settles.
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="mt-3">
          <div className="flex items-center gap-2 text-bad">
            <span aria-hidden className="text-[18px]">
              ✗
            </span>
            <span className="font-disp text-[17px] font-semibold">Reveal rejected</span>
          </div>
          <p role="alert" className="mt-1 text-[12px] text-ink-dim">
            {errMsg}
          </p>
          <p className="mt-2 text-[11px] text-ink-faint">
            Nothing was changed — a sealed commitment can only be fulfilled by an exact match.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => void doReveal()}>Try again</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <dt className="w-[140px] shrink-0 text-ink-faint">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}
