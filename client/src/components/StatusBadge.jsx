const STYLES = {
  active: {
    label: 'Active',
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  pending: {
    label: 'Pending',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  expired: {
    label: 'Expired',
    chip: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
    dot: 'bg-red-500',
  },
  deactivated: {
    label: 'Deactivated',
    chip: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    dot: 'bg-slate-500',
  },
}

/**
 * Status chip. With `onToggle` it becomes a button that asks to switch the
 * license off (or back on); without it, plain read-only text.
 */
export default function StatusBadge({ status, onToggle }) {
  const style = STYLES[status] || STYLES.expired
  const base = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style.chip}`
  const dot = <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />

  if (!onToggle) {
    return (
      <span className={base}>
        {dot}
        {style.label}
      </span>
    )
  }

  const deactivated = status === 'deactivated'
  const action = deactivated ? 'Reactivate this license' : 'Deactivate this license'

  return (
    <button
      type="button"
      onClick={onToggle}
      title={action}
      aria-label={`${style.label}. ${action}`}
      className={`${base} cursor-pointer transition hover:opacity-80 hover:ring-2 hover:ring-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:ring-slate-600`}
    >
      {dot}
      {style.label}
    </button>
  )
}
