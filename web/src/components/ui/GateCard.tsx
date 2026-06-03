import type { GateVM } from '../../models'

export function GateCard({ gate }: { gate: GateVM }) {
  const border = gate.pending ? 'border-l-ink-faint' : gate.ok ? 'border-l-signal' : 'border-l-bad'
  const idColor = gate.pending ? 'text-ink-faint' : gate.ok ? 'text-signal' : 'text-bad'
  const badge = gate.pending
    ? { t: 'PENDING', c: 'bg-ink-faint text-bg' }
    : gate.ok
      ? { t: 'PASS', c: 'bg-signal text-[#04130d]' }
      : { t: 'FAIL', c: 'bg-bad text-white' }
  return (
    <div
      className={`flex items-start gap-3 rounded-inner border border-l-[3px] border-line ${border} bg-[#06090b] px-[13px] py-[11px]`}
    >
      <span className={`hp-label min-w-[20px] text-[11.5px] font-semibold ${idColor}`}>{gate.id}</span>
      <span className="text-[11px] text-ink">
        {gate.title}
        <span
          className={`hp-label ml-1.5 inline-block rounded-[4px] px-1.5 py-px text-[9px] font-semibold ${badge.c}`}
        >
          {badge.t}
        </span>
        <small className="mt-0.5 block text-[10px] leading-[1.45] text-ink-faint">{gate.detail}</small>
      </span>
    </div>
  )
}
