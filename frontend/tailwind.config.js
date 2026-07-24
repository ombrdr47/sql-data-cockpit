/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        // Primary accent — violet/indigo
        accent: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        // Console surface — deep neutral
        surface: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          800: '#1e2028',
          850: '#181a22',
          900: '#13151c',
          950: '#0d0f14',
        },
        // Marketing surface — warm off-white
        neutral: {
          50:  '#FAFAF9',
          100: '#F5F5F4',
          200: '#E7E5E4',
          300: '#D6D3D1',
          400: '#A8A29E',
          500: '#78716C',
          600: '#57534E',
          700: '#44403C',
          800: '#292524',
          900: '#1C1917',
        },
      },
      boxShadow: {
        'glow-accent':  '0 0 24px rgba(99,102,241,0.30)',
        'glow-sm':      '0 0 12px rgba(99,102,241,0.20)',
        'glow-lg':      '0 0 48px rgba(99,102,241,0.25)',
        'glow-emerald': '0 0 16px rgba(52,211,153,0.25)',
        'glass':        '0 8px 32px rgba(0,0,0,0.36)',
        'card-float':   '0 20px 60px rgba(0,0,0,0.40)',
        'input-focus':  '0 0 0 3px rgba(99,102,241,0.25)',
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        'gradient-mesh':   'radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.10) 0%, transparent 50%)',
        'gradient-dark':   'linear-gradient(180deg, #0d0f14 0%, #111214 100%)',
        'shimmer':         'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
      },
      animation: {
        'spin-slow':     'spin 3s linear infinite',
        'pulse-subtle':  'pulse 2.5s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-up':       'fadeUp 0.5s ease-out forwards',
        'fade-in':       'fadeIn 0.3s ease-out forwards',
        'float':         'float 6s ease-in-out infinite',
        'shimmer':       'shimmer 2s linear infinite',
        'slide-in-right': 'slideInRight 0.3s ease-out forwards',
        'slide-up':      'slideUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards',
        'glow-pulse':    'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        slideInRight: {
          '0%':   { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(99,102,241,0.2)' },
          '50%':      { boxShadow: '0 0 40px rgba(99,102,241,0.4)' },
        },
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      screens: {
        'xs': '390px',
      },
    },
  },
  plugins: [],
}
