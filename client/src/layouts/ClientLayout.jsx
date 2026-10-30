import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import colourWordmark from '../assets/images/Opz-Logo-Re---Branding-final..png'
import { useBranding } from '../context/BrandingContext'
import { notifyProduct } from '../services/productLink'

/**
 * The parent of the product-facing pages. No sidebar and no admin session —
 * these pages are public, and a product shows them in place of its own
 * sign-in and license screens. Each page draws itself the way products draw
 * their own licence screens, from the pieces below.
 *
 * Sizes are the kiosk panel's millimetres scaled to the 520px column a
 * product frames, so the pages match the product's built-in screens.
 */
export default function ClientLayout() {
  const location = useLocation()

  // The product waits for this before it trusts the frame: a page that never
  // says ready means the server could not be reached, and the product falls
  // back to its own screens rather than showing a browser error.
  useEffect(() => {
    notifyProduct('ready', { page: location.pathname.replace(/^\/client\/?/, '') || 'login' })
  }, [location.pathname])

  return <Outlet />
}

/** A text field: tall, dark, with the brand outline when focused. */
export const INPUT_CLASS =
  'h-[44px] w-full rounded-[7px] border border-slate-300 bg-white px-[13px] text-[12.5px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:shadow-[0_0_0_2px_rgba(80,199,212,0.25)] disabled:opacity-60 dark:border-white/[0.12] dark:bg-[#1b2432] dark:text-white dark:placeholder:text-white/45 dark:focus:border-brand-500'

/** The full-width action. Brand #50C7D4 with dark text, which reads at ~8:1. */
export const BUTTON_CLASS =
  'h-[44px] w-full rounded-[7px] bg-brand-500 text-[13px] font-bold text-slate-900 transition hover:bg-brand-600 active:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-60'

/** The quiet secondary action under the button. */
export const LINK_CLASS =
  'mt-[13px] text-[12px] font-medium text-slate-500 transition hover:text-slate-800 disabled:opacity-50 dark:text-white/60 dark:hover:text-white'

/** Dark ground, one card centred on it. */
export function KioskPage({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-12 text-slate-900 dark:bg-[#060a16] dark:text-white">
      {children}
    </div>
  )
}

export const CARD_CLASS =
  'flex w-full flex-col items-center rounded-[10.5px] border border-slate-200 bg-white px-[26px] pb-[26px] pt-[31px] dark:border-white/10 dark:bg-[#121a2a]'

/**
 * The logo and heading that open the sign-in and key cards. The logo is the
 * one uploaded in Settings; until it loads, or if the server cannot be
 * reached, the colour wordmark shipped with the build stands in, so the card
 * never shows a text fallback.
 */
export function CardHeading({ children }) {
  const { logo } = useBranding()
  return (
    <>
      <img
        src={logo || colourWordmark}
        alt="Opezee"
        draggable="false"
        className="mb-[18px] h-[57px] w-auto max-w-full object-contain"
      />
      <h1 className="mb-[22px] text-center text-[17.5px] font-bold leading-[1.1]">{children}</h1>
    </>
  )
}

/** A labelled field with its own error under it. */
export function Field({ id, label, error, children }) {
  return (
    <div className="mb-[15px] flex w-full flex-col gap-[6px]">
      <label htmlFor={id} className="text-[11.5px] font-medium text-slate-700 dark:text-white/[0.86]">
        {label}
      </label>
      {children}
      {error && <p className="text-[10.5px] font-medium text-[#e0532c]">{error}</p>}
    </div>
  )
}

/** A refused or failed request, centred above the button. */
export function FormMessage({ children }) {
  return (
    <p
      role="alert"
      aria-live="polite"
      className="mb-[9px] min-h-[14px] w-full text-center text-[10.5px] font-medium text-[#e0532c]"
    >
      {children}
    </p>
  )
}

/** Shown once the product has been told and is about to swap the page out. */
export function Handoff({ children }) {
  return (
    <div className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-slate-500 dark:text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      {children}
    </div>
  )
}
