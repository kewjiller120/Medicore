'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { patient_id, status } = req.query;
  const conditions = [];
  const params = [];
  if (req.user.role === 'patient') {
    // A patient only ever sees their own bills - any patient_id query
    // param is ignored rather than trusted.
    params.push(req.user.patientId);
    conditions.push(`b.patient_id = $${params.length}`);
  } else if (patient_id) {
    params.push(patient_id);
    conditions.push(`b.patient_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`b.status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT b.*, p.name AS patient_name,
            COALESCE((SELECT SUM(amount) FROM payment WHERE bill_id = b.bill_id AND status = 'Confirmed'), 0) AS amount_paid
       FROM billing b
       JOIN patient p ON p.patient_id = b.patient_id
       ${where}
      ORDER BY b.bill_date DESC, b.bill_id DESC`,
    params
  );
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.*, p.name AS patient_name,
            COALESCE((SELECT SUM(amount) FROM payment WHERE bill_id = b.bill_id AND status = 'Confirmed'), 0) AS amount_paid
       FROM billing b
       JOIN patient p ON p.patient_id = b.patient_id
      WHERE b.bill_id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Bill not found');
  if (req.user.role === 'patient' && rows[0].patient_id !== req.user.patientId) {
    throw ApiError.forbidden('You can only view your own bills');
  }

  const { rows: payments } = await pool.query(
    'SELECT * FROM payment WHERE bill_id = $1 ORDER BY payment_date DESC, payment_id DESC',
    [req.params.id]
  );
  res.json({ ...rows[0], payments });
});

// status is intentionally NOT accepted here - fn_update_billing_status() derives
// it from payment.amount every time a payment is inserted/updated/deleted.
const create = asyncHandler(async (req, res) => {
  const { patient_id, admission_id, bill_date, total_amt } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO billing (patient_id, admission_id, bill_date, total_amt)
     VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4) RETURNING *`,
    [patient_id, admission_id || null, bill_date || null, total_amt]
  );
  res.status(201).json(rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { admission_id, bill_date, total_amt } = req.body;
  const { rows } = await pool.query(
    `UPDATE billing SET
       admission_id = COALESCE($1, admission_id),
       bill_date = COALESCE($2, bill_date),
       total_amt = COALESCE($3, total_amt)
     WHERE bill_id = $4 RETURNING *`,
    [admission_id ?? null, bill_date || null, total_amt ?? null, req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Bill not found');
  res.json(rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM billing WHERE bill_id = $1', [req.params.id]);
  if (rowCount === 0) throw ApiError.notFound('Bill not found');
  res.status(204).send();
});

module.exports = { list, getOne, create, update, remove };
