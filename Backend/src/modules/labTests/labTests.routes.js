'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./labTests.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole } = require('../../middleware/authorize');
const ApiError = require('../../utils/ApiError');

const router = express.Router();

router.use(authenticate);

/** Lab tests are clinical data, but a patient may read their own (scoped in the controller). */
function canRead(req, res, next) {
  if (['admin', 'doctor', 'staff', 'patient'].includes(req.user.role)) return next();
  return next(ApiError.forbidden('You do not have access to view lab tests'));
}

function canOrder(req, res, next) {
  if (req.user.role === 'admin' || req.user.role === 'doctor') return next();
  return next(ApiError.forbidden('Only admin or a doctor can order a lab test'));
}

router.get(
  '/',
  canRead,
  [query('patient_id').optional().isInt(), query('doctor_id').optional().isInt(), query('status').optional().isIn(['Pending', 'In Progress', 'Completed', 'Cancelled'])],
  validate,
  ctrl.list
);
router.get('/:id', canRead, [param('id').isInt()], validate, ctrl.getOne);

router.post(
  '/',
  canOrder,
  [
    body('patient_id').isInt(),
    body('doctor_id').optional().isInt(),
    body('test_type').trim().notEmpty(),
    body('test_date').optional({ nullable: true }).isISO8601(),
    body('staff_id').optional({ nullable: true }).isInt(),
  ],
  validate,
  ctrl.create
);

router.put(
  '/:id',
  [
    param('id').isInt(),
    body('status').optional().isIn(['Pending', 'In Progress', 'Completed', 'Cancelled']),
    body('staff_id').optional({ nullable: true }).isInt(),
    body('test_date').optional({ nullable: true }).isISO8601(),
  ],
  validate,
  ctrl.update
);

router.delete('/:id', requireRole('admin'), [param('id').isInt()], validate, ctrl.remove);

module.exports = router;
