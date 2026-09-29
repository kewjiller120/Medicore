'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

/**
 * SESSION MANAGEMENT DESIGN (documented for the demo / defense):
 *
 * - ACCESS TOKEN: a short-lived (default 15 min) signed JWT, sent in the
 *   `Authorization: Bearer <token>` header on every request and kept only
 *   in front-end memory (never localStorage, to limit XSS exposure). It
 *   carries { userId, role, doctorId?, staffId?, staffRole?, username }
 *   resolved from the database at login time - the client never supplies
 *   its own role, and the server never trusts a client-supplied role.
 *   Being short-lived and stateless, verifying it costs zero DB round
 *   trips, which keeps every authenticated request fast.
 *
 * - REFRESH TOKEN: a long-lived, high-entropy random string, stored by
 *   the browser only as an httpOnly, SameSite=Lax secure cookie (never
 *   reachable from JS). The server never stores the raw refresh token -
 *   only a SHA-256 hash of it, next to a session row in `auth_session`.
 *   POST /api/auth/refresh exchanges a valid, non-revoked refresh token
 *   for a new access token. POST /api/auth/logout marks the session row
 *   `revoked_at = now()`, which is a genuine, immediate server-side
 *   invalidation - not just a client-side redirect - satisfying the
 *   "logout must genuinely invalidate the session" requirement.
 */

function signAccessToken(payload) {
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.ACCESS_TOKEN_SECRET);
}

/** Generate a high-entropy opaque refresh token (not a JWT - it carries no data of its own). */
function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

/** SHA-256 is sufficient here: the token is already high-entropy random data, not a human password. */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function refreshTokenExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + env.REFRESH_TOKEN_TTL_DAYS);
  return d;
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiryDate,
};
