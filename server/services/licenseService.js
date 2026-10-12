'use strict';

const { getDb, Timestamp, FieldValue } = require('../config/firebase');
const { ApiError } = require('../middleware/errorHandler');
const { resolveLicensePeriod } = require('../utils/licenseDates');
const {
  generateLicenseKey,
  normalizeLicenseKey,
} = require('../utils/generateLicenseKey');

const COLLECTION = 'licenses';

function collection() {
  return getDb().collection(COLLECTION);
}

const normalizeUserId = (value) => String(value || '').trim().toLowerCase();
const normalizeMachine = (value) => String(value || '').trim().toLowerCase();

/**
 * username -> { clientName, companyName } for every client account.
 *
 * Read directly from the collection rather than through clientService, which
 * depends on this module; going the other way would be a require cycle.
 */
async function clientDirectory() {
  const snap = await getDb().collection('clients').get();
  const map = new Map();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    if (!data.username) return;
    map.set(normalizeUserId(data.username), {
      clientName: data.clientName,
      companyName: data.companyName,
    });
  });
  return map;
}

/** Firestore Timestamp | Date | string -> ISO string (or null). */
function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Status is always derived, never read from the stored field — a document
 * written a year ago would otherwise still claim to be "active".
 *
 * - deactivated: switched off by an admin; overrides the dates, because it is
 *   an explicit decision and the admin needs to see that it is in force
 * - pending: the start date is in the future
 * - active:  start date reached and expiry not yet passed
 * - expired: expiry date has passed
 */
function computeStatus(startDate, expiryDate, deactivated = false, now = new Date()) {
  if (deactivated) return 'deactivated';

  const expiryIso = toIso(expiryDate);
  if (!expiryIso) return 'expired';
  if (new Date(expiryIso).getTime() <= now.getTime()) return 'expired';

  const startIso = toIso(startDate);
  if (startIso && new Date(startIso).getTime() > now.getTime()) return 'pending';

  return 'active';
}

function toPublicLicense(doc, directory) {
  const data = doc.data();
  // Licenses created before start dates and the user-id rename fall back to
  // their old fields, so existing documents keep working untouched.
  const startDate = data.startDate || data.createdAt;
  const clientUserId = data.clientUserId || data.clientEmail || '';
  const deactivated = Boolean(data.deactivated);

  // The client account is authoritative; the stored copies are the fallback for
  // licenses issued to a user ID that has no account.
  const account = directory?.get(normalizeUserId(clientUserId));

  return {
    id: doc.id,
    licenseKey: data.licenseKey,
    // The name stored on the license wins: it is what the admin typed on the
    // form. A linked client account is only the fallback, for licenses issued
    // before the name was captured directly.
    clientName: data.clientName || account?.clientName || '',
    companyName: data.companyName || account?.companyName || '',
    clientUserId,
    productName: data.productName,
    // Who sold this license. Blank on licenses created before it was tracked.
    soldBy: data.soldBy || '',
    duration: data.duration || 'custom',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    startDate: toIso(startDate),
    expiryDate: toIso(data.expiryDate),
    // The machine this license is locked to. Empty until a product first
    // verifies with one, which claims it.
    machineNumber: data.machineNumber || '',
    deactivated,
    status: computeStatus(startDate, data.expiryDate, deactivated),
  };
}

/** Generates a key and confirms it is unused before handing it back. */
async function generateUniqueLicenseKey(attempts = 6) {
  for (let i = 0; i < attempts; i += 1) {
    const key = generateLicenseKey();
    const existing = await collection().where('licenseKey', '==', key).limit(1).get();
    if (existing.empty) return key;
  }
  throw new ApiError(500, 'Could not allocate a unique license key', 'KEY_ALLOCATION_FAILED');
}

/**
 * The login of the one existing POC account with this name, if there is
 * exactly one.
 *
 * A POC is one person with many licenses, so a license issued by name alone
 * has to land on that person's account — otherwise the Clients page shows a
 * second row for them and the product login never sees the license. Two
 * accounts sharing a name cannot be told apart here; the form makes the
 * admin pick, and this leaves the license unlinked rather than guess.
 */
function soleAccountNamed(directory, clientName) {
  const name = normalizeUserId(clientName);
  if (!name) return '';
  const matches = [...directory.entries()].filter(
    ([, account]) => normalizeUserId(account.clientName) === name
  );
  return matches.length === 1 ? matches[0][0] : '';
}

