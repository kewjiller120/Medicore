'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

/** Resolve the authoring doctor_id for a prescription via its parent medical_record. */
async function getPrescriptionOwnerDoctorId(prescriptionId) {
  const { rows } = await pool.query(
    `SELECT mr.doctor_id
       FROM prescription pr
       JOIN medical_record mr ON mr.record_id = pr.record_id
      WHERE pr.prescription_id = $1`,
    [prescriptionId]
  );
  return rows.length ? rows[0].doctor_id : null;
}

function canAccessPrescription(req, ownerDoctorId, prescription) {
  if (req.user.role === 'admin') return true;
  if (req.user.role === 'patient') return prescription && prescription.patient_id === req.user.patientId;
  if (req.user.role === 'staff' && req.user.staffRole === 'Pharmacist') return true; // read-only, enforced in routes
  if (req.user.role === 'doctor') return ownerDoctorId === req.user.doctorId;
  return false;
}

/** Shared write-guard used by add/update/remove item and delete-prescription. */
function assertCanWrite(req, ownerDoctorId) {
  if (req.user.role === 'admin') return;
  if (req.user.role === 'doctor' && ownerDoctorId === req.user.doctorId) return;
  if (req.user.role === 'doctor') {
    throw ApiError.forbidden('You can only modify your own prescriptions');
  }
  throw ApiError.forbidden('Only admin or a doctor can modify prescriptions');
}

// ---------------------------------------------------------------------
// GET /api/prescriptions?record_id=&patient_id=
// ---------------------------------------------------------------------
const list = asyncHandler(async (req, res) => {
  const { record_id, patient_id } = req.query;
  const conditions = [];
  const params = [];

  if (req.user.role === 'doctor') {
    params.push(req.user.doctorId);
    conditions.push(`mr.doctor_id = $${params.length}`);
  }
  if (req.user.role === 'patient') {
    // A patient sees only their own prescriptions.
    params.push(req.user.patientId);
    conditions.push(`mr.patient_id = $${params.length}`);
  }
  if (record_id) {
    params.push(record_id);
    conditions.push(`pr.record_id = $${params.length}`);
  }
  if (patient_id) {
    params.push(patient_id);
    conditions.push(`mr.patient_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT pr.*, mr.patient_id, mr.doctor_id, p.name AS patient_name
       FROM prescription pr
       JOIN medical_record mr ON mr.record_id = pr.record_id
       JOIN patient p ON p.patient_id = mr.patient_id
       ${where}
      ORDER BY pr.date_issued DESC, pr.prescription_id DESC`,
    params
  );
  res.json(rows);
});

// ---------------------------------------------------------------------
// GET /api/prescriptions/:id  (includes items)
// ---------------------------------------------------------------------
const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT pr.*, mr.patient_id, mr.doctor_id, p.name AS patient_name
       FROM prescription pr
       JOIN medical_record mr ON mr.record_id = pr.record_id
       JOIN patient p ON p.patient_id = mr.patient_id
      WHERE pr.prescription_id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Prescription not found');
  const prescription = rows[0];

  if (!canAccessPrescription(req, prescription.doctor_id, prescription)) {
    throw ApiError.forbidden('You can only view your own prescriptions and medical records');
  }

  const { rows: items } = await pool.query(
    `SELECT pi.*, m.name AS medicine_name, m.unit_price
       FROM prescription_item pi
       JOIN medicine m ON m.medicine_id = pi.medicine_id
      WHERE pi.prescription_id = $1
      ORDER BY pi.item_id`,
    [req.params.id]
  );

  res.json({ ...prescription, items });
});

// ---------------------------------------------------------------------
// POST /api/prescriptions   { record_id, date_issued? }
// ---------------------------------------------------------------------
const create = asyncHandler(async (req, res) => {
  const { record_id, date_issued } = req.body;

  const { rows: recordRows } = await pool.query('SELECT doctor_id FROM medical_record WHERE record_id = $1', [
    record_id,
  ]);
  if (recordRows.length === 0) throw ApiError.notFound('Medical record not found');

  assertCanWrite(req, recordRows[0].doctor_id);

  const { rows } = await pool.query(
    `INSERT INTO prescription (record_id, date_issued) VALUES ($1, COALESCE($2, CURRENT_DATE)) RETURNING *`,
    [record_id, date_issued || null]
  );
  res.status(201).json(rows[0]);
});

// ---------------------------------------------------------------------
// POST /api/prescriptions/:id/items   { medicine_id, dosage, duration, quantity }
// Triggers fn_adjust_medicine_stock() - insufficient stock => 409 from the DB.
// ---------------------------------------------------------------------
const addItem = asyncHandler(async (req, res) => {
  const prescriptionId = req.params.id;
  const ownerDoctorId = await getPrescriptionOwnerDoctorId(prescriptionId);
  if (ownerDoctorId === null) throw ApiError.notFound('Prescription not found');
  assertCanWrite(req, ownerDoctorId);

  const { medicine_id, dosage, duration, quantity } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO prescription_item (prescription_id, medicine_id, dosage, duration, quantity)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [prescriptionId, medicine_id, dosage, duration, quantity]
  );
  res.status(201).json(rows[0]);
});

// ---------------------------------------------------------------------
// PUT /api/prescriptions/:id/items/:itemId
// ---------------------------------------------------------------------
const updateItem = asyncHandler(async (req, res) => {
  const ownerDoctorId = await getPrescriptionOwnerDoctorId(req.params.id);
  if (ownerDoctorId === null) throw ApiError.notFound('Prescription not found');
  assertCanWrite(req, ownerDoctorId);

  const { medicine_id, dosage, duration, quantity } = req.body;
  const { rows } = await pool.query(
    `UPDATE prescription_item SET
       medicine_id = COALESCE($1, medicine_id),
       dosage = COALESCE($2, dosage),
       duration = COALESCE($3, duration),
       quantity = COALESCE($4, quantity)
     WHERE item_id = $5 AND prescription_id = $6 RETURNING *`,
    [medicine_id || null, dosage || null, duration || null, quantity || null, req.params.itemId, req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Prescription item not found');
  res.json(rows[0]);
});

// ---------------------------------------------------------------------
// DELETE /api/prescriptions/:id/items/:itemId  (restocks automatically)
// ---------------------------------------------------------------------
const removeItem = asyncHandler(async (req, res) => {
  const ownerDoctorId = await getPrescriptionOwnerDoctorId(req.params.id);
  if (ownerDoctorId === null) throw ApiError.notFound('Prescription not found');
  assertCanWrite(req, ownerDoctorId);

  const { rowCount } = await pool.query(
    'DELETE FROM prescription_item WHERE item_id = $1 AND prescription_id = $2',
    [req.params.itemId, req.params.id]
  );
  if (rowCount === 0) throw ApiError.notFound('Prescription item not found');
  res.status(204).send();
});

// ---------------------------------------------------------------------
// DELETE /api/prescriptions/:id  (cascades items, restocking each one)
// ---------------------------------------------------------------------
const remove = asyncHandler(async (req, res) => {
  const ownerDoctorId = await getPrescriptionOwnerDoctorId(req.params.id);
  if (ownerDoctorId === null) throw ApiError.notFound('Prescription not found');
  assertCanWrite(req, ownerDoctorId);

  await pool.query('DELETE FROM prescription WHERE prescription_id = $1', [req.params.id]);
  res.status(204).send();
});

module.exports = { list, getOne, create, addItem, updateItem, removeItem, remove };
