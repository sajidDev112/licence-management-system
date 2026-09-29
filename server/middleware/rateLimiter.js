'use strict';

const rateLimit = require('express-rate-limit');

const json = (message) => (req, res) =>
  res.status(429).json({ success: false, valid: false, message });

/** Generous limit for the admin dashboard APIs. */
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json('Too many requests. Please slow down.'),
});

/** Strict limit for the public verification endpoint — it is brute-forceable. */
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json('Too many verification attempts. Please try again in a minute.'),
});

/** Very strict limit on sign-in, which is the credential-guessing surface. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: json('Too many sign-in attempts. Please try again in 15 minutes.'),
});

/**
 * The product's client login. Stricter than verification because it guards
 * credentials, but generous enough for real users mistyping a password.
 */
const clientLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: json('Too many login attempts. Please try again in 15 minutes.'),
});

module.exports = { adminLimiter, verifyLimiter, loginLimiter, clientLoginLimiter };
