'use strict';

const express = require('express');
const { body, param } = require('express-validator');

const controller = require('../controllers/licenseController');
const { validate } = require('../middleware/validate');
const { requireAdmin } = require('../middleware/auth');
const { verifyLimiter } = require('../middleware/rateLimiter');
const { DURATION_KEYS } = require('../utils/licenseDates');

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
];

// --- Public (product-facing) -------------------------------------------------
// Mounted before the admin guard, so products never need a token.
router.post('/verify', verifyLimiter, keyCheck, validate, controller.verify);
router.post('/sync', verifyLimiter, keyCheck, validate, controller.sync);

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
