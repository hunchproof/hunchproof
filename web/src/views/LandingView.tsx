import { useEffect, useRef, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { HeroVisual } from '../components/landing/HeroVisual'
import './landing.css'

// CSS custom properties on `style` need an OBJECT (React rejects a string at runtime).
const v = (vars: Record<string, string | number>): CSSProperties => vars as unknown as CSSProperties

const STEPS = [
  {
    n: '01',
    title: 'Seal',
    body: 'Commit your Home / Draw / Away probabilities before kickoff. Each pick is hashed with a private salt and sealed (commit-reveal) — your numbers stay invisible until you reveal them.',
  },
  {
    n: '02',
    title: 'Score',
    body: 'After the match you’re measured against the market’s closing line — the sharpest public forecast — benchmarked to the line at your submit time. CLV, not the result.',
  },
  {
    n: '03',
    title: 'Prove',
    body: 'Every call is auditable and committed up front, so nothing is cherry-picked. Two separate scores build your record: calibration, and oracle weight — never merged.',
  },
]

export default function LandingView() {
  const { search } = useLocation()
  const appHref = `/slate${search}` // carry ?api=… so a live entry stays live
  const ambientRef = useRef<HTMLDivElement>(null)

  // pause the ambient drift when the tab is hidden (cheap when backgrounded)
  useEffect(() => {
    const el = ambientRef.current
    if (!el) return
    const onVis = () => el.classList.toggle('is-paused', document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return (
    <div className="relative overflow-hidden">
      <div ref={ambientRef} className="landing-ambient" aria-hidden />
      <div className="landing-grain" aria-hidden />

      <div className="relative z-[1] mx-auto max-w-[1120px] px-6">
        {/* hero fills the first viewport */}
        <div className="flex min-h-screen flex-col">
          <header className="flex items-center justify-between py-5">
            <div className="font-disp text-[20px] font-black tracking-[-0.02em]">
              Hunchproof<span className="text-signal">.</span>
            </div>
            <Link
              to={appHref}
              className="rounded-full px-3 py-1.5 text-[12.5px] text-ink-dim transition hover:text-ink"
            >
              Enter the app →
            </Link>
          </header>

          <main className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-4">
            {/* ---- copy ---- */}
            <div className="max-w-[36ch]">
              <p
                className="hero-rise mb-5 hp-label text-[11px] text-signal-dim"
                style={v({ '--rise-delay': '0.05s' })}
              >
                Belief market · not a betting market
              </p>

              <h1 className="font-disp text-[2.7rem] font-semibold leading-[1.03] tracking-[-0.02em] text-ink sm:text-[3.4rem] lg:text-[4rem]">
                {['Turn', 'your', 'hunch', 'into'].map((w, i) => (
                  <span
                    key={w}
                    className="hero-rise mr-[0.28em] inline-block"
                    style={v({ '--rise-delay': `${0.12 + i * 0.07}s` })}
                  >
                    {w}
                  </span>
                ))}
                <span
                  className="hero-rise inline-block text-signal"
                  style={v({ '--rise-delay': '0.4s' })}
                >
                  proof.
                </span>
              </h1>

              <p
                className="hero-rise mt-6 max-w-[46ch] text-[14.5px] leading-relaxed text-ink-dim"
                style={v({ '--rise-delay': '0.52s' })}
              >
                Seal your read on every match — Home, Draw, Away — before kickoff. It’s scored against
                the market’s closing line, not the result. You prove the quality of your foresight; you
                never stake money on outcomes.
              </p>

              <div
                className="hero-fade mt-8 flex flex-wrap items-center gap-4"
                style={v({ '--fade-delay': '0.75s' })}
              >
                <Link
                  to={appHref}
                  className="inline-flex items-center gap-2 rounded-full bg-signal px-6 py-3.5 font-mono text-[14px] font-semibold tracking-[0.01em] text-[#04130d] shadow-lg shadow-signal/20 transition hover:brightness-110 active:translate-y-px"
                >
                  Start predicting →
                </Link>
                <a
                  href="#how"
                  className="rounded-full px-3 py-2 text-[13px] text-ink-dim transition hover:text-ink"
                >
                  How it works
                </a>
              </div>
            </div>

            {/* ---- the animated hero visual ---- */}
            <div className="flex items-center justify-center lg:justify-end">
              <HeroVisual />
            </div>
          </main>
        </div>

        {/* ---- short, honest "how it works" strip ---- */}
        <section id="how" className="scroll-mt-8 border-t border-line/60 py-16">
          <h2 className="font-disp text-[22px] font-semibold text-ink">How it works</h2>
          <p className="mt-1 max-w-[60ch] text-[12.5px] text-ink-faint">
            Three steps, no cherry-picking — the closing line is the bar, CLV is the metric.
          </p>
          <div className="mt-7 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="glass-panel rounded-panel p-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-disp text-[17px] font-semibold text-ink">{s.title}</h3>
                  <span className="tnum text-[11px] text-ink-faint">{s.n}</span>
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- footer (keeps the boundary explicit) ---- */}
        <footer className="border-t border-line/60 py-8 text-[11px] leading-relaxed text-ink-faint">
          <p>
            <b className="text-ink-dim">Hunchproof is a belief market, not a betting market.</b> You prove
            the quality of probabilistic foresight against the market’s closing line — you never stake money
            on outcomes.
          </p>
          <p className="mt-3">
            <a
              href="mailto:frank@hunchproof.com"
              aria-label="Email Hunchproof"
              className="text-ink-faint transition hover:text-ink"
            >
              frank@hunchproof.com
            </a>
            <span aria-hidden className="px-2 text-ink-faint/50">
              ·
            </span>
            <a
              href="https://x.com/hunch_proof"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Hunchproof on X"
              className="text-ink-faint transition hover:text-ink"
            >
              @hunch_proof
            </a>
          </p>
        </footer>
      </div>
    </div>
  )
}
