'use strict';

/**
 * Wraps an async route handler so any rejected promise is forwarded to
 * Express's error-handling middleware via next(err), instead of crashing
 * the process or hanging the request. Express 5 does this automatically
 * for async handlers, but we keep this wrapper explicit so the codebase
 * works the same way regardless of Express major version and so every
 * controller reads the same way.
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
