'use strict';

/** Error carrying an HTTP status code that is safe to show to a client. */
class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isProd = process.env.NODE_ENV === 'production';
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;

  // Internal failures (Firestore, network, bugs) are logged but never leaked.
  if (status >= 500 || !err.expose) {
    console.error('[error]', req.method, req.originalUrl, err);
  }

  const body = {
    success: false,
    message: err.expose && status < 500 ? err.message : 'Something went wrong. Please try again.',
  };
  if (err.code) body.code = err.code;
  if (err.details) body.errors = err.details;
  if (!isProd && status >= 500) body.debug = err.message;

  res.status(status).json(body);
}

module.exports = { ApiError, notFound, errorHandler };
