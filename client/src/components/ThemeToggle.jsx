import { useTheme } from '../context/ThemeContext'

const SUN =
  'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'
const MOON = 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z'

/** Compact icon button used in the sidebar and on the login screen. */
export default function ThemeToggle({ className = '' }) {
  const { isDark, toggle } = useTheme()

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white ${className}`}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d={isDark ? SUN : MOON} />
      </svg>
    </button>
  )
}

/**
 * Pill switch with the mode's icon inside the track, sitting opposite the knob.
 * Used on the Settings page and anywhere else the theme can be flipped.
 */
export function ThemePillSwitch({ className = '' }) {
  const { isDark, toggle } = useTheme()

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
      className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
        isDark ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
      } ${className}`}
    >
      {/* The icon stays on the side the knob is not occupying. In dark mode it
          sits on the indigo track so it is white; in light mode the track is
          neutral, so it takes the theme indigo to stay legible. */}
      <span
        className={`pointer-events-none absolute top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center transition-all ${
          isDark ? 'left-1 text-white' : 'right-1 text-indigo-600 dark:text-indigo-400'
        }`}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={isDark ? MOON : SUN} />
        </svg>
      </span>

      <span
        className={`pointer-events-none relative h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ${
          isDark ? 'translate-x-9' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
