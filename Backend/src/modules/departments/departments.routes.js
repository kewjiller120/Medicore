'use strict';

const express = require('express');
const { body, param } = require('express-validator');

const ctrl = require('./departments.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole } = require('../../middleware/authorize');

const router = express.Router();

// The department directory is public (no auth) - it isn't sensitive data,
// and the doctor/staff self-registration form needs to populate a
// department dropdown *before* the person has any token to authenticate
// with. Every write operation below is still fully authenticated + admin-only.

router.get('/', ctrl.list);
router.get('/:id', [param('id').isInt()], validate, ctrl.getOne);

router.post(
  '/',
  authenticate,
  requireRole('admin'),
  [body('name').trim().notEmpty(), body('location').optional({ nullable: true }).isString()],
  validate,
  ctrl.create
);

router.put(
  '/:id',
  authenticate,
  requireRole('admin'),
  [param('id').isInt(), body('name').optional().isString(), body('location').optional({ nullable: true }).isString()],
  validate,
  ctrl.update
);

router.delete('/:id', authenticate, requireRole('admin'), [param('id').isInt()], validate, ctrl.remove);

module.exports = router;
