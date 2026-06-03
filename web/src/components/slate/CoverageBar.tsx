import { Button } from '../ui/Button'

export function CoverageBar({
  covered,
  total,
  sealed,
  locked,
  onSeal,
}: {
  covered: number
  total: number
  sealed: boolean
  locked: boolean
  onSeal: () => void
}) {
  const label = sealed ? '✓ Slate sealed' : locked ? 'Locked' : '⊟ Seal & commit slate'
  return (
    <div className="sticky bottom-0 z-[15] mt-3 bg-gradient-to-t from-bg from-[60%] to-transparent pb-1.5 pt-4">
      <div className="flex items-center gap-4 glass-panel rounded-panel px-[18px] py-3.5">
        <span className="text-[12px] text-ink-dim">
          coverage{' '}
          <b className="tnum text-signal">
            {covered}/{total}
          </b>{' '}
          · all matches required
        </span>
        <span className="flex-1" />
        <Button onClick={onSeal} disabled={sealed || locked || total === 0} aria-live="polite">
          {label}
        </Button>
      </div>
    </div>
  )
}
