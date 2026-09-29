'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./rooms.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole } = require('../../middleware/authorize');

const router = express.Router();

router.use(authenticate);
router.use(requireRole('admin', 'doctor', 'staff')); // internal ward-management data - not part of patient self-service

router.get(
  '/',
  [
    query('status').optional().isIn(['Available', 'Occupied', 'Maintenance']),
    query('type').optional().isIn(['General', 'Private', 'ICU', 'Operation Theatre', 'Emergency']),
  ],
  validate,
  ctrl.list
);
router.get('/:id', [param('id').isInt()], validate, ctrl.getOne);

// Admin manages the room inventory (create/edit/delete).
router.post(
  '/',
  requireRole('admin'),
  [
    body('room_number').trim().notEmpty(),
    body('type').isIn(['General', 'Private', 'ICU', 'Operation Theatre', 'Emergency']),
    body('status').optional().isIn(['Available', 'Occupied', 'Maintenance']),
  ],
  validate,
  ctrl.create
);

router.put(
  '/:id',
  requireRole('admin'),
  [
    param('id').isInt(),
    body('room_number').optional().isString(),
    body('type').optional().isIn(['General', 'Private', 'ICU', 'Operation Theatre', 'Emergency']),
    body('status').optional().isIn(['Available', 'Occupied', 'Maintenance']),
  ],
  validate,
  ctrl.update
);

router.delete('/:id', requireRole('admin'), [param('id').isInt()], validate, ctrl.remove);

module.exports = router;
