'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM department ORDER BY name');
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM department WHERE department_id = $1', [req.params.id]);
  if (rows.length === 0) throw ApiError.notFound('Department not found');
  res.json(rows[0]);
});

const create = asyncHandler(async (req, res) => {
  const { name, location } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO department (name, location) VALUES ($1, $2) RETURNING *',
    [name, location || null]
  );
  res.status(201).json(rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { name, location } = req.body;
  const { rows } = await pool.query(
    `UPDATE department SET name = COALESCE($1, name), location = COALESCE($2, location)
     WHERE department_id = $3 RETURNING *`,
    [name || null, location ?? null, req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Department not found');
  res.json(rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM department WHERE department_id = $1', [req.params.id]);
  if (rowCount === 0) throw ApiError.notFound('Department not found');
  res.status(204).send();
});

module.exports = { list, getOne, create, update, remove };
