'use strict';

const express = require('express');
const { body, param } = require('express-validator');

const controller = require('../controllers/adminController');
const { validate } = require('../middleware/validate');
const { requireAdmin } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const password = (field, label) =>
  body(field)
    .isString()
    .withMessage(`${label} is required`)
    .isLength({ min: 8, max: 128 })
    .withMessage(`${label} must be between 8 and 128 characters`);

// --- Public ------------------------------------------------------------------
router.post(
  '/login',
  loginLimiter,
  [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Enter a valid email address')
      .normalizeEmail(),
    body('password').isString().notEmpty().withMessage('Password is required'),
  ],
  validate,
  controller.login
);

// The logo is public branding, and the console needs it before sign-in.
router.get('/branding', controller.getBranding);

// --- Authenticated -----------------------------------------------------------
router.use(requireAdmin);

router.put(
  '/branding',
  [
    body('logo').isString().notEmpty().withMessage('A logo image is required'),
    body('fileName').optional({ values: 'falsy' }).isString().isLength({ max: 200 }),
  ],
  validate,
  controller.setLogo
);

router.delete('/branding', controller.clearLogo);

router.get('/me', controller.me);

router.post(
  '/change-password',
  [
    body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
    password('newPassword', 'New password'),
    body('confirmPassword')
      .isString()
      .custom((value, { req }) => value === req.body.newPassword)
      .withMessage('New password and confirmation do not match'),
  ],
  validate,
  controller.changePassword
);

router.get('/emails', controller.listEmails);

router.post(
  '/emails',
  [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Enter a valid email address')
      .normalizeEmail(),
    body('label').optional({ values: 'falsy' }).trim().escape().isLength({ max: 60 }),
  ],
  validate,
  controller.addEmail
);

router.put(
  '/emails/:id',
  [
    param('id').trim().notEmpty(),
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Enter a valid email address')
      .normalizeEmail(),
    body('label').optional({ values: 'falsy' }).trim().escape().isLength({ max: 60 }),
    body('isDefault').optional().isBoolean().withMessage('Default must be true or false'),
  ],
  validate,
  controller.updateEmail
);

router.put(
  '/emails/:id/default',
  [
    param('id').trim().notEmpty(),
    body('isDefault').optional().isBoolean().withMessage('Default must be true or false'),
  ],
  validate,
  controller.setDefaultEmail
);

router.delete('/emails/:id', [param('id').trim().notEmpty()], validate, controller.deleteEmail);

module.exports = router;
