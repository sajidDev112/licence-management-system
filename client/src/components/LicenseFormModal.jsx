import { useEffect, useMemo, useState } from 'react'

import Modal from './Modal'
import LicenseKey from './LicenseKey'
import StatusSelect from './StatusSelect'
import ShareLicenseModal from './ShareLicenseModal'
import DatePicker from './DatePicker'
import { DURATIONS, formatDate, previewExpiry, toDateInput } from '../services/format'

const today = () => new Date().toISOString().slice(0, 10)

const EMPTY = {
  clientName: '',
  clientUserId: '',
  productName: '',
  soldBy: '',
  duration: '1_year',
  startDate: today(),
  expiryDate: '',
}

const sameName = (a, b) =>
  String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

/**
 * The POC account a license should be filed under, given the accounts whose
 * name matches what was typed.
 *
 * One match is that POC. Several need the admin's pick, which `chosen` holds.
 * None means a new POC — or, when editing, a rename that keeps the license's
 * existing link.
 */
function resolvePocLink(accounts, chosen, editing) {
  if (accounts.length === 1) return accounts[0].username
  if (accounts.length > 1) {
    return accounts.some((a) => sameName(a.username, chosen)) ? chosen : ''
  }
  return editing?.clientUserId || ''
}

function validateForm(values) {
  const errors = {}
  if (!values.clientName.trim()) errors.clientName = 'POC name is required'
  if (!values.productName.trim()) errors.productName = 'Product name is required'
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
    setDeactivated(Boolean(license?.deactivated))
    setValues(
      license
        ? {
            clientName: license.clientName || '',
            clientUserId: license.clientUserId || '',
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

  // For a preset duration the expiry is derived; the field becomes read-only.
  const computedExpiry = useMemo(
    () => previewExpiry(values.startDate, values.duration),
    [values.startDate, values.duration]
  )
  const isCustom = values.duration === 'custom'
  const shownExpiry = isCustom ? values.expiryDate : computedExpiry

  // A POC is one person with many licenses. Typing an existing POC's name
  // links the license to that POC's account, so the Clients page keeps one row
  // for them and their product login sees the new license.
  const pocNames = useMemo(
    () => [...new Set(clients.map((c) => c.clientName).filter(Boolean))].sort(),
    [clients]
  )
  const pocAccounts = useMemo(
    () =>
      clients.filter(
        (c) => c.hasLogin && c.username && sameName(c.clientName, values.clientName)
      ),
    [clients, values.clientName]
  )
  const linkedUserId = resolvePocLink(pocAccounts, values.clientUserId, isEdit ? license : null)
  const linkedAccount = pocAccounts.find((c) => sameName(c.username, linkedUserId))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const found = validateForm(values)
    if (!found.clientName && pocAccounts.length > 1 && !linkedUserId) {
      found.clientName = 'More than one POC has this name — choose which one'
    }
    setErrors(found)
    if (Object.keys(found).length) return

    setSubmitting(true)
    try {
      await onSubmit(
        {
          clientName: values.clientName.trim(),
          // The existing POC account this license belongs to, when there is one.
          // A brand-new POC has none until a login is set up for them.
          ...(linkedUserId ? { clientUserId: linkedUserId } : {}),
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
              POC Name <span className="text-red-500">*</span>
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
              onChange={(e) => setField('clientName', e.target.value)}
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
                value={linkedUserId}
                onChange={(e) => {
                  setField('clientUserId', e.target.value)
                  setErrors((prev) => ({ ...prev, clientName: undefined }))
                }}
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
              (linkedAccount && pocAccounts.length === 1 ? (
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                  Existing POC ·{' '}
                  {[linkedAccount.companyName, linkedAccount.username].filter(Boolean).join(' · ')}
                </p>
              ) : !isEdit && values.clientName.trim() && !pocAccounts.length ? (
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

          <div className="sm:col-span-2">
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
