'use strict';

const crypto = require('crypto');

// Crockford-style alphabet: no I, L, O, U, 0, 1 — avoids transcription mistakes
// when a client reads a key off an invoice or an email.
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const GROUP_SIZE = 4;
const GROUPS = 3; // plus the fixed prefix group => PREFIX-XXXX-XXXX-XXXX

/**
 * Cryptographically secure random string from ALPHABET.
 * Uses rejection sampling so every symbol is equally likely.
 */
function randomSegment(length) {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = '';
  while (out.length < length) {
    const bytes = crypto.randomBytes(length * 2);
    for (let i = 0; i < bytes.length && out.length < length; i += 1) {
      if (bytes[i] < max) out += ALPHABET[bytes[i] % ALPHABET.length];
    }
  }
  return out;
}

function normalizePrefix(prefix) {
  const cleaned = String(prefix || 'OPEZ')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, GROUP_SIZE);
  return cleaned.length === GROUP_SIZE ? cleaned : cleaned.padEnd(GROUP_SIZE, 'X');
}

/**
 * @returns {string} e.g. "OPEZ-8F4K-92LM-X7PQ"
 */
function generateLicenseKey(prefix = process.env.LICENSE_KEY_PREFIX) {
  const parts = [normalizePrefix(prefix)];
  for (let i = 0; i < GROUPS; i += 1) parts.push(randomSegment(GROUP_SIZE));
  return parts.join('-');
}

/** Normalizes user input ("opez 8f4k92lmx7pq") into the canonical key format. */
function normalizeLicenseKey(raw) {
  const compact = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (compact.length !== GROUP_SIZE * (GROUPS + 1)) return String(raw || '').trim().toUpperCase();
  return compact.match(/.{1,4}/g).join('-');
}

const LICENSE_KEY_PATTERN = new RegExp(
  `^[A-Z0-9]{${GROUP_SIZE}}(-[A-Z0-9]{${GROUP_SIZE}}){${GROUPS}}$`
);

module.exports = { generateLicenseKey, normalizeLicenseKey, LICENSE_KEY_PATTERN };
