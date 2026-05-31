import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink:          'rgb(var(--vs-ink) / <alpha-value>)',
        paper:        'rgb(var(--vs-paper) / <alpha-value>)',
        paper2:       'rgb(var(--vs-paper2) / <alpha-value>)',
        red:          'rgb(var(--vs-red) / <alpha-value>)',
        'red-dark':   'rgb(var(--vs-red-dark) / <alpha-value>)',
        gold:         'rgb(var(--vs-gold) / <alpha-value>)',
        muted:        'rgb(var(--vs-muted) / <alpha-value>)',
        border:       'rgb(var(--vs-border) / <alpha-value>)',
        'ok-bg':      'var(--vs-ok-bg)',
        'ok-fg':      'var(--vs-ok-fg)',
        'warn-bg':    'var(--vs-warn-bg)',
        'warn-fg':    'var(--vs-warn-fg)',
        'flag-bg':    'var(--vs-flag-bg)',
        'flag-fg':    'var(--vs-flag-fg)',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        mono:    ['"IBM Plex Mono"', 'monospace'],
        sans:    ['"IBM Plex Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
