import { NavLink } from 'react-router-dom'
import { ConnBadge } from './ConnBadge'
import { Countdown } from './Countdown'
import { useSlate } from '../../api/queries'

const tabs: Array<[string, string]> = [
  ['/slate', 'Slate'],
  ['/portfolio', 'Portfolio'],
  ['/leaderboards', 'Leaderboards'],
  ['/oracle', 'Oracle'],
]

export function TopBar() {
  const { slate } = useSlate() // shares the React Query cache with SlateView (no extra fetch)
  return (
    <header className="glass-nav sticky top-0 z-20 border-b border-line/60 px-[22px]">
      <div className="mx-auto flex h-[62px] max-w-shell items-center gap-4 sm:gap-[22px]">
        <div className="whitespace-nowrap font-disp text-[21px] font-black tracking-[-0.02em]">
          Hunchproof<span className="text-signal">.</span>
        </div>
        <nav className="flex flex-1 gap-1 overflow-x-auto" aria-label="Primary">
          {tabs.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-[13px] py-2 text-[12.5px] tracking-[0.04em] transition ${
                  isActive ? 'bg-signal/[0.07] text-signal' : 'text-ink-faint hover:text-ink-dim'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden md:block">
          <Countdown targetMs={slate?.lockMs ?? null} />
        </div>
        <ConnBadge />
      </div>
    </header>
  )
}
