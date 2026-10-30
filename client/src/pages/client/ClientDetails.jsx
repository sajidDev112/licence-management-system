import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import wordmark from '../../assets/images/opezee-wordmark-white.png'
import { productClientApi } from '../../services/api'
import { formatDateNumeric } from '../../services/format'
import { notifyProduct, readParams, statusLabel } from '../../services/productLink'

// The status pill: green for a licence in use, amber for one not started
// yet, the product's alert red for everything that stops it.
const PILL = {
  active: 'bg-[#3fae6a]/[0.18] text-[#3fae6a]',
  pending: 'bg-amber-500/[0.18] text-amber-500',
  blocked: 'bg-[#e0532c]/[0.18] text-[#e0532c]',
}

/**
 * The license record as the server holds it now, for the staff page a product
 * keeps behind its PIN. Read with POST /api/licenses/verify, which for the
 * machine that owns the key also returns the POC and company. Nothing here is
 * editable.
 *
 * Drawn as products draw their own licence page — a title bar, the record in
 * two columns, a round close button and a "Powered by" foot — rather than as a
 * card, so it sits in a product as one of its own screens. The sizes are the
 * kiosk panel's millimetres scaled to the 520px column a product frames.
 */
export default function ClientDetails() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = readParams(location.search)

  const [license, setLicense] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!params.key) {
      setError('No licence key was given to look up.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await productClientApi.verify({
        licenseKey: params.key,
        productName: params.product || undefined,
        machineNumber: params.machine || undefined,
      })
      setLicense({ ...data.license, status: data.valid ? 'active' : data.license?.status })
    } catch (err) {
      setLicense(null)
      setError(err.status === 404 ? 'That licence key was not found.' : err.message)
    } finally {
      setLoading(false)
    }
  }, [params.key, params.product, params.machine])

  useEffect(() => {
    load()
  }, [load])

  const close = () => {
    if (!notifyProduct('close')) navigate(-1)
  }

  const status = license?.status
  const pill = PILL[status] || PILL.blocked

  const contact = [
    ['POC', license?.clientName || params.poc],
    ['Email', params.email],
    ['Company', license?.companyName || params.company],
  ]
  const record = [
    ['Product', license?.productName || params.product],
    ['Licence Key', license?.licenseKey || params.key, 'key'],
    ['Start Date', license?.startDate && formatDateNumeric(license.startDate)],
    ['End Date', license?.expiryDate && formatDateNumeric(license.expiryDate)],
  ]

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900 dark:bg-[#0c1220] dark:text-white">
      <header className="border-b border-slate-200 px-12 pb-[22px] pt-[35px] dark:border-white/10">
        <h1 className="text-[21px] font-bold leading-none">Licence Details</h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-12">
        <dl className="grid w-full grid-cols-[132px_1fr] items-center gap-x-[9px] gap-y-[19px] px-12 py-[31px]">
          {contact.map(([label, value]) => (
            <Row key={label} label={label} value={value} />
          ))}

          <div className="col-span-2 h-px bg-slate-200 dark:bg-white/10" role="presentation" />

          {record.map(([label, value, kind]) => (
            <Row key={label} label={label} value={value} mono={kind === 'key'} />
          ))}

          <dt className="text-[14.5px] text-slate-500 dark:text-white/60">Status</dt>
          <dd className="m-0">
            {status ? (
              <span className={`inline-block rounded-full px-[9px] py-[3.5px] text-[10.5px] font-bold ${pill}`}>
                {statusLabel(status)}
              </span>
            ) : (
              <span className="text-[14.5px] text-slate-500 dark:text-white/60">
                {loading ? 'Checking...' : '-'}
              </span>
            )}
          </dd>
        </dl>

        {error && (
          <p role="alert" className="-mt-2 mb-2 text-center text-[13px] font-medium text-[#e0532c]">
            {error}
          </p>
        )}

        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="mt-[31px] flex h-[53px] w-[53px] items-center justify-center rounded-full border border-[#c4441e] bg-[#e0532c] p-[14px] text-white transition hover:bg-[#c4441e] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-full w-full"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M7 7 17 17M17 7 7 17" />
          </svg>
        </button>
      </main>

      <footer className="flex h-[72px] flex-col items-center justify-center gap-[5px] border-t border-slate-200 dark:border-white/10">
        <span className="text-[9.5px] text-slate-500 dark:text-white/60">Powered by</span>
        <img src={wordmark} alt="Opezee" draggable="false" className="block h-6 w-auto invert dark:invert-0" />
      </footer>
    </div>
  )
}

function Row({ label, value, mono = false }) {
  return (
    <>
      <dt className="text-[14.5px] text-slate-500 dark:text-white/60">{label}</dt>
      <dd
        className={`m-0 min-w-0 break-words ${
          mono
            ? 'font-mono text-[15px] font-medium tracking-[0.5px]'
            : 'text-[16.5px] font-bold'
        }`}
      >
        {value || '-'}
      </dd>
    </>
  )
}
