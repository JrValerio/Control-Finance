/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html",
  "./src/**/*.{js,jsx,ts,tsx}",],
  theme: {
    extend: {
      maxWidth: {
        '700': '700px',
      },
      fontFamily: {
        title1: ['"Open Sans"', 'sans-serif'], 
        text1: ['"Open Sans"', 'sans-serif'],  
        sans: ['Inter', 'sans-serif'],
      },
      fontWeight: {
        bold: '700',
        semibold: '600',
        medium: '500',
        regular: '400',
      },
      colors: {
        'cf-bg-page':        'var(--cf-bg-page)',
        'cf-header-bg':      'var(--cf-header-bg)',
        'cf-surface':        'var(--cf-surface)',
        'cf-bg-subtle':      'var(--cf-bg-subtle)',
        'cf-text-primary':   'var(--cf-text-primary)',
        'cf-text-secondary': 'var(--cf-text-secondary)',
        'cf-border':         'var(--cf-border)',
        'cf-border-input':   'var(--cf-border-input)',
        brand: {
          1: '#6741D9',
          2: '#4C3299',
          3: '#F0ECFB',
        },
        ui: {
          100: '#212529',
          200: '#495057',
          300: '#ADB5BD',
          400: '#E9ECEF',
          500: '#F1F3F5',
          mode: '#FFFFFF',
        }
      }
    },
  },
  plugins: [],
}

