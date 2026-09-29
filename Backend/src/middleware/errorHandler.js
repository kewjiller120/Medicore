'use strict';

const ApiError = require('../utils/ApiError');
const env = require('../config/env');

/**
 * Translates raw PostgreSQL error codes (see
 * https://www.postgresql.org/docs/current/errcodes-appendix.html) into
 * clean HTTP responses, so a constraint violation deep in the database
 * layer still comes back to the client as a sensible 400/404/409 instead
 * of a raw stack trace or a generic 500.
 */
function mapPgError(err) {
  switch (err.code) {
    case '23505': // unique_violation
      return ApiError.conflict(friendlyConstraintMessage(err) || 'A record with this value already exists');
    case '23503': // foreign_key_violation
      return ApiError.conflict(
        'This action refers to (or is referred to by) a record that does not allow it - check related records first'
      );
    case '23502': // not_null_violation
      return ApiError.badRequest(`Missing required field: ${err.column || 'unknown'}`);
    case '23514': // check_violation
      return ApiError.badRequest(`Invalid value: violates rule "${err.constraint || 'check constraint'}"`);
    case 'P0001': // RAISE EXCEPTION from one of our trigger functions - message is already friendly
      return ApiError.conflict(err.message);
    default:
      return null;
  }
}

function friendlyConstraintMessage(err) {
  if (!err.detail) return null;
  // e.g. Key (username)=(admin) already exists.
  return err.detail.replace(/^Key /, '').replace(/=\(/, ' = "').replace(/\)/, '"');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let apiErr = err;

  if (!(err instanceof ApiError)) {
    const mapped = err.code ? mapPgError(err) : null;
    if (mapped) {
      apiErr = mapped;
    } else if (err.type === 'entity.parse.failed') {
      apiErr = ApiError.badRequest('Malformed JSON in request body');
    } else {
      apiErr = ApiError.internal(env.NODE_ENV === 'production' ? 'Internal server error' : err.message);
    }
  }

  if (apiErr.statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }

  const body = { error: apiErr.message };
  if (apiErr.details) body.details = apiErr.details;
  if (env.NODE_ENV !== 'production' && apiErr.statusCode >= 500) body.stack = err.stack;

  res.status(apiErr.statusCode).json(body);
}

module.exports = errorHandler;