async function createLicense(payload) {
  const directory = await clientDirectory();
  const clientUserId =
    normalizeUserId(payload.clientUserId) || soleAccountNamed(directory, payload.clientName);
  payload = { ...payload, clientUserId };
  const account = directory.get(clientUserId);

  // The name typed on the form wins. A matching client account only fills in
  // what was left blank, so a license can name a client who has no account.
  const clientName = payload.clientName || account?.clientName;
  const companyName = payload.companyName || account?.companyName || '';
  if (!clientName) {
    throw new ApiError(400, 'Client name is required', 'CLIENT_NAME_REQUIRED');
  }

  const licenseKey = await generateUniqueLicenseKey();
  const period = resolveLicensePeriod({
    startDate: payload.startDate,
    expiryDate: payload.expiryDate,
    duration: payload.duration,
  });

  const startTs = Timestamp.fromDate(period.startDate);
  const expiryTs = Timestamp.fromDate(period.expiryDate);

  const doc = {
    licenseKey,
    clientName,
    companyName,
    clientUserId: payload.clientUserId || '',
    productName: payload.productName,
    soldBy: payload.soldBy,
    duration: period.duration,
    // Claimed by the first machine that verifies this key.
    machineNumber: '',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    startDate: startTs,
    expiryDate: expiryTs,
    deactivated: false,
    // Stored for convenience when browsing Firestore; the API always recomputes.
    status: computeStatus(startTs, expiryTs, false),
  };

  const ref = await collection().add(doc);
  return toPublicLicense(await ref.get(), await clientDirectory());
}

async function listLicenses() {
  const [snap, directory] = await Promise.all([
    collection().orderBy('createdAt', 'desc').get(),
    clientDirectory(),
  ]);
  return snap.docs.map((doc) => toPublicLicense(doc, directory));
}

async function getLicenseById(id) {
  const doc = await collection().doc(id).get();
  if (!doc.exists) throw new ApiError(404, 'License not found', 'LICENSE_NOT_FOUND');
  return toPublicLicense(doc, await clientDirectory());
}

async function updateLicense(id, payload) {
  const ref = collection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new ApiError(404, 'License not found', 'LICENSE_NOT_FOUND');

  const current = toPublicLicense(doc, await clientDirectory());
  const updates = { updatedAt: Timestamp.now() };

  ['clientName', 'companyName', 'clientUserId', 'productName', 'soldBy'].forEach((field) => {
    if (payload[field] !== undefined) updates[field] = payload[field];
  });

  // The client name identifies the license everywhere it is listed, so an edit
  // is never allowed to leave it blank.
  if (updates.clientName !== undefined && !String(updates.clientName).trim()) {
    delete updates.clientName;
  }

  // An unlinked license given an existing POC's name joins that POC, exactly
  // as a new one would. A license already linked keeps its link.
  if (!normalizeUserId(updates.clientUserId ?? current.clientUserId)) {
    const linked = soleAccountNamed(
      await clientDirectory(),
      updates.clientName ?? current.clientName
    );
    if (linked) updates.clientUserId = linked;
  }

  // Any change to the period is re-resolved as a whole, so a new duration
  // recomputes the expiry from whichever start date now applies.
  const touchesPeriod =
    payload.startDate !== undefined ||
    payload.expiryDate !== undefined ||
    payload.duration !== undefined;

  if (touchesPeriod) {
    const period = resolveLicensePeriod({
      startDate: payload.startDate ?? current.startDate,
      expiryDate: payload.expiryDate ?? current.expiryDate,
      duration: payload.duration ?? current.duration,
    });
    updates.startDate = Timestamp.fromDate(period.startDate);
    updates.expiryDate = Timestamp.fromDate(period.expiryDate);
    updates.duration = period.duration;
    updates.status = computeStatus(updates.startDate, updates.expiryDate, current.deactivated);
  }

  // licenseKey is deliberately not updatable — clients already hold it.

  await ref.update(updates);
  return toPublicLicense(await ref.get(), await clientDirectory());
}

/**
 * Switches a license off or back on. A deactivated license keeps its dates but
 * stops verifying immediately, so a client's product loses access on its next
 * check without the admin having to delete anything.
 */
async function setLicenseDeactivated(id, deactivated) {
  const ref = collection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new ApiError(404, 'License not found', 'LICENSE_NOT_FOUND');

  const data = doc.data();
  await ref.update({
    deactivated: Boolean(deactivated),
    status: computeStatus(data.startDate || data.createdAt, data.expiryDate, Boolean(deactivated)),
    updatedAt: Timestamp.now(),
  });

  return toPublicLicense(await ref.get(), await clientDirectory());
}

/**
 * Points licenses that only name a client at a newly created account.
 *
 * A license created from the Licenses page carries a client name but no user
 * ID. When credentials are later added for that name, those licenses have to
 * adopt the new username — otherwise the Clients page keeps showing two rows
 * for the same person and the product login finds no licenses for them.
 *
 * Only licenses with no user ID at all are touched; one already linked to
 * someone keeps its link.
 */
