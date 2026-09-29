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
  clients:
    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  settings:
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
  signOut: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
}

const MAIN_NAV = [
  { to: '/', label: 'Dashboard', icon: ICONS.dashboard },
  { to: '/licenses', label: 'Licenses', icon: ICONS.licenses },
  { to: '/products', label: 'Products', icon: ICONS.products },
  { to: '/clients', label: 'Clients', icon: ICONS.clients },
]

const linkClasses = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
    isActive
      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
  }`

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
      className="block rounded-lg px-6 py-5 transition hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <BrandLogo className="h-10 w-auto" />
    </Link>
  )
}

/** Sidebar body: main navigation at the top, Settings pinned to the bottom. */
function SidebarBody({ onNavigate }) {
  const { signOut } = useAuth()

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

      <div className="mt-auto border-t border-slate-200 px-3 py-3 dark:border-slate-800">
        <div className="mb-2.5 text-center">
          <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">Admin</p>
          <p className="truncate text-xs text-slate-400 dark:text-slate-500">OpEzee</p>
        </div>

        {/* Settings and Log Out share one row, so both are sized to their
            content rather than filling the sidebar. */}
        <div className="flex items-center justify-center gap-2">
          <NavLink
            to="/settings"
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`
            }
          >
            <NavIcon d={ICONS.settings} />
            Settings
          </NavLink>

          {/* Mirrors the Settings link's sizing so the two sit level, but in
              red: signing out is the one destructive action in the sidebar. */}
          <button
            type="button"
            onClick={signOut}
            aria-label="Log out"
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
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
