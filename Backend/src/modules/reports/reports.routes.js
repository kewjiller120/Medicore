'use strict';

const express = require('express');
const { param, query } = require('express-validator');

const ctrl = require('./reports.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole, requireStaffRole } = require('../../middleware/authorize');

const router = express.Router();

router.use(authenticate);

// Analytical reports are management/clinical tools.
// - patient-history is additionally scoped inside the controller so a
//   patient can pull their own file from their portal.
// Financial figures are strictly admin / Accountant territory.
router.get('/revenue-summary', requireStaffRole('Accountant'), [
  query('from_date').optional().isISO8601(),
  query('to_date').optional().isISO8601(),
], validate, ctrl.revenueSummary);

router.get('/room-occupancy', requireRole('admin', 'doctor', 'staff'), ctrl.roomOccupancy);

router.get('/patient-history/:patientId', [
  param('patientId').isInt(),
], validate, ctrl.patientHistory);

router.get('/doctor-appointments/:doctorId', requireRole('admin', 'doctor', 'staff'), [
  param('doctorId').isInt(),
  query('days').optional().isInt({ min: 1, max: 365 }),
], validate, ctrl.doctorAppointments);

router.get('/doctor-workload/:doctorId', requireRole('admin', 'doctor', 'staff'), [
  param('doctorId').isInt(),
], validate, ctrl.doctorWorkload);

router.get('/low-stock', requireRole('admin', 'staff'), [
  query('threshold').optional().isInt({ min: 0 }),
], validate, ctrl.lowStock);

router.get('/department-doctors/:departmentId', requireRole('admin', 'staff'), [
  param('departmentId').isInt(),
], validate, ctrl.departmentDoctors);

router.get('/patient-census', requireRole('admin', 'staff'), [
  query('group').optional().isIn(['gender', 'blood_group']),
], validate, ctrl.patientCensus);

module.exports = router;