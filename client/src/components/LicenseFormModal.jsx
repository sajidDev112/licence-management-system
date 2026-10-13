import { useEffect, useMemo, useState } from 'react'

import Modal from './Modal'
import LicenseKey from './LicenseKey'
import StatusSelect from './StatusSelect'
import ShareLicenseModal from './ShareLicenseModal'
import DatePicker from './DatePicker'
import { DURATIONS, formatDate, previewExpiry, toDateInput } from '../services/format'

const today = () => new Date().toISOString().slice(0, 10)

const MIN_PASSWORD_LENGTH = 8

const EMPTY = {
  clientName: '',
  clientUserId: '',
  companyName: '',
  password: '',
  productName: '',
  soldBy: '',
  duration: '1_year',
  startDate: today(),
  expiryDate: '',
}

const sameName = (a, b) =>
  String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** POC accounts with a product login whose name matches `name`. */
const accountsNamed = (clients, name) =>
  clients.filter((c) => c.hasLogin && c.username && sameName(c.clientName, name))

/** The POC's sign-in fields, as an existing account fills them in. */
const POC_FIELDS = ['clientUserId', 'companyName', 'password']
const pocFieldsOf = (account) => ({
  clientUserId: account?.username || '',
  companyName: account?.companyName || '',
  password: account?.password || '',
})

function validateForm(values) {
  const errors = {}
  if (!values.clientName.trim()) errors.clientName = 'POC is required'
  if (!values.productName.trim()) errors.productName = 'Product name is required'
  const email = values.clientUserId.trim()
  if (!email) errors.clientUserId = 'Email is required'
  else if (!EMAIL_PATTERN.test(email)) errors.clientUserId = 'Enter a valid email address'
  if (!values.companyName.trim()) errors.companyName = 'Company is required'
  if (!values.password) errors.password = 'Password is required'
  else if (values.password.length < MIN_PASSWORD_LENGTH)
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  if (!values.soldBy.trim()) errors.soldBy = 'Sold by is required'
  if (!values.startDate) errors.startDate = 'Start date is required'

  if (values.duration === 'custom') {
    if (!values.expiryDate) errors.expiryDate = 'Expiry date is required'
    else if (values.startDate && values.expiryDate <= values.startDate)
      errors.expiryDate = 'Expiry date must be after the start date'
  }

  return errors
}

/**
 * Create / view / edit form for a license.
 *
 * In edit mode this is the popup opened by the View action: it shows the full
 * details and lets the admin change everything except the license key, which
 * clients already hold.
 */
