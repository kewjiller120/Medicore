'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./ambulances.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole, requireStaffRole } = require('../../middleware/authorize');

const router = express.Router();

router.use(authenticate);
router.use(requireRole('admin', 'doctor', 'staff')); // internal fleet-management data - patients use ambulanceRequests instead

router.get('/', [query('status').optional().isIn(['Available', 'On Trip', 'Maintenance'])], validate, ctrl.list);
router.get('/:id', [param('id').isInt()], validate, ctrl.getOne);

router.post(
  '/',
  requireRole('admin'),
  [
    body('vehicle_no').trim().notEmpty(),
    body('current_location').optional({ nullable: true }).isString(),
    body('status').optional().isIn(['Available', 'On Trip', 'Maintenance']),
  ],
  validate,
  ctrl.create
);

router.put(
  '/:id',
  requireRole('admin', 'staff'),
  requireStaffRole('Driver'), // a Driver may update their assigned ambulance's location/status; admin always allowed
  [
    param('id').isInt(),
    body('vehicle_no').optional().isString(),
    body('current_location').optional({ nullable: true }).isString(),
    body('status').optional().isIn(['Available', 'On Trip', 'Maintenance']),
  ],
  validate,
  ctrl.update
);

router.delete('/:id', requireRole('admin'), [param('id').isInt()], validate, ctrl.remove);

module.exports = router;
