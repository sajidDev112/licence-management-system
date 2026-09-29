import { useCallback, useEffect, useRef, useState } from 'react'

import { ThemePillSwitch } from '../components/ThemeToggle'
import ConfirmDialog from '../components/ConfirmDialog'
import IconButton, { ACTION_ICONS } from '../components/IconButton'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import { authApi, brandingApi, emailApi } from '../services/api'

// Must stay in step with the allowed types in server/services/brandingService.js.
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const MAX_LOGO_BYTES = 500 * 1024

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('That file could not be read'))
    reader.readAsDataURL(file)
  })
}

function BrandingSettings() {
  const toast = useToast()
  const { logo, setLogo, refresh } = useBranding()
  const [preview, setPreview] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const shown = preview || logo

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be picked again after an error
    if (!file) return

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setError('Use a PNG, JPEG, WebP or SVG file.')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('That image is too large. Please use a logo under 500 KB.')
      return
    }

    setError('')
    try {
      setPreview(await readAsDataUrl(file))
      setFileName(file.name)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleSave = async () => {
    if (!preview) return
    setSaving(true)
    try {
      const branding = await brandingApi.setLogo({ logo: preview, fileName })
      // Update the context directly so the sidebar changes without a reload.
      setLogo(branding.logo)
      setPreview(null)
      setFileName('')
      toast.success('Logo updated successfully')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await brandingApi.clearLogo()
      setLogo(null)
      setPreview(null)
      await refresh()
      toast.success('Logo removed successfully')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex min-h-[5.5rem] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        {shown ? (
          <img src={shown} alt="Logo preview" className="max-h-16 w-auto max-w-full object-contain" />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No logo uploaded. The console shows the OpEzee wordmark.
          </p>
        )}
      </div>

      {preview && (
        <p className="text-xs text-indigo-600 dark:text-indigo-400">
          Previewing {fileName || 'the selected file'} — not saved yet.
        </p>
      )}
      {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-secondary cursor-pointer">
          Choose image
          <input
            type="file"
            accept={ALLOWED_LOGO_TYPES.join(',')}
            className="hidden"
            onChange={handleFile}
          />
        </label>

        <button type="button" className="btn-primary" onClick={handleSave} disabled={!preview || saving}>
          {saving ? 'Saving...' : 'Save Logo'}
        </button>

        {preview && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setPreview(null)
              setFileName('')
              setError('')
            }}
            disabled={saving}
          >
            Cancel
          </button>
        )}

        {logo && !preview && (
          <button
            type="button"
            className="btn-danger-outline"
            onClick={handleRemove}
            disabled={removing}
          >
            {removing ? 'Removing...' : 'Remove Logo'}
          </button>
        )}
      </div>

      {/* <p className="text-xs text-slate-500 dark:text-slate-400">
        PNG, JPEG, WebP or SVG, up to 500 KB. Stored in Firebase and applied across the console
        immediately — no redeploy needed.
      </p> */}
    </div>
  )
}

function Section({ title, description, children }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

const EMPTY_PASSWORD = { currentPassword: '', newPassword: '', confirmPassword: '' }

function ChangePassword() {
  const toast = useToast()
  const [values, setValues] = useState(EMPTY_PASSWORD)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const setField = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const validate = () => {
    const found = {}
    if (!values.currentPassword) found.currentPassword = 'Current password is required'
    if (!values.newPassword) found.newPassword = 'New password is required'
    else if (values.newPassword.length < 8)
      found.newPassword = 'New password must be at least 8 characters'
    else if (values.newPassword === values.currentPassword)
      found.newPassword = 'The new password must be different from the current one'
    if (!values.confirmPassword) found.confirmPassword = 'Please confirm the new password'
    else if (values.confirmPassword !== values.newPassword)
      found.confirmPassword = 'Passwords do not match'
    return found
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) return

    setSubmitting(true)
    try {
      // The backend re-checks the current password against the stored hash;
      // the client-side rules above are only there for fast feedback.
      await authApi.changePassword(values)
      toast.success('Password changed successfully')
      setValues(EMPTY_PASSWORD)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const fields = [
    { name: 'currentPassword', label: 'Current Password', autoComplete: 'current-password' },
    { name: 'newPassword', label: 'New Password', autoComplete: 'new-password' },
    { name: 'confirmPassword', label: 'Confirm New Password', autoComplete: 'new-password' },
  ]

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-md space-y-4">
      {fields.map((field) => (
        <div key={field.name}>
          <label className="label" htmlFor={field.name}>
            {field.label}
          </label>
          <input
            id={field.name}
            type="password"
            autoComplete={field.autoComplete}
            className={`input ${errors[field.name] ? 'border-red-400' : ''}`}
            value={values[field.name]}
            onChange={(e) => setField(field.name, e.target.value)}
          />
          {errors[field.name] && (
            <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
              {errors[field.name]}
            </p>
          )}
        </div>
      ))}

      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? 'Updating...' : 'Update Password'}
      </button>
    </form>
  )
}

