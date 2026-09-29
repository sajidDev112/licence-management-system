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
    clientName: account?.clientName || data.clientName,
    companyName: account?.companyName || data.companyName,
    clientUserId,
    productName: data.productName,
    // Who sold this license. Blank on licenses created before it was tracked.
    soldBy: data.soldBy || '',
    duration: data.duration || 'custom',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    startDate: toIso(startDate),
    expiryDate: toIso(data.expiryDate),
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

async function createLicense(payload) {
  const directory = await clientDirectory();
  const account = directory.get(normalizeUserId(payload.clientUserId));

  // The form only asks for the client; their name and company come from the
  // account. They may still be passed explicitly for a user ID with no account.
  const clientName = payload.clientName || account?.clientName;
  const companyName = payload.companyName || account?.companyName;
  if (!clientName || !companyName) {
    throw new ApiError(
      400,
      'Select a client, or add them on the Clients page first',
      'UNKNOWN_CLIENT'
    );
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
    clientUserId: payload.clientUserId,
    productName: payload.productName,
    soldBy: payload.soldBy,
    duration: period.duration,
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
async function checkLicense({ licenseKey, productName }) {
  const key = normalizeLicenseKey(licenseKey);
  const snap = await collection().where('licenseKey', '==', key).limit(1).get();

  if (snap.empty) return { outcome: 'not_found' };

  const license = toPublicLicense(snap.docs[0], await clientDirectory());

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

  return { outcome: 'valid', license };
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
  checkLicense,
  getStats,
  listClients,
  computeStatus,
  toPublicLicense,
  FieldValue,
};