async function adoptUnlinkedLicenses(clientName, username, companyName) {
  const name = normalizeUserId(clientName);
  const user = normalizeUserId(username);
  const company = normalizeUserId(companyName);
  if (!name || !user) return 0;

  const snap = await collection().get();
  const orphans = snap.docs.filter((doc) => {
    const data = doc.data();
    if (normalizeUserId(data.clientUserId)) return false;
    if (normalizeUserId(data.clientName) !== name) return false;

    // Client names may repeat across companies, so a license that names a
    // company only joins an account with the same one. A license with no
    // company recorded — the usual case from the Licenses form — goes by name.
    const licenseCompany = normalizeUserId(data.companyName);
    return !licenseCompany || !company || licenseCompany === company;
  });

  await Promise.all(
    orphans.map((doc) => doc.ref.update({ clientUserId: user, updatedAt: Timestamp.now() }))
  );
  return orphans.length;
}

async function deleteLicense(id) {
  const ref = collection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new ApiError(404, 'License not found', 'LICENSE_NOT_FOUND');
  await ref.delete();
  return { id };
}

/**
 * Shared lookup behind both /verify and /sync. Returns a plain result object
 * rather than throwing, because each outcome maps to a specific response body.
 */
/**
 * Shared lookup behind both /verify and /sync.
 *
 * A license is tied to one machine. The first machine to verify a key claims
 * it, and from then on only that machine can use it — which is what stops one
 * key being installed on several systems.
 */
async function checkLicense({ licenseKey, productName, machineNumber }) {
  const key = normalizeLicenseKey(licenseKey);
  const snap = await collection().where('licenseKey', '==', key).limit(1).get();

  if (snap.empty) return { outcome: 'not_found' };

  const doc = snap.docs[0];
  const license = toPublicLicense(doc, await clientDirectory());

  // Product is checked before dates: a key used in the wrong product should say
  // so, rather than leaking that it happens to be expired elsewhere.
  if (
    productName &&
    license.productName.trim().toLowerCase() !== String(productName).trim().toLowerCase()
  ) {
    return { outcome: 'product_mismatch', license };
  }

  if (license.status === 'deactivated') return { outcome: 'deactivated', license };
  if (license.status === 'expired') return { outcome: 'expired', license };
  if (license.status === 'pending') return { outcome: 'pending', license };

  const claimed = normalizeMachine(license.machineNumber);
  const asking = normalizeMachine(machineNumber);

  if (claimed) {
    // Refusing a request that names no machine matters as much as refusing a
    // wrong one: otherwise the lock is bypassed by simply omitting the field.
    if (!asking || asking !== claimed) return { outcome: 'machine_mismatch', license };
  } else if (asking) {
    // First use on this key: the machine claims it.
    await doc.ref.update({ machineNumber: String(machineNumber).trim(), updatedAt: Timestamp.now() });
    license.machineNumber = String(machineNumber).trim();
  }

  return { outcome: 'valid', license };
}


/**
 * Self-service updates made by the product itself, not by an admin.
 *
 * The caller proves it is entitled with the same pair /verify uses: the license
 * key plus the machine that claimed it. There is no token — the product holds
 * no admin credentials — so these endpoints can only ever touch the one license
 * whose key and machine both match, and only while that license is usable.
 *
 * Whatever the product changes is also written to the linked client account
 * when there is one, so the Clients page and the product login stay in step
 * with the Licenses page rather than drifting apart.
 */
async function updateLicenseContact({ licenseKey, machineNumber, productName, clientName, clientUserId }) {
  const key = normalizeLicenseKey(licenseKey);
  const snap = await collection().where('licenseKey', '==', key).limit(1).get();
  if (snap.empty) throw new ApiError(404, 'Invalid license key', 'LICENSE_NOT_FOUND');

  const ref = snap.docs[0].ref;
  const current = toPublicLicense(snap.docs[0], await clientDirectory());

  if (
    productName &&
    current.productName.trim().toLowerCase() !== String(productName).trim().toLowerCase()
  ) {
    throw new ApiError(403, 'License is not valid for this product', 'PRODUCT_MISMATCH');
  }

  // A license that cannot be used cannot be edited either: an expired or
  // switched-off installation has no business rewriting its own record.
  if (current.status !== 'active') {
    throw new ApiError(403, `License is ${current.status}`, 'LICENSE_NOT_ACTIVE');
  }

  // The machine lock is the authentication here, so it is required — an
  // unclaimed license has nobody to prove they are the holder.
  const claimed = normalizeMachine(current.machineNumber);
  if (!claimed) {
    throw new ApiError(
      403,
      'This license has not been activated on a machine yet',
      'LICENSE_NOT_CLAIMED'
    );
  }
  if (normalizeMachine(machineNumber) !== claimed) {
    throw new ApiError(403, 'License is already in use on another machine', 'MACHINE_MISMATCH');
  }

  const updates = { updatedAt: Timestamp.now() };
  if (clientName !== undefined) updates.clientName = String(clientName).trim();
  if (clientUserId !== undefined) updates.clientUserId = String(clientUserId).trim();

  // Keep the linked client account in step, matched on the user id the license
  // had *before* this change.
  const clients = getDb().collection('clients');
  const accountSnap = await clients
    .where('username', '==', normalizeUserId(current.clientUserId))
    .limit(1)
    .get();

  if (!accountSnap.empty) {
    const account = accountSnap.docs[0];
    const accountUpdates = { updatedAt: Timestamp.now() };

    if (updates.clientName) accountUpdates.clientName = updates.clientName;

    if (updates.clientUserId !== undefined) {
      const nextUsername = normalizeUserId(updates.clientUserId);
      // The username is how the client signs in to the product, so it still has
      // to be unique even when the product is the one changing it.
      const clash = await clients.where('username', '==', nextUsername).limit(1).get();
      if (!clash.empty && clash.docs[0].id !== account.id) {
        throw new ApiError(409, 'That email is already in use', 'EMAIL_TAKEN');
      }
      accountUpdates.username = nextUsername;
    }

    await account.ref.update(accountUpdates);
  }

  await ref.update(updates);
  return toPublicLicense(await ref.get(), await clientDirectory());
}

