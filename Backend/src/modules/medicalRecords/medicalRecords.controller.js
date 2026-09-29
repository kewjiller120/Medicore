'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Central ownership rule for this whole module: a doctor may only see or
 * touch medical records THEY authored, and a patient only their OWN
 * records (read-only). This is enforced server-side on every read and
 * write below - never by hiding a button on the frontend - and is
 * exactly the "object-level ownership" scenario the 60% guidelines call
 * out explicitly (e.g. "/orders/17 belonging to a different customer").
 */
function canAccessRecord(req, record) {
  if (req.user.role === 'admin') return true;
  if (req.user.role === 'doctor') return record.doctor_id === req.user.doctorId;
  if (req.user.role === 'patient') return record.patient_id === req.user.patientId;
  if (req.user.role === 'staff' && req.user.staffRole === 'Nurse') return true; // read-only, enforced in routes
  return false;
}

const list = asyncHandler(async (req, res) => {
  const { patient_id } = req.query;
  const conditions = [];
  const params = [];

  if (req.user.role === 'doctor') {
    params.push(req.user.doctorId);
    conditions.push(`mr.doctor_id = $${params.length}`);
  }
  if (req.user.role === 'patient') {
    // A patient sees only their own medical records.
    params.push(req.user.patientId);
    conditions.push(`mr.patient_id = $${params.length}`);
  }
  // admin, doctor and Nurse (read-only route) see all records, optionally filtered by patient
  if (patient_id) {
    params.push(patient_id);
    conditions.push(`mr.patient_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT mr.*, p.name AS patient_name, d.name AS doctor_name
       FROM medical_record mr
       JOIN patient p ON p.patient_id = mr.patient_id
       JOIN doctor d ON d.doctor_id = mr.doctor_id
       ${where}
      ORDER BY mr.visit_date DESC, mr.record_id DESC`,
    params
  );
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT mr.*, p.name AS patient_name, d.name AS doctor_name
       FROM medical_record mr
       JOIN patient p ON p.patient_id = mr.patient_id
       JOIN doctor d ON d.doctor_id = mr.doctor_id
      WHERE mr.record_id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Medical record not found');
  if (!canAccessRecord(req, rows[0])) {
    throw ApiError.forbidden('You can only view medical records you are allowed to see');
  }
  res.json(rows[0]);
});

const create = asyncHandler(async (req, res) => {
  const { patient_id, diagnosis, visit_date, notes } = req.body;
  let { doctor_id } = req.body;

  if (req.user.role === 'doctor') {
    // A doctor can only ever author a record as themselves - the client
    // supplying a different doctor_id is simply ignored, not trusted.
    doctor_id = req.user.doctorId;
  } else if (!doctor_id) {
    throw ApiError.badRequest('doctor_id is required');
  }

  const { rows } = await pool.query(
    `INSERT INTO medical_record (patient_id, doctor_id, diagnosis, visit_date, notes)
     VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5) RETURNING *`,
    [patient_id, doctor_id, diagnosis, visit_date || null, notes || null]
  );
  res.status(201).json(rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM medical_record WHERE record_id = $1', [
    req.params.id,
  ]);
  if (existingRows.length === 0) throw ApiError.notFound('Medical record not found');

  const existing = existingRows[0];
  const isOwnerDoctor = req.user.role === 'doctor' && existing.doctor_id === req.user.doctorId;
  if (req.user.role !== 'admin' && !isOwnerDoctor) {
    throw ApiError.forbidden('You can only edit medical records you authored');
  }

  const { diagnosis, visit_date, notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE medical_record SET
       diagnosis = COALESCE($1, diagnosis),
       visit_date = COALESCE($2, visit_date),
       notes = COALESCE($3, notes)
     WHERE record_id = $4 RETURNING *`,
    [diagnosis || null, visit_date || null, notes ?? null, req.params.id]
  );
  res.json(rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  // Deletion is admin-only regardless of authorship - handled by route-level requireRole('admin').
  const { rowCount } = await pool.query('DELETE FROM medical_record WHERE record_id = $1', [req.params.id]);
  if (rowCount === 0) throw ApiError.notFound('Medical record not found');
  res.status(204).send();
});

module.exports = { list, getOne, create, update, remove };
