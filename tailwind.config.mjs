/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./client/index.html', './client/src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // 500 is the brand colour exactly; the rest are lighter and darker
        // steps of it, for hover, focus rings and tints.
        brand: {
          50: '#EDFAFC',
          100: '#D3F3F7',
          200: '#A9E7EE',
          300: '#8ADCE4',
          400: '#6DD2DC',
          500: '#50C7D4',
          600: '#2FAEBC',
          700: '#26919C',
          800: '#1F757E',
          900: '#1A5F67',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
