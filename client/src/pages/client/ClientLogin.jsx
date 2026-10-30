import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import {
  BUTTON_CLASS,
  CARD_CLASS,
  CardHeading,
  Field,
  FormMessage,
  Handoff,
  INPUT_CLASS,
  KioskPage,
} from '../../layouts/ClientLayout'
import { productClientApi } from '../../services/api'
import { EMAIL_PATTERN, linkTo, notifyProduct, readParams } from '../../services/productLink'

/**
 * The product's sign-in: the POC's email and password, checked against
 * POST /api/clients/login. On success the product is told who signed in (never
 * the password) and moves on to the key page.
 *
 * Drawn as products draw their own sign-in — logo, one heading, two tall
 * fields and a full-width button in a dark card — at the kiosk panel's
 * millimetres scaled to the 520px column a product frames.
 */
export default function ClientLogin() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = readParams(location.search)

  const [values, setValues] = useState({ email: params.email, password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [handedOff, setHandedOff] = useState(false)

  const setField = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
    setFormError('')
  }

  const validate = () => {
    const found = {}
    const email = values.email.trim()
    if (!email) found.email = 'Email is required'
    else if (!EMAIL_PATTERN.test(email)) found.email = 'Enter a valid email address'
    else if (email.length > 60) found.email = 'Email must be at most 60 characters'
    if (!values.password) found.password = 'Password is required'
    return found
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting || handedOff) return
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) return

    const username = values.email.trim()
    setSubmitting(true)
    setFormError('')
    try {
      const data = await productClientApi.login({
        username,
        password: values.password,
        productName: params.product || undefined,
      })
      const client = data.client || { username }

      if (notifyProduct('login', { username, client })) {
        setHandedOff(true)
        return
      }
      navigate(
        linkTo('/client/activate', params, {
          email: username,
          poc: client.clientName,
          company: client.companyName,
        })
      )
    } catch (err) {
      setFormError(err.status === 401 ? 'Email or password is incorrect.' : err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KioskPage>
      <form onSubmit={handleSubmit} noValidate className={CARD_CLASS}>
        <CardHeading>Sign in to your account</CardHeading>

        <Field id="email" label="Email ID" error={errors.email}>
          <input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            placeholder="name@company.com"
            value={values.email}
            onChange={(e) => setField('email', e.target.value)}
            disabled={handedOff}
            className={`${INPUT_CLASS} ${errors.email ? '!border-[#e0532c]' : ''}`}
          />
        </Field>

        <Field id="password" label="Password" error={errors.password}>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="your password"
            value={values.password}
            onChange={(e) => setField('password', e.target.value)}
            disabled={handedOff}
            className={`${INPUT_CLASS} ${errors.password ? '!border-[#e0532c]' : ''}`}
          />
        </Field>

        <FormMessage>{formError}</FormMessage>

        {handedOff ? (
          <Handoff>Signed in. Continuing...</Handoff>
        ) : (
          <button type="submit" disabled={submitting} className={BUTTON_CLASS}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        )}
      </form>
    </KioskPage>
  )
}
