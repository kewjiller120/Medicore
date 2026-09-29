'use strict';

const express = require('express');
const { body, param } = require('express-validator');

const ctrl = require('./driverAssignments.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole, requireStaffRole } = require('../../middleware/authorize');

const router = express.Router();

router.use(authenticate);

router.get('/', requireRole('admin'), ctrl.list);
router.get('/mine', requireRole('staff'), requireStaffRole('Driver'), ctrl.myAssignments);

router.post(
  '/',
  requireRole('admin'),
  [body('staff_id').isInt(), body('ambulance_id').isInt()],
  validate,
  ctrl.create
);

router.delete(
  '/:staffId/:ambulanceId',
  requireRole('admin'),
  [param('staffId').isInt(), param('ambulanceId').isInt()],
  validate,
  ctrl.remove
);

module.exports = router;
