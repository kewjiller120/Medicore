'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { bill_id, status } = req.query;
  const conditions = [];
  const params = [];
  if (bill_id) {
    params.push(bill_id);
    conditions.push(`bill_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM payment ${where} ORDER BY payment_date DESC, payment_id DESC`,
    params
  );
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM payment WHERE payment_id = $1', [req.params.id]);
  if (rows.length === 0) throw ApiError.notFound('Payment not found');
  res.json(rows[0]);
});

// fn_update_billing_status() recomputes billing.status the instant a
// payment is Confirmed (or deleted). A new payment is always recorded as
// 'Pending' - it only becomes a valid payment once an accountant confirms
// it via sp_confirm_payment().
const create = asyncHandler(async (req, res) => {
  const { bill_id, amount, payment_method, payment_date } = req.body;

  if (req.user.role === 'patient') {
    const { rows: bill } = await pool.query('SELECT patient_id, status FROM billing WHERE bill_id = $1', [bill_id]);
    if (bill.length === 0) throw ApiError.notFound('Bill not found');
    if (bill[0].patient_id !== req.user.patientId) {
      throw ApiError.forbidden('You can only pay your own bills');
    }
    if (bill[0].status === 'Paid') {
      throw ApiError.conflict('This bill is already fully paid');
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO payment (bill_id, amount, payment_method, payment_date)
     VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE)) RETURNING *`,
    [bill_id, amount, payment_method, payment_date || null]
  );
  res.status(201).json(rows[0]);
});

// Confirm a Pending payment (accountant-only at route level). Only a
// confirmed payment counts towards billing.status and revenue. The
// AFTER UPDATE trigger recalculates the parent bill automatically.
const confirm = asyncHandler(async (req, res) => {
  await pool.query('CALL sp_confirm_payment($1, $2)', [req.params.id, req.user.staffId || null]);
  const { rows } = await pool.query('SELECT * FROM payment WHERE payment_id = $1', [req.params.id]);
  if (rows.length === 0) throw ApiError.notFound('Payment not found');
  res.json(rows[0]);
});

// Reject a Pending payment (accountant-only at route level). A rejected
// payment never counts towards the bill.
const reject = asyncHandler(async (req, res) => {
  await pool.query('CALL sp_reject_payment($1, $2)', [req.params.id, req.user.staffId || null]);
  const { rows } = await pool.query('SELECT * FROM payment WHERE payment_id = $1', [req.params.id]);
  if (rows.length === 0) throw ApiError.notFound('Payment not found');
  res.json(rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  // Deleting a payment (e.g. correcting a mistaken entry) also re-triggers
  // fn_update_billing_status(), so the parent bill's status stays correct.
  const { rowCount } = await pool.query('DELETE FROM payment WHERE payment_id = $1', [req.params.id]);
  if (rowCount === 0) throw ApiError.notFound('Payment not found');
  res.status(204).send();
});

module.exports = { list, getOne, create, confirm, reject, remove };
