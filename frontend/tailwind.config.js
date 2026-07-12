/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        brand: {
          50: '#fff8f0',
          100: '#ffeed9',
          200: '#ffd9b3',
          300: '#ffbd80',
          400: '#ff9842',
          500: '#ff6b00', // Industrial Cyber Orange
          600: '#e05800',
          700: '#b84500',
          800: '#943808',
          900: '#78300a',
        },
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          800: '#1c1f26',
          850: '#15181e',
          900: '#101217',
          950: '#0a0b0e', // Obsidian Matte Charcoal
        },
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-subtle': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'typing': 'typing 1.2s steps(3) infinite',
        'scanline': 'scanline 8s linear infinite',
      },
      keyframes: {
        typing: {
          '0%, 100%': { opacity: '0.2' },
          '50%': { opacity: '1' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(1000%)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
