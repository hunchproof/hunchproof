import { API_LABEL, IS_LIVE } from '../../config'

/** Connection indicator. Demo mode is clearly labeled "synthetic data". */
export function ConnBadge() {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-[11px] text-ink-dim" title={IS_LIVE ? 'Connected to a live backend' : 'No backend configured — synthetic demo data'}>
      <span
        aria-hidden
        className={`h-[7px] w-[7px] rounded-full ${
          IS_LIVE ? 'bg-signal shadow-[0_0_8px_rgb(var(--signal))]' : 'bg-away shadow-[0_0_8px_rgb(var(--away))]'
        }`}
      />
      {IS_LIVE ? <>live · {API_LABEL}</> : <>demo · synthetic data</>}
    </span>
  )
}
