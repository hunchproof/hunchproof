import type { TileVM, Tone } from '../../models'

const toneClass: Record<Tone, string> = {
  sig: 'text-signal',
  blue: 'text-home',
  warn: 'text-away',
  bad: 'text-bad',
  violet: 'text-violet',
  plain: 'text-ink',
}

export function Tile({ t }: { t: TileVM }) {
  return (
    <div className="glass-panel rounded-tile p-[14px]">
      <div className={`tnum font-disp text-[24px] font-semibold leading-none ${toneClass[t.tone]}`}>
        {t.value}
      </div>
      <div className="mt-2 text-[10px] leading-[1.4] text-ink-faint">
        {t.label}
        <br />
        <span className="text-[#454e58]">{t.sub}</span>
      </div>
    </div>
  )
}

export function TileGrid({ tiles }: { tiles: TileVM[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t, i) => (
        <Tile key={i} t={t} />
      ))}
    </div>
  )
}
