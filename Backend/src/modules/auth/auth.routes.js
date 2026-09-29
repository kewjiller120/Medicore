'use strict';

const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');

const ctrl = require('./auth.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole } = require('../../middleware/authorize');
const asyncHandler = require('../../utils/asyncHandler');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');

const router = express.Router();

// Slow down credential-guessing / signup-spam without punishing normal use.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

/**
 * Doctor and staff accounts are never self-registered: only an existing
 * admin may create one, from the User Accounts screen (POST
 * /api/admin/users) or, equivalently, these same two endpoints while
 * authenticated as admin. This prevents anyone from signing up claiming
 * to be a doctor or a member of staff.
 */
const adminOnlyGate = asyncHandler(async (req, res, next) => {
  return authenticate(req, res, () => requireRole('admin')(req, res, next));
});

/**
 * Patients are the one role allowed to self-register - this is the
 * hospital's public "create a patient account" sign-up. When
 * ALLOW_PUBLIC_SIGNUP=false it's closed entirely (an admin would then
 * need another way to grant patients a login), same flag that used to
 * gate doctor/staff self-signup.
 */
const gatePatientSignup = asyncHandler(async (req, res, next) => {
  if (env.ALLOW_PUBLIC_SIGNUP) return next();
  return next(ApiError.forbidden('Public sign-up is currently disabled'));
});

const usernameRule = body('username')
  .trim()
  .isLength({ min: 3, max: 50 })
  .withMessage('Username must be 3-50 characters')
  .matches(/^[a-zA-Z0-9._-]+$/)
  .withMessage('Username may only contain letters, numbers, dot, underscore, hyphen');

const passwordRule = body('password').isString().notEmpty().withMessage('Password is required');
const nameRule = body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name is required');

router.post(
  '/register/doctor',
  authLimiter,
  adminOnlyGate,
  [
    usernameRule,
    passwordRule,
    nameRule,
    body('department_id').optional({ nullable: true }).isInt().withMessage('department_id must be an integer'),
    body('email').optional({ nullable: true }).isEmail().withMessage('Invalid email'),
    body('phone').optional({ nullable: true }).isString(),
    body('specialization').optional({ nullable: true }).isString(),
    body('qualification').optional({ nullable: true }).isString(),
  ],
  validate,
  ctrl.registerDoctor
);

router.post(
  '/register/staff',
  authLimiter,
  adminOnlyGate,
  [
    usernameRule,
    passwordRule,
    nameRule,
    body('department_id').optional({ nullable: true }).isInt().withMessage('department_id must be an integer'),
    body('role').isIn(['Receptionist', 'Nurse', 'Pharmacist', 'LabTechnician', 'Driver', 'Accountant', 'Other']),
    body('phone').optional({ nullable: true }).isString(),
    body('shift_timing').optional({ nullable: true }).isString(),
  ],
  validate,
  ctrl.registerStaff
);

router.post(
  '/register/patient',
  authLimiter,
  gatePatientSignup,
  [
    usernameRule,
    passwordRule,
    nameRule,
    body('dob').optional({ nullable: true }).isISO8601().withMessage('dob must be a valid date'),
    body('gender').optional({ nullable: true }).isIn(['Male', 'Female', 'Other']),
    body('blood_group').optional({ nullable: true }).isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
    body('address').optional({ nullable: true }).isString(),
    body('phone').optional({ nullable: true }).isString(),
    body('emergency_contact').optional({ nullable: true }).isString(),
  ],
  validate,
  ctrl.registerPatient
);

router.post(
  '/login',
  authLimiter,
  [body('username').trim().notEmpty(), body('password').notEmpty()],
  validate,
  ctrl.login
);

router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);
router.get('/me', authenticate, ctrl.me);

router.put(
  '/change-password',
  authenticate,
  [body('currentPassword').notEmpty(), body('newPassword').notEmpty()],
  validate,
  ctrl.changePassword
);

module.exports = router;
