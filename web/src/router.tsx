import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import App from './App'
import { RouteError } from './components/layout/ErrorBoundary'
import { ViewLoading } from './components/ui/states'

// Route-level code splitting — landing + each view is its own chunk.
const LandingView = lazy(() => import('./views/LandingView'))
const SlateView = lazy(() => import('./views/SlateView'))
const PortfolioView = lazy(() => import('./views/PortfolioView'))
const LeaderboardsView = lazy(() => import('./views/LeaderboardsView'))
const OracleView = lazy(() => import('./views/OracleView'))

const lazyEl = (node: ReactNode) => <Suspense fallback={<ViewLoading />}>{node}</Suspense>
// Landing's own fallback: a bare dark field (the body bg already paints) — no app skeleton.
const lazyLanding = (node: ReactNode) => <Suspense fallback={<div className="min-h-dvh" />}>{node}</Suspense>

export const router = createBrowserRouter([
  // New front door. The app view paths below are UNCHANGED.
  { path: '/', element: lazyLanding(<LandingView />), errorElement: <RouteError /> },
  {
    // Pathless layout route: the product shell (TopBar + ConnBadge + Footer) wraps the views.
    element: <App />,
    errorElement: <RouteError />,
    children: [
      { path: 'slate', element: lazyEl(<SlateView />) },
      { path: 'portfolio', element: lazyEl(<PortfolioView />) },
      { path: 'leaderboards', element: lazyEl(<LeaderboardsView />) },
      { path: 'oracle', element: lazyEl(<OracleView />) },
    ],
  },
  // Unknown paths fall through to the app (preserves prior behavior).
  { path: '*', element: <Navigate to="/slate" replace /> },
])
