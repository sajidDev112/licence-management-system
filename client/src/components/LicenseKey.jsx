import { useState } from 'react'

/** Monospace license key with a one-click copy button. */
export default function LicenseKey({ value, onCopied, size = 'sm', showLabel = true }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // The Clipboard API needs a secure context; fall back to a temp textarea.
      const el = document.createElement('textarea')
      el.value = value
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    onCopied?.()
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Click to copy"
      className={`inline-flex items-center gap-1.5 rounded-md font-mono font-semibold text-slate-700 transition dark:text-slate-200 ${
        size === 'lg'
          ? 'bg-white/70 px-3 py-1.5 text-base tracking-wider text-emerald-900 hover:bg-white dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20'
          : 'bg-slate-100 px-2 py-1 text-[11px] hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
      }`}
    >
      {value}
      {showLabel && (
        <span
          className={`shrink-0 transition ${
            copied ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
          }`}
          aria-hidden="true"
        >
          {copied ? (
            // A tick for the moment after copying, so the button still says
            // something happened now that the word "Copied" is gone.
            <svg
              className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            // Two overlapping sheets: the back one is drawn as an open path so
            // the front one sits over it rather than crossing its outline.
            <svg
              className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.9"
            >
              <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.6" />
              <path
                strokeLinecap="round"
                d="M15.5 8.5V6.6A2.6 2.6 0 0 0 12.9 4H6.6A2.6 2.6 0 0 0 4 6.6v6.3A2.6 2.6 0 0 0 6.6 15.5H8.5"
              />
            </svg>
          )}
        </span>
      )}
    </button>
  )
}
