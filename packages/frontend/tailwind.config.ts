import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'InterVariable', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        // Gama violeta de la marca (landing). 950 = theme-color del sitio.
        marca: {
          950: '#2a1240',
          900: '#2e1065',
          800: '#3b1a8a',
          700: '#5b21b6',
          600: '#6d3ff2',
          500: '#8b5cf6',
          300: '#c4b5fd',
          100: '#efe9ff',
          fondo: '#f5f2ff',
          banda: '#ece7ff',
          linea: '#e4defa',
          tinta: '#1b1233',
          suave: '#5b5675',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 2px 4px 0 rgb(15 23 42 / 0.06), 0 4px 12px 0 rgb(15 23 42 / 0.08)',
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
