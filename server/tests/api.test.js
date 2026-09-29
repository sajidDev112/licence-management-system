/*
 * End-to-end API tests. Runs the real Express app, routes, validators and
 * service layer against an in-memory Firestore stand-in, so no credentials and
 * no network access are needed. Run with: npm test
 */
process.env.NODE_ENV = 'test'
process.env.CORS_ORIGIN = 'http://localhost:5173'
process.env.LICENSE_KEY_PREFIX = 'OPEZ'
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-the-check'

// Force email off. Without this, a configured .env would make the
// suite send real messages through the live SMTP provider.
process.env.SMTP_HOST = ''
process.env.SMTP_USER = ''
process.env.SMTP_PASS = ''

const path = require('path')
const BACKEND = path.resolve(__dirname, '..')

// ---- fake firestore ---------------------------------------------------------
let seq = 0
const store = new Map() // collectionName -> Map(id -> data)

function coll(name) {
  if (!store.has(name)) store.set(name, new Map())
  return store.get(name)
}

function makeQuery(name, filters = [], order = null, limit = null) {
  return {
    where: (f, op, v) => makeQuery(name, [...filters, [f, op, v]], order, limit),
    orderBy: (f, dir) => makeQuery(name, filters, [f, dir], limit),
    limit: (n) => makeQuery(name, filters, order, n),
    async get() {
      let docs = [...coll(name).entries()]
        .filter(([, data]) => filters.every(([f, , v]) => data[f] === v))
        .map(([id, data]) => ({ id, data: () => data, exists: true, ref: docRef(name, id) }))
      if (order) {
        const [field, dir] = order
        docs.sort((a, b) => {
          const av = a.data()[field]?.toMillis?.() ?? 0
          const bv = b.data()[field]?.toMillis?.() ?? 0
          return dir === 'desc' ? bv - av : av - bv
        })
      }
      if (limit) docs = docs.slice(0, limit)
      return { empty: docs.length === 0, docs, size: docs.length }
    },
  }
}

function docRef(name, id) {
  return {
    id,
    async get() {
      return { id, exists: coll(name).has(id), data: () => coll(name).get(id), ref: docRef(name, id) }
    },
    async set(data, options = {}) {
      coll(name).set(id, options.merge ? { ...coll(name).get(id), ...data } : { ...data })
    },
    async update(patch) {
      coll(name).set(id, { ...coll(name).get(id), ...patch })
    },
    async delete() {
      coll(name).delete(id)
    },
  }
}

const fakeCollection = (name) => ({
  ...makeQuery(name),
  async add(doc) {
    const id = `doc${++seq}`
    coll(name).set(id, { ...doc })
    return { id, get: async () => ({ id, exists: true, data: () => coll(name).get(id) }) }
  },
  doc: (id) => docRef(name, id),
})

const firebase = require(path.join(BACKEND, 'config/firebase.js'))
firebase.getDb = () => ({ collection: fakeCollection })
firebase.initFirebase = () => ({ collection: fakeCollection })

const adminService = require(path.join(BACKEND, 'services/adminService.js'))
const app = require(path.join(BACKEND, 'server.js'))

