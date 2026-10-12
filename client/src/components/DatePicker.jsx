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

/** `double` is the year step; a single chevron moves by one month. */
function Chevron({ left, double = false }) {
  const single = left ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'
  const pair = left ? 'M18 19l-7-7 7-7M11 19l-7-7 7-7' : 'M6 5l7 7-7 7M13 5l7 7-7 7'
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
      <path strokeLinecap="round" strokeLinejoin="round" d={double ? pair : single} />
    </svg>
  )
}

const navButton =
  'rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'

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
  // The header doubles as a year picker: a license can run years out, and
  // stepping there a month at a time is not realistic.
  const [pickingYear, setPickingYear] = useState(false)
  const [position, setPosition] = useState(null)

  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  // Reopening always lands on the selected month rather than wherever the user
  // last browsed to.
  useEffect(() => {
    if (!open) return
    setView(parseKey(value) || todayParts())
    setPickingYear(false)
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

  const shiftYear = (by) => setView((v) => ({ ...v, y: v.y + by }))

  // A 12-year grid, with the viewed year in the second row so there is room
  // both before and after it.
  const yearGridStart = view.y - 4

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
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => (pickingYear ? shiftYear(-12) : shiftYear(-1))}
                  aria-label={pickingYear ? 'Earlier years' : 'Previous year'}
                  className={navButton}
                >
                  <Chevron left double />
                </button>
                {!pickingYear && (
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous month"
                    className={navButton}
                  >
                    <Chevron left />
                  </button>
                )}
              </div>

              {/* Tapping the title switches to choosing a year outright. */}
              <button
                type="button"
                onClick={() => setPickingYear((v) => !v)}
                aria-label={pickingYear ? 'Back to days' : 'Choose a year'}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 dark:text-white dark:hover:bg-slate-800"
              >
                {pickingYear ? `${yearGridStart} – ${yearGridStart + 11}` : `${MONTHS[view.m]} ${view.y}`}
              </button>

              <div className="flex items-center">
                {!pickingYear && (
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    aria-label="Next month"
                    className={navButton}
                  >
                    <Chevron />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (pickingYear ? shiftYear(12) : shiftYear(1))}
                  aria-label={pickingYear ? 'Later years' : 'Next year'}
                  className={navButton}
                >
                  <Chevron double />
                </button>
              </div>
            </div>

            {pickingYear ? (
              <div className="grid grid-cols-3 gap-1">
                {Array.from({ length: 12 }, (_, i) => yearGridStart + i).map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => {
                      setView((v) => ({ ...v, y: year }))
                      setPickingYear(false)
                    }}
                    className={`h-10 rounded-lg text-sm font-medium transition ${
                      year === view.y
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/30 hover:bg-indigo-500'
                        : year === today.y
                          ? 'text-indigo-600 ring-1 ring-inset ring-indigo-400 hover:bg-indigo-50 dark:text-indigo-300 dark:ring-indigo-500 dark:hover:bg-indigo-500/10'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            ) : (
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
            )}

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
