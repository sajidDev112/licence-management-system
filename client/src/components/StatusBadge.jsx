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
  // Red, matching the status dots in the details popup: a switched-off license
  // blocks a client just as firmly as an expired one.
  deactivated: {
    label: 'Deactive',
    chip: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
    dot: 'bg-red-500',
  },
}

/** Read-only status chip. Switching a license off is done from its details popup. */
export default function StatusBadge({ status }) {
  const style = STYLES[status] || STYLES.expired

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  )
}
