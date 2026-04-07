/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#e8eef5',
          100: '#c5d5e8',
          200: '#9eb9d8',
          300: '#769dc8',
          400: '#4f81b8',
          500: '#2d6aa8',
          600: '#1E3A5F',
          700: '#163050',
          800: '#0F2A4A',
          900: '#081828',
          950: '#040e18',
        },
        accent: {
          50:  '#f0f4ff',
          100: '#dce8ff',
          200: '#b8d0ff',
          300: '#7aabff',
          400: '#4287f5',
          500: '#1D6FE8',
          600: '#1558C0',
          700: '#104296',
        },
        success: { 50: '#f0fdf4', 500: '#22c55e', 700: '#15803d' },
        warning: { 50: '#fffbeb', 500: '#f59e0b', 700: '#b45309' },
        danger:  { 50: '#fef2f2', 500: '#ef4444', 700: '#b91c1c' },
        tarja: {
          discipulo: { bg: '#EAF3DE', text: '#27500A', border: '#97C459' },
          nicodemos: { bg: '#FAEEDA', text: '#633806', border: '#E8A84C' },
          prodigo:   { bg: '#FCEBEB', text: '#791F1F', border: '#F09595' },
        },
        subdep: {
          louvor:   '#1D6FE8',
          regencia: '#7C3AED',
          ebd:      '#0E9F6E',
          recepcao: '#D97706',
          midia:    '#DB2777',
        }
      },
      fontFamily: {
        sans:    ['Sora', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      boxShadow: {
        'card':    '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-md': '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07)',
        'glow':    '0 0 20px -5px rgb(30 58 95 / 0.4)',
        'glow-sm': '0 0 10px -3px rgb(30 58 95 / 0.3)',
      },
      borderRadius: { '2.5xl': '1.25rem' },
      animation: {
        'fade-in':   'fadeIn 0.2s ease-out',
        'slide-up':  'slideUp 0.25s ease-out',
        'slide-down':'slideDown 0.2s ease-out',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:   { from: { opacity: '0' },                        to: { opacity: '1' } },
        slideUp:  { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideDown:{ from: { opacity: '0', transform: 'translateY(-6px)' },to: { opacity: '1', transform: 'translateY(0)' } },
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
      },
    },
  },
  plugins: [],
}
