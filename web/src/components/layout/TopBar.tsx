import { useEffect, useRef, useState } from 'react'
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
  const [open, setOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)

  // mobile sheet: close on Escape or a tap outside the header
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <header
      ref={headerRef}
      className="glass-nav sticky top-0 z-20 border-b border-line/60 px-3 sm:px-[22px]"
    >
      <div className="mx-auto flex h-[62px] max-w-shell items-center gap-2 sm:gap-[22px]">
        <div className="whitespace-nowrap font-disp text-[18px] font-black tracking-[-0.02em] sm:text-[21px]">
          Hunchproof<span className="text-signal">.</span>
        </div>

        {/* desktop horizontal tabs — unchanged at ≥sm; collapsed into the sheet below sm */}
        <nav className="hidden flex-1 gap-1 overflow-x-auto sm:flex" aria-label="Primary">
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

        {/* keeps the badge + toggle right-aligned on mobile (the desktop nav's flex-1 does this at ≥sm) */}
        <span className="flex-1 sm:hidden" aria-hidden />

        <div className="hidden md:block">
          <Countdown targetMs={slate?.lockMs ?? null} />
        </div>
        <ConnBadge />

        {/* mobile menu toggle */}
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-dim transition hover:text-ink sm:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="app-mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M2.5 5h13M2.5 9h13M2.5 13h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* mobile dropdown sheet (≥sm never renders it; desktop header is untouched) */}
      {open && (
        <nav
          id="app-mobile-nav"
          aria-label="Primary"
          className="absolute left-0 right-0 top-full z-30 border-b border-line bg-bg/95 px-4 pb-3 pt-1 shadow-2xl shadow-black/40 backdrop-blur-xl sm:hidden"
        >
          {tabs.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `hp-label block rounded-lg px-3 py-3 text-[13px] transition ${
                  isActive ? 'bg-signal/[0.07] text-signal' : 'text-ink-dim hover:text-ink'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
          <div className="mt-1 border-t border-line/60 px-3 pt-3">
            <Countdown targetMs={slate?.lockMs ?? null} />
          </div>
        </nav>
      )}
    </header>
  )
}
