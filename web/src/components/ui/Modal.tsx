import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Accessible modal: backdrop, focus trap, Escape to close, scroll lock, focus restore. */
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
  dismissable = true,
}: {
  open: boolean
  onClose: () => void
  labelledBy: string
  children: ReactNode
  dismissable?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prevActive = document.activeElement as HTMLElement | null
    const node = ref.current
    // focus the dialog itself first
    node?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        onClose()
        return
      }
      if (e.key === 'Tab' && node) {
        const f = node.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])',
        )
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          last.focus()
          e.preventDefault()
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus()
          e.preventDefault()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      prevActive?.focus?.()
    }
  }, [open, onClose, dismissable])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden
        onClick={dismissable ? onClose : undefined}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="glass-panel relative z-10 max-h-[90vh] w-full max-w-[560px] animate-rise overflow-y-auto rounded-t-panel p-5 outline-none sm:rounded-panel sm:p-6"
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
