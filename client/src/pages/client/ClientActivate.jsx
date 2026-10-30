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
  LINK_CLASS,
} from '../../layouts/ClientLayout'
import { productClientApi } from '../../services/api'
import {
  KEY_PATTERN,
  MACHINE_PATTERN,
  formatKeyInput,
  isEmbedded,
  linkTo,
  notifyProduct,
  readParams,
} from '../../services/productLink'

/**
 * Signed in, not yet licensed: the operator types the key, and it is checked
 * with POST /api/licenses/verify together with this machine's number. The
 * first machine to verify a key claims it, so the same key on another machine
 * is refused from then on.
 *
 * A key the server knows but will not honour (expired, deactivated, pending)
 * is still handed to the product, so its next screen can say exactly why.
 *
 * Drawn like the sign-in card it follows: logo, heading, one field, the
 * button and Sign out.
 */
export default function ClientActivate() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = readParams(location.search)

  const [key, setKey] = useState('')
  const [fieldError, setFieldError] = useState('')
  // The product may send back an error of its own, from its own re-check.
  const [formError, setFormError] = useState(params.error)
  const [submitting, setSubmitting] = useState(false)
  const [handedOff, setHandedOff] = useState('')

  // A product that frames this page must say which machine it is; without it
  // a key would verify without being bound, and the lock would mean nothing.
  const machineProblem =
    isEmbedded() && !params.machine
      ? 'This product did not send its machine number. Contact support.'
      : params.machine && !MACHINE_PATTERN.test(params.machine)
        ? 'This product sent a machine number the server cannot accept. Contact support.'
        : ''

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting || handedOff || machineProblem) return

    const licenseKey = key.trim().toUpperCase()
    if (!licenseKey) return setFieldError('License key is required')
    if (!KEY_PATTERN.test(licenseKey)) {
      return setFieldError('Enter the full key, e.g. OPEZ-XXXX-XXXX-XXXX')
    }

    setSubmitting(true)
    setFormError('')
    try {
      const data = await productClientApi.verify({
        licenseKey,
        productName: params.product || undefined,
        machineNumber: params.machine || undefined,
      })
      const status = data.valid ? 'active' : data.license?.status || 'deactivated'

      const told = notifyProduct('activated', {
        licenseKey,
        valid: Boolean(data.valid),
        status,
        license: data.license || null,
      })
      if (told) {
        setHandedOff(data.valid ? 'License activated. Opening...' : `${data.message}.`)
        return
      }
      navigate(linkTo(data.valid ? '/client/details' : '/client/status', params, { key: licenseKey }))
    } catch (err) {
      setFormError(err.status === 404 ? 'That license key was not found.' : err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const signOut = () => {
    if (!notifyProduct('signOut')) {
      navigate(linkTo('/client/login', { product: params.product, machine: params.machine, theme: params.theme }))
    }
  }

  return (
    <KioskPage>
      <form onSubmit={handleSubmit} noValidate className={CARD_CLASS}>
        <CardHeading>Activate License</CardHeading>

        <Field id="licenseKey" label="License key" error={fieldError}>
          <input
            id="licenseKey"
            type="text"
            autoComplete="off"
            spellCheck="false"
            autoFocus
            placeholder="OPEZ-XXXX-XXXX-XXXX"
            value={key}
            onChange={(e) => {
              setKey(formatKeyInput(e.target.value, key))
              setFieldError('')
              setFormError('')
            }}
            disabled={Boolean(handedOff)}
            className={`${INPUT_CLASS} font-mono tracking-[1px] ${fieldError ? '!border-[#e0532c]' : ''}`}
          />
        </Field>

        <FormMessage>{machineProblem || formError}</FormMessage>

        {handedOff ? (
          <Handoff>{handedOff}</Handoff>
        ) : (
          <button type="submit" disabled={submitting || Boolean(machineProblem)} className={BUTTON_CLASS}>
            {submitting ? 'Checking...' : 'Activate'}
          </button>
        )}

        <button
          type="button"
          onClick={signOut}
          disabled={submitting || Boolean(handedOff)}
          className={LINK_CLASS}
        >
          Sign out
        </button>
      </form>
    </KioskPage>
  )
}
