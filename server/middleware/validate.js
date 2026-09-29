'use strict';

const { validationResult } = require('express-validator');
const { ApiError } = require('./errorHandler');

/** Turns express-validator failures into a single 400 with field-level details. */
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
  err.details = result.array().map((e) => ({ field: e.path, message: e.msg }));
  return next(err);
}

module.exports = { validate };
