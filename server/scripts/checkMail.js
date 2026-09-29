'use strict';

/*
 * Verifies the SMTP settings in .env.
 *
 *   npm run check-mail                  -- connect and authenticate only
 *   npm run check-mail you@example.com  -- also send a sample license email
 *
 * Reports the provider's own error message on failure, which is usually enough
 * to tell a wrong password from a blocked port.
 */

require('dotenv').config();

const mailService = require('../services/mailService');

const SAMPLE = {
  licenseKey: 'OPEZ-TEST-0000-DEMO',
  productName: 'Sample Product',
  clientName: 'Sample Client',
  companyName: 'Sample Company Ltd',
  startDate: new Date().toISOString(),
  expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  status: 'active',
};

async function main() {
  const recipient = process.argv[2];

  if (!mailService.isConfigured()) {
    console.error('\nSMTP is not configured.');
    console.error('Set SMTP_HOST, SMTP_USER and SMTP_PASS in .env — see .env.example.\n');
    process.exit(1);
  }

  console.log('');
  console.log(`  Host: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`);
  console.log(`  User: ${process.env.SMTP_USER}`);
  console.log(`  From: ${process.env.MAIL_FROM || process.env.SMTP_USER}`);
  console.log('');

  process.stdout.write('  Connecting and authenticating... ');
  await mailService.verifyConnection();
  console.log('OK');

  if (!recipient) {
    console.log('\nSMTP is working. Pass an address to send a test email:');
    console.log('  npm run check-mail you@example.com\n');
    return;
  }

  process.stdout.write(`  Sending a sample license to ${recipient}... `);
  const result = await mailService.sendLicense({ license: SAMPLE, recipients: [recipient] });
  console.log('sent');
  console.log(`  Accepted: ${result.accepted.join(', ') || 'none'}`);
  if (result.rejected.length) console.log(`  Rejected: ${result.rejected.join(', ')}`);
  console.log('\nCheck the inbox (and the spam folder).\n');
}

main().catch((err) => {
  console.log('FAILED');
  console.error(`\n  ${err.message}\n`);
  console.error('Common causes:');
  console.error('  - Using your normal password instead of an App Password (Gmail, Outlook)');
  console.error('  - 2-Step Verification not enabled, so App Passwords are unavailable');
  console.error('  - Wrong port: use 587 for STARTTLS, or 465 with SMTP_SECURE=true');
  console.error('  - A firewall or host blocking outbound SMTP\n');
  process.exit(1);
});
