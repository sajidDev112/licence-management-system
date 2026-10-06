import { useCallback, useEffect, useMemo, useState } from 'react'

import Modal from './Modal'
import { useToast } from './Toast'
import { emailApi, licenseApi } from '../services/api'
import { formatDate } from '../services/format'

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

/** The message body the admin sends to the client. */
function buildMessage(license) {
  return [
    `Hello ${license.clientName},`,
    '',
    `Here is your license for ${license.productName}:`,
    '',
    `License Key: ${license.licenseKey}`,
    `Starts on:   ${formatDate(license.startDate)}`,
    `Expires on:  ${formatDate(license.expiryDate)}`,
    '',
    'Enter this key in the product to activate it.',
  ].join('\n')
}

/**
 * Picks recipients for a license and hands off to the admin's mail client.
 * Addresses come from Settings -> Email Configuration, and a new one can be
 * added here without leaving the page.
 */
export default function ShareLicenseModal({ open, license, onClose }) {
  const toast = useToast()

  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [sending, setSending] = useState(false)
  // null until known; true when the server can send email itself.
  const [canSend, setCanSend] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await emailApi.list()
      setEmails(list)
      return list
    } catch (err) {
      toast.error(err.message)
      return []
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!open) return
    setSearch('')
    setNewEmail('')
    setError('')
    // Nothing is ticked up front: which address a license goes to is a choice
    // made per license, not something the Settings default should decide.
    setSelected([])
    load()
    licenseApi.mailStatus().then(setCanSend).catch(() => setCanSend(false))
  }, [open, load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return emails
    return emails.filter(
      (e) => e.email.toLowerCase().includes(q) || (e.label || '').toLowerCase().includes(q)
    )
  }, [emails, search])

  const toggle = (email) =>
    setSelected((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]))

  const handleAdd = async () => {
    const value = newEmail.trim().toLowerCase()
    if (!value) return setError('Enter an email address')
    if (!isEmail(value)) return setError('Enter a valid email address')

    // Already configured: just tick it rather than erroring.
    if (emails.some((e) => e.email === value)) {
      setSelected((prev) => (prev.includes(value) ? prev : [...prev, value]))
      setNewEmail('')
      setError('')
      return undefined
    }

    setAdding(true)
    try {
      await emailApi.add({ email: value })
      await load()
      setSelected((prev) => [...prev, value])
      setNewEmail('')
      setError('')
      toast.success('Email added')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAdding(false)
    }
    return undefined
  }

  const copyDetails = async () => {
    const text = buildMessage(license)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    toast.success('License details copied')
  }

  const share = async () => {
    if (!selected.length) {
      setError('Select at least one recipient')
      return
    }

    setSending(true)
    try {
      const result = await licenseApi.share(license.id, selected)
      toast.success(result.message)
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSending(false)
    }
  }

  if (!license) return null

  return (
    <Modal open={open} title="Share License" onClose={onClose} maxWidth="max-w-lg">
      <div className="mb-4 rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
        <p className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">
          {license.licenseKey}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {license.clientName} · {license.productName} · expires{' '}
          {formatDate(license.expiryDate)}
        </p>
      </div>

      <div className="relative mb-3">
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
          placeholder="Search saved emails"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {emails.length
            ? 'No saved email matches that search.'
            : 'No emails saved yet. Add one below.'}
        </p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {visible.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                  checked={selected.includes(item.email)}
                  onChange={() => toggle(item.email)}
                />
                <span className="min-w-0 flex-1">
                  <span className="truncate text-sm text-slate-900 dark:text-white">
                    {item.email}
                  </span>
                  {item.label && (
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {item.label}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
        <label className="label" htmlFor="shareNewEmail">
          Add another email
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="shareNewEmail"
            type="email"
            className={`input ${error ? 'border-red-400' : ''}`}
            placeholder="client@example.com"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdd()
              }
            }}
          />
          <button type="button" className="btn-secondary shrink-0" onClick={handleAdd} disabled={adding}>
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
        {error && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Saved to your email list in Settings so it is there next time.
        </p>
        {canSend === false && (
          <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
            Email sending is not configured on the server, so this license cannot be
            sent. Add the SMTP settings to .env and restart the server.
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        {/* <button type="button" className="btn-secondary" onClick={copyDetails}>
          Copy details
        </button> */}
        <button
          type="button"
          className="btn-primary"
          onClick={share}
          disabled={sending || canSend === false}
        >
          {sending ? 'Sending...' : `Send Email${selected.length > 0 ? ` (${selected.length})` : ''}`}
        </button>
      </div>
    </Modal>
  )
}
