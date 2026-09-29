'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

// ---------------------------------------------------------------------
// GET /api/reports/revenue-summary?from_date=&to_date=
// fun_revenue_summary: totals per payment method for a date range.
// ---------------------------------------------------------------------
const revenueSummary = asyncHandler(async (req, res) => {
  const { from_date, to_date } = req.query;
  const { rows } = await pool.query('SELECT * FROM fun_revenue_summary($1, $2)', [
    from_date || null,
    to_date || null,
  ]);
  res.json(rows);
});

// ---------------------------------------------------------------------
// GET /api/reports/room-occupancy
// fun_room_occupancy: rooms grouped by type (total/available/occupied/maintenance).
// ---------------------------------------------------------------------
const roomOccupancy = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM fun_room_occupancy()');
  res.json(rows);
});

// ---------------------------------------------------------------------
// GET /api/reports/patient-history/:patientId
// fun_patient_history: chronological trail of one patient's visits, lab
// tests/results, admissions, bills and ambulance requests. A patient
// caller may only request their own history.
// ---------------------------------------------------------------------
const patientHistory = asyncHandler(async (req, res) => {
  const patientId = parseInt(req.params.patientId, 10);
  if (req.user.role === 'patient' && patientId !== req.user.patientId) {
    throw ApiError.forbidden('You can only view your own patient history');
  }
  const { rows } = await pool.query('SELECT * FROM fun_patient_history($1)', [patientId]);
  res.json(rows);
});

// ---------------------------------------------------------------------
// GET /api/reports/doctor-appointments/:doctorId?days=
// fun_doctor_appointments: the doctor's upcoming schedule.
// ---------------------------------------------------------------------
const doctorAppointments = asyncHandler(async (req, res) => {
  const doctorId = parseInt(req.params.doctorId, 10);
  const days = req.query.days ? parseInt(req.query.days, 10) : null;
  const { rows } = await pool.query('SELECT * FROM fun_doctor_appointments($1, $2)', [doctorId, days]);
  res.json(rows);
});

// ---------------------------------------------------------------------
// GET /api/reports/doctor-workload/:doctorId
// fun_doctor_workload: one-count workload snapshot for a doctor.
// ---------------------------------------------------------------------
const doctorWorkload = asyncHandler(async (req, res) => {
  const doctorId = parseInt(req.params.doctorId, 10);
  const { rows } = await pool.query('SELECT * FROM fun_doctor_workload($1)', [doctorId]);
  res.json(rows[0] || null);
});

// ---------------------------------------------------------------------
// GET /api/reports/low-stock?threshold=
// fun_low_stock_medicines: stock at or below a threshold (default 20).
// ---------------------------------------------------------------------
const lowStock = asyncHandler(async (req, res) => {
  const threshold = req.query.threshold ? parseInt(req.query.threshold, 10) : null;
  const { rows } = await pool.query('SELECT * FROM fun_low_stock_medicines($1)', [threshold]);
  res.json(rows);
});

// ---------------------------------------------------------------------
// GET /api/reports/department-doctors/:departmentId
// fun_department_doctors: doctors currently in a department.
// ---------------------------------------------------------------------
const departmentDoctors = asyncHandler(async (req, res) => {
  const departmentId = parseInt(req.params.departmentId, 10);
  const { rows } = await pool.query('SELECT * FROM fun_department_doctors($1)', [departmentId]);
  res.json(rows);
});

// ---------------------------------------------------------------------
// GET /api/reports/patient-census?group=gender|blood_group
// fun_patient_census_by_gender / by_blood_group: demographic snapshots.
// ---------------------------------------------------------------------
const patientCensus = asyncHandler(async (req, res) => {
  const { group } = req.query;
  if (group === 'blood_group') {
    const { rows } = await pool.query('SELECT * FROM fun_patient_census_by_blood_group()');
    return res.json(rows);
  }
  const { rows } = await pool.query('SELECT * FROM fun_patient_census_by_gender()');
  res.json(rows);
});

module.exports = {
  revenueSummary,
  roomOccupancy,
  patientHistory,
  doctorAppointments,
  doctorWorkload,
  lowStock,
  departmentDoctors,
  patientCensus,
};