'use strict';

const express = require('express');
const { body, param } = require('express-validator');

const ctrl = require('./admin.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole } = require('../../middleware/authorize');

const router = express.Router();

// Every route in this file is admin-only.
router.use(authenticate, requireRole('admin'));

router.get('/users', ctrl.listUsers);

router.post(
  '/users',
  [
    body('username').trim().isLength({ min: 3, max: 50 }),
    body('password').notEmpty(),
    body('role').isIn(['admin', 'doctor', 'staff']),
    body('name').if(body('role').not().equals('admin')).trim().isLength({ min: 2 }),
    body('department_id').optional({ nullable: true }).isInt(),
    body('staffRole')
      .if(body('role').equals('staff'))
      .isIn(['Receptionist', 'Nurse', 'Pharmacist', 'LabTechnician', 'Driver', 'Accountant', 'Other']),
  ],
  validate,
  ctrl.createUser
);

router.patch(
  '/users/:id',
  [
    param('id').isInt(),
    body('username').optional({ nullable: true }).trim().isLength({ min: 3, max: 50 }),
    body('newPassword').optional({ nullable: true }).isString(),
  ],
  validate,
  ctrl.updateUser
);

router.delete('/users/:id', [param('id').isInt()], validate, ctrl.deleteUser);

module.exports = router;
