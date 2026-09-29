'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./staff.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole } = require('../../middleware/authorize');

const router = express.Router();

router.use(authenticate);
router.use(requireRole('admin', 'doctor', 'staff')); // internal staff directory - not part of patient self-service

router.get(
  '/',
  [
    query('department_id').optional().isInt(),
    query('role').optional().isIn(['Receptionist', 'Nurse', 'Pharmacist', 'LabTechnician', 'Driver', 'Accountant', 'Other']),
    query('search').optional().isString(),
  ],
  validate,
  ctrl.list
);
router.get('/:id', [param('id').isInt()], validate, ctrl.getOne);

router.put(
  '/:id',
  [
    param('id').isInt(),
    body('name').optional().isString(),
    body('department_id').optional({ nullable: true }).isInt(),
    body('role').optional().isIn(['Receptionist', 'Nurse', 'Pharmacist', 'LabTechnician', 'Driver', 'Accountant', 'Other']),
    body('phone').optional({ nullable: true }).isString(),
    body('shift_timing').optional({ nullable: true }).isString(),
  ],
  validate,
  ctrl.update
);

module.exports = router;
