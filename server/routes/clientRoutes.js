'use strict';

const express = require('express');
const { body, param } = require('express-validator');

const controller = require('../controllers/clientController');
const { validate } = require('../middleware/validate');
const { requireAdmin } = require('../middleware/auth');
const { clientLoginLimiter } = require('../middleware/rateLimiter');
const { MIN_PASSWORD_LENGTH } = require('../services/clientService');

const router = express.Router();

const text = (field, label, { max = 120, optional = false } = {}) => {
  const chain = body(field);
  return (optional ? chain.optional() : chain)
    .trim()
    .escape()
    .notEmpty()
    .withMessage(`${label} is required`)
    .isLength({ max })
    .withMessage(`${label} must be at most ${max} characters`);
};

const username = ({ optional = false } = {}) => {
  const chain = body('username');
  return (optional ? chain.optional() : chain)
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 60 })
    .withMessage('Username must be between 3 and 60 characters')
    .matches(/^[A-Za-z0-9._@+-]+$/)
    .withMessage('Username may only contain letters, numbers and . _ @ + -');
};

const password = ({ optional = false } = {}) => {
  const chain = body('password');
  return (optional ? chain.optional({ values: 'falsy' }) : chain)
    .isString()
    .withMessage('Password is required')
    .isLength({ min: MIN_PASSWORD_LENGTH, max: 128 })
    .withMessage(`Password must be between ${MIN_PASSWORD_LENGTH} and 128 characters`);
};

// --- Public: the product's own login screen ---------------------------------
router.post(
  '/login',
  clientLoginLimiter,
  [
    body('username').trim().notEmpty().withMessage('Username is required').isLength({ max: 60 }),
    body('password').isString().notEmpty().withMessage('Password is required'),
    body('productName').optional({ values: 'falsy' }).trim().escape().isLength({ max: 120 }),
  ],
  validate,
  controller.login
);

// --- Admin -------------------------------------------------------------------
router.use(requireAdmin);

router.get('/', controller.list);

router.post(
  '/',
  [
    text('clientName', 'Client name'),
    text('companyName', 'Company name'),
    username(),
    password(),
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
    username({ optional: true }),
    password({ optional: true }),
  ],
  validate,
  controller.update
);

router.delete('/:id', [param('id').trim().notEmpty()], validate, controller.remove);

module.exports = router;
