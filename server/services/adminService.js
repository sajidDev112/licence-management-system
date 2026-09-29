'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { getDb, Timestamp } = require('../config/firebase');
const { ApiError } = require('../middleware/errorHandler');

const COLLECTION = 'admins';
const EMAIL_COLLECTION = 'emailConfigs';
const BCRYPT_ROUNDS = 12;

function admins() {
  return getDb().collection(COLLECTION);
}

function emails() {
  return getDb().collection(EMAIL_COLLECTION);
}

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new ApiError(
      500,
      'Server authentication is not configured',
      'JWT_SECRET_MISSING'
    );
  }
  return secret;
}

/** Never leaks passwordHash, whatever the caller does with the result. */
function toPublicAdmin(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    email: data.email,
    name: data.name || 'Administrator',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

async function findAdminByEmail(email) {
  const snap = await admins()
    .where('email', '==', String(email).trim().toLowerCase())
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

function signToken(admin) {
  return jwt.sign({ sub: admin.id, email: admin.email, role: 'admin' }, jwtSecret(), {
    expiresIn: process.env.TOKEN_EXPIRES_IN || '12h',
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, jwtSecret());
  } catch {
    // Expired and tampered tokens are deliberately indistinguishable to callers.
    throw new ApiError(401, 'Your session has expired. Please sign in again.', 'INVALID_TOKEN');
  }
}

/**
 * Creates or resets the admin account. Used by `npm run create-admin`; it is
 * not reachable over HTTP.
 */
async function upsertAdmin({ email, password, name }) {
  const normalized = String(email).trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const existing = await findAdminByEmail(normalized);

  if (existing) {
    await existing.ref.update({
      passwordHash,
      name: name || existing.data().name || 'Administrator',
      updatedAt: Timestamp.now(),
    });
    return { created: false, admin: toPublicAdmin(await existing.ref.get()) };
  }

  const ref = await admins().add({
    email: normalized,
    passwordHash,
    name: name || 'Administrator',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return { created: true, admin: toPublicAdmin(await ref.get()) };
}

async function login({ email, password }) {
  const doc = await findAdminByEmail(email);

  // Compare against a dummy hash when the account is unknown, so that a wrong
  // email and a wrong password take the same time to answer.
  const hash = doc ? doc.data().passwordHash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
  const ok = await bcrypt.compare(String(password), hash);

  if (!doc || !ok) {
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const admin = toPublicAdmin(doc);
  return { token: signToken(admin), admin };
}

async function getAdminById(id) {
  const doc = await admins().doc(id).get();
  if (!doc.exists) throw new ApiError(401, 'Account no longer exists', 'ADMIN_NOT_FOUND');
  return toPublicAdmin(doc);
}

async function changePassword(adminId, { currentPassword, newPassword }) {
  const ref = admins().doc(adminId);
  const doc = await ref.get();
  if (!doc.exists) throw new ApiError(401, 'Account no longer exists', 'ADMIN_NOT_FOUND');

  const ok = await bcrypt.compare(String(currentPassword), doc.data().passwordHash);
  if (!ok) {
    throw new ApiError(400, 'Your current password is incorrect', 'WRONG_CURRENT_PASSWORD');
  }

  if (String(currentPassword) === String(newPassword)) {
    throw new ApiError(
      400,
      'The new password must be different from the current one',
      'PASSWORD_UNCHANGED'
    );
  }

  await ref.update({
    passwordHash: await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS),
    updatedAt: Timestamp.now(),
  });

  return { success: true };
}

// --- Email configuration -----------------------------------------------------

function toPublicEmail(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    email: data.email,
    label: data.label || '',
    isDefault: Boolean(data.isDefault),
    createdAt: toIso(data.createdAt),
  };
}

async function listEmails() {
  const snap = await emails().orderBy('createdAt', 'asc').get();
  return snap.docs.map(toPublicEmail);
}

/** Clears the default flag everywhere except `keepId`. */
async function clearOtherDefaults(keepId) {
  const snap = await emails().where('isDefault', '==', true).get();
  await Promise.all(
    snap.docs
      .filter((doc) => doc.id !== keepId)
      .map((doc) => doc.ref.update({ isDefault: false }))
  );
}

async function addEmail({ email, label }) {
  const normalized = String(email).trim().toLowerCase();

  const existing = await emails().where('email', '==', normalized).limit(1).get();
  if (!existing.empty) {
    throw new ApiError(409, 'That email is already configured', 'EMAIL_EXISTS');
  }

  // The very first address configured becomes the default automatically,
  // so there is never a state with addresses but no default.
  const all = await emails().limit(1).get();
  const isDefault = all.empty;

  const ref = await emails().add({
    email: normalized,
    label: label || '',
    isDefault,
    createdAt: Timestamp.now(),
  });

  return toPublicEmail(await ref.get());
}

/**
 * Edits an existing address. The default flag is left alone: changing which
 * address is the default is a separate, explicit action.
 */
async function updateEmail(id, { email, label }) {
  const ref = emails().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new ApiError(404, 'Email configuration not found', 'EMAIL_NOT_FOUND');

  const updates = {};

  if (email !== undefined) {
    const normalized = String(email).trim().toLowerCase();
    const clash = await emails().where('email', '==', normalized).limit(1).get();
    if (!clash.empty && clash.docs[0].id !== id) {
      throw new ApiError(409, 'That email is already configured', 'EMAIL_EXISTS');
    }
    updates.email = normalized;
  }

  // An empty label is a real value here — it clears the label.
  if (label !== undefined) updates.label = label || '';

  if (Object.keys(updates).length) await ref.update(updates);
  return toPublicEmail(await ref.get());
}

async function setDefaultEmail(id) {
  const ref = emails().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new ApiError(404, 'Email configuration not found', 'EMAIL_NOT_FOUND');

  await ref.update({ isDefault: true });
  await clearOtherDefaults(id);
  return toPublicEmail(await ref.get());
}

async function deleteEmail(id) {
  const ref = emails().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new ApiError(404, 'Email configuration not found', 'EMAIL_NOT_FOUND');

  const all = await emails().get();
  const wasDefault = Boolean(doc.data().isDefault);

  if (wasDefault && all.size > 1) {
    throw new ApiError(
      400,
      'Set another email as default before deleting this one',
      'CANNOT_DELETE_DEFAULT'
    );
  }

  await ref.delete();
  return { id };
}

module.exports = {
  COLLECTION,
  EMAIL_COLLECTION,
  upsertAdmin,
  login,
  verifyToken,
  getAdminById,
  changePassword,
  findAdminByEmail,
  listEmails,
  addEmail,
  updateEmail,
  setDefaultEmail,
  deleteEmail,
};
