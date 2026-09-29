const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
]

export default function TableToolbar({ search, onSearch, status, onStatus, placeholder }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="relative w-full sm:max-w-xs">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          type="search"
          className="input pl-9"
          placeholder={placeholder || 'Search by name, company, email or key'}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onStatus(f.value)}
            className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition sm:flex-none ${
              status === f.value ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}