/**
 * Carries an edited client account through to their licenses.
 *
 * Licenses are matched to a client by user id, and the Licenses table shows the
 * name stored on the license. So renaming a client — or changing the email they
 * sign in with — has to reach their licenses too, or the Clients page splits
 * into two rows for the same person and the two pages disagree.
 */
async function relinkClientLicenses(previousUsername, { username, clientName, companyName }) {
  const previous = normalizeUserId(previousUsername);
  if (!previous) return 0;

  const snap = await collection().get();
  const mine = snap.docs.filter((doc) => normalizeUserId(doc.data().clientUserId) === previous);
  if (!mine.length) return 0;

  const updates = { updatedAt: Timestamp.now() };
  if (username !== undefined) updates.clientUserId = normalizeUserId(username);
  if (clientName !== undefined) updates.clientName = String(clientName).trim();
  if (companyName !== undefined) updates.companyName = String(companyName).trim();

  await Promise.all(mine.map((doc) => doc.ref.update(updates)));
  return mine.length;
}

async function getStats() {
  const licenses = await listLicenses();
  const active = licenses.filter((l) => l.status === 'active').length;
  const pending = licenses.filter((l) => l.status === 'pending').length;
  const deactivated = licenses.filter((l) => l.status === 'deactivated').length;
  // Distinct clients are keyed on the client user id, the stable identifier.
  const clients = new Set(licenses.map((l) => (l.clientUserId || '').toLowerCase()));

  return {
    totalClients: clients.size,
    activeLicenses: active,
    pendingLicenses: pending,
    deactivatedLicenses: deactivated,
    expiredLicenses: licenses.length - active - pending - deactivated,
    totalLicenses: licenses.length,
  };
}

/**
 * Clients are derived from licenses rather than stored separately, so they can
 * never drift out of sync with the licenses that define them.
 */
async function listClients() {
  const licenses = await listLicenses();
  const byClient = new Map();

  licenses.forEach((license) => {
    const key = (license.clientUserId || '').toLowerCase();
    if (!byClient.has(key)) {
      byClient.set(key, {
        clientUserId: license.clientUserId,
        clientName: license.clientName,
        companyName: license.companyName,
        products: [],
        totalLicenses: 0,
        activeLicenses: 0,
        expiredLicenses: 0,
        pendingLicenses: 0,
        deactivatedLicenses: 0,
        latestExpiry: null,
      });
    }

    const client = byClient.get(key);
    client.totalLicenses += 1;
    if (license.status === 'active') client.activeLicenses += 1;
    else if (license.status === 'pending') client.pendingLicenses += 1;
    else if (license.status === 'deactivated') client.deactivatedLicenses += 1;
    else client.expiredLicenses += 1;

    if (license.productName && !client.products.includes(license.productName)) {
      client.products.push(license.productName);
    }
    if (!client.latestExpiry || license.expiryDate > client.latestExpiry) {
      client.latestExpiry = license.expiryDate;
    }
  });

  return [...byClient.values()].sort((a, b) =>
    (a.clientName || '').localeCompare(b.clientName || '')
  );
}

module.exports = {
  COLLECTION,
  createLicense,
  listLicenses,
  getLicenseById,
  updateLicense,
  setLicenseDeactivated,
  deleteLicense,
  adoptUnlinkedLicenses,
  relinkClientLicenses,
  checkLicense,
  updateLicenseContact,
  getStats,
  listClients,
  computeStatus,
  toPublicLicense,
  FieldValue,
};
