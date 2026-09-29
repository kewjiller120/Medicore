'use strict';

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

/**
 * Hash a plaintext password with bcrypt (per-user random salt is built
 * into the bcrypt hash format itself - never store passwords in plain
 * text or as a bare unsalted MD5/SHA1 hash).
 */
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a stored bcrypt hash.
 */
async function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

/**
 * Minimal password strength policy: at least 8 characters, at least one
 * letter and one number. Kept simple and explainable on purpose.
 */
function isPasswordStrongEnough(password) {
  return typeof password === 'string' && password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

module.exports = { hashPassword, comparePassword, isPasswordStrongEnough };
