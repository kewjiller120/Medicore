'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

// A patient browsing the hospital's own patient directory would be a
// privacy leak (every other patient's contact info, blood group, etc.) -
// so a patient caller only ever sees their own single record here,
// regardless of any `search` query. Admin/doctor/staff keep full access.
const list = asyncHandler(async (req, res) => {
  if (req.user.role === 'patient') {
    const { rows } = await pool.query('SELECT * FROM patient WHERE patient_id = $1', [req.user.patientId]);
    return res.json(rows);
  }

  const { search, gender, blood_group } = req.query;
  const conditions = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }
  if (gender) {
    params.push(gender);
    conditions.push(`gender = $${params.length}`);
  }
  if (blood_group) {
    params.push(blood_group);
    conditions.push(`blood_group = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM patient ${where} ORDER BY patient_id DESC`, params);
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM patient WHERE patient_id = $1', [req.params.id]);
  if (rows.length === 0) throw ApiError.notFound('Patient not found');
  if (req.user.role === 'patient' && rows[0].patient_id !== req.user.patientId) {
    throw ApiError.forbidden('You can only view your own patient record');
  }
  res.json(rows[0]);
});

const create = asyncHandler(async (req, res) => {
  const { name, dob, gender, blood_group, address, phone, emergency_contact } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO patient (name, dob, gender, blood_group, address, phone, emergency_contact)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, dob || null, gender || null, blood_group || null, address || null, phone || null, emergency_contact || null]
  );
  res.status(201).json(rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { name, dob, gender, blood_group, address, phone, emergency_contact } = req.body;
  const { rows } = await pool.query(
    `UPDATE patient SET
       name = COALESCE($1, name),
       dob = COALESCE($2, dob),
       gender = COALESCE($3, gender),
       blood_group = COALESCE($4, blood_group),
       address = COALESCE($5, address),
       phone = COALESCE($6, phone),
       emergency_contact = COALESCE($7, emergency_contact)
     WHERE patient_id = $8 RETURNING *`,
    [
      name || null,
      dob || null,
      gender || null,
      blood_group || null,
      address ?? null,
      phone ?? null,
      emergency_contact ?? null,
      req.params.id,
    ]
  );
  if (rows.length === 0) throw ApiError.notFound('Patient not found');
  res.json(rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM patient WHERE patient_id = $1', [req.params.id]);
  if (rowCount === 0) throw ApiError.notFound('Patient not found');
  res.status(204).send();
});

module.exports = { list, getOne, create, update, remove };
