/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: {
      xs:  '480px',   // compact phones (landscape or small)
      sm:  '640px',   // large phones / small tablets
      md:  '768px',   // tablets / small laptops
      lg:  '1024px',  // laptops
      xl:  '1280px',  // desktops
      '2xl': '1536px',
    },
    extend: {
      animation: {
        'star-movement-bottom': 'star-movement-bottom linear infinite alternate',
        'star-movement-top':    'star-movement-top    linear infinite alternate',
      },
      keyframes: {
        'star-movement-bottom': {
          '0%':   { transform: 'translate(0%, 0%)',    opacity: '1' },
          '100%': { transform: 'translate(-100%, 0%)', opacity: '0' },
        },
        'star-movement-top': {
          '0%':   { transform: 'translate(0%, 0%)',   opacity: '1' },
          '100%': { transform: 'translate(100%, 0%)', opacity: '0' },
        },
      },
      colors: {
        accent: 'var(--accent)',
        'accent-2': 'var(--accent-2)',
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        text: 'var(--text)',
        'text-dim': 'var(--text-dim)',
        'text-faint': 'var(--text-faint)',
        danger: 'var(--danger)',
        warn: 'var(--warn)',
        ok: 'var(--ok)',
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
