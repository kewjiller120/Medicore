'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Runs after every real route has had a chance to match. Not a path
 * pattern (so this is unaffected by Express 5's path-to-regexp changes
 * around wildcard routes) - just a plain fallback middleware.
 */
function notFound(req, res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

module.exports = notFound;
