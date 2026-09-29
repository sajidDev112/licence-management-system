'use strict';

/*
 * Creates or resets the admin account used to sign in to the dashboard.
 *
 *   npm run create-admin
 *
 * Reads ADMIN_EMAIL and ADMIN_PASSWORD from .env, or takes them as
 * arguments:  node scripts/createAdmin.js admin@example.com "my password"
 *
 * Safe to re-run — it resets the password of an existing account, which is how
 * you recover from being locked out.
 */

require('dotenv').config();

const { initFirebase } = require('../config/firebase');
const adminService = require('../services/adminService');

const MIN_PASSWORD_LENGTH = 8;

async function main() {
  const email = (process.argv[2] || process.env.ADMIN_EMAIL || '').trim();
  const password = process.argv[3] || process.env.ADMIN_PASSWORD || '';
  const name = process.env.ADMIN_NAME || 'Administrator';

  if (!email || !password) {
    console.error('\nMissing credentials.');
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env, or pass them:');
    console.error('  node scripts/createAdmin.js admin@example.com "your password"\n');
    process.exit(1);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`\n"${email}" is not a valid email address.\n`);
    process.exit(1);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`\nThe password must be at least ${MIN_PASSWORD_LENGTH} characters.\n`);
    process.exit(1);
  }

  initFirebase();

  const { created, admin } = await adminService.upsertAdmin({ email, password, name });

  console.log('');
  console.log(created ? 'Admin account created.' : 'Admin account already existed — password reset.');
  console.log(`  Email: ${admin.email}`);
  console.log('  Password: (the one you supplied)');
  console.log('');
  console.log('Sign in at http://localhost:5173/login');
  console.log('');
}

main().catch((err) => {
  console.error('\nCould not create the admin account:', err.message, '\n');
  process.exit(1);
});
