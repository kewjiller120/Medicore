'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./patients.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole } = require('../../middleware/authorize');
const ApiError = require('../../utils/ApiError');

const router = express.Router();

router.use(authenticate); // any authenticated role can hit these routes; a patient caller is scoped to their own record inside the controller

router.get(
  '/',
  [
    query('search').optional().isString(),
    query('gender').optional().isIn(['Male', 'Female', 'Other']),
    query('blood_group').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  ],
  validate,
  ctrl.list
);
router.get('/:id', [param('id').isInt()], validate, ctrl.getOne);

const patientBodyRules = [
  body('dob').optional({ nullable: true }).isISO8601(),
  body('gender').optional({ nullable: true }).isIn(['Male', 'Female', 'Other']),
  body('blood_group').optional({ nullable: true }).isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  body('address').optional({ nullable: true }).isString(),
  body('phone').optional({ nullable: true }).isString(),
  body('emergency_contact').optional({ nullable: true }).isString(),
];

/**
 * Registering/updating a patient record is admin or doctor work only -
 * front-desk and nursing staff view patient records but may not create
 * or edit them.
 */
function canManagePatients(req, res, next) {
  const { role } = req.user;
  if (role === 'admin' || role === 'doctor') return next();
  return next(ApiError.forbidden('Only admin or doctors can manage patient records'));
}

/** Same as canManagePatients, but a patient may also edit their own record (never anyone else's). */
function canManagePatientsOrSelf(req, res, next) {
  if (req.user.role === 'patient' && req.user.patientId === parseInt(req.params.id, 10)) return next();
  return canManagePatients(req, res, next);
}

router.post('/', canManagePatients, [body('name').trim().notEmpty(), ...patientBodyRules], validate, ctrl.create);

router.put(
  '/:id',
  canManagePatientsOrSelf,
  [param('id').isInt(), body('name').optional().isString(), ...patientBodyRules],
  validate,
  ctrl.update
);

router.delete('/:id', requireRole('admin'), [param('id').isInt()], validate, ctrl.remove);

module.exports = router;
