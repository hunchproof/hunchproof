export type Status = 'sealed' | 'locked' | 'revealed' | 'scored' | 'verified' | 'failed'

const map: Record<Status, string> = {
  sealed: 'text-home bg-home/10',
  locked: 'text-away bg-away/10',
  revealed: 'text-signal bg-signal/10',
  scored: 'text-violet bg-violet/[0.12]',
  verified: 'text-signal bg-signal/10',
  failed: 'text-bad bg-bad/[0.12]',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`hp-label whitespace-nowrap rounded-[5px] px-2 py-0.5 text-[9.5px] ${map[status]}`}
    >
      {status}
    </span>
  )
}
