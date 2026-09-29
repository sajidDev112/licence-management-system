// Spelled out rather than using toLocaleDateString, which renders September as
// "Sept" in some locales and shifts with the viewer's locale.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "23 Sep 2027" — the format used across the tables. */
export function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  // UTC getters: periods are stored as whole UTC days, so a local-time render
  // would show the day either side of the one the admin actually picked.
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Value for an <input type="date">. */
export function toDateInput(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export function daysUntil(value) {
  if (!value) return null
  const diff = new Date(value).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

/**
 * Predefined license durations. These mirror server/utils/licenseDates.js —
 * the frontend only previews the expiry date; the backend computes the value
 * that is actually stored.
 */
export const DURATIONS = [
  { value: '1_month', label: '1 Month', months: 1 },
  { value: '3_months', label: '3 Months', months: 3 },
  { value: '6_months', label: '6 Months', months: 6 },
  { value: '1_year', label: '1 Year', months: 12 },
  { value: 'custom', label: 'Custom Date', months: null },
]

export function durationLabel(value) {
  return DURATIONS.find((d) => d.value === value)?.label || 'Custom Date'
}

/** Mirrors the backend's month arithmetic, clamping 31 Jan + 1 month to 28 Feb. */
export function addMonthsUtc(dateInput, months) {
  const base = new Date(`${dateInput}T00:00:00.000Z`)
  if (Number.isNaN(base.getTime())) return null

  const day = base.getUTCDate()
  const result = new Date(base.getTime())
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}

/** Expiry preview for a preset duration, as a yyyy-mm-dd string. */
export function previewExpiry(startDate, duration) {
  const preset = DURATIONS.find((d) => d.value === duration)
  if (!startDate || !preset || preset.months === null) return ''
  const end = addMonthsUtc(startDate, preset.months)
  return end ? end.toISOString().slice(0, 10) : ''
}
