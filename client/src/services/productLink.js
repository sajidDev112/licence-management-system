/**
 * The contract between the /client pages and the product that shows them.
 *
 * A product (Match Match, say) opens these pages inside a frame instead of
 * drawing its own sign-in and key screens. It tells the page who it is through
 * the URL, and the page tells it what happened through postMessage:
 *
 *   /client/login     ?product=&machine=&theme=
 *   /client/activate  ?product=&machine=&email=&poc=&company=&error=&theme=
 *   /client/status    ?product=&machine=&key=&email=&poc=&company=&status=&theme=
 *   /client/details   ?product=&machine=&key=&email=&poc=&company=&theme=
 *
 * Every message is { source: 'opezee-licence', type, ...payload }:
 *
 *   ready        the page has loaded (the product's cue that the server is up)
 *   login        { username, client }       signed in; never the password
 *   activated    { licenseKey, valid, status, license }
 *   reactivate   the operator wants to enter a key again
 *   signOut      the operator signed out
 *   close        the details page was closed
 *
 * The product must still treat a message as a request, not a verdict: Match
 * Match re-verifies an `activated` key from its own process before it opens.
 *
 * Opened on its own in a browser, with no product around it, the pages move
 * between each other instead, so the flow can be tried end to end.
 */

export const MESSAGE_SOURCE = 'opezee-licence'

const CARRIED = ['product', 'machine', 'key', 'email', 'poc', 'company', 'status', 'theme']

/** The server's own rules, mirrored so a bad value is caught before a request. */
export const MACHINE_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
export const KEY_PATTERN = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function readParams(search = window.location.search) {
  const q = new URLSearchParams(search)
  const get = (name) => (q.get(name) || '').trim()
  return {
    product: get('product'),
    machine: get('machine'),
    key: get('key').toUpperCase(),
    email: get('email'),
    poc: get('poc'),
    company: get('company'),
    // What the product last heard, so the notice opens on the right face
    // before the page's own sync answers.
    status: get('status').toLowerCase(),
    theme: get('theme'),
    error: get('error'),
  }
}

/** True when a product is showing this page in a frame. */
export function isEmbedded() {
  try {
    return window.parent !== window
  } catch {
    return true
  }
}

/**
 * Tells the product what happened. The target is '*' because an installed
 * Electron app loads from file://, whose origin cannot be named; nothing
 * secret is ever sent — no password, only what the operator just typed or
 * what the server answered.
 */
export function notifyProduct(type, payload = {}) {
  if (!isEmbedded()) return false
  try {
    window.parent.postMessage({ source: MESSAGE_SOURCE, type, ...payload }, '*')
    return true
  } catch {
    return false
  }
}

/** A link to another /client page that keeps the product's parameters. */
export function linkTo(path, params, overrides = {}) {
  const q = new URLSearchParams()
  const merged = { ...params, ...overrides }
  for (const name of CARRIED) if (merged[name]) q.set(name, merged[name])
  const query = q.toString()
  return query ? `${path}?${query}` : path
}

/**
 * Groups the key as the server prints it, OPEZ-XXXX-XXXX-XXXX, while it is
 * typed. A dash appears as each group of four fills, but only when typing
 * forward, so a backspace over it is not undone.
 */
export function formatKeyInput(raw, previous = '') {
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)
  const grouped = clean.match(/.{1,4}/g)?.join('-') ?? ''
  const typingForward = String(raw || '').length > String(previous || '').length
  const groupJustFilled = clean.length > 0 && clean.length < 16 && clean.length % 4 === 0
  return typingForward && groupJustFilled ? `${grouped}-` : grouped
}

/** Statuses as the server spells them on /verify and /sync, and as shown. */
export const STATUS_LABELS = {
  active: 'Active',
  valid: 'Active',
  expired: 'Expired',
  pending: 'Pending',
  deactivated: 'Deactivated',
  deactive: 'Deactivated',
  invalid: 'Invalid',
  machine_mismatch: 'In use elsewhere',
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || (status ? status[0].toUpperCase() + status.slice(1) : '-')
}
