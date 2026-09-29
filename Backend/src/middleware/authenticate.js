'use strict';

const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/tokens');

/**
 * Verifies the Authorization: Bearer <token> header and attaches the
 * decoded claims to req.user. Role, doctorId, staffId etc. all come
 * from the signed token (resolved server-side at login) - never from
 * anything the client sends on this request.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Missing or malformed access token'));
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded; // { userId, role, username, doctorId?, staffId?, staffRole? }
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Access token expired'));
    }
    return next(ApiError.unauthorized('Invalid access token'));
  }
}

/**
 * Like authenticate(), but does not fail the request if no/invalid token
 * is present - just leaves req.user undefined. Useful for endpoints that
 * behave differently for logged-in vs anonymous callers, if any.
 */
function authenticateOptional(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      req.user = verifyAccessToken(token);
    } catch (err) {
      // ignore - treated as anonymous
    }
  }
  return next();
}

module.exports = { authenticate, authenticateOptional };
