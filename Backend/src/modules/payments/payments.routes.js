'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./payments.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole, requireStaffRole } = require('../../middleware/authorize');
const ApiError = require('../../utils/ApiError');

const router = express.Router();

router.use(authenticate);

/** Browsing the raw payment ledger is billing-staff work. */
function requireBillingStaff(req, res, next) {
  const { role, staffRole } = req.user;
  if (role === 'admin' || (role === 'staff' && ['Receptionist', 'Accountant'].includes(staffRole))) return next();
  return next(ApiError.forbidden('Only admin, receptionists, or accountants can view payment records'));
}

/** Billing staff can record a payment for anyone; a patient may pay (only) their own bill - enforced in the controller. */
function canPay(req, res, next) {
  const { role, staffRole } = req.user;
  if (role === 'admin' || role === 'patient') return next();
  if (role === 'staff' && ['Receptionist', 'Accountant'].includes(staffRole)) return next();
  return next(ApiError.forbidden('Only admin, receptionists, accountants, or the patient themselves can record a payment'));
}

router.get('/', requireBillingStaff, [query('bill_id').optional().isInt(), query('status').optional().isIn(['Pending', 'Confirmed', 'Rejected'])], validate, ctrl.list);
router.get('/:id', requireBillingStaff, [param('id').isInt()], validate, ctrl.getOne);

router.post(
  '/',
  canPay,
  [
    body('bill_id').isInt(),
    body('amount').isFloat({ gt: 0 }),
    body('payment_method').isIn(['Cash', 'Card', 'Mobile Banking', 'Insurance', 'Bank Transfer']),
    body('payment_date').optional({ nullable: true }).isISO8601(),
  ],
  validate,
  ctrl.create
);

// A payment only becomes valid (counts towards the bill + revenue) after
// the accountant confirms it; rejection keeps the audit trail but the
// payment never counts. Pending-only enforcement lives in the procedures.
router.put(
  '/:id/confirm',
  requireStaffRole('Accountant'),
  [param('id').isInt()],
  validate,
  ctrl.confirm
);
router.put(
  '/:id/reject',
  requireStaffRole('Accountant'),
  [param('id').isInt()],
  validate,
  ctrl.reject
);

router.delete('/:id', requireRole('admin'), [param('id').isInt()], validate, ctrl.remove);

module.exports = router;
