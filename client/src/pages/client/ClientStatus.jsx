import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { BUTTON_CLASS, Handoff, LINK_CLASS } from '../../layouts/ClientLayout'
import { productClientApi } from '../../services/api'
import { linkTo, notifyProduct, readParams } from '../../services/productLink'

// Sentence case: only the first word and the product's own name are capped.
// Two lines, balanced: "Your Match Match license / has been deactivated".
const HEADLINES = {
  expired: (product) => (product ? `Your ${product} license has expired` : 'Your license has expired'),
  deactivated: (product) =>
    product ? `Your ${product} license has been deactivated` : 'Your license has been deactivated',
  pending: (product) =>
    product ? `Your ${product} license has not started yet` : 'Your license has not started yet',
  invalid: () => 'This license key is no longer valid',
  machine_mismatch: () => 'This license is in use on another machine',
}

/**
 * The notice a product shows when its license stops being usable — what its
 * auto-sync found. The page asks POST /api/licenses/sync itself when it opens,
 * so what it says is the server's answer now, not what the product last
 * remembered. If the license turns out to be usable again (re-enabled in the
 * console, or renewed), the product is told at once and opens.
 *
 * Drawn as products draw their own notice — a badge, a two-line headline, the
 * key and who to contact, Reactivate and Sign out, and the support line under
 * the card. Expired is the red face with a clock; everything else is grey with
 * a bar. The sizes are the kiosk panel's millimetres scaled to the 520px
 * column a product frames.
 */
export default function ClientStatus() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = readParams(location.search)

  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [handedOff, setHandedOff] = useState(false)
  const told = useRef(false)

  const check = useCallback(async () => {
    if (!params.key) {
      setError('No license key was given to check.')
      return
    }
    setError('')
    try {
      const data = await productClientApi.sync({
        licenseKey: params.key,
        productName: params.product || undefined,
        machineNumber: params.machine || undefined,
      })
      setResult(data)
      if (data.valid && !told.current) {
        told.current = true
        if (notifyProduct('activated', { licenseKey: params.key, valid: true, status: 'active' })) {
          setHandedOff(true)
        }
      }
    } catch (err) {
      if (err.status === 404) setResult({ valid: false, status: 'invalid', message: err.message })
      else if (err.status === 403) {
        setResult({
          valid: false,
          status: /another machine/i.test(err.message) ? 'machine_mismatch' : 'invalid',
          message: err.message,
        })
      } else setError(err.message)
    }
  }, [params.key, params.product, params.machine])

  useEffect(() => {
    check()
  }, [check])

  // Until the server answers, the status the product sent stands in — it is
  // why the product opened this page — and failing that, deactivated.
  const known = params.status === 'deactive' ? 'deactivated' : params.status
  const status = result?.valid ? 'active' : result?.status || (HEADLINES[known] ? known : 'deactivated')
  const expired = status === 'expired'
  const product = result?.productName || params.product
  const headline = result?.valid
    ? 'Your license is active again'
    : (HEADLINES[status] || HEADLINES.deactivated)(product)

  const reactivate = () => {
    if (!notifyProduct('reactivate')) navigate(linkTo('/client/activate', params, { key: '' }))
  }
  const signOut = () => {
    if (!notifyProduct('signOut')) {
      navigate(linkTo('/client/login', { product: params.product, machine: params.machine, theme: params.theme }))
    }
  }

  const facts = [
    ['License Key', params.key, true],
    ['Product', product],
    ['POC', params.poc],
    ['Email', params.email],
  ]

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-12 text-slate-900 dark:bg-[#060a16] dark:text-white">
      <div className="flex w-full flex-col items-center">
        <div className="flex w-full flex-col items-center rounded-[10.5px] border border-slate-200 bg-white px-[26px] pb-[26px] pt-[31px] dark:border-white/10 dark:bg-[#121a2a]">
          <span
            aria-hidden="true"
            className={`mb-[9px] block h-[44px] w-[44px] rounded-full bg-slate-100 p-[11px] dark:bg-[#1b2432] ${
              result?.valid ? 'text-[#3fae6a]' : expired ? 'text-[#ff5c5c]' : 'text-slate-700 dark:text-white'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="block h-full w-full"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="8.5" />
              {result?.valid ? (
                <path d="m8.5 12.5 2.5 2.5 4.5-5" />
              ) : expired ? (
                <path d="M12 7v5l3 2" />
              ) : (
                <path d="M6 6 18 18" />
              )}
            </svg>
          </span>

          <h1
            className={`mb-[9px] max-w-[273px] text-balance text-center text-[16px] font-bold leading-[1.3] ${
              expired ? 'text-[#ff5c5c]' : ''
            }`}
          >
            {headline}
          </h1>

          <dl className="mb-[35px] mt-[4px] grid w-full grid-cols-[auto_1fr] gap-x-[13px] gap-y-[8px] rounded-[7px] bg-slate-100 px-[16px] py-[15px] text-[11.5px] dark:bg-[#1b2432]">
            {facts.map(([label, value, mono]) => (
              <div key={label} className="contents">
                <dt className="text-slate-500 dark:text-white/60">{label}</dt>
                <dd
                  className={`m-0 min-w-0 text-right [overflow-wrap:anywhere] ${
                    mono ? 'font-mono font-medium' : 'font-bold'
                  }`}
                >
                  {value || '—'}
                </dd>
              </div>
            ))}
          </dl>

          {error && (
            <p role="alert" className="-mt-[22px] mb-[13px] text-center text-[11px] font-medium text-[#e0532c]">
              {error}
            </p>
          )}

          {handedOff ? (
            <Handoff>Opening...</Handoff>
          ) : result?.valid ? (
            <button
              type="button"
              onClick={() => navigate(linkTo('/client/details', params))}
              className={BUTTON_CLASS}
            >
              View Details
            </button>
          ) : (
            <button
              type="button"
              onClick={reactivate}
              className={BUTTON_CLASS}
            >
              Reactivate License
            </button>
          )}

          <button
            type="button"
            onClick={signOut}
            disabled={handedOff}
            className={LINK_CLASS}
          >
            Sign out
          </button>
        </div>

        {/* Plain text for now: there is no support channel to link to yet. */}
        <p className="mt-[31px] text-center text-[9.7px] text-slate-400 dark:text-white/45">
          Need assistance? Contact Support
        </p>
      </div>
    </div>
  )
}
