'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./prescriptions.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const ApiError = require('../../utils/ApiError');

const router = express.Router();

router.use(authenticate);

/** admin (all), doctor (own only - filtered in controller), staff Pharmacist (all, read-only), patient (own, read-only) */
function canRead(req, res, next) {
  const { role, staffRole } = req.user;
  if (role === 'admin' || role === 'doctor' || role === 'patient') return next();
  if (role === 'staff' && staffRole === 'Pharmacist') return next();
  return next(ApiError.forbidden('Only admin, doctors, pharmacists, or the patient themselves can view prescriptions'));
}

/** admin or doctor may author prescriptions/items */
function canWrite(req, res, next) {
  if (req.user.role === 'admin' || req.user.role === 'doctor') return next();
  return next(ApiError.forbidden('Only admin or a doctor can manage prescriptions'));
}

router.get('/', canRead, [query('record_id').optional().isInt(), query('patient_id').optional().isInt()], validate, ctrl.list);
router.get('/:id', canRead, [param('id').isInt()], validate, ctrl.getOne);

router.post('/', canWrite, [body('record_id').isInt(), body('date_issued').optional({ nullable: true }).isISO8601()], validate, ctrl.create);
router.delete('/:id', canWrite, [param('id').isInt()], validate, ctrl.remove);

router.post(
  '/:id/items',
  canWrite,
  [
    param('id').isInt(),
    body('medicine_id').isInt(),
    body('dosage').trim().notEmpty(),
    body('duration').trim().notEmpty(),
    body('quantity').isInt({ min: 1 }),
  ],
  validate,
  ctrl.addItem
);

router.put(
  '/:id/items/:itemId',
  canWrite,
  [
    param('id').isInt(),
    param('itemId').isInt(),
    body('medicine_id').optional().isInt(),
    body('dosage').optional().isString(),
    body('duration').optional().isString(),
    body('quantity').optional().isInt({ min: 1 }),
  ],
  validate,
  ctrl.updateItem
);

router.delete(
  '/:id/items/:itemId',
  canWrite,
  [param('id').isInt(), param('itemId').isInt()],
  validate,
  ctrl.removeItem
);

module.exports = router;
