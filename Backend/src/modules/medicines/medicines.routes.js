'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./medicines.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole, requireStaffRole } = require('../../middleware/authorize');

const router = express.Router();

router.use(authenticate);
router.use(requireRole('admin', 'doctor', 'staff')); // internal inventory - all hospital roles can view the formulary/stock, patients cannot

router.get('/', [query('search').optional().isString(), query('lowStock').optional().isBoolean()], validate, ctrl.list);
router.get('/:id', [param('id').isInt()], validate, ctrl.getOne);

// Only pharmacists (or admin) manage inventory levels and pricing
router.post(
  '/',
  requireRole('admin', 'staff'),
  requireStaffRole('Pharmacist'),
  [
    body('name').trim().notEmpty(),
    body('unit_price').isFloat({ min: 0 }),
    body('stock_quantity').optional().isInt({ min: 0 }),
    body('manufacturer').optional({ nullable: true }).isString(),
    body('exp_date').optional({ nullable: true }).isISO8601(),
  ],
  validate,
  ctrl.create
);

router.put(
  '/:id',
  requireRole('admin', 'staff'),
  requireStaffRole('Pharmacist'),
  [
    param('id').isInt(),
    body('name').optional().isString(),
    body('unit_price').optional().isFloat({ min: 0 }),
    body('stock_quantity').optional().isInt({ min: 0 }),
    body('manufacturer').optional({ nullable: true }).isString(),
    body('exp_date').optional({ nullable: true }).isISO8601(),
  ],
  validate,
  ctrl.update
);

router.delete(
  '/:id',
  requireRole('admin', 'staff'),
  requireStaffRole('Pharmacist'),
  [param('id').isInt()],
  validate,
  ctrl.remove
);

module.exports = router;
