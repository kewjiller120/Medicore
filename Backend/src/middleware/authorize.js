'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Gate a route to one or more top-level roles (admin/doctor/staff).
 * Must run after authenticate(). 401 if not authenticated at all (should
 * not normally happen here since authenticate() already guards that),
 * 403 if authenticated but the wrong role.
 */
function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`This action requires one of these roles: ${roles.join(', ')}`));
    }
    return next();
  };
}

/**
 * Gate a route to specific staff sub-roles (Receptionist, Nurse,
 * Pharmacist, LabTechnician, Driver, Accountant...). Admins are always
 * allowed through too, since an admin can perform any staff duty.
 * Must run after authenticate().
 */
function requireStaffRole(...subRoles) {
  return function (req, res, next) {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role === 'admin') return next();
    if (req.user.role !== 'staff' || !subRoles.includes(req.user.staffRole)) {
      return next(
        ApiError.forbidden(`This action requires one of these staff roles: ${subRoles.join(', ')}`)
      );
    }
    return next();
  };
}

/**
 * True if the current user is an admin (admins bypass most ownership
 * checks by design - they administer the whole hospital).
 */
function isAdmin(req) {
  return req.user && req.user.role === 'admin';
}

module.exports = { requireRole, requireStaffRole, isAdmin };
