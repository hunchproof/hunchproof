import { Outlet } from 'react-router-dom'
import { TopBar } from './components/layout/TopBar'
import { ErrorBoundary } from './components/layout/ErrorBoundary'
import { SCHEME } from './config'

export default function App() {
  return (
    <ErrorBoundary>
      <a
        href="#main"
        className="sr-only rounded bg-signal px-3 py-2 text-[12px] font-semibold text-[#04130d] focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50"
      >
        Skip to content
      </a>
      <TopBar />
      <main id="main" className="relative z-[1] mx-auto max-w-shell px-[22px] pb-24 pt-8">
        <Outlet />
      </main>
      <Footer />
    </ErrorBoundary>
  )
}

function Footer() {
  return (
    <footer className="relative z-[1] border-t border-line/70 py-7 text-[11px] leading-relaxed text-ink-faint">
      <div className="mx-auto flex max-w-shell flex-col gap-1 px-[22px]">
        <p>
          <b className="text-ink-dim">Hunchproof is a belief market, not a betting market.</b> You prove
          the quality of probabilistic foresight against the market’s closing line — you never stake money
          on outcomes.
        </p>
        <p className="text-ink-faint/80">
          Closing line is the bar · CLV is the metric · commitment binds, reveal verifies · scheme{' '}
          <span className="text-ink-dim">{SCHEME}</span>.
        </p>
      </div>
    </footer>
  )
}
