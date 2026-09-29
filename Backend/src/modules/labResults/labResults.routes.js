'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./labResults.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole, requireStaffRole } = require('../../middleware/authorize');

const router = express.Router();

router.use(authenticate);

/** Lab results are clinical data, but a patient may read their own (scoped in the controller). */
function canRead(req, res, next) {
  if (['admin', 'doctor', 'staff', 'patient'].includes(req.user.role)) return next();
  return next(ApiError.forbidden('You do not have access to view lab results'));
}

router.get(
  '/',
  canRead,
  [
    query('test_id').optional().isInt(),
    query('patient_id').optional().isInt(),
    query('doctor_id').optional().isInt(),
  ],
  validate,
  ctrl.list
);
router.get('/:id', canRead, [param('id').isInt()], validate, ctrl.getOne);

router.post(
  '/',
  requireRole('admin', 'staff'),
  requireStaffRole('LabTechnician'),
  [body('test_id').isInt(), body('result_date').optional({ nullable: true }).isISO8601(), body('details').trim().notEmpty()],
  validate,
  ctrl.create
);

router.put(
  '/:id',
  requireRole('admin', 'staff'),
  requireStaffRole('LabTechnician'),
  [param('id').isInt(), body('details').optional().isString(), body('result_date').optional({ nullable: true }).isISO8601()],
  validate,
  ctrl.update
);

router.delete('/:id', requireRole('admin'), [param('id').isInt()], validate, ctrl.remove);

module.exports = router;
