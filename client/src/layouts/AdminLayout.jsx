import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import BrandLogo from '../components/BrandLogo'

const ICONS = {
  dashboard:
    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  licenses:
    'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
  products:
    'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  // An outlined cog, drawn hollow so the sidebar shows through it. Sized to
  // ink the same height as the sign-out glyph beside it, rather than to fill
  // the icon box — otherwise it reads noticeably larger.
  settings:
    'M9.81 6.31 L10.4 3.75 L13.6 3.75 L14.19 6.31 L14.48 6.43 L16.7 5.04 L18.96 7.3 L17.57 9.52 L17.69 9.81 L20.25 10.4 L20.25 13.6 L17.69 14.19 L17.57 14.48 L18.96 16.7 L16.7 18.96 L14.48 17.57 L14.19 17.69 L13.6 20.25 L10.4 20.25 L9.81 17.69 L9.52 17.57 L7.3 18.96 L5.04 16.7 L6.43 14.48 L6.31 14.19 L3.75 13.6 L3.75 10.4 L6.31 9.81 L6.43 9.52 L5.04 7.3 L7.3 5.04 L9.52 6.43 Z M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0Z',
  signOut: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
}

const MAIN_NAV = [
  { to: '/', label: 'Dashboard', icon: ICONS.dashboard },
  { to: '/licenses', label: 'Licenses', icon: ICONS.licenses },
  { to: '/products', label: 'Products', icon: ICONS.products },
]

const linkClasses = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
    isActive
      ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
  }`

/** Shared shape of the Settings and Log Out buttons at the foot of the sidebar. */
const FOOTER_BUTTON =
  'flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-2 py-2 text-sm font-medium transition'

function NavIcon({ d }) {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

/** The logo doubles as the link home, which is what people expect of it. */
function Logo({ onNavigate }) {
  return (
    <Link
      to="/"
      onClick={onNavigate}
      aria-label="Go to Dashboard"
      className="block rounded-lg px-6 py-5 transition hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <BrandLogo className="h-10 w-auto" />
    </Link>
  )
}

/** Sidebar body: main navigation at the top, Settings pinned to the bottom. */
function SidebarBody({ onNavigate }) {
  const { admin, signOut } = useAuth()

  return (
    <>
      <Logo onNavigate={onNavigate} />

      {/* Scrolls on its own if the nav ever outgrows a short viewport. */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        {MAIN_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={linkClasses}
          >
            <NavIcon d={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-slate-200 px-4 py-4 dark:border-slate-800">
        <div className="mb-3 min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">Admin</p>
          <p
            className="truncate text-xs text-slate-500 dark:text-slate-400"
            title={admin?.email || undefined}
          >
            {admin?.email || 'Signed in'}
          </p>
        </div>

        {/* Two equal outlined buttons sharing the row. Log Out is in red: it is
            the one destructive action in the sidebar. */}
        <div className="grid grid-cols-2 gap-2">
          <NavLink
            to="/settings"
            onClick={onNavigate}
            className={({ isActive }) =>
              `${FOOTER_BUTTON} ${
                isActive
                  ? 'border-brand-400 text-brand-700 dark:border-brand-500/60 dark:text-brand-400'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
              }`
            }
          >
            <NavIcon d={ICONS.settings} />
            Settings
          </NavLink>

          <button
            type="button"
            onClick={signOut}
            aria-label="Log out"
            className={`${FOOTER_BUTTON} border-slate-300 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:border-slate-700 dark:text-red-400 dark:hover:border-red-500/40 dark:hover:bg-red-500/10 dark:hover:text-red-300`}
          >
            <NavIcon d={ICONS.signOut} />
            Log Out
          </button>
        </div>
      </div>
    </>
  )
}

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Route changes should never leave the mobile drawer hanging open.
  useEffect(() => setMobileOpen(false), [location.pathname])

  // Escape closes the open drawer, as it would any other overlay.
  useEffect(() => {
    if (!mobileOpen) return undefined
    const onKey = (e) => e.key === 'Escape' && setMobileOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  return (
    <div className="min-h-screen lg:flex">
      {/* Sticky and exactly viewport-tall, so Settings and the admin block stay
          pinned to the bottom of the screen however long the page content is. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <SidebarBody />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {/* Vertically centred on the logo row (py-5 around an h-10 logo). */}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-[22px] rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <SidebarBody onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Open navigation"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link to="/" aria-label="Go to Dashboard" className="transition hover:opacity-75">
            <BrandLogo className="h-7 w-auto" textClassName="text-sm" />
          </Link>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