// ---- tiny test runner -------------------------------------------------------
let passed = 0
let failed = 0
function check(name, cond, extra) {
  if (cond) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`, extra !== undefined ? JSON.stringify(extra) : '')
  }
}

const ADMIN = { email: 'admin@test.com', password: 'SuperSecret123' }

// Smallest valid PNG, used for the branding tests.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`
  let token = null

  const call = async (method, url, body, opts = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      Origin: opts.origin || 'http://localhost:5173',
    }
    if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`
    const res = await fetch(base + url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, body: await res.json(), headers: res.headers }
  }

  const newLicense = (over = {}) => ({
    clientName: 'John Doe',
    companyName: 'ABC Pvt Ltd',
    clientUserId: 'john.doe',
    productName: 'My Product',
    soldBy: 'Alex Seller',
    duration: '1_year',
    startDate: '2020-01-01',
    ...over,
  })

  try {
    console.log('\n-- health --')
    check('health ok', (await call('GET', '/health')).status === 200)

    console.log('\n-- authentication --')
    await adminService.upsertAdmin({ email: ADMIN.email, password: ADMIN.password })
    check('admin list requires a token', (await call('GET', '/api/licenses')).status === 401)
    check('products require a token', (await call('GET', '/api/products')).status === 401)
    check('settings require a token', (await call('GET', '/api/admin/emails')).status === 401)
    check(
      'a garbage token is rejected',
      (await call('GET', '/api/licenses', null, { token: 'not.a.jwt' })).status === 401
    )

    const badLogin = await call('POST', '/api/admin/login', { ...ADMIN, password: 'wrong' })
    check('wrong password -> 401', badLogin.status === 401, badLogin.body)
    check('login error does not reveal which field was wrong',
      badLogin.body.message === 'Invalid email or password')
    check(
      'unknown email -> 401',
      (await call('POST', '/api/admin/login', { email: 'nobody@test.com', password: 'whatever' }))
        .status === 401
    )

    const login = await call('POST', '/api/admin/login', ADMIN)
    check('correct credentials -> 200 with token', login.status === 200 && Boolean(login.body.token))
    check('login response omits the password hash', !JSON.stringify(login.body).includes('passwordHash'))
    token = login.body.token

    const me = await call('GET', '/api/admin/me')
    check('token identifies the admin', me.body.admin.email === ADMIN.email, me.body)

    console.log('\n-- products --')
    const prod = await call('POST', '/api/products', { name: 'My Product', description: 'Test' })
    check('creates a product', prod.status === 201, prod.body)
    check(
      'rejects a duplicate product name',
      (await call('POST', '/api/products', { name: 'my product' })).status === 409
    )
    check('rejects a nameless product', (await call('POST', '/api/products', {})).status === 400)
    const prodList = await call('GET', '/api/products')
    check('lists products', prodList.body.products.length === 1)
    const prodUpd = await call('PUT', `/api/products/${prod.body.product.id}`, {
      description: 'Updated',
    })
    check('updates a product', prodUpd.body.product.description === 'Updated', prodUpd.body)

    console.log('\n-- license durations --')
    const yearly = await call('POST', '/api/licenses', newLicense())
    check('creates a license', yearly.status === 201, yearly.body)
    const lic = yearly.body.license
    check('key matches OPEZ-XXXX-XXXX-XXXX', /^OPEZ-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(lic.licenseKey))
    check('start date stored at start of day UTC', lic.startDate === '2020-01-01T00:00:00.000Z', lic.startDate)
    check('1 year computes the expiry', lic.expiryDate === '2021-01-01T23:59:59.999Z', lic.expiryDate)

    const m1 = await call('POST', '/api/licenses', newLicense({ duration: '1_month', startDate: '2020-01-31' }))
    check('1 month from 31 Jan clamps to 29 Feb',
      m1.body.license.expiryDate === '2020-02-29T23:59:59.999Z', m1.body.license.expiryDate)

    const m3 = await call('POST', '/api/licenses', newLicense({ duration: '3_months', startDate: '2020-01-01' }))
    check('3 months computes the expiry', m3.body.license.expiryDate === '2020-04-01T23:59:59.999Z')

    const m6 = await call('POST', '/api/licenses', newLicense({ duration: '6_months', startDate: '2020-01-01' }))
    check('6 months computes the expiry', m6.body.license.expiryDate === '2020-07-01T23:59:59.999Z')

    const custom = await call('POST', '/api/licenses', newLicense({
      duration: 'custom', startDate: '2020-01-01', expiryDate: '2030-06-15',
    }))
    check('custom uses the supplied expiry',
      custom.body.license.expiryDate === '2030-06-15T23:59:59.999Z', custom.body.license.expiryDate)

    const badPeriod = await call('POST', '/api/licenses', newLicense({
      duration: 'custom', startDate: '2030-01-01', expiryDate: '2029-01-01',
    }))
    check('rejects expiry before start', badPeriod.status === 400, badPeriod.body)
    check('rejects a custom duration with no expiry',
      (await call('POST', '/api/licenses', newLicense({ duration: 'custom', expiryDate: undefined }))).status === 400)
    check('rejects an unknown duration',
      (await call('POST', '/api/licenses', newLicense({ duration: '99_years' }))).status === 400)
    check('rejects a missing client user id',
      (await call('POST', '/api/licenses', newLicense({ clientUserId: '' }))).status === 400)
    check('rejects a client with neither an account nor a name supplied',
      (await call('POST', '/api/licenses', {
        clientUserId: 'ghost.user', productName: 'My Product', soldBy: 'Alex Seller',
        duration: '1_year', startDate: '2020-01-01',
      })).status === 400)

    console.log('\n-- sold by --')
    check('records who sold the license', lic.soldBy === 'Alex Seller', lic.soldBy)
    check('rejects a license with no seller',
      (await call('POST', '/api/licenses', newLicense({ soldBy: '' }))).status === 400)
    check('the seller is not exposed to the product',
      !('soldBy' in (await call('POST', '/api/licenses/verify',
        { licenseKey: lic.licenseKey }, { auth: false })).body.license))

    console.log('\n-- derived status --')
    check('ongoing period is active', custom.body.license.status === 'active')
    check('finished period is expired', m3.body.license.status === 'expired', m3.body.license.status)
    const future = await call('POST', '/api/licenses', newLicense({
      clientUserId: 'future.user', duration: '3_months', startDate: '2090-01-01',
    }))
    check('future start date is pending', future.body.license.status === 'pending', future.body.license.status)

    console.log('\n-- verification --')
    const active = custom.body.license
    const v1 = await call('POST', '/api/licenses/verify',
      { licenseKey: active.licenseKey, productName: 'My Product' }, { auth: false })
    check('valid key -> 200 valid:true', v1.status === 200 && v1.body.valid === true, v1.body)
    check('verify needs no token', !v1.headers.get('www-authenticate'))
    check('valid response carries startDate', v1.body.license.startDate === active.startDate)
    check('valid response carries expiryDate', v1.body.license.expiryDate === active.expiryDate)
    check('valid response hides the client user id and id',
      !('clientUserId' in v1.body.license) && !('id' in v1.body.license))

    const v2 = await call('POST', '/api/licenses/verify', { licenseKey: 'OPEZ-0000-0000-0000' }, { auth: false })
    check('unknown key -> 404 invalid', v2.status === 404 && v2.body.valid === false, v2.body)

    const v3 = await call('POST', '/api/licenses/verify', { licenseKey: m3.body.license.licenseKey }, { auth: false })
    check('expired key -> 200 valid:false', v3.status === 200 && v3.body.valid === false)
    check('expired message', v3.body.message === 'License has expired')
    check('expired response carries the expiry date', Boolean(v3.body.license.expiryDate))

    const v4 = await call('POST', '/api/licenses/verify', { licenseKey: future.body.license.licenseKey }, { auth: false })
    check('not-yet-started key -> valid:false, pending',
      v4.body.valid === false && v4.body.license.status === 'pending', v4.body)

    const v5 = await call('POST', '/api/licenses/verify',
      { licenseKey: active.licenseKey, productName: 'Other Product' }, { auth: false })
    check('wrong product -> not valid',
      v5.body.valid === false && v5.body.message === 'License is not valid for this product')

    const v6 = await call('POST', '/api/licenses/verify',
      { licenseKey: active.licenseKey.toLowerCase().replace(/-/g, ' ') }, { auth: false })
    check('key normalization (lowercase/spaces)', v6.body.valid === true)
    check('empty key -> 400',
      (await call('POST', '/api/licenses/verify', { licenseKey: '' }, { auth: false })).status === 400)

    console.log('\n-- sync --')
    const s1 = await call('POST', '/api/licenses/sync',
      { licenseKey: active.licenseKey, productName: 'My Product' }, { auth: false })
    check('sync returns validity and status', s1.body.valid === true && s1.body.status === 'active', s1.body)
    check('sync returns startDate and expiryDate',
      s1.body.startDate === active.startDate && s1.body.expiryDate === active.expiryDate)
    check('sync returns checkedAt', !Number.isNaN(Date.parse(s1.body.checkedAt)))
    check('sync needs no token', s1.status === 200)

    const s2 = await call('POST', '/api/licenses/sync', { licenseKey: m3.body.license.licenseKey }, { auth: false })
    check('sync reports an expired license', s2.body.valid === false && s2.body.status === 'expired')
    check('sync on unknown key -> 404',
      (await call('POST', '/api/licenses/sync', { licenseKey: 'OPEZ-0000-0000-0000' }, { auth: false })).status === 404)

    console.log('\n-- deactivation --')
    const live = custom.body.license // active: 2020-01-01 -> 2030-06-15
    check('a license starts active', live.status === 'active' && live.deactivated === false)
    check('rejects a non-boolean flag',
      (await call('PUT', `/api/licenses/${live.id}/status`, { deactivated: 'maybe' })).status === 400)
    check('deactivating requires a token',
      (await call('PUT', `/api/licenses/${live.id}/status`, { deactivated: true },
        { auth: false, token: 'bad.token' })).status === 401)
    check('deactivating an unknown license -> 404',
      (await call('PUT', '/api/licenses/nope/status', { deactivated: true })).status === 404)

    const off = await call('PUT', `/api/licenses/${live.id}/status`, { deactivated: true })
    check('deactivates the license', off.status === 200 && off.body.license.status === 'deactivated', off.body)
    check('the dates are left untouched',
      off.body.license.expiryDate === live.expiryDate && off.body.license.startDate === live.startDate)

    const vOff = await call('POST', '/api/licenses/verify',
      { licenseKey: live.licenseKey, productName: 'My Product' }, { auth: false })
    check('a deactivated key is NOT valid', vOff.status === 200 && vOff.body.valid === false, vOff.body)
    check('verify explains why', vOff.body.message === 'License has been deactivated')
    check('verify reports the deactivated status', vOff.body.license.status === 'deactivated')

    const sOff = await call('POST', '/api/licenses/sync', { licenseKey: live.licenseKey }, { auth: false })
    check('sync also reports it as not valid',
      sOff.body.valid === false && sOff.body.status === 'deactivated', sOff.body)

    const statsOff = await call('GET', '/api/licenses/stats')
    check('stats count it as deactivated, not expired',
      statsOff.body.stats.deactivatedLicenses === 1, statsOff.body.stats)

    const on = await call('PUT', `/api/licenses/${live.id}/status`, { deactivated: false })
    check('reactivates the license', on.body.license.status === 'active', on.body)
    check('the key verifies again',
      (await call('POST', '/api/licenses/verify',
        { licenseKey: live.licenseKey }, { auth: false })).body.valid === true)

    console.log('\n-- clients + stats --')
    const stats = await call('GET', '/api/licenses/stats')
    check('stats counts pending separately', stats.body.stats.pendingLicenses === 1, stats.body.stats)
    const clientList = await call('GET', '/api/clients')
    check('clients are grouped by username', clientList.body.clients.length === 2, clientList.body.count)
    const john = clientList.body.clients.find((c) => c.username === 'john.doe')
    check('client aggregates their licenses', john.totalLicenses === 5, john)
    check('a license-only client has no login yet', john.hasLogin === false)

    console.log('\n-- client accounts --')
    check('the client list requires a token',
      (await call('GET', '/api/clients', null, { auth: false, token: 'bad.token' })).status === 401)

    const newClient = {
      clientName: 'John Doe',
      companyName: 'ABC Pvt Ltd',
      username: 'john.doe',
      password: 'ClientPass123',
    }
    const created = await call('POST', '/api/clients', newClient)
    check('adds a client with credentials', created.status === 201, created.body)
    check('the password hash is never returned',
      !JSON.stringify(created.body).includes('passwordHash'), created.body)
    // The console shows the password, so admin responses carry it deliberately.
    check('admin responses include the readable password',
      created.body.client.password === 'ClientPass123', created.body.client)
    check('rejects a duplicate username',
      (await call('POST', '/api/clients', { ...newClient, username: 'JOHN.DOE' })).status === 409)
    check('rejects a short password',
      (await call('POST', '/api/clients', { ...newClient, username: 'someone.else', password: 'short' }))
        .status === 400)
    check('rejects an invalid username',
      (await call('POST', '/api/clients', { ...newClient, username: 'has spaces' })).status === 400)

    const merged = await call('GET', '/api/clients')
    const johnNow = merged.body.clients.find((c) => c.username === 'john.doe')
    check('the account merges with their existing licenses',
      johnNow.hasLogin === true && johnNow.totalLicenses === 5, johnNow)
    check('no duplicate row is created for the same username',
      merged.body.clients.filter((c) => c.username === 'john.doe').length === 1)
    check('the client list carries the readable password',
      johnNow.password === 'ClientPass123', johnNow.password)

    // The license form only sends the client; the account fills in the rest.
    const fromAccount = await call('POST', '/api/licenses', {
      clientUserId: 'john.doe', productName: 'My Product', soldBy: 'Alex Seller',
      duration: '1_year', startDate: '2020-01-01',
    })
    check('a license takes its client name from the account',
      fromAccount.status === 201 && fromAccount.body.license.clientName === 'John Doe',
      fromAccount.body)
    check('and its company from the account',
      fromAccount.body.license.companyName === 'ABC Pvt Ltd')
    await call('DELETE', `/api/licenses/${fromAccount.body.license.id}`)

    console.log('\n-- product login --')
    const badUser = await call('POST', '/api/clients/login',
      { username: 'nobody', password: 'whatever' }, { auth: false })
    check('unknown username -> 401', badUser.status === 401, badUser.body)
    check('login error does not reveal which field was wrong',
      badUser.body.message === 'Invalid username or password')
    check('wrong password -> 401',
      (await call('POST', '/api/clients/login',
        { username: 'john.doe', password: 'nope' }, { auth: false })).status === 401)

    const good = await call('POST', '/api/clients/login',
      { username: 'JOHN.DOE', password: 'ClientPass123' }, { auth: false })
    check('correct credentials -> 200 valid', good.status === 200 && good.body.valid === true, good.body)
    check('login needs no admin token', good.status === 200)
    check('username matching ignores case', good.body.client.username === 'john.doe')
    check('login returns the client identity', good.body.client.clientName === 'John Doe')
    check('login never leaks a hash or password',
      !JSON.stringify(good.body).includes('passwordHash') &&
        !JSON.stringify(good.body).includes('ClientPass123'))
    check('login returns their licenses', good.body.licenses.length === 5, good.body.licenses.length)
    check('each license carries its own validity',
      good.body.licenses.every((l) => typeof l.valid === 'boolean' && l.licenseKey))

    const filtered = await call('POST', '/api/clients/login',
      { username: 'john.doe', password: 'ClientPass123', productName: 'My Product' }, { auth: false })
    check('productName filters the licenses returned',
      filtered.body.licenses.every((l) => l.productName === 'My Product'))

    console.log('\n-- client edit + delete --')
    const clientId = created.body.client.id
    const renamed = await call('PUT', `/api/clients/${clientId}`, { clientName: 'Jonathan Doe' })
    check('updates a client without touching the password', renamed.body.client.clientName === 'Jonathan Doe')
    check('the old password still works',
      (await call('POST', '/api/clients/login',
        { username: 'john.doe', password: 'ClientPass123' }, { auth: false })).status === 200)

    await call('PUT', `/api/clients/${clientId}`, { password: 'BrandNewPass9' })
    check('changing the password invalidates the old one',
      (await call('POST', '/api/clients/login',
        { username: 'john.doe', password: 'ClientPass123' }, { auth: false })).status === 401)
    check('the new password works',
      (await call('POST', '/api/clients/login',
        { username: 'john.doe', password: 'BrandNewPass9' }, { auth: false })).status === 200)

    check('cannot delete a client that still holds licenses',
      (await call('DELETE', `/api/clients/${clientId}`)).status === 409)

    const spare = await call('POST', '/api/clients', {
      clientName: 'Temp', companyName: 'Temp Co', username: 'temp.user', password: 'TempPass123',
    })
    check('a client with no licenses can be deleted',
      (await call('DELETE', `/api/clients/${spare.body.client.id}`)).status === 200)
    check('deleting an unknown client -> 404',
      (await call('DELETE', '/api/clients/nope')).status === 404)

    console.log('\n-- update + delete --')
    const upd = await call('PUT', `/api/licenses/${lic.id}`, { soldBy: 'Dana Seller', duration: '1_month' })
    check('updates fields', upd.body.license.soldBy === 'Dana Seller', upd.body)
    // john.doe has a client account by this point, and it is authoritative.
    check('the client account supplies the name, not the license',
      upd.body.license.clientName === 'Jonathan Doe', upd.body.license.clientName)
    check('key unchanged after update', upd.body.license.licenseKey === lic.licenseKey)
    check('changing duration recomputes the expiry',
      upd.body.license.expiryDate === '2020-02-01T23:59:59.999Z', upd.body.license.expiryDate)
    check('cannot delete a product that licenses still use',
      (await call('DELETE', `/api/products/${prod.body.product.id}`)).status === 409)
    check('deletes a license', (await call('DELETE', `/api/licenses/${lic.id}`)).status === 200)
    check('deleted key no longer verifies',
      (await call('POST', '/api/licenses/verify', { licenseKey: lic.licenseKey }, { auth: false })).status === 404)

    console.log('\n-- change password --')
    check('rejects a wrong current password',
      (await call('POST', '/api/admin/change-password', {
        currentPassword: 'nope', newPassword: 'BrandNewPass1', confirmPassword: 'BrandNewPass1',
      })).status === 400)
    check('rejects a mismatched confirmation',
      (await call('POST', '/api/admin/change-password', {
        currentPassword: ADMIN.password, newPassword: 'BrandNewPass1', confirmPassword: 'Different1',
      })).status === 400)
    check('rejects a too-short password',
      (await call('POST', '/api/admin/change-password', {
        currentPassword: ADMIN.password, newPassword: 'short', confirmPassword: 'short',
      })).status === 400)
    const changed = await call('POST', '/api/admin/change-password', {
      currentPassword: ADMIN.password, newPassword: 'BrandNewPass1', confirmPassword: 'BrandNewPass1',
    })
    check('changes the password', changed.status === 200, changed.body)
    check('the old password no longer works',
      (await call('POST', '/api/admin/login', ADMIN, { auth: false })).status === 401)
    check('the new password works',
      (await call('POST', '/api/admin/login', { email: ADMIN.email, password: 'BrandNewPass1' })).status === 200)

    console.log('\n-- email configuration --')
    const e1 = await call('POST', '/api/admin/emails', { email: 'first@test.com' })
    check('adds an email', e1.status === 201, e1.body)
    check('the first email becomes the default', e1.body.email.isDefault === true)
    const e2 = await call('POST', '/api/admin/emails', { email: 'second@test.com', label: 'Billing' })
    check('a later email is not default', e2.body.email.isDefault === false)
    check('rejects a duplicate email',
      (await call('POST', '/api/admin/emails', { email: 'FIRST@test.com' })).status === 409)
    check('rejects an invalid email',
      (await call('POST', '/api/admin/emails', { email: 'not-an-email' })).status === 400)
    check('refuses to delete the default while others exist',
      (await call('DELETE', `/api/admin/emails/${e1.body.email.id}`)).status === 400)

    await call('PUT', `/api/admin/emails/${e2.body.email.id}/default`)
    const emailList = await call('GET', '/api/admin/emails')
    const defaults = emailList.body.emails.filter((e) => e.isDefault)
    check('exactly one email is default after switching', defaults.length === 1, emailList.body.emails)
    check('the newly chosen email is the default', defaults[0].email === 'second@test.com')
    check('the previous default can now be deleted',
      (await call('DELETE', `/api/admin/emails/${e1.body.email.id}`)).status === 200)

    console.log('\n-- branding --')
    const b0 = await call('GET', '/api/admin/branding', null, { auth: false })
    check('branding is readable without a token', b0.status === 200, b0.body)
    check('no logo configured initially', b0.body.branding.logo === null)
    check('uploading a logo requires a token',
      (await call('PUT', '/api/admin/branding', { logo: TINY_PNG }, { auth: false, token: 'bad.token' })).status === 401)
    check('rejects a non-image data url',
      (await call('PUT', '/api/admin/branding', { logo: 'data:text/html;base64,PHN2Zz4=' })).status === 400)
    check('rejects a malformed data url',
      (await call('PUT', '/api/admin/branding', { logo: 'just-a-string' })).status === 400)
    check('rejects an oversized image',
      (await call('PUT', '/api/admin/branding', { logo: `data:image/png;base64,${'A'.repeat(700001)}` })).status === 400)
    const bSet = await call('PUT', '/api/admin/branding', { logo: TINY_PNG, fileName: 'logo.png' })
    check('saves the logo', bSet.status === 200 && bSet.body.branding.logo === TINY_PNG, bSet.body)
    check('records the mime type', bSet.body.branding.mimeType === 'image/png')
    check('records the file name', bSet.body.branding.fileName === 'logo.png')
    const bRead = await call('GET', '/api/admin/branding', null, { auth: false })
    check('the saved logo is served publicly', bRead.body.branding.logo === TINY_PNG)
    check('removes the logo', (await call('DELETE', '/api/admin/branding')).body.branding.logo === null)

    console.log('\n-- share by email --')
    const shareable = m6.body.license
    check('mail status requires a token',
      (await call('GET', '/api/licenses/mail-status', null, { auth: false, token: 'bad.token' }))
        .status === 401)
    const mailStatus = await call('GET', '/api/licenses/mail-status')
    check('mail status reports whether SMTP is configured',
      mailStatus.status === 200 && typeof mailStatus.body.configured === 'boolean', mailStatus.body)
    check('sharing requires a token',
      (await call('POST', `/api/licenses/${shareable.id}/share`, { recipients: ['a@b.com'] },
        { auth: false, token: 'bad.token' })).status === 401)
    check('rejects an empty recipient list',
      (await call('POST', `/api/licenses/${shareable.id}/share`, { recipients: [] })).status === 400)
    check('rejects an invalid recipient',
      (await call('POST', `/api/licenses/${shareable.id}/share`, { recipients: ['not-an-email'] }))
        .status === 400)
    check('rejects more than ten recipients',
      (await call('POST', `/api/licenses/${shareable.id}/share`, {
        recipients: Array.from({ length: 11 }, (_, i) => `user${i}@test.com`),
      })).status === 400)
    // No SMTP in the test environment, so a valid request reports that clearly
    // rather than failing in some opaque way.
    const noSmtp = await call('POST', `/api/licenses/${shareable.id}/share`, {
      recipients: ['client@test.com'],
    })
    check('without SMTP configured it answers 503, not 500',
      noSmtp.status === 503 && noSmtp.body.code === 'MAIL_NOT_CONFIGURED', noSmtp.body)
    check('sharing an unknown license -> 404',
      (await call('POST', '/api/licenses/nope/share', { recipients: ['a@b.com'] })).status === 404)

    console.log('\n-- cors --')
    const foreign = await call('POST', '/api/licenses/verify',
      { licenseKey: 'OPEZ-2222-2222-2222' }, { auth: false, origin: 'https://my-product.example.com' })
    check('verify reachable from a foreign origin', foreign.status === 404)
    check('verify sends wildcard CORS header',
      foreign.headers.get('access-control-allow-origin') === '*')
    const foreignSync = await call('POST', '/api/licenses/sync',
      { licenseKey: 'OPEZ-2222-2222-2222' }, { auth: false, origin: 'https://my-product.example.com' })
    check('sync reachable from a foreign origin', foreignSync.status === 404)
    check('admin API rejects an unknown origin',
      (await call('GET', '/api/licenses', null, { origin: 'https://evil.example.com' })).status === 403)

    console.log('\n-- rate limiting --')
    let limited = false
    for (let i = 0; i < 25; i++) {
      const r = await call('POST', '/api/licenses/verify', { licenseKey: 'OPEZ-1111-1111-1111' }, { auth: false })
      if (r.status === 429) { limited = true; break }
    }
    check('verify endpoint rate limits burst traffic', limited)

    console.log('\n-- error shape --')
    const nf = await call('GET', '/api/does-not-exist')
    check('unknown route -> 404 json', nf.status === 404 && nf.body.success === false)
    check('no stack traces in responses', !JSON.stringify(nf.body).includes('at '))
  } catch (e) {
    failed++
    console.error('  FAIL  threw:', e)
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  server.close()
  process.exit(failed ? 1 : 0)
})
