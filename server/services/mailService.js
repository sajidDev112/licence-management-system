'use strict';

const nodemailer = require('nodemailer');

const { ApiError } = require('../middleware/errorHandler');

let transporter = null;

/**
 * Email is optional: without SMTP settings the app still runs, and the console
 * falls back to opening the admin's own mail client instead.
 */
function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (transporter) return transporter;

  if (!isConfigured()) {
    throw new ApiError(
      503,
      'Email sending is not configured on the server',
      'MAIL_NOT_CONFIGURED'
    );
  }

  const port = Number(process.env.SMTP_PORT || 587);

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // Port 465 is implicit TLS; 587 and 25 upgrade with STARTTLS.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  return transporter;
}

function fromAddress() {
  const name = process.env.MAIL_FROM_NAME || 'Opezee Licenses';
  const address = process.env.MAIL_FROM || process.env.SMTP_USER;
  return `"${name}" <${address}>`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Dates are stored as whole UTC days, so they are rendered in UTC too. */
function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Values come from admin input, so they are escaped before going into HTML. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STATUS_COLORS = {
  active: '#059669',
  pending: '#d97706',
  expired: '#dc2626',
  // Red, like the console: a switched-off license blocks a client just as
  // firmly as an expired one.
  deactivated: '#dc2626',
};

// How each status is written for the recipient. Only the ones that differ from
// a plain capitalisation of the stored value need an entry.
const STATUS_LABELS = {
  deactivated: 'Deactive',
};

function buildRows(license) {
  return [
    ['License Key', license.licenseKey],
    ['Product', license.productName],
    ['Client', license.clientName],
    ['Company', license.companyName],
    ['Sold By', license.soldBy || '-'],
    ['Start Date', formatDate(license.startDate)],
    ['Expiry Date', formatDate(license.expiryDate)],
    ['Status', license.status],
  ];
}

/**
 * Table-based layout with inline styles, because that is what email clients
 * reliably render — Outlook in particular ignores most modern CSS.
 */
function buildHtml(license, logo) {
  const rows = buildRows(license)
    .map(([label, value]) => {
      const isKey = label === 'License Key';
      const isStatus = label === 'Status';
      const cellStyle = isKey
        ? 'font-family:Consolas,Menlo,monospace;font-size:15px;font-weight:700;letter-spacing:1px;color:#0f172a;'
        : 'font-size:14px;color:#0f172a;';
      const display = isStatus
        ? `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;text-transform:capitalize;color:#ffffff;background:${
            STATUS_COLORS[value] || STATUS_COLORS.expired
          };">${escapeHtml(STATUS_LABELS[value] || value)}</span>`
        : escapeHtml(value);

      return `
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;white-space:nowrap;">${escapeHtml(
            label
          )}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;${cellStyle}">${display}</td>
        </tr>`;
    })
    .join('');

  const logoBlock = logo
    ? `<img src="${logo}" alt="" style="height:36px;width:auto;display:block;margin-bottom:20px;" />`
    : '';

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
      <tr>
        <td style="padding:28px 24px;">
          ${logoBlock}
          <h1 style="margin:0 0 18px;font-size:19px;color:#0f172a;">
            ${escapeHtml(license.clientName)} licence details
          </h1>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;overflow:hidden;">
            ${rows}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildText(license) {
  return [
    `${license.clientName} licence details`,
    '',
    ...buildRows(license).map(([label, value]) => `${label.padEnd(13)}: ${value}`),
  ].join('\n');
}

/**
 * Sends one license to one or more recipients.
 *
 * @param {object} license  A public license object.
 * @param {string[]} recipients
 * @param {string|null} logo  Optional data-URL logo for the header.
 */
async function sendLicense({ license, recipients, logo = null }) {
  const info = await getTransporter().sendMail({
    from: fromAddress(),
    to: recipients.join(', '),
    subject: `Your ${license.productName} licence key`,
    text: buildText(license),
    html: buildHtml(license, logo),
  });

  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

/** Confirms the SMTP settings actually work, without sending anything. */
async function verifyConnection() {
  await getTransporter().verify();
  return true;
}

module.exports = { isConfigured, sendLicense, verifyConnection, buildHtml, buildText };
