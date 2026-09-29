import { useState } from 'react'

/** Monospace license key with a one-click copy affordance. */
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
        className={`font-sans text-[10px] font-medium ${
          copied ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
        }`}
      >
        {copied ? 'Copied' : 'Copy'}
      </span>
      )}
    </button>
  )
}
