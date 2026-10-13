'use strict';

const express = require('express');
const { body, param } = require('express-validator');

const controller = require('../controllers/licenseController');
const { validate } = require('../middleware/validate');
const { requireAdmin } = require('../middleware/auth');
const { verifyLimiter } = require('../middleware/rateLimiter');
const { DURATION_KEYS } = require('../utils/licenseDates');
const { MIN_PASSWORD_LENGTH } = require('../services/clientService');

const router = express.Router();

// `values: 'falsy'` matters: a form posts an untouched field as '', not as
// undefined, so a plain .optional() would still fail it on .notEmpty().
const text = (field, label, { max = 120, optional = false } = {}) => {
  const chain = body(field);
  return (optional ? chain.optional({ values: 'falsy' }) : chain)
    .trim()
    .escape()
    .notEmpty()
    .withMessage(`${label} is required`)
    .isLength({ max })
    .withMessage(`${label} must be at most ${max} characters`);
};

const duration = ({ optional = false } = {}) => {
  const chain = body('duration');
  return (optional ? chain.optional() : chain)
    .isIn(DURATION_KEYS)
    .withMessage('Select a valid license duration');
};

const isoDate = (field, label, { optional = false } = {}) => {
  const chain = body(field);
  return (optional ? chain.optional() : chain)
    .notEmpty()
    .withMessage(`${label} is required`)
    .isISO8601()
    .withMessage(`${label} must be a valid date`);
};

// The POC's product sign-in, entered on the license form. Optional on the wire
// so a license can still be saved without touching the account; when it is
// sent, the email it signs in with has to be a real address.
const pocLogin = [
  body('password')
    .optional({ values: 'falsy' })
    .isString()
    .isLength({ min: MIN_PASSWORD_LENGTH, max: 128 })
    .withMessage(`Password must be between ${MIN_PASSWORD_LENGTH} and 128 characters`),
  body('clientUserId')
    .if(body('password').notEmpty())
    .isEmail()
    .withMessage('Enter a valid email address'),
  body('companyName')
    .if(body('password').notEmpty())
    .notEmpty()
    .withMessage('Company name is required'),
];

const keyCheck = [
  body('licenseKey')
    .trim()
    .notEmpty()
    .withMessage('License key is required')
    .isLength({ max: 64 })
    .withMessage('License key is too long')
    .matches(/^[A-Za-z0-9\s-]+$/)
    .withMessage('License key contains invalid characters'),
  body('productName').optional().trim().escape().isLength({ max: 120 }),
  // Identifies the machine the product is installed on. Optional on the wire so
  // a key that has never been claimed still verifies, but once a key is claimed
  // the service refuses any request that does not carry the matching value.
  body('machineNumber')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 128 })
    .withMessage('Machine number is too long')
    .matches(/^[A-Za-z0-9._:-]+$/)
    .withMessage('Machine number contains invalid characters'),
  body('machine_number')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 128 })
    .withMessage('Machine number is too long')
    .matches(/^[A-Za-z0-9._:-]+$/)
    .withMessage('Machine number contains invalid characters'),
];

// --- Public (product-facing) -------------------------------------------------
// Mounted before the admin guard, so products never need a token.
router.post('/verify', verifyLimiter, keyCheck, validate, controller.verify);
router.post('/sync', verifyLimiter, keyCheck, validate, controller.sync);

// Self-service: the product corrects its own contact details. Authenticated by
// the license key and the machine that claimed it, so no admin token is needed.
// Declared here, before the admin guard and before the `/:id` routes, so the
// paths are not swallowed by either.
router.put(
  '/poc',
  verifyLimiter,
  [
    ...keyCheck,
    body('pocName').optional({ values: 'falsy' }).trim().escape().isLength({ max: 120 }),
    body('poc_name').optional({ values: 'falsy' }).trim().escape().isLength({ max: 120 }),
    body('clientName').optional({ values: 'falsy' }).trim().escape().isLength({ max: 120 }),
    body().custom((value) => {
      if (!value.pocName && !value.poc_name && !value.clientName) {
        throw new Error('POC name is required');
      }
      return true;
    }),
  ],
  validate,
  controller.updatePoc
);

router.put(
  '/email',
  verifyLimiter,
  [
    ...keyCheck,
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Enter a valid email address')
      .isLength({ max: 160 })
      // Deliberately NOT normalizeEmail(): it strips dots from gmail addresses,
      // so 'a.b@gmail.com' would be silently saved as 'ab@gmail.com'.
      .customSanitizer((v) => String(v).trim().toLowerCase()),
  ],
  validate,
  controller.updateEmail
);

// --- Admin -------------------------------------------------------------------
router.use(requireAdmin);

router.get('/stats', controller.stats);
router.get('/mail-status', controller.mailStatus);
router.get('/', controller.list);

router.post(
  '/',
  [
    text('clientName', 'Client name'),
    text('companyName', 'Company name', { optional: true }),
    // Optional: it links the license to a client account for the product
    // login. A license may instead name a client who has no account.
    text('clientUserId', 'Client user ID', { optional: true }),
    text('productName', 'Product name'),
    text('soldBy', 'Sold by'),
    duration(),
    isoDate('startDate', 'Start date'),
    // Only required for the custom duration; the service enforces that.
    isoDate('expiryDate', 'Expiry date', { optional: true }),
    ...pocLogin,
  ],
  validate,
  controller.create
);

router.get('/:id', [param('id').trim().notEmpty()], validate, controller.getOne);

router.put(
  '/:id',
  [
    param('id').trim().notEmpty(),
    text('clientName', 'Client name', { optional: true }),
    text('companyName', 'Company name', { optional: true }),
    text('clientUserId', 'Client user ID', { optional: true }),
    text('productName', 'Product name', { optional: true }),
    text('soldBy', 'Sold by', { optional: true }),
    duration({ optional: true }),
    isoDate('startDate', 'Start date', { optional: true }),
    isoDate('expiryDate', 'Expiry date', { optional: true }),
    ...pocLogin,
  ],
  validate,
  controller.update
);

router.put(
  '/:id/status',
  [
    param('id').trim().notEmpty(),
    body('deactivated')
      .isBoolean()
      .withMessage('deactivated must be true or false')
      .toBoolean(),
  ],
  validate,
  controller.setStatus
);

router.post(
  '/:id/share',
  [
    param('id').trim().notEmpty(),
    body('recipients')
      .isArray({ min: 1, max: 10 })
      .withMessage('Choose between 1 and 10 recipients'),
    body('recipients.*')
      .trim()
      .isEmail()
      .withMessage('Every recipient must be a valid email address')
      .normalizeEmail(),
  ],
  validate,
  controller.share
);

router.delete('/:id', [param('id').trim().notEmpty()], validate, controller.remove);

module.exports = router;
