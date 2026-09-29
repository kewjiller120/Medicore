'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const ctrl = require('./doctors.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();

router.use(authenticate); // any role can browse the doctor directory

router.get(
  '/',
  [
    query('department_id').optional().isInt(),
    query('status').optional().isIn(['Active', 'Inactive', 'On Leave']),
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
    body('specialization').optional({ nullable: true }).isString(),
    body('qualification').optional({ nullable: true }).isString(),
    body('phone').optional({ nullable: true }).isString(),
    body('email').optional({ nullable: true }).isEmail(),
    body('status').optional().isIn(['Active', 'Inactive', 'On Leave']),
  ],
  validate,
  ctrl.update
);

module.exports = router;