export default function LicenseFormModal({
  open,
  license,
  products = [],
  clients = [],
  onClose,
  onSubmit,
}) {
  const isEdit = Boolean(license)
  const [values, setValues] = useState(EMPTY)
  // The status picked in the dropdown. Held here until Save Changes, so
  // choosing an option on its own changes nothing on the server.
  const [deactivated, setDeactivated] = useState(false)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setAutoFilled(pocFieldsOf(null))
    setDeactivated(Boolean(license?.deactivated))
    setValues(
      license
        ? {
            clientName: license.clientName || '',
            clientUserId: license.clientUserId || '',
            companyName: license.companyName || '',
            // Filled from the POC's account below, once the accounts are loaded.
            password: '',
            productName: license.productName || '',
            soldBy: license.soldBy || '',
            duration: license.duration || 'custom',
            startDate: toDateInput(license.startDate),
            expiryDate: toDateInput(license.expiryDate),
          }
        : { ...EMPTY, startDate: today() }
    )
  }, [open, license])

  const setField = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  // Picking an existing POC fills in their email, company and password. Each
  // field is only replaced while it is empty or still holds what was filled
  // in this way — never something the admin typed.
  const [autoFilled, setAutoFilled] = useState(pocFieldsOf(null))
  const fillFromAccount = (account, extra = {}) => {
    const next = pocFieldsOf(account)
    setValues((prev) => {
      const updates = { ...extra }
      POC_FIELDS.forEach((f) => {
        if (!prev[f].trim() || prev[f] === autoFilled[f]) updates[f] = next[f]
      })
      return { ...prev, ...updates }
    })
    setAutoFilled(next)
    setErrors((prev) => ({
      ...prev,
      clientName: undefined,
      clientUserId: undefined,
      companyName: undefined,
      password: undefined,
    }))
  }
  const setPocName = (name) => {
    const matches = accountsNamed(clients, name)
    fillFromAccount(matches.length === 1 ? matches[0] : null, { clientName: name })
  }

  // Editing: the password lives on the POC's account, not the license, and the
  // accounts may arrive after the form opens.
  useEffect(() => {
    if (!open || !license?.clientUserId) return
    const account = clients.find((c) => c.hasLogin && sameName(c.username, license.clientUserId))
    if (!account?.password) return
    setValues((prev) => (prev.password ? prev : { ...prev, password: account.password }))
  }, [open, license, clients])

  // For a preset duration the expiry is derived; the field becomes read-only.
  const computedExpiry = useMemo(
    () => previewExpiry(values.startDate, values.duration),
    [values.startDate, values.duration]
  )
  const isCustom = values.duration === 'custom'
  const shownExpiry = isCustom ? values.expiryDate : computedExpiry

  // A POC is one person with many licenses. The email links the license to
  // that POC's account, so their product login sees the new license.
  const pocNames = useMemo(
    () => [...new Set(clients.map((c) => c.clientName).filter(Boolean))].sort(),
    [clients]
  )
  const pocAccounts = useMemo(
    () => accountsNamed(clients, values.clientName),
    [clients, values.clientName]
  )
  const email = values.clientUserId.trim().toLowerCase()
  // Several POCs share this name: the picker below sets the email to one.
  const chosenAccount = pocAccounts.find((c) => sameName(c.username, email))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const found = validateForm(values)
    if (!found.clientName && pocAccounts.length > 1 && !email) {
      found.clientName = 'More than one POC has this name — choose which one'
    }
    setErrors(found)
    if (Object.keys(found).length) return

    setSubmitting(true)
    try {
      await onSubmit(
        {
          clientName: values.clientName.trim(),
          // The POC's sign-in for the product. The server saves these on the
          // POC's account and links the license to it by the email.
          clientUserId: email,
          companyName: values.companyName.trim(),
          password: values.password,
          productName: values.productName.trim(),
          soldBy: values.soldBy.trim(),
          duration: values.duration,
          startDate: values.startDate,
          // The backend recomputes this for presets; sending it keeps custom working.
          ...(isCustom ? { expiryDate: values.expiryDate } : {}),
        },
        // Status has its own endpoint, so it travels beside the fields.
        isEdit ? { deactivated } : undefined
      )
    } finally {
      setSubmitting(false)
    }
  }

  const fieldError = (name) =>
    errors[name] ? (
      <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{errors[name]}</p>
    ) : null

  return (
    <Modal
      open={open}
      title={
        isEdit ? (
          <span className="flex items-center gap-2">
            License Details
            {/* Reads as a button in its own right, not a bare glyph beside the
                title — sharing is an action, and it was easy to miss before. */}
            <button
              type="button"
              onClick={() => setSharing(true)}
              aria-label="Share this license"
              title="Share this license"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:bg-slate-700 dark:hover:text-indigo-300"
            >
              {/* A solid curved arrow — the forward/share mark. */}
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M13.4 2.4 L22.2 9.6 L13.4 16.8 V12.7 C8.9 12.7 5.6 14.9 3.6 19.3 L2.4 19 C2.4 11.3 7 6.9 13.4 6.6 Z" />
              </svg>
              Share
            </button>
          </span>
        ) : (
          'Create License'
        )
      }
      onClose={submitting ? () => {} : onClose}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} noValidate>
        {isEdit && (
          <div className="mb-5 flex flex-col gap-3 rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/60 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                License Key
              </p>
              <div className="mt-1.5">
                <LicenseKey value={license.licenseKey} />
              </div>
            </div>

            {/* Read-only: the machine claims the key itself on first use, and
                letting an admin retype it would defeat the one-machine lock. */}
            <div className="min-w-0 sm:px-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Machine No.
              </p>
              <p className="mt-1.5 text-sm">
                {license.machineNumber ? (
                  <span className="break-all font-mono text-slate-800 dark:text-slate-100">
                    {license.machineNumber}
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">Not claimed yet</span>
                )}
              </p>
            </div>

            <div className="flex shrink-0 justify-start sm:justify-end">
              {/* Expired and pending are not switchable, so the pending choice
                  only replaces the status shown when it is active/deactivated. */}
              <StatusSelect
                status={
                  license.status === 'active' || license.status === 'deactivated'
                    ? deactivated
                      ? 'deactivated'
                      : 'active'
                    : license.status
                }
                onChange={(next) => setDeactivated(next === 'deactivated')}
              />
              {/* <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Created {formatDate(license.createdAt)}
              </p> */}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="clientName">
              POC <span className="text-red-500">*</span>
            </label>
            {/* Typed, with existing POCs suggested: picking one files this
                license under that POC instead of starting a new one. */}
            <input
              id="clientName"
              className={`input ${errors.clientName ? 'border-red-400' : ''}`}
              placeholder="Name of the point of contact"
              list="poc-names"
              autoComplete="off"
              value={values.clientName}
              onChange={(e) => setPocName(e.target.value)}
            />
            <datalist id="poc-names">
              {pocNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {pocAccounts.length > 1 && (
              <select
                className="input mt-2"
                aria-label="Which POC"
                value={chosenAccount ? chosenAccount.username : ''}
                onChange={(e) =>
                  fillFromAccount(pocAccounts.find((c) => c.username === e.target.value))
                }
              >
                <option value="">Choose which {values.clientName.trim()}…</option>
                {pocAccounts.map((c) => (
                  <option key={c.username} value={c.username}>
                    {[c.companyName, c.username].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </select>
            )}
            {fieldError('clientName') ||
              (!isEdit && values.clientName.trim() && !pocAccounts.length ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">New POC</p>
              ) : null)}
          </div>

          <div>
            <label className="label" htmlFor="productName">
              Product Name <span className="text-red-500">*</span>
            </label>
            {/* Always a dropdown of the products on the Products page. It used
                to fall back to a free text box when the list came back empty,
                which silently turned a load failure into a typo waiting to
                happen — a license must name a product exactly. */}
            <select
              id="productName"
              className={`input ${errors.productName ? 'border-red-400' : ''}`}
              value={values.productName}
              onChange={(e) => setField('productName', e.target.value)}
              disabled={!products.length}
            >
              <option value="">{products.length ? 'Select a product' : 'No products yet'}</option>
              {/* An older license may name a product that has since been removed. */}
              {values.productName && !products.some((p) => p.name === values.productName) && (
                <option value={values.productName}>{values.productName}</option>
              )}
              {products.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            {fieldError('productName')}
            {!products.length && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                No products loaded. Add one on the Products page, or reload if the
                server was restarting.
              </p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="clientUserId">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="clientUserId"
              type="email"
              autoComplete="off"
              className={`input ${errors.clientUserId ? 'border-red-400' : ''}`}
              placeholder="Email of the point of contact"
              value={values.clientUserId}
              onChange={(e) => setField('clientUserId', e.target.value)}
            />
            {fieldError('clientUserId')}
          </div>

          <div>
            <label className="label" htmlFor="companyName">
              Company <span className="text-red-500">*</span>
            </label>
            <input
              id="companyName"
              autoComplete="off"
              className={`input ${errors.companyName ? 'border-red-400' : ''}`}
              placeholder="Company of the point of contact"
              value={values.companyName}
              onChange={(e) => setField('companyName', e.target.value)}
            />
            {fieldError('companyName')}
          </div>

          {/* Shown in plain text: the admin sets it
              and reads it back to the POC, who signs in to the product with it. */}
          <div>
            <label className="label" htmlFor="password">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              id="password"
              type="text"
              autoComplete="off"
              spellCheck="false"
              className={`input ${errors.password ? 'border-red-400' : ''}`}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              value={values.password}
              onChange={(e) => setField('password', e.target.value)}
            />
            {fieldError('password')}
          </div>

          <div>
            <label className="label" htmlFor="soldBy">
              Sold By <span className="text-red-500">*</span>
            </label>
            <input
              id="soldBy"
              className={`input ${errors.soldBy ? 'border-red-400' : ''}`}
              placeholder="Name of the person who sold this license"
              value={values.soldBy}
              onChange={(e) => setField('soldBy', e.target.value)}
            />
            {fieldError('soldBy')}
          </div>

          {/* Duration spans the row on its own; the two dates then pair up
              underneath it, which reads in the order they are filled in. */}
          <div className="sm:col-span-2">
            <label className="label" htmlFor="duration">
              License Duration <span className="text-red-500">*</span>
            </label>
            <select
              id="duration"
              className="input"
              value={values.duration}
              onChange={(e) => setField('duration', e.target.value)}
            >
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="startDate">
              Start Date <span className="text-red-500">*</span>
            </label>
            <DatePicker
              id="startDate"
              value={values.startDate}
              invalid={Boolean(errors.startDate)}
              onChange={(v) => setField('startDate', v)}
            />
            {fieldError('startDate')}
          </div>

          <div>
            <label className="label" htmlFor="expiryDate">
              Expiry Date {isCustom && <span className="text-red-500">*</span>}
            </label>
            <DatePicker
              id="expiryDate"
              value={shownExpiry}
              min={values.startDate || undefined}
              invalid={Boolean(errors.expiryDate)}
              disabled={!isCustom}
              onChange={(v) => setField('expiryDate', v)}
            />
            {fieldError('expiryDate')}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create License'}
          </button>
        </div>
      </form>

      {isEdit && (
        <ShareLicenseModal
          open={sharing}
          license={license}
          onClose={() => setSharing(false)}
        />
      )}
    </Modal>
  )
}
