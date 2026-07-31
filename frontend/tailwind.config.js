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
      maxWidth: {
        'page': '1200px',
      },
      colors: {
        // Semantic landing-page tokens
        canvas:  '#FAFAF9',   // off-white marketing bg
        ink:     '#111214',   // near-black primary text / dark bg
        muted:   '#5B6270',   // secondary text
        ok:      '#15803d',   // success green (text)
        'ok-soft': '#dcfce7', // success green bg
        warn:    '#b45309',   // amber warning (text)
        'warn-soft': '#fef9c3', // amber bg
        line: {
          DEFAULT: '#e5e7eb', // hairline border
          strong:  '#d1d5db',
        },
        // Primary brand accent — clean saturated blue, used only on CTAs and active states
        accent: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',  // hover
          600: '#2563eb',  // primary CTA — THE brand blue
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        // Fixed status colors — never reuse brand blue for these
        status: {
          'success':   '#22c55e',  // green-500
          'warning':   '#f59e0b',  // amber-500
          'error':     '#ef4444',  // red-500
          'connected': '#22c55e',
          'untested':  '#f59e0b',
          'offline':   '#ef4444',
        },
        // App surface — deep neutral, not pure black, not cold blue
        surface: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          800: '#1e2028',
          850: '#181a1f',
          900: '#13151a',
          950: '#0f1117',  // main app bg
        },
        // Marketing/auth pages — warm off-white per UI.md spec
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
        // Only one glow — used exclusively on primary CTA/focus ring
        'cta':          '0 0 0 3px rgba(37,99,235,0.30)',
        'focus':        '0 0 0 3px rgba(37,99,235,0.25)',
        // Neutral shadows for panels/cards
        'glass':        '0 4px 24px rgba(0,0,0,0.28)',
        'card':         '0 1px 4px rgba(0,0,0,0.20)',
        'card-float':   '0 8px 32px rgba(0,0,0,0.32)',
        // Auth card shadow (light background)
        'card-light':   '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)',
        // Keep these but rarely used
        'glow-sm':      '0 0 12px rgba(37,99,235,0.20)',
        'glow-emerald': '0 0 12px rgba(34,197,94,0.25)',
      },
      animation: {
        'spin-slow':        'spin 3s linear infinite',
        'pulse-subtle':     'pulse 2.5s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-up':          'fadeUp 0.5s ease-out forwards',
        'fade-in':          'fadeIn 0.3s ease-out forwards',
        'float':            'float 6s ease-in-out infinite',
        'float-delayed':    'float 6s ease-in-out 1.5s infinite',
        'slide-in-right':   'slideInRight 0.3s ease-out forwards',
        'slide-in-left':    'slideInLeft 0.3s ease-out forwards',
        'slide-up':         'slideUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards',
        'pulse-dot':        'pulseDot 1.4s ease-in-out infinite',
        'blink':            'blink 1s step-end infinite',
        'gradient-pan':     'gradientPan 4s ease infinite',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
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
        slideInRight: {
          '0%':   { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%':   { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.3' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
        gradientPan: {
          '0%, 100%': { backgroundSize: '200% 200%', backgroundPosition: 'left center' },
          '50%':      { backgroundSize: '200% 200%', backgroundPosition: 'right center' },
        },
      },
      backdropBlur: {
        xs:    '2px',
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
