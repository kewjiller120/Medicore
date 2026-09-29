'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { patient_id, doctor_id, status } = req.query;
  const conditions = [];
  const params = [];

  if (req.user.role === 'doctor') {
    params.push(req.user.doctorId);
    conditions.push(`lt.doctor_id = $${params.length}`);
  }
  if (req.user.role === 'patient') {
    // A patient sees only their own lab tests - any patient_id query
    // param is ignored rather than trusted.
    params.push(req.user.patientId);
    conditions.push(`lt.patient_id = $${params.length}`);
  } else if (patient_id) {
    params.push(patient_id);
    conditions.push(`lt.patient_id = $${params.length}`);
  }
  // Doctors are already scoped to their own orders above, so the
  // doctor_id filter is offered to everyone else (admin / lab
  // technicians / patients filtering their own tests by doctor).
  if (doctor_id && req.user.role !== 'doctor') {
    params.push(doctor_id);
    conditions.push(`lt.doctor_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`lt.status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT lt.*, p.name AS patient_name, d.name AS doctor_name, s.name AS staff_name
       FROM lab_test lt
       JOIN patient p ON p.patient_id = lt.patient_id
       JOIN doctor d ON d.doctor_id = lt.doctor_id
       LEFT JOIN staff s ON s.staff_id = lt.staff_id
       ${where}
      ORDER BY lt.test_date DESC, lt.test_id DESC`,
    params
  );
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT lt.*, p.name AS patient_name, d.name AS doctor_name, s.name AS staff_name
       FROM lab_test lt
       JOIN patient p ON p.patient_id = lt.patient_id
       JOIN doctor d ON d.doctor_id = lt.doctor_id
       LEFT JOIN staff s ON s.staff_id = lt.staff_id
      WHERE lt.test_id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Lab test not found');
  const test = rows[0];
  if (req.user.role === 'doctor' && test.doctor_id !== req.user.doctorId) {
    throw ApiError.forbidden('You can only view lab tests you ordered');
  }
  if (req.user.role === 'patient' && test.patient_id !== req.user.patientId) {
    throw ApiError.forbidden('You can only view your own lab tests');
  }
  res.json(test);
});

// A doctor orders a test for their own patient; admin can order on anyone's behalf.
const create = asyncHandler(async (req, res) => {
  const { patient_id, test_type, test_date, staff_id } = req.body;
  let { doctor_id } = req.body;

  if (req.user.role === 'doctor') {
    doctor_id = req.user.doctorId;
  } else if (!doctor_id) {
    throw ApiError.badRequest('doctor_id is required');
  }

  const { rows } = await pool.query(
    `INSERT INTO lab_test (test_type, test_date, patient_id, doctor_id, staff_id)
     VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5) RETURNING *`,
    [test_type, test_date || null, patient_id, doctor_id, staff_id || null]
  );
  res.status(201).json(rows[0]);
});

// LabTechnicians progress the test through its workflow (assign self, mark status).
const update = asyncHandler(async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM lab_test WHERE test_id = $1', [req.params.id]);
  if (existingRows.length === 0) throw ApiError.notFound('Lab test not found');
  const existing = existingRows[0];

  const isOwnerDoctor = req.user.role === 'doctor' && existing.doctor_id === req.user.doctorId;
  const isLabTech = req.user.role === 'staff' && req.user.staffRole === 'LabTechnician';
  if (req.user.role !== 'admin' && !isOwnerDoctor && !isLabTech) {
    throw ApiError.forbidden('You do not have access to update this lab test');
  }

  const { status, staff_id, test_date } = req.body;
  // A doctor may only cancel their own order, not reassign the technician or mark it complete themselves.
  if (isOwnerDoctor && (staff_id !== undefined || (status && status !== 'Cancelled'))) {
    throw ApiError.forbidden('A doctor may only cancel their own lab test order');
  }

  const { rows } = await pool.query(
    `UPDATE lab_test SET
       status = COALESCE($1, status),
       staff_id = COALESCE($2, staff_id),
       test_date = COALESCE($3, test_date)
     WHERE test_id = $4 RETURNING *`,
    [status || null, staff_id ?? null, test_date || null, req.params.id]
  );
  res.json(rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM lab_test WHERE test_id = $1', [req.params.id]);
  if (rowCount === 0) throw ApiError.notFound('Lab test not found');
  res.status(204).send();
});

module.exports = { list, getOne, create, update, remove };
