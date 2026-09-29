'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { patient_id, doctor_id, admit_date, status } = req.query;
  const conditions = [];
  const params = [];

  if (req.user.role === 'doctor') {
    params.push(req.user.doctorId);
    conditions.push(`ad.doctor_id = $${params.length}`);
  }
  if (patient_id) {
    params.push(patient_id);
    conditions.push(`ad.patient_id = $${params.length}`);
  }
  if (doctor_id) {
    params.push(doctor_id);
    conditions.push(`ad.doctor_id = $${params.length}`);
  }
  if (admit_date) {
    params.push(admit_date);
    conditions.push(`ad.admit_date = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`ad.status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT ad.*, p.name AS patient_name, d.name AS doctor_name, r.room_number
       FROM admission ad
       JOIN patient p ON p.patient_id = ad.patient_id
       JOIN doctor d ON d.doctor_id = ad.doctor_id
       JOIN room r ON r.room_id = ad.room_id
       ${where}
      ORDER BY ad.admit_date DESC, ad.admission_id DESC`,
    params
  );
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ad.*, p.name AS patient_name, d.name AS doctor_name, r.room_number
       FROM admission ad
       JOIN patient p ON p.patient_id = ad.patient_id
       JOIN doctor d ON d.doctor_id = ad.doctor_id
       JOIN room r ON r.room_id = ad.room_id
      WHERE ad.admission_id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Admission not found');
  const admission = rows[0];
  if (req.user.role === 'doctor' && admission.doctor_id !== req.user.doctorId) {
    throw ApiError.forbidden('You can only view admissions under your own care');
  }
  res.json(admission);
});

// Room availability + occupancy bookkeeping is handled entirely by
// fn_admission_before()/fn_admission_after() in the database.
const create = asyncHandler(async (req, res) => {
  const { patient_id, room_id, admit_date, status } = req.body;
  let { doctor_id } = req.body;

  if (req.user.role === 'doctor') {
    doctor_id = req.user.doctorId;
  } else if (!doctor_id) {
    throw ApiError.badRequest('doctor_id is required');
  }

  const { rows } = await pool.query(
    `INSERT INTO admission (patient_id, room_id, doctor_id, admit_date, status)
     VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), COALESCE($5, 'Admitted')) RETURNING *`,
    [patient_id, room_id, doctor_id, admit_date || null, status || null]
  );
  res.status(201).json(rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM admission WHERE admission_id = $1', [
    req.params.id,
  ]);
  if (existingRows.length === 0) throw ApiError.notFound('Admission not found');
  const existing = existingRows[0];

  const isOwnerDoctor = req.user.role === 'doctor' && existing.doctor_id === req.user.doctorId;
  if (req.user.role !== 'admin' && !isOwnerDoctor) {
    throw ApiError.forbidden('You do not have access to update this admission');
  }

  const { room_id, discharge_date, status } = req.body;
  const { rows } = await pool.query(
    `UPDATE admission SET
       room_id = COALESCE($1, room_id),
       discharge_date = COALESCE($2, discharge_date),
       status = COALESCE($3, status)
     WHERE admission_id = $4 RETURNING *`,
    [room_id || null, discharge_date || null, status || null, req.params.id]
  );
  res.json(rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM admission WHERE admission_id = $1', [req.params.id]);
  if (rowCount === 0) throw ApiError.notFound('Admission not found');
  res.status(204).send();
});

module.exports = { list, getOne, create, update, remove };
