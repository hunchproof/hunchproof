import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  sm?: boolean
}

const variants: Record<Variant, string> = {
  primary:
    'bg-signal text-[#04130d] hover:brightness-110 active:translate-y-px disabled:bg-[#2a323b] disabled:text-ink-faint disabled:brightness-100',
  ghost:
    'bg-transparent text-ink-dim border border-line hover:text-ink hover:border-ink-faint disabled:opacity-50',
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', sm = false, className = '', type = 'button', ...rest },
  ref,
) {
  const base =
    'inline-flex items-center justify-center gap-2 font-mono font-semibold tracking-[0.02em] transition disabled:cursor-not-allowed'
  const size = sm ? 'rounded-[8px] px-[13px] py-[7px] text-[11.5px]' : 'rounded-[10px] px-5 py-3 text-[13px]'
  return (
    <button ref={ref} type={type} className={`${base} ${size} ${variants[variant]} ${className}`} {...rest} />
  )
})
