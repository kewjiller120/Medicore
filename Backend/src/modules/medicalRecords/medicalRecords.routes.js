'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./medicalRecords.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const ApiError = require('../../utils/ApiError');

const router = express.Router();

router.use(authenticate);

/** admin (all), doctor (own only - filtered in controller), patient (own, read-only) */
function canRead(req, res, next) {
  const { role } = req.user;
  if (role === 'admin' || role === 'doctor' || role === 'patient') return next();
  return next(ApiError.forbidden('Only admin, doctors, or the patient themselves can view medical records'));
}

/** admin or doctor may author/edit records */
function canWrite(req, res, next) {
  if (req.user.role === 'admin' || req.user.role === 'doctor') return next();
  return next(ApiError.forbidden('Only admin or a doctor can create/edit medical records'));
}

function adminOnly(req, res, next) {
  if (req.user.role === 'admin') return next();
  return next(ApiError.forbidden('Only admin can delete medical records'));
}

router.get('/', canRead, [query('patient_id').optional().isInt()], validate, ctrl.list);
router.get('/:id', canRead, [param('id').isInt()], validate, ctrl.getOne);

router.post(
  '/',
  canWrite,
  [
    body('patient_id').isInt(),
    body('doctor_id').optional().isInt(), // ignored for doctor callers - forced server-side
    body('diagnosis').trim().notEmpty(),
    body('visit_date').optional({ nullable: true }).isISO8601(),
    body('notes').optional({ nullable: true }).isString(),
  ],
  validate,
  ctrl.create
);

router.put(
  '/:id',
  canWrite,
  [
    param('id').isInt(),
    body('diagnosis').optional().isString(),
    body('visit_date').optional({ nullable: true }).isISO8601(),
    body('notes').optional({ nullable: true }).isString(),
  ],
  validate,
  ctrl.update
);

router.delete('/:id', adminOnly, [param('id').isInt()], validate, ctrl.remove);

module.exports = router;
