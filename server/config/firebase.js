'use strict';

const admin = require('firebase-admin');

let db = null;

/**
 * Builds the Admin SDK credential from environment variables.
 * Supports either the three discrete vars or GOOGLE_APPLICATION_CREDENTIALS.
 */
function buildCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        // .env files keep newlines escaped; Firebase needs the real ones.
        privateKey: privateKey.replace(/\n/g, '\n').replace(/^"|"$/g, ''),
      }),
    };
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { credential: admin.credential.applicationDefault() };
  }

  throw new Error(
    'Firebase credentials missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and ' +
      'FIREBASE_PRIVATE_KEY (or GOOGLE_APPLICATION_CREDENTIALS) in .env'
  );
}

function initFirebase() {
  if (db) return db;

  if (!admin.apps.length) {
    admin.initializeApp(buildCredential());
  }

  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

function getDb() {
  if (!db) return initFirebase();
  return db;
}

module.exports = {
  admin,
  initFirebase,
  getDb,
  Timestamp: admin.firestore.Timestamp,
  FieldValue: admin.firestore.FieldValue,
};
