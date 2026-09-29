import { useEffect, useMemo, useState } from 'react'

import Modal from './Modal'
import LicenseKey from './LicenseKey'
import StatusBadge from './StatusBadge'
import ShareLicenseModal from './ShareLicenseModal'
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

function validateForm(values) {
  const errors = {}
  if (!values.clientName.trim()) errors.clientName = 'Client name is required'
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
  onClose,
  onSubmit,
}) {
  const isEdit = Boolean(license)
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    const found = validateForm(values)
    setErrors(found)
    if (Object.keys(found).length) return

    setSubmitting(true)
    try {
      await onSubmit({
        clientName: values.clientName.trim(),
        // Only sent when the license already has one. It links the license to a
        // client account for the product login, and the form no longer asks for
        // it, so a new license simply has none.
        ...(values.clientUserId.trim() ? { clientUserId: values.clientUserId.trim() } : {}),
        productName: values.productName.trim(),
        soldBy: values.soldBy.trim(),
        duration: values.duration,
        startDate: values.startDate,
        // The backend recomputes this for presets; sending it keeps custom working.
        ...(isCustom ? { expiryDate: values.expiryDate } : {}),
      })
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
            <button
              type="button"
              onClick={() => setSharing(true)}
              aria-label="Share this license"
              title="Share this license"
              className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.684 13.342a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316M18 8a3 3 0 11-.001-5.999A3 3 0 0118 8zm0 13a3 3 0 11-.001-5.999A3 3 0 0118 21z"
                />
              </svg>
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
              {/* <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                The license key cannot be changed.
              </p> */}
            </div>
            <div className="text-left sm:text-right">
              <StatusBadge status={license.status} />
              {/* <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Created {formatDate(license.createdAt)}
              </p> */}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="clientName">
              Client Name <span className="text-red-500">*</span>
            </label>
            {/* Typed freely rather than picked from a list: this exact name is
                what the Licenses table and the Clients page show. */}
            <input
              id="clientName"
              className={`input ${errors.clientName ? 'border-red-400' : ''}`}
              placeholder="Name of the client"
              value={values.clientName}
              onChange={(e) => setField('clientName', e.target.value)}
            />
            {fieldError('clientName')}
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

          <div>
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
            <input
              id="startDate"
              type="date"
              className={`input ${errors.startDate ? 'border-red-400' : ''}`}
              value={values.startDate}
              onChange={(e) => setField('startDate', e.target.value)}
            />
            {fieldError('startDate')}
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="expiryDate">
              Expiry Date {isCustom && <span className="text-red-500">*</span>}
            </label>
            <input
              id="expiryDate"
              type="date"
              className={`input ${errors.expiryDate ? 'border-red-400' : ''} ${
                isCustom ? '' : 'cursor-not-allowed opacity-70'
              }`}
              value={shownExpiry}
              min={values.startDate || undefined}
              readOnly={!isCustom}
              disabled={!isCustom}
              onChange={(e) => setField('expiryDate', e.target.value)}
            />
            {fieldError('expiryDate')}
            {!isCustom && shownExpiry && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Calculated automatically from the start date. Expires {formatDate(shownExpiry)}.
                Choose <span className="font-medium">Custom Date</span> to set it manually.
              </p>
            )}
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
