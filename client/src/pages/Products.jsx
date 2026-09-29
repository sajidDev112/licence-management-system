import { useEffect, useState } from 'react'

import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import IconButton, { ACTION_ICONS } from '../components/IconButton'
import { EmptyState, ErrorState, TableSkeleton } from '../components/States'
import { useToast } from '../components/Toast'
import { useProducts } from '../hooks/useLicenses'
import { productApi } from '../services/api'
import { formatDate } from '../services/format'

const EMPTY = { name: '', description: '' }

function ProductFormModal({ open, product, onClose, onSubmit }) {
  const isEdit = Boolean(product)
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setValues(product ? { name: product.name, description: product.description || '' } : EMPTY)
  }, [open, product])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const found = {}
    if (!values.name.trim()) found.name = 'Product name is required'
    setErrors(found)
    if (Object.keys(found).length) return

    setSubmitting(true)
    try {
      await onSubmit({ name: values.name.trim(), description: values.description.trim() })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit Product' : 'Add Product'}
      subtitle="Products are matched by name when a license is verified."
      onClose={submitting ? () => {} : onClose}
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-4">
          <label className="label" htmlFor="productName">
            Product Name <span className="text-red-500">*</span>
          </label>
          <input
            id="productName"
            autoFocus
            className={`input ${errors.name ? 'border-red-400' : ''}`}
            placeholder="Invoice Pro"
            value={values.name}
            onChange={(e) => {
              setValues((p) => ({ ...p, name: e.target.value }))
              setErrors({})
            }}
          />
          {errors.name && (
            <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{errors.name}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="productDescription">
            Product Description
          </label>
          <textarea
            id="productDescription"
            rows={4}
            className="input resize-y"
            placeholder="What this product does"
            value={values.description}
            onChange={(e) => setValues((p) => ({ ...p, description: e.target.value }))}
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function Products() {
  const { products, loading, error, reload } = useProducts()
  const toast = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const handleSubmit = async (values) => {
    try {
      if (editing) {
        await productApi.update(editing.id, values)
        toast.success('Product updated successfully')
      } else {
        await productApi.create(values)
        toast.success('Product saved successfully')
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
      await productApi.remove(deleting.id)
      toast.success('Product deleted successfully')
      setDeleting(null)
      await reload({ silent: true })
    } catch (err) {
      // The backend refuses to delete a product that licenses still reference.
      toast.error(err.message)
      setDeleting(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  const renderBody = () => {
    if (loading) return <TableSkeleton cols={4} />
    if (error) return <ErrorState message={error} onRetry={reload} />
    if (!products.length) {
      return (
        <EmptyState
          title="No products found."
          description="Add your first product to start issuing licenses against it."
          action={
            <button className="btn-primary" onClick={openCreate}>
              Add Product
            </button>
          }
        />
      )
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full table-auto text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="table-head">Product Name</th>
              <th className="table-head">Description</th>
              <th className="table-head">Created</th>
              <th className="table-head">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {products.map((product) => (
              <tr key={product.id} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                <td className="px-2 py-3 font-medium text-slate-900 dark:text-white">
                  {product.name}
                </td>
                <td className="max-w-md px-2 py-3 text-slate-600 dark:text-slate-300">
                  {product.description || (
                    <span className="text-slate-400 dark:text-slate-600">No description</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-slate-600 dark:text-slate-300">
                  {formatDate(product.createdAt)}
                </td>
                <td className="whitespace-nowrap px-2 py-3">
                  <div className="flex items-center gap-1">
                    <IconButton
                      label="Edit"
                      paths={ACTION_ICONS.edit}
                      onClick={() => {
                        setEditing(product)
                        setFormOpen(true)
                      }}
                    />
                    <IconButton
                      label="Delete"
                      paths={ACTION_ICONS.delete}
                      tone="danger"
                      onClick={() => setDeleting(product)}
                    />
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
        <div>
          <h1 className="page-title">Products</h1>
          {/* <p className="page-subtitle">The products you issue licenses for.</p> */}
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Product
        </button>
      </div>

      <div className="card overflow-hidden">{renderBody()}</div>

      <ProductFormModal
        open={formOpen}
        product={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        busy={deleteBusy}
        title="Delete this product?"
        message={
          deleting
            ? `"${deleting.name}" will be permanently deleted. Products that still have licenses issued against them cannot be deleted.`
            : ''
        }
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
