'use strict';

const { getDb, Timestamp } = require('../config/firebase');
const { ApiError } = require('../middleware/errorHandler');

const COLLECTION = 'products';

function collection() {
  return getDb().collection(COLLECTION);
}

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toPublicProduct(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name,
    description: data.description || '',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/** Product names identify licenses during verification, so they must be unique. */
async function assertNameAvailable(name, exceptId) {
  const snap = await collection().get();
  const clash = snap.docs.find(
    (doc) =>
      doc.id !== exceptId &&
      String(doc.data().name || '').trim().toLowerCase() === name.trim().toLowerCase()
  );
  if (clash) {
    throw new ApiError(409, 'A product with that name already exists', 'PRODUCT_NAME_TAKEN');
  }
}

async function createProduct({ name, description }) {
  await assertNameAvailable(name);
  const ref = await collection().add({
    name,
    description: description || '',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return toPublicProduct(await ref.get());
}

async function listProducts() {
  const snap = await collection().orderBy('createdAt', 'desc').get();
  return snap.docs.map(toPublicProduct);
}

async function getProductById(id) {
  const doc = await collection().doc(id).get();
  if (!doc.exists) throw new ApiError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  return toPublicProduct(doc);
}

async function updateProduct(id, { name, description }) {
  const ref = collection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new ApiError(404, 'Product not found', 'PRODUCT_NOT_FOUND');

  const updates = { updatedAt: Timestamp.now() };
  if (name !== undefined) {
    await assertNameAvailable(name, id);
    updates.name = name;
  }
  if (description !== undefined) updates.description = description;

  await ref.update(updates);
  return toPublicProduct(await ref.get());
}

async function deleteProduct(id) {
  const ref = collection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new ApiError(404, 'Product not found', 'PRODUCT_NOT_FOUND');

  // Licenses are matched against the product name during verification, so
  // deleting a product that licenses still reference would silently break them.
  const name = doc.data().name;
  const licenses = await getDb()
    .collection('licenses')
    .where('productName', '==', name)
    .limit(1)
    .get();

  if (!licenses.empty) {
    throw new ApiError(
      409,
      'This product still has licenses issued against it. Delete those licenses first.',
      'PRODUCT_IN_USE'
    );
  }

  await ref.delete();
  return { id };
}

module.exports = {
  COLLECTION,
  createProduct,
  listProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
