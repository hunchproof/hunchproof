/** Chart/SVG colors as real CSS colors (the design tokens are RGB *channels*, so SVG
 *  fills need rgb(var(--x)) rather than var(--x) directly). */
export const col = (name: string): string => `rgb(var(--${name}))`

export const CHART = {
  home: col('home'),
  draw: col('draw'),
  away: col('away'),
  signal: col('signal'),
  signalDim: col('signal-dim'),
  violet: col('violet'),
  bad: col('bad'),
  ink: col('ink'),
  inkDim: col('ink-dim'),
  inkFaint: col('ink-faint'),
  line: col('line'),
  line2: col('line-2'),
} as const
