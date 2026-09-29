'use strict';

const bcrypt = require('bcryptjs');

const { getDb, Timestamp } = require('../config/firebase');
const { ApiError } = require('../middleware/errorHandler');
const licenseService = require('./licenseService');

const COLLECTION = 'clients';
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

function collection() {
  return getDb().collection(COLLECTION);
}

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const normalizeUsername = (value) => String(value || '').trim().toLowerCase();

/**
 * Never leaks passwordHash. The readable password is opt-in and is only passed
 * for admin-facing responses — never from the product login endpoint.
 */
function toPublicClient(doc, { includePassword = false } = {}) {
  const data = doc.data();
  return {
    id: doc.id,
    clientName: data.clientName,
    companyName: data.companyName,
    username: data.username,
    ...(includePassword ? { password: data.password || '' } : {}),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

async function findByUsername(username) {
  const snap = await collection()
    .where('username', '==', normalizeUsername(username))
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

/** Usernames are the product's login identity, so they must be unique. */
async function assertUsernameAvailable(username, exceptId) {
  const existing = await findByUsername(username);
  if (existing && existing.id !== exceptId) {
    throw new ApiError(409, 'That username is already taken', 'USERNAME_TAKEN');
  }
}

function assertPasswordStrength(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(
      400,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      'WEAK_PASSWORD'
    );
  }
}

async function createClient({ clientName, companyName, username, password }) {
  const normalized = normalizeUsername(username);
  await assertUsernameAvailable(normalized);
  assertPasswordStrength(password);

  const ref = await collection().add({
    clientName,
    companyName,
    username: normalized,
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    password,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  return toPublicClient(await ref.get(), { includePassword: true });
}

async function getClientById(id) {
  const doc = await collection().doc(id).get();
  if (!doc.exists) throw new ApiError(404, 'Client not found', 'CLIENT_NOT_FOUND');
  return toPublicClient(doc, { includePassword: true });
}

async function updateClient(id, { clientName, companyName, username, password }) {
  const ref = collection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new ApiError(404, 'Client not found', 'CLIENT_NOT_FOUND');

  const updates = { updatedAt: Timestamp.now() };
  if (clientName !== undefined) updates.clientName = clientName;
  if (companyName !== undefined) updates.companyName = companyName;

  if (username !== undefined) {
    const normalized = normalizeUsername(username);
    await assertUsernameAvailable(normalized, id);
    updates.username = normalized;
  }

  // Blank means "leave the password alone" — the edit form does not prefill it.
  if (password) {
    assertPasswordStrength(password);
    updates.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    updates.password = password;
  }

  await ref.update(updates);
  return toPublicClient(await ref.get(), { includePassword: true });
}

async function deleteClient(id) {
  const ref = collection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new ApiError(404, 'Client not found', 'CLIENT_NOT_FOUND');

  // Licenses are matched to a client by username, so removing the account
  // while licenses still point at it would strand them.
  const username = doc.data().username;
  const licenses = await licenseService.listLicenses();
  const inUse = licenses.some((l) => normalizeUsername(l.clientUserId) === username);
  if (inUse) {
    throw new ApiError(
      409,
      'This client still has licenses. Delete those licenses first.',
      'CLIENT_IN_USE'
    );
  }

  await ref.delete();
  return { id };
}

/**
 * The Clients page shows two kinds of row:
 *   - registered clients, who have login credentials for the product
 *   - user IDs that only appear on a license, kept visible so nothing is lost
 *     and so credentials can be added for them
 */
async function listClients() {
  const [snap, licenses] = await Promise.all([
    collection().orderBy('createdAt', 'desc').get(),
    licenseService.listLicenses(),
  ]);

  const rows = new Map();

  snap.docs.forEach((doc) => {
    const client = toPublicClient(doc, { includePassword: true });
    rows.set(normalizeUsername(client.username), {
      ...client,
      hasLogin: true,
      products: [],
      totalLicenses: 0,
      activeLicenses: 0,
      pendingLicenses: 0,
      expiredLicenses: 0,
      deactivatedLicenses: 0,
      latestExpiry: null,
    });
  });

  licenses.forEach((license) => {
    const key = normalizeUsername(license.clientUserId);
    if (!key) return;

    if (!rows.has(key)) {
      rows.set(key, {
        id: null,
        hasLogin: false,
        password: '',
        clientName: license.clientName,
        companyName: license.companyName,
        username: license.clientUserId,
        createdAt: null,
        updatedAt: null,
        products: [],
        totalLicenses: 0,
        activeLicenses: 0,
        pendingLicenses: 0,
        expiredLicenses: 0,
        deactivatedLicenses: 0,
        latestExpiry: null,
      });
    }

    const row = rows.get(key);
    row.totalLicenses += 1;
    if (license.status === 'active') row.activeLicenses += 1;
    else if (license.status === 'pending') row.pendingLicenses += 1;
    else if (license.status === 'deactivated') row.deactivatedLicenses += 1;
    else row.expiredLicenses += 1;

    if (license.productName && !row.products.includes(license.productName)) {
      row.products.push(license.productName);
    }
    if (!row.latestExpiry || license.expiryDate > row.latestExpiry) {
      row.latestExpiry = license.expiryDate;
    }
  });

  return [...rows.values()].sort((a, b) =>
    (a.clientName || '').localeCompare(b.clientName || '')
  );
}

/**
 * Credential check for the product's own login screen. Returns the client and
 * the licenses issued to them, so the product can authenticate and decide what
 * the user may access in a single call.
 */
async function login({ username, password, productName }) {
  const doc = await findByUsername(username);

  // Compare against a dummy hash when the username is unknown, so that a wrong
  // username and a wrong password take the same time to answer.
  const hash = doc
    ? doc.data().passwordHash
    : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
  const ok = await bcrypt.compare(String(password), hash);

  if (!doc || !ok) {
    throw new ApiError(401, 'Invalid username or password', 'INVALID_CREDENTIALS');
  }

  const client = toPublicClient(doc);
  const all = await licenseService.listLicenses();

  const licenses = all
    .filter((l) => normalizeUsername(l.clientUserId) === normalizeUsername(client.username))
    .filter((l) =>
      productName
        ? l.productName.trim().toLowerCase() === String(productName).trim().toLowerCase()
        : true
    )
    .map((l) => ({
      licenseKey: l.licenseKey,
      productName: l.productName,
      startDate: l.startDate,
      expiryDate: l.expiryDate,
      status: l.status,
      valid: l.status === 'active',
    }));

  return {
    client: {
      id: client.id,
      clientName: client.clientName,
      companyName: client.companyName,
      username: client.username,
    },
    licenses,
  };
}

module.exports = {
  COLLECTION,
  MIN_PASSWORD_LENGTH,
  createClient,
  getClientById,
  updateClient,
  deleteClient,
  listClients,
  login,
  findByUsername,
};
