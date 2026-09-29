'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./billing.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole } = require('../../middleware/authorize');
const ApiError = require('../../utils/ApiError');

const router = express.Router();

router.use(authenticate);

function isBillingStaff(req) {
  const { role, staffRole } = req.user;
  return role === 'admin' || (role === 'staff' && ['Receptionist', 'Accountant'].includes(staffRole));
}

/** Billing staff can view any bill; a patient may view (only) their own - enforced in the controller. */
function canViewBilling(req, res, next) {
  if (isBillingStaff(req) || req.user.role === 'patient') return next();
  return next(ApiError.forbidden('Only admin, receptionists, accountants, or the patient themselves can view billing records'));
}

/**
 * Creating/editing bills is the accountant's job (or admin's) - the
 * receptionist may view bills and record payments at the front desk, but
 * may never author an invoice.
 */
function requireBillingStaff(req, res, next) {
  const { role, staffRole } = req.user;
  if (role === 'admin' || (role === 'staff' && staffRole === 'Accountant')) return next();
  return next(ApiError.forbidden('Only admin or accountants can create or edit bills'));
}

router.get(
  '/',
  canViewBilling,
  [query('patient_id').optional().isInt(), query('status').optional().isIn(['Unpaid', 'Partial', 'Paid'])],
  validate,
  ctrl.list
);
router.get('/:id', canViewBilling, [param('id').isInt()], validate, ctrl.getOne);

router.post(
  '/',
  requireBillingStaff,
  [
    body('patient_id').isInt(),
    body('admission_id').optional({ nullable: true }).isInt(),
    body('bill_date').optional({ nullable: true }).isISO8601(),
    body('total_amt').isFloat({ min: 0 }),
  ],
  validate,
  ctrl.create
);

router.put(
  '/:id',
  requireBillingStaff,
  [
    param('id').isInt(),
    body('admission_id').optional({ nullable: true }).isInt(),
    body('bill_date').optional({ nullable: true }).isISO8601(),
    body('total_amt').optional().isFloat({ min: 0 }),
  ],
  validate,
  ctrl.update
);

router.delete('/:id', requireRole('admin'), [param('id').isInt()], validate, ctrl.remove);

module.exports = router;
