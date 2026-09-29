'use strict';

const { ApiError } = require('./errorHandler');
const adminService = require('../services/adminService');

/**
 * Requires a valid admin bearer token. Applied to every admin API; the
 * product-facing /verify and /sync endpoints are mounted outside this guard.
 */
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Authentication required', 'NO_TOKEN'));
  }

  try {
    const payload = adminService.verifyToken(token);
    req.admin = { id: payload.sub, email: payload.email };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAdmin };
