'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./ambulanceRequests.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole } = require('../../middleware/authorize');
const ApiError = require('../../utils/ApiError');

const router = express.Router();

router.use(authenticate);

const AMBULANCE_STATUSES = ['Pending', 'Approved', 'Rejected', 'Completed', 'Cancelled'];

/**
 * Only the people actually involved in the ambulance workflow may touch
 * this resource: the patient (requesting), their department's doctor
 * (accepting/rejecting), the assigned or dispatch driver (their trips),
 * and the admin (dispatch coordination). Front-desk / back-office staff
 * (Receptionist, Nurse, Pharmacist, LabTechnician, Accountant) have no
 * ambulance duties and get a clean 403.
 */
function canAccess(req, res, next) {
  const { role, staffRole } = req.user;
  if (role === 'admin' || role === 'doctor' || role === 'patient') return next();
  if (role === 'staff' && staffRole === 'Driver') return next();
  return next(ApiError.forbidden('Ambulance requests are only available to patients, doctors, drivers, and admin'));
}

/** A doctor may accept/reject requests for their own department (enforced in controller + procedure). */
function doctorOnly(req, res, next) {
  if (req.user.role === 'doctor') return next();
  return next(ApiError.forbidden('Only a doctor can accept or reject an ambulance request'));
}

/** Dispatching (assign/change ambulance) is admin coordination work. */
function dispatcherOnly(req, res, next) {
  if (req.user.role === 'admin') return next();
  return next(ApiError.forbidden('Only admin can dispatch an ambulance'));
}

/**
 * Completing a trip is admin coordination work - or the driver assigned to
 * that trip, once the ride is over (the controller verifies they really are
 * the assigned driver).
 */
function completerOnly(req, res, next) {
  if (req.user.role === 'admin') return next();
  if (req.user.role === 'staff' && req.user.staffRole === 'Driver') return next();
  return next(ApiError.forbidden('Only admin or the assigned driver can complete a trip'));
}

/**
 * The person who accepts a request (the department doctor) - or admin -
 * picks the driver for the trip. Anyone else gets a clean 403.
 */
function driverPickerOnly(req, res, next) {
  if (req.user.role === 'admin' || req.user.role === 'doctor') return next();
  return next(ApiError.forbidden('Only the department doctor (or admin) can choose the driver for a trip'));
}

/** Creating a request is a patient's own action, or an admin on a patient's behalf. */
function canRequest(req, res, next) {
  if (req.user.role === 'admin' || req.user.role === 'patient') return next();
  return next(ApiError.forbidden('Only the patient (or admin on their behalf) can request an ambulance'));
}

router.get(
  '/',
  canAccess,
  [
    query('patient_id').optional().isInt(),
    query('department_id').optional().isInt(),
    query('status').optional().isIn(AMBULANCE_STATUSES),
  ],
  validate,
  ctrl.list
);
// Drivers who are NOT already on an active (incomplete) trip - the only
// options the doctor/admin may pick from when assigning the driver slot.
// Registered before /:id so 'available-drivers' is never treated as an id.
router.get(
  '/available-drivers',
  driverPickerOnly,
  validate,
  ctrl.listAvailableDrivers
);
router.get('/:id', canAccess, [param('id').isInt()], validate, ctrl.getOne);

router.post(
  '/',
  canRequest,
  [
    body('patient_id').optional({ nullable: true }).isInt(),
    body('department_id').isInt(),
    body('pickup_location').trim().notEmpty(),
    body('drop_location').trim().notEmpty(),
  ],
  validate,
  ctrl.create
);

router.put(
  '/:id/accept',
  doctorOnly,
  [
    param('id').isInt(),
    // Accepting IS the dispatch - the doctor must attach an available
    // ambulance and an available driver in the same action.
    body('ambulance_id').isInt().withMessage('ambulance_id must be an integer'),
    body('staff_id').isInt().withMessage('staff_id (the driver) must be an integer'),
  ],
  validate,
  ctrl.accept
);

router.put(
  '/:id/reject',
  doctorOnly,
  [param('id').isInt()],
  validate,
  ctrl.reject
);

router.put(
  '/:id/assign',
  dispatcherOnly,
  [param('id').isInt(), body('ambulance_id').isInt()],
  validate,
  ctrl.assign
);

router.put(
  '/:id/assign-driver',
  driverPickerOnly,
  [param('id').isInt(), body('staff_id').isInt()],
  validate,
  ctrl.assignDriver
);

router.put(
  '/:id/complete',
  completerOnly,
  [param('id').isInt()],
  validate,
  ctrl.complete
);

router.put(
  '/:id',
  dispatcherOnly,
  [
    param('id').isInt(),
    body('pickup_location').optional().isString(),
    body('drop_location').optional().isString(),
    body('status').optional().isIn(['Cancelled']),
  ],
  validate,
  ctrl.update
);

router.delete('/:id', requireRole('admin'), [param('id').isInt()], validate, ctrl.remove);

module.exports = router;