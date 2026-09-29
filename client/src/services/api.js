import axios from 'axios'

const TOKEN_KEY = 'lm.token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage unavailable — the session simply will not survive a refresh.
  }
}

// In production the Express server serves this build, so a relative '/api'
// hits the same origin and needs no configuration. Local development sets
// VITE_API_BASE_URL because Vite (5173) and the API (5000) are separate.
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
})

client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/** Raw backend/network errors are turned into a single readable message. */
function toFriendlyError(error) {
  if (error.response) {
    const data = error.response.data || {}
    const err = new Error(
      Array.isArray(data.errors) && data.errors.length
        ? data.errors.map((e) => e.message).join(', ')
        : data.message ||
          (error.response.status === 429
            ? 'Too many requests. Please wait a moment.'
            : 'The server could not complete that request.')
    )
    err.status = error.response.status
    err.code = data.code
    return err
  }
  if (error.code === 'ECONNABORTED') return new Error('The request timed out. Please try again.')
  return new Error('Cannot reach the server. Is the backend running?')
}

// Set by AuthContext so an expired token bounces the admin to the login page.
let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const friendly = toFriendlyError(error)
    // A failed sign-in is handled by the login form itself, not a global redirect.
    const isLoginAttempt = error.config?.url?.includes('/admin/login')
    if (friendly.status === 401 && !isLoginAttempt && onUnauthorized) onUnauthorized()
    return Promise.reject(friendly)
  }
)

export const authApi = {
  login: (payload) => client.post('/admin/login', payload).then((r) => r.data),
  me: () => client.get('/admin/me').then((r) => r.data.admin),
  changePassword: (payload) => client.post('/admin/change-password', payload).then((r) => r.data),
}

export const licenseApi = {
  list: () => client.get('/licenses').then((r) => r.data.licenses),
  stats: () => client.get('/licenses/stats').then((r) => r.data.stats),
  get: (id) => client.get(`/licenses/${id}`).then((r) => r.data.license),
  create: (payload) => client.post('/licenses', payload).then((r) => r.data.license),
  update: (id, payload) => client.put(`/licenses/${id}`, payload).then((r) => r.data.license),
  mailStatus: () => client.get('/licenses/mail-status').then((r) => r.data.configured),
  share: (id, recipients) =>
    client.post(`/licenses/${id}/share`, { recipients }).then((r) => r.data),
  setStatus: (id, deactivated) =>
    client.put(`/licenses/${id}/status`, { deactivated }).then((r) => r.data.license),
  remove: (id) => client.delete(`/licenses/${id}`).then((r) => r.data),
  verify: (payload) => client.post('/licenses/verify', payload).then((r) => r.data),
}

export const productApi = {
  list: () => client.get('/products').then((r) => r.data.products),
  create: (payload) => client.post('/products', payload).then((r) => r.data.product),
  update: (id, payload) => client.put(`/products/${id}`, payload).then((r) => r.data.product),
  remove: (id) => client.delete(`/products/${id}`).then((r) => r.data),
}

export const clientApi = {
  list: () => client.get('/clients').then((r) => r.data.clients),
  create: (payload) => client.post('/clients', payload).then((r) => r.data.client),
  update: (id, payload) => client.put(`/clients/${id}`, payload).then((r) => r.data.client),
  remove: (id) => client.delete(`/clients/${id}`).then((r) => r.data),
}

export const brandingApi = {
  get: () => client.get('/admin/branding').then((r) => r.data.branding),
  setLogo: (payload) => client.put('/admin/branding', payload).then((r) => r.data.branding),
  clearLogo: () => client.delete('/admin/branding').then((r) => r.data.branding),
}

export const emailApi = {
  list: () => client.get('/admin/emails').then((r) => r.data.emails),
  add: (payload) => client.post('/admin/emails', payload).then((r) => r.data.email),
  update: (id, payload) => client.put(`/admin/emails/${id}`, payload).then((r) => r.data.email),
  setDefault: (id) => client.put(`/admin/emails/${id}/default`).then((r) => r.data.email),
  remove: (id) => client.delete(`/admin/emails/${id}`).then((r) => r.data),
}

export default client
