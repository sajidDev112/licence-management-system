import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/*
 * A date field with its own calendar, replacing the browser's native one so it
 * matches the rest of the console in both themes.
 *
 * The value stays a plain 'YYYY-MM-DD' string, exactly what <input type="date">
 * produced, so nothing downstream had to change.
 *
 * All arithmetic goes through Date.UTC and the getUTC* readers. A local-time
 * Date would shift the day across a timezone boundary, which is how calendars
 * end up off by one.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const pad = (n) => String(n).padStart(2, '0')
const toKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`

/** 'YYYY-MM-DD' -> {y, m, d}, or null when absent or malformed. */
function parseKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const [, y, m, d] = match
  return { y: Number(y), m: Number(m) - 1, d: Number(d) }
}

function todayParts() {
  const now = new Date()
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() }
}

const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
const firstWeekday = (y, m) => new Date(Date.UTC(y, m, 1)).getUTCDay()

/** Days are compared as numbers so the result never depends on the clock. */
const ordinal = (p) => (p ? p.y * 10000 + p.m * 100 + p.d : null)

function CalendarIcon({ className = 'h-[18px] w-[18px]' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path strokeLinecap="round" d="M8 3v4M16 3v4M3 10h18" />
      <circle cx="8.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Chevron({ left }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
      <path strokeLinecap="round" strokeLinejoin="round" d={left ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
    </svg>
  )
}

export default function DatePicker({
  id,
  value,
  onChange,
  min,
  disabled = false,
  invalid = false,
  placeholder = 'Select a date',
}) {
  const selected = parseKey(value)
  const minParts = parseKey(min)
  const today = todayParts()

  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => selected || today)
  const [position, setPosition] = useState(null)

  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  // Reopening always lands on the selected month rather than wherever the user
  // last browsed to.
  useEffect(() => {
    if (open) setView(parseKey(value) || todayParts())
  }, [open, value])

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const height = 340
    // Flip above the field when there is not enough room below it.
    const below = window.innerHeight - rect.bottom
    const openUp = below < height && rect.top > below
    setPosition({
      left: Math.min(Math.max(8, rect.left), window.innerWidth - 310),
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      openUp,
      width: rect.width,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return undefined
    place()
    // The modal body scrolls, so the popover has to follow its field.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (popoverRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }
    // Escape closes the calendar first; the modal behind it stays open.
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const minOrdinal = ordinal(minParts)
  const isBlocked = (y, m, d) => minOrdinal !== null && ordinal({ y, m, d }) < minOrdinal

  const pick = (y, m, d) => {
    if (isBlocked(y, m, d)) return
    onChange(toKey(y, m, d))
    setOpen(false)
    triggerRef.current?.focus()
  }

  const shiftMonth = (by) => {
    const next = new Date(Date.UTC(view.y, view.m + by, 1))
    setView({ y: next.getUTCFullYear(), m: next.getUTCMonth(), d: 1 })
  }

  const label = selected
    ? `${pad(selected.d)} ${SHORT_MONTHS[selected.m]} ${selected.y}`
    : placeholder

  const total = daysInMonth(view.y, view.m)
  const lead = firstWeekday(view.y, view.m)
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ]

  const selectedOrdinal = ordinal(selected)
  const todayOrdinal = ordinal(today)

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`input flex items-center justify-between gap-2 text-left ${
          invalid ? 'border-red-400 dark:border-red-500' : ''
        } ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-indigo-400'} ${
          open ? 'border-indigo-500 ring-2 ring-indigo-100 dark:border-indigo-400 dark:ring-indigo-900/50' : ''
        }`}
      >
        <span className={selected ? '' : 'text-slate-400 dark:text-slate-500'}>{label}</span>
        <CalendarIcon
          className={`h-[18px] w-[18px] shrink-0 transition ${
            open ? 'text-indigo-700 dark:text-indigo-300' : 'text-indigo-600 dark:text-indigo-400'
          }`}
        />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Choose a date"
            style={{
              position: 'fixed',
              left: position.left,
              top: position.openUp ? undefined : position.top,
              bottom: position.openUp ? window.innerHeight - position.top : undefined,
              width: 296,
            }}
            className="z-[60] rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <Chevron left />
              </button>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {MONTHS[view.m]} {view.y}
              </p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <Chevron />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500"
                >
                  {w}
                </div>
              ))}

              {cells.map((day, i) => {
                if (day === null) return <div key={`pad-${i}`} />

                const cell = ordinal({ y: view.y, m: view.m, d: day })
                const isSelected = cell === selectedOrdinal
                const isToday = cell === todayOrdinal
                const blocked = isBlocked(view.y, view.m, day)

                return (
                  <button
                    key={day}
                    type="button"
                    disabled={blocked}
                    onClick={() => pick(view.y, view.m, day)}
                    aria-current={isToday ? 'date' : undefined}
                    className={`h-9 rounded-lg text-sm font-medium transition ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/30 hover:bg-indigo-500'
                        : blocked
                          ? 'cursor-not-allowed text-slate-300 dark:text-slate-700'
                          : isToday
                            ? 'text-indigo-600 ring-1 ring-inset ring-indigo-400 hover:bg-indigo-50 dark:text-indigo-300 dark:ring-indigo-500 dark:hover:bg-indigo-500/10'
                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
              <button
                type="button"
                onClick={() => pick(today.y, today.m, today.d)}
                disabled={isBlocked(today.y, today.m, today.d)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent dark:text-indigo-400 dark:hover:bg-indigo-500/10 dark:disabled:text-slate-600"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
