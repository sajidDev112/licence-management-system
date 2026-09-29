'use strict';

const express = require('express');
const { body, param } = require('express-validator');

const controller = require('../controllers/productController');
const { validate } = require('../middleware/validate');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAdmin);

const name = ({ optional = false } = {}) => {
  const chain = body('name');
  return (optional ? chain.optional() : chain)
    .trim()
    .escape()
    .notEmpty()
    .withMessage('Product name is required')
    .isLength({ max: 120 })
    .withMessage('Product name must be at most 120 characters');
};

const description = () =>
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .escape()
    .isLength({ max: 1000 })
    .withMessage('Product description must be at most 1000 characters');

router.get('/', controller.list);
router.post('/', [name(), description()], validate, controller.create);
router.get('/:id', [param('id').trim().notEmpty()], validate, controller.getOne);
router.put(
  '/:id',
  [param('id').trim().notEmpty(), name({ optional: true }), description()],
  validate,
  controller.update
);
router.delete('/:id', [param('id').trim().notEmpty()], validate, controller.remove);

module.exports = router;
