import { useEffect, useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { HashChip } from '../ui/HashChip'
import { SealedReceipt } from './SealedReceipt'
import { commitmentHash, quantizePermille, randSalt } from '../../lib/commitment'
import { IS_LIVE } from '../../config'
import { api, ApiError } from '../../api/client'
import type { SealRecord, SlateMatch, Triple } from '../../api/types'

export interface Pick {
  match: SlateMatch
  pct: Triple
}
type Step = 'idle' | 'hashing' | 'posting' | 'sealed' | 'error'
type RowStatus = 'pending' | 'hashing' | 'hashed' | 'posting' | 'sealed' | 'failed'
interface Row {
  matchId: number
  home: string
  away: string
  status: RowStatus
  hash?: string
  error?: string
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function SealCeremony({
  open,
  onClose,
  picks,
  userId,
  slateId,
  onComplete,
}: {
  open: boolean
  onClose: () => void
  picks: Pick[]
  userId: string
  slateId: string
  onComplete: (records: SealRecord[]) => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [step, setStep] = useState<Step>('idle')
  const [records, setRecords] = useState<SealRecord[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (!open) {
      started.current = false
      setRows([])
      setStep('idle')
      setRecords([])
      setErrorMsg(null)
      return
    }
    if (started.current) return // guard StrictMode double-invoke / re-renders
    started.current = true
    void run([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Hash every pick once (new salts). Returns the immutable record set.
  async function hashAll(): Promise<SealRecord[]> {
    setStep('hashing')
    setRows(picks.map((p) => ({ matchId: p.match.id, home: p.match.home, away: p.match.away, status: 'pending' })))
    const recs: SealRecord[] = []
    for (let i = 0; i < picks.length; i++) {
      const { match, pct } = picks[i]
      setRows((r) => r.map((x, idx) => (idx === i ? { ...x, status: 'hashing' } : x)))
      await delay(180) // let the "forming" animation breathe — this is the signature moment
      const permille = quantizePermille(pct[0], pct[1], pct[2])
      const salt = randSalt()
      const hash = await commitmentHash(match.id, permille, salt)
      recs.push({
        matchId: match.id,
        home: match.home,
        away: match.away,
        homeCode: match.homeCode,
        awayCode: match.awayCode,
        competition: match.competition,
        permille,
        salt,
        commitmentHash: hash,
        qSubmit: match.market,
        submittedAt: new Date().toISOString(),
        slateId,
        lockMs: match.lockMs,
      })
      setRows((r) => r.map((x, idx) => (idx === i ? { ...x, status: 'hashed', hash } : x)))
      await delay(70)
    }
    setRecords(recs)
    return recs
  }

  // Post all commitments. A 409 "already committed" is treated as idempotent success so a
  // RETRY (which reuses the SAME salts/hashes) never double-fails on commits that landed.
  async function postAll(recs: SealRecord[]): Promise<string[]> {
    const fails: string[] = []
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i]
      setRows((rw) => rw.map((x, idx) => (idx === i ? { ...x, status: 'posting' } : x)))
      try {
        await api.commit({ user_id: userId, match_id: r.matchId, commitment_hash: r.commitmentHash })
        setRows((rw) => rw.map((x, idx) => (idx === i ? { ...x, status: 'sealed' } : x)))
      } catch (e) {
        const isDup = e instanceof ApiError && e.status === 409 && /already committed/i.test(e.detail)
        if (isDup) {
          setRows((rw) => rw.map((x, idx) => (idx === i ? { ...x, status: 'sealed' } : x)))
          continue
        }
        const msg = e instanceof ApiError ? e.detail : 'network error'
        fails.push(`${r.home}–${r.away}: ${msg}`)
        setRows((rw) => rw.map((x, idx) => (idx === i ? { ...x, status: 'failed', error: msg } : x)))
      }
    }
    return fails
  }

  async function run(existing: SealRecord[]) {
    setErrorMsg(null)
    let recs = existing.length ? existing : records
    if (!recs.length) {
      recs = await hashAll()
    } else {
      setRows(recs.map((r) => ({ matchId: r.matchId, home: r.home, away: r.away, status: 'hashed', hash: r.commitmentHash })))
    }
    if (IS_LIVE) {
      setStep('posting')
      const fails = await postAll(recs)
      if (fails.length) {
        setErrorMsg(`The server rejected ${fails.length} commitment(s) — nothing was sealed locally. ${fails[0]}`)
        setStep('error')
        return
      }
    } else {
      setRows((rw) => rw.map((x) => ({ ...x, status: 'sealed' })))
    }
    onComplete(recs)
    setStep('sealed')
  }

  const dismissable = step === 'sealed' || step === 'error'

  return (
    <Modal open={open} onClose={onClose} labelledBy="seal-title" dismissable={dismissable}>
      <h2 id="seal-title" className="font-disp text-[20px] font-semibold">
        {step === 'sealed' ? 'Slate sealed' : 'Sealing your slate'}
      </h2>
      {step !== 'sealed' && (
        <p className="mt-1 text-[12px] text-ink-dim">
          Each pick is quantized to permille, mixed with a private 256-bit salt, and hashed (SHA-256).{' '}
          {IS_LIVE
            ? 'The server stores only the hash and snapshots the market at receipt — your numbers stay sealed.'
            : 'In demo mode nothing leaves your browser.'}
        </p>
      )}

      {step !== 'sealed' && (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <CeremonyRow key={row.matchId} row={row} />
          ))}
        </ul>
      )}

      {step === 'error' && (
        <>
          <div role="alert" className="mt-4 rounded-lg border border-bad/50 bg-bad/[0.07] p-3 text-[12px] text-ink">
            {errorMsg}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => void run(records)}>Retry</Button>
          </div>
        </>
      )}

      {step === 'sealed' && (
        <div className="mt-3">
          <SealedReceipt records={records} />
          <div className="mt-4 flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function CeremonyRow({ row }: { row: Row }) {
  const dot =
    row.status === 'sealed'
      ? 'bg-signal'
      : row.status === 'failed'
        ? 'bg-bad'
        : row.status === 'pending'
          ? 'bg-line-2'
          : 'bg-away animate-pulseglow'
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-line bg-[#06090b] px-3 py-2">
      <span className="flex items-center gap-2.5 text-[12px]">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span className="font-semibold">
          {row.home} <span className="text-ink-faint">vs</span> {row.away}
        </span>
      </span>
      <span className="min-w-0 text-right">
        {row.status === 'hashing' && (
          <span className="hp-hash inline-block animate-pulseglow text-[11px] text-away">computing SHA-256…</span>
        )}
        {row.status === 'pending' && <span className="text-[11px] text-ink-faint">queued</span>}
        {row.status === 'posting' && <span className="text-[11px] text-away">sending to server…</span>}
        {(row.status === 'hashed' || row.status === 'sealed') && row.hash && (
          <HashChip hash={row.hash} label={`${row.home}–${row.away} commitment`} />
        )}
        {row.status === 'failed' && <span className="text-[11px] text-bad">{row.error || 'rejected'}</span>}
      </span>
    </li>
  )
}
