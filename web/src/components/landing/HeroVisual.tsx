import { useEffect, useRef, type CSSProperties } from 'react'
import { CHART } from '../../lib/theme'

/**
 * The hero centerpiece — ONE idea, well composed: the H/D/A distribution measured
 * against the closing line. Three bold bars on a shared baseline (your sealed read),
 * one dashed closing-line profile drawn across them (the market), a quiet sealed
 * receipt caption. Entrance: bars grow loose→settle, a brief seal "lock" beat, the
 * closing line slides in. All motion is CSS keyframes (landing.css); this effect only
 * adds the pointer parallax + pauses when the tab is hidden. Decorative → aria-hidden.
 */
// CSS custom properties on `style` need an OBJECT (React rejects a string at runtime).
const v = (vars: Record<string, string | number>): CSSProperties => vars as unknown as CSSProperties

// One centered unit. viewBox 460×300, shared baseline at y=230, symmetric margins.
const BASE = 230
const BAR_W = 62
// your sealed read (H/D/A) — illustrative, on-brand shape, not real data
const BARS = [
  { x: 103, cx: 134, h: 171, fill: CHART.home, label: 'H', cls: 'h', delay: '0.45s' },
  { x: 199, cx: 230, h: 75, fill: CHART.draw, label: 'D', cls: 'd', delay: '0.6s' },
  { x: 295, cx: 326, h: 54, fill: CHART.away, label: 'A', cls: 'a', delay: '0.75s' },
]
// the market's closing line at each outcome (slightly different → visible deviation):
// H bar pokes ABOVE the line, D/A sit just below it.
const CLOSE_PTS: Array<[number, number]> = [
  [134, 71],
  [230, 149],
  [326, 170],
]
const CLOSE_PATH = `86,71 ${CLOSE_PTS.map(([x, y]) => `${x},${y}`).join(' ')} 374,170`

export function HeroVisual() {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    let tx = 0
    let ty = 0
    const apply = () => {
      raf = 0
      root.style.setProperty('--px', tx.toFixed(3))
      root.style.setProperty('--py', ty.toFixed(3))
    }
    const onMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect()
      tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1))
      ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1))
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const onLeave = () => {
      tx = 0
      ty = 0
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const onVis = () => root.classList.toggle('is-paused', document.hidden)

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('blur', onLeave)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('blur', onLeave)
      document.removeEventListener('visibilitychange', onVis)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <svg
      ref={ref}
      viewBox="0 0 460 300"
      className="hero-visual h-auto w-full max-w-[540px]"
      role="img"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* ---- the distribution: bold H/D/A bars on a shared baseline (your read) ---- */}
      <g className="hero-layer-mid">
        <line x1="88" y1={BASE} x2="372" y2={BASE} stroke={CHART.line2} strokeWidth="1" opacity="0.7" />

        <g className="hero-bars">
          {BARS.map((b) => (
            <rect
              key={b.cls}
              className="hero-bar"
              style={v({ '--bar-delay': b.delay })}
              x={b.x}
              y={BASE - b.h}
              width={BAR_W}
              height={b.h}
              rx="12"
              fill={b.fill}
              opacity="0.95"
            />
          ))}
        </g>

        {BARS.map((b, i) => (
          <text
            key={b.cls}
            className="hero-fade"
            style={v({ '--fade-delay': `${1.0 + i * 0.1}s` })}
            x={b.cx}
            y={249}
            textAnchor="middle"
            fontSize="12"
            fontFamily="'IBM Plex Mono', monospace"
            fill={CHART.inkDim}
            letterSpacing="0.08em"
          >
            {b.label}
          </text>
        ))}

        {/* sealed receipt — quiet, low emphasis; the commit-reveal motif, demoted */}
        <text
          className="seal-caption"
          x="230"
          y="274"
          textAnchor="middle"
          fontSize="9"
          fontFamily="'IBM Plex Mono', monospace"
          fill={CHART.signalDim}
          letterSpacing="0.12em"
        >
          sealed · PoF·v1 · c9e215…8142b309
        </text>
      </g>

      {/* ---- the closing line: one clean dashed profile the bars are measured against ---- */}
      <g className="hero-layer-front">
        <g className="closing-line">
          <polyline
            points={CLOSE_PATH}
            fill="none"
            stroke={CHART.signal}
            strokeWidth="1.5"
            strokeDasharray="5 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {CLOSE_PTS.map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="3" fill={CHART.signal} />
          ))}
          <text
            x="374"
            y="160"
            textAnchor="end"
            fontSize="9.5"
            fontFamily="'IBM Plex Mono', monospace"
            fill={CHART.signal}
            letterSpacing="0.12em"
          >
            closing line
          </text>
        </g>
      </g>
    </svg>
  )
}
