'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./admissions.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole } = require('../../middleware/authorize');
const ApiError = require('../../utils/ApiError');

const router = express.Router();

router.use(authenticate);
router.use(requireRole('admin', 'doctor', 'staff')); // internal ward-management data - not part of patient self-service

function canCreate(req, res, next) {
  const { role } = req.user;
  if (role === 'admin' || role === 'doctor') return next();
  return next(ApiError.forbidden('Only admin or doctors can admit a patient'));
}

router.get(
  '/',
  [
    query('patient_id').optional().isInt(),
    query('doctor_id').optional().isInt(),
    query('admit_date').optional().isISO8601(),
    query('status').optional().isIn(['Admitted', 'Discharged', 'Transferred']),
  ],
  validate,
  ctrl.list
);
router.get('/:id', [param('id').isInt()], validate, ctrl.getOne);

router.post(
  '/',
  canCreate,
  [
    body('patient_id').isInt(),
    body('room_id').isInt(),
    body('doctor_id').optional().isInt(),
    body('admit_date').optional({ nullable: true }).isISO8601(),
    body('status').optional().isIn(['Admitted', 'Discharged', 'Transferred']),
  ],
  validate,
  ctrl.create
);

router.put(
  '/:id',
  requireRole('admin', 'doctor'),
  [
    param('id').isInt(),
    body('room_id').optional().isInt(),
    body('discharge_date').optional({ nullable: true }).isISO8601(),
    body('status').optional().isIn(['Admitted', 'Discharged', 'Transferred']),
  ],
  validate,
  ctrl.update
);

router.delete('/:id', requireRole('admin'), [param('id').isInt()], validate, ctrl.remove);

module.exports = router;
