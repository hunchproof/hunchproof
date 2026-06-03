import { Component, type ReactNode } from 'react'
import { useRouteError } from 'react-router-dom'
import { Button } from '../ui/Button'

function FullError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-shell px-6 py-20 text-center">
      <h2 className="font-disp text-[22px] font-semibold text-ink">Something went off-script.</h2>
      <p className="mx-auto mt-2 max-w-[46ch] text-[12.5px] text-ink-dim">{message}</p>
      <Button variant="ghost" className="mt-5" onClick={() => window.location.assign('/slate')}>
        Back to the slate
      </Button>
    </div>
  )
}

/** App-level boundary (catches render errors in the tree). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  override render() {
    if (this.state.error) return <FullError message={this.state.error.message} />
    return this.props.children
  }
}

/** Router errorElement. */
export function RouteError() {
  const err = useRouteError() as { message?: string; statusText?: string } | undefined
  return <FullError message={err?.message || err?.statusText || 'Unknown routing error.'} />
}
