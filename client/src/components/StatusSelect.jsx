/*
 * The status control inside the License Details popup: a dropdown holding the
 * two states an admin can actually choose between.
 *
 * The table only displays the status now, so this is the one place it changes —
 * which keeps a stray click in a long list from cutting a client off.
 *
 * Expired and pending come from the dates, not from a switch, so the dropdown
 * is disabled there and simply states where the license stands.
 */

const TEXT = {
  active: 'text-emerald-600 dark:text-emerald-400',
  pending: 'text-amber-600 dark:text-amber-400',
  expired: 'text-red-600 dark:text-red-400',
  deactivated: 'text-red-600 dark:text-red-400',
}

/** Mid-weight shades, so they stay legible whichever way the OS paints the list. */
const OPTION_COLOUR = {
  active: '#10b981',
  pending: '#f59e0b',
  expired: '#ef4444',
  deactivated: '#ef4444',
}

const LABEL = {
  active: 'Active',
  pending: 'Pending',
  expired: 'Expired',
  deactivated: 'Deactive',
}

export default function StatusSelect({ status, onChange }) {
  const switchable = status === 'active' || status === 'deactivated'
  const disabled = !onChange || !switchable

  return (
    <select
      value={switchable ? status : 'current'}
      disabled={disabled}
      aria-label="License status"
      onChange={(e) => onChange(e.target.value === 'deactivated')}
      className={`input w-auto min-w-[9.5rem] cursor-pointer py-1.5 text-sm font-semibold ${
        TEXT[status] || TEXT.expired
      } ${disabled ? 'cursor-not-allowed opacity-80' : ''}`}
    >
      {/* The open list is drawn by the OS, which ignores Tailwind classes — so
          each option carries its colour inline. These two read on both the
          light and dark list backgrounds the browser may use. */}
      {switchable ? (
        <>
          <option value="active" style={{ color: OPTION_COLOUR.active }}>
            Active
          </option>
          <option value="deactivated" style={{ color: OPTION_COLOUR.deactivated }}>
            Deactive
          </option>
        </>
      ) : (
        <option value="current" style={{ color: OPTION_COLOUR[status] || OPTION_COLOUR.expired }}>
          {LABEL[status] || LABEL.expired}
        </option>
      )}
    </select>
  )
}
