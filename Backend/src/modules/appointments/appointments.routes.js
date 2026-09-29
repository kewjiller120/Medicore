'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./appointments.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const ApiError = require('../../utils/ApiError');

const router = express.Router();

router.use(authenticate);

const APPOINTMENT_STATUSES = ['Pending', 'Approved', 'Rejected', 'Completed', 'No-show', 'Cancelled'];

/** admin, doctor (own), or a patient (own) can book/create appointments */
function canBook(req, res, next) {
  const { role } = req.user;
  if (role === 'admin' || role === 'doctor' || role === 'patient') return next();
  return next(ApiError.forbidden('Only admin, doctors, or patients can manage appointments'));
}

function canDelete(req, res, next) {
  if (req.user.role === 'admin') return next();
  return next(ApiError.forbidden('Only admin can delete an appointment'));
}

/**
 * Browsing the appointment calendar is for the people the nurse/driver
 * pages don't include: admin, doctors, patients, and the desk/support
 * staff who work the schedule (Receptionist, Pharmacist, LabTechnician,
 * Accountant, Other). Nurses and drivers are kept out entirely.
 */
function canView(req, res, next) {
  const { role, staffRole } = req.user;
  if (role === 'admin' || role === 'doctor' || role === 'patient') return next();
  if (role === 'staff' && staffRole !== 'Nurse' && staffRole !== 'Driver') return next();
  return next(ApiError.forbidden('Appointments are not part of this role\u2019s workflow'));
}

/** Approving/rejecting an appointment request is exclusively the attending doctor's decision. */
function ownerDoctorOnly(req, res, next) {
  if (req.user.role === 'doctor') return next();
  return next(ApiError.forbidden('Only the attending doctor can approve or reject an appointment'));
}

router.get(
  '/',
  canView,
  [
    query('patient_id').optional().isInt(),
    query('doctor_id').optional().isInt(),
    query('date').optional().isISO8601(),
    query('status').optional().isIn(APPOINTMENT_STATUSES),
  ],
  validate,
  ctrl.list
);
router.get('/:id', canView, [param('id').isInt()], validate, ctrl.getOne);

router.post(
  '/',
  canBook,
  [
    body('patient_id').optional({ nullable: true }).isInt(),
    body('doctor_id').optional().isInt(),
    body('appt_date').isISO8601(),
    body('appt_time').matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
    body('name').trim().notEmpty(),
  ],
  validate,
  ctrl.create
);

router.put(
  '/:id/approve',
  ownerDoctorOnly,
  [param('id').isInt()],
  validate,
  ctrl.approve
);

router.put(
  '/:id/reject',
  ownerDoctorOnly,
  [param('id').isInt()],
  validate,
  ctrl.reject
);

router.put(
  '/:id',
  canBook,
  [
    param('id').isInt(),
    body('appt_date').optional().isISO8601(),
    body('appt_time').optional().matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
    body('name').optional().isString(),
    body('status').optional().isIn(APPOINTMENT_STATUSES),
  ],
  validate,
  ctrl.update
);

router.delete('/:id', canDelete, [param('id').isInt()], validate, ctrl.remove);

module.exports = router;