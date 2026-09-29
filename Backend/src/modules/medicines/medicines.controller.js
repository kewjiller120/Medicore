'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { search, lowStock } = req.query;
  const conditions = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }
  if (lowStock === 'true') {
    conditions.push('stock_quantity < 20');
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM medicine ${where} ORDER BY name`, params);
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM medicine WHERE medicine_id = $1', [req.params.id]);
  if (rows.length === 0) throw ApiError.notFound('Medicine not found');
  res.json(rows[0]);
});

const create = asyncHandler(async (req, res) => {
  const { name, unit_price, stock_quantity, manufacturer, exp_date } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO medicine (name, unit_price, stock_quantity, manufacturer, exp_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, unit_price, stock_quantity ?? 0, manufacturer || null, exp_date || null]
  );
  res.status(201).json(rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { name, unit_price, stock_quantity, manufacturer, exp_date } = req.body;
  const { rows } = await pool.query(
    `UPDATE medicine SET
       name = COALESCE($1, name),
       unit_price = COALESCE($2, unit_price),
       stock_quantity = COALESCE($3, stock_quantity),
       manufacturer = COALESCE($4, manufacturer),
       exp_date = COALESCE($5, exp_date)
     WHERE medicine_id = $6 RETURNING *`,
    [name || null, unit_price ?? null, stock_quantity ?? null, manufacturer ?? null, exp_date ?? null, req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Medicine not found');
  res.json(rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM medicine WHERE medicine_id = $1', [req.params.id]);
  if (rowCount === 0) throw ApiError.notFound('Medicine not found');
  res.status(204).send();
});

module.exports = { list, getOne, create, update, remove };
