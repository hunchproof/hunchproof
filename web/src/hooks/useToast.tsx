import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type ToastKind = 'info' | 'success' | 'error'
interface ToastState {
  id: number
  message: string
  kind: ToastKind
}
interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void
}

const Ctx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    setState({ id: Date.now() + Math.random(), message, kind })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState(null), 3400)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <ToastHost state={state} />
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi['toast'] {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast must be used within <ToastProvider>')
  return c.toast
}

function ToastHost({ state }: { state: ToastState | null }) {
  if (!state) return null
  const border =
    state.kind === 'error'
      ? 'border-bad/70'
      : state.kind === 'success'
        ? 'border-signal/70'
        : 'border-signal-dim/60'
  return (
    <div
      key={state.id}
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 bottom-6 z-[60] -translate-x-1/2 animate-toastin rounded-[10px] border ${border} bg-panel-2 px-4 py-3 text-[12.5px] text-ink shadow-2xl shadow-black/40`}
    >
      {state.message}
    </div>
  )
}
