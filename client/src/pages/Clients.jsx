import { useEffect, useMemo, useState } from 'react'

import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import IconButton, { ACTION_ICONS } from '../components/IconButton'
import { EmptyState, ErrorState, TableSkeleton } from '../components/States'
import { useToast } from '../components/Toast'
import { useClients } from '../hooks/useLicenses'
import { clientApi } from '../services/api'
import { formatDate } from '../services/format'

const MIN_PASSWORD_LENGTH = 8
const EMPTY = { clientName: '', companyName: '', username: '', password: '', confirmPassword: '' }

/** Small count chip used in the per-client license breakdown. */
function CountChip({ value, tone, label }) {
  if (!value) return null
  const tones = {
    active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    expired: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
    deactivated: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {value} {label}
    </span>
  )
}

function ClientFormModal({ open, client, onClose, onSubmit }) {
  const isEdit = Boolean(client?.id)
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
    // A row without an id came from a license only, so its name and username
    // prefill the form and the admin just supplies a password.
    setValues({
      ...EMPTY,
      clientName: client?.clientName || '',
      companyName: client?.companyName || '',
      username: client?.username || '',
      password: client?.password || '',
      confirmPassword: client?.password || '',
    })
  }, [open, client])

  const setField = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const validate = () => {
    const found = {}
    if (!values.clientName.trim()) found.clientName = 'Client name is required'
    if (!values.companyName.trim()) found.companyName = 'Company name is required'

    if (!values.username.trim()) found.username = 'Username is required'
    else if (values.username.trim().length < 3)
      found.username = 'Username must be at least 3 characters'
    else if (!/^[A-Za-z0-9._@+-]+$/.test(values.username.trim()))
      found.username = 'Use only letters, numbers and . _ @ + -'

    if (!values.password) found.password = 'Password is required'
    else if (values.password.length < MIN_PASSWORD_LENGTH)
      found.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    if (values.confirmPassword !== values.password)
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
      await onSubmit({
        clientName: values.clientName.trim(),
        companyName: values.companyName.trim(),
        username: values.username.trim().toLowerCase(),
        password: values.password,
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
      title={isEdit ? 'Edit Client' : 'Add Client'}
      subtitle="These are the credentials the client uses to sign in to your product."
      onClose={submitting ? () => {} : onClose}
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { name: 'clientName', label: 'Client Name', placeholder: 'John Doe' },
            { name: 'companyName', label: 'Company Name', placeholder: 'ABC Pvt Ltd' },
          ].map((f) => (
            <div key={f.name}>
              <label className="label" htmlFor={f.name}>
                {f.label} <span className="text-red-500">*</span>
              </label>
              <input
                id={f.name}
                className={`input ${errors[f.name] ? 'border-red-400' : ''}`}
                placeholder={f.placeholder}
                value={values[f.name]}
                onChange={(e) => setField(f.name, e.target.value)}
              />
              {fieldError(f.name)}
            </div>
          ))}

          <div className="sm:col-span-2">
            <label className="label" htmlFor="username">
              Username <span className="text-red-500">*</span>
            </label>
            <input
              id="username"
              autoComplete="off"
              className={`input ${errors.username ? 'border-red-400' : ''}`}
              placeholder="john.doe or john@abc.com"
              value={values.username}
              onChange={(e) => setField('username', e.target.value)}
            />
            {fieldError('username')}
          </div>

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
              placeholder="At least 8 characters"
              value={values.password}
              onChange={(e) => setField('password', e.target.value)}
            />
            {fieldError('password')}
          </div>

          <div>
            <label className="label" htmlFor="confirmPassword">
              Confirm Password <span className="text-red-500">*</span>
            </label>
            <input
              id="confirmPassword"
              type="text"
              autoComplete="off"
              spellCheck="false"
              className={`input ${errors.confirmPassword ? 'border-red-400' : ''}`}
              placeholder="Repeat the password"
              value={values.confirmPassword}
              onChange={(e) => setField('confirmPassword', e.target.value)}
            />
            {fieldError('confirmPassword')}
          </div>

        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Client'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function Clients() {
  const { clients, loading, error, reload } = useClients()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) =>
      [c.clientName, c.companyName, c.username, ...(c.products || [])]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q))
    )
  }, [clients, search])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const handleSubmit = async (values) => {
    try {
      if (editing?.id) {
        await clientApi.update(editing.id, values)
        toast.success('Client updated successfully')
      } else {
        await clientApi.create(values)
        toast.success('Client added successfully')
      }
      setFormOpen(false)
      setEditing(null)
      await reload({ silent: true })
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleDelete = async () => {
    setDeleteBusy(true)
    try {
      await clientApi.remove(deleting.id)
      toast.success('Client deleted successfully')
      setDeleting(null)
      await reload({ silent: true })
    } catch (err) {
      // The backend refuses while licenses still reference this client.
      toast.error(err.message)
      setDeleting(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  const renderBody = () => {
    if (loading) return <TableSkeleton cols={6} />
    if (error) return <ErrorState message={error} onRetry={reload} />
    if (!clients.length) {
      return (
        <EmptyState
          title="No clients yet."
          description="Add a client to create the credentials they will use to sign in to your product."
          action={
            <button className="btn-primary" onClick={openCreate}>
              Add Client
            </button>
          }
        />
      )
    }
    if (!visible.length) {
      return <EmptyState title="No matching clients" description="Try a different search term." />
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full table-auto text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="table-head">Client Name</th>
              <th className="table-head">Company</th>
              <th className="table-head">Username</th>
              <th className="table-head">Password</th>
              <th className="table-head">Login</th>
              <th className="table-head">Products</th>
              <th className="table-head">Licenses</th>
              <th className="table-head">Latest Expiry</th>
              <th className="table-head">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((client) => (
              <tr
                key={client.id || client.username}
                className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
              >
                <td className="px-2 py-3 font-medium text-slate-900 dark:text-white">
                  {client.clientName}
                </td>
                <td className="px-2 py-3 text-slate-600 dark:text-slate-300">
                  {client.companyName}
                </td>
                <td className="px-2 py-3 text-slate-600 dark:text-slate-300">{client.username}</td>
                <td className="px-2 py-3">
                  {client.password ? (
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-200">
                      {client.password}
                    </span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-600">&mdash;</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-3">
                  {client.hasLogin ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                      Enabled
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                      No login
                    </span>
                  )}
                </td>
                <td className="px-2 py-3 text-slate-600 dark:text-slate-300">
                  {client.products.join(', ') || (
                    <span className="text-slate-400 dark:text-slate-600">&mdash;</span>
                  )}
                </td>
                <td className="px-2 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CountChip value={client.activeLicenses} tone="active" label="active" />
                    <CountChip value={client.pendingLicenses} tone="pending" label="pending" />
                    <CountChip value={client.expiredLicenses} tone="expired" label="expired" />
                    <CountChip value={client.deactivatedLicenses} tone="deactivated" label="off" />
                    {!client.totalLicenses && (
                      <span className="text-xs text-slate-400 dark:text-slate-600">None</span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-slate-600 dark:text-slate-300">
                  {client.latestExpiry ? formatDate(client.latestExpiry) : '—'}
                </td>
                <td className="whitespace-nowrap px-2 py-3">
                  <div className="flex items-center gap-1">
                    <IconButton
                      label={client.hasLogin ? 'Edit' : 'Add login'}
                      paths={ACTION_ICONS.edit}
                      onClick={() => {
                        setEditing(client)
                        setFormOpen(true)
                      }}
                    />
                    {client.hasLogin && (
                      <IconButton
                        label="Delete"
                        paths={ACTION_ICONS.delete}
                        tone="danger"
                        onClick={() => setDeleting(client)}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="page-title">Clients</h1>
        {/* <button className="btn-primary" onClick={openCreate}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Client
        </button> */}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
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
              placeholder="Search clients"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {renderBody()}
      </div>

      <ClientFormModal
        open={formOpen}
        client={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        busy={deleteBusy}
        title="Delete this client?"
        message={
          deleting
            ? `${deleting.clientName} (${deleting.username}) will lose access to your product. Clients that still hold licenses cannot be deleted.`
            : ''
        }
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
