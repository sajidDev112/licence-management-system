import { useBranding } from '../context/BrandingContext'

/**
 * Renders the logo stored in Firestore. Until it loads — or if none has been
 * uploaded yet — a plain wordmark stands in, so the header is never empty.
 */
export default function BrandLogo({ className = 'h-10 w-auto', textClassName = 'text-lg' }) {
  const { logo, loading } = useBranding()

  if (logo) {
    return <img src={logo} alt="Opezee" className={`${className} max-w-full object-contain`} />
  }

  return (
    <span
      className={`font-semibold tracking-tight text-slate-900 dark:text-white ${textClassName} ${
        loading ? 'opacity-40' : ''
      }`}
    >
      OpEzee
    </span>
  )
}
