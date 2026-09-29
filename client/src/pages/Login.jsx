import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import ThemeToggle from '../components/ThemeToggle'
import BrandLogo from '../components/BrandLogo'

export default function Login() {
  const { signIn, isAuthenticated, loading } = useAuth()
  const { isDark } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Send the admin back to whatever page bounced them here.
  const from = location.state?.from?.pathname || '/'

  if (!loading && isAuthenticated) return <Navigate to={from} replace />

  const setField = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
    setFormError('')
  }

  const validate = () => {
    const found = {}
    if (!values.email.trim()) found.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
      found.email = 'Enter a valid email address'
    if (!values.password) found.password = 'Password is required'
    return found
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) return

    setSubmitting(true)
    setFormError('')
    try {
      await signIn({ email: values.email.trim(), password: values.password })
      navigate(from, { replace: true })
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="card p-6 sm:p-8" noValidate>
          {/* Logo, then the heading, then the fields. */}
          <div className="mb-7 flex flex-col items-center text-center">
            <BrandLogo className="h-11 w-auto" textClassName="text-xl" />
            <h1 className="mt-5 text-lg font-bold text-slate-900 dark:text-white">
              Sign In to Admin
            </h1>
            {/* <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sign in to the admin console
            </p> */}
          </div>

          {formError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              {formError}
            </div>
          )}

          <div className="mb-4">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              className={`input ${errors.email ? 'border-red-400' : ''}`}
              placeholder="admin@example.com"
              value={values.email}
              onChange={(e) => setField('email', e.target.value)}
            />
            {errors.email && (
              <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                {errors.email}
              </p>
            )}
          </div>

          <div className="mb-5">
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className={`input ${errors.password ? 'border-red-400' : ''}`}
              placeholder="Your password"
              value={values.password}
              onChange={(e) => setField('password', e.target.value)}
            />
            {errors.password && (
              <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                {errors.password}
              </p>
            )}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
            Opezee License Management
          </p>
        </form>
      </div>
    </div>
  )
}