function EmailConfiguration() {
  const toast = useToast()
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [value, setValue] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  // Editing reuses the add form rather than opening a second one: the fields
  // are identical, so a separate dialog would only duplicate them.
  const [editing, setEditing] = useState(null)
  const formRef = useRef(null)

  const load = useCallback(async () => {
    try {
      setEmails(await emailApi.list())
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const resetForm = () => {
    setEditing(null)
    setValue('')
    setLabel('')
    setError('')
  }

  const startEdit = (item) => {
    setEditing(item)
    setValue(item.email)
    setLabel(item.label || '')
    setError('')
    // The form sits above the list, so bring it into view and focus it.
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    formRef.current?.querySelector('input')?.focus()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!value.trim()) return setError('Email is required')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
      return setError('Enter a valid email address')

    setError('')
    setSubmitting(true)
    try {
      const payload = { email: value.trim(), label: label.trim() }
      if (editing) {
        await emailApi.update(editing.id, payload)
        toast.success('Email updated successfully')
      } else {
        await emailApi.add(payload)
        toast.success('Email added successfully')
      }
      resetForm()
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
    return undefined
  }

  const handleSetDefault = async (id) => {
    try {
      await emailApi.setDefault(id)
      toast.success('Default email updated')
      await load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleDelete = async () => {
    setDeleteBusy(true)
    try {
      await emailApi.remove(deleting.id)
      toast.success('Email removed successfully')
      setDeleting(null)
      await load()
    } catch (err) {
      // The backend refuses to remove the default while others still exist.
      toast.error(err.message)
      setDeleting(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      {/* {editing && (
        <p className="mb-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
          Editing {editing.email}
        </p>
      )} */}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="mb-5 flex flex-col gap-3 sm:flex-row"
      >
        <div className="flex-1">
          <input
            type="email"
            className={`input ${error ? 'border-red-400' : ''}`}
            placeholder="notifications@yourcompany.com"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
            }}
          />
          {error && (
            <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
        <input
          className="input sm:max-w-[10rem]"
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button type="submit" className="btn-primary shrink-0" disabled={submitting}>
          {submitting ? (editing ? 'Saving...' : 'Adding...') : editing ? 'Save Changes' : 'Add Email'}
        </button>

        {editing && (
          <button
            type="button"
            onClick={resetForm}
            disabled={submitting}
            className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        )}
      </form>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : emails.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No email IDs configured yet. The first one you add becomes the default.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {emails.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-white">
                    {item.email}
                  </span>
                  {item.isDefault && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400">
                      Default
                    </span>
                  )}
                </div>
                {item.label && (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {!item.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(item.id)}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                  >
                    Set as default
                  </button>
                )}
                <IconButton
                  label="Edit"
                  paths={ACTION_ICONS.edit}
                  onClick={() => startEdit(item)}
                />
                <IconButton
                  label="Delete"
                  paths={ACTION_ICONS.delete}
                  tone="danger"
                  onClick={() => setDeleting(item)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        busy={deleteBusy}
        title="Remove this email?"
        confirmLabel="Remove"
        message={
          deleting
            ? `${deleting.email} will be removed from your configured email IDs.${
                deleting.isDefault ? ' It is currently the default address.' : ''
              }`
            : ''
        }
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}

export default function Settings() {
  const { admin } = useAuth()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Settings</h1>
          {/* <p className="page-subtitle">
            Signed in as {admin?.email}. Manage appearance, security and email configuration.
          </p> */}
        </div>
        {/* Theme switch lives here rather than in a card of its own. */}
        <ThemePillSwitch />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Section
            title="Branding"
          >
            <BrandingSettings />
          </Section>

          <Section
            title="Change Login Password"
          >
            <ChangePassword />
          </Section>
        </div>

        <Section
          title="Email Configuration"
        >
          <EmailConfiguration />
        </Section>
      </div>
    </div>
  )
}
