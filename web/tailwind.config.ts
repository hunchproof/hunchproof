import type { Config } from 'tailwindcss'

// Colors are exposed as space-separated RGB channels in src/index.css (:root),
// referenced here through `rgb(var(--x) / <alpha-value>)` so Tailwind opacity
// modifiers (e.g. bg-signal/10, text-ink-dim/70) work. Palette mirrors the
// original hunchproof_app.html design tokens exactly.
const ch = (v: string) => `rgb(var(${v}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: ch('--bg'),
        panel: ch('--panel'),
        'panel-2': ch('--panel-2'),
        'panel-3': ch('--panel-3'),
        line: ch('--line'),
        'line-2': ch('--line-2'),
        ink: ch('--ink'),
        'ink-dim': ch('--ink-dim'),
        'ink-faint': ch('--ink-faint'),
        signal: ch('--signal'),
        'signal-dim': ch('--signal-dim'),
        home: ch('--home'),
        draw: ch('--draw'),
        away: ch('--away'),
        bad: ch('--bad'),
        violet: ch('--violet'),
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'monospace'],
        disp: ['Fraunces', 'Georgia', 'serif'],
      },
      maxWidth: { shell: '1080px' },
      // One radius scale, applied uniformly (Apple "continuous corner" feel):
      // panel = all cards/panels/modal/match-card; tile = stat tiles + callouts;
      // inner = gate cards / empty / error blocks; pills stay rounded-full.
      borderRadius: {
        panel: '1.375rem',
        tile: '1rem',
        inner: '0.625rem',
      },
      keyframes: {
        fade: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'none' },
        },
        toastin: {
          from: { opacity: '0', transform: 'translateX(-50%) translateY(80px)' },
          to: { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
        },
        scan: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 -200%' },
        },
        pulseglow: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        fade: 'fade .4s ease',
        rise: 'rise .5s ease backwards',
        toastin: 'toastin .3s ease',
        scan: 'scan 1.1s linear infinite',
        pulseglow: 'pulseglow 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
