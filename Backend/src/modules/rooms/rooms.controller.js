'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { status, type } = req.query;
  const conditions = [];
  const params = [];
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (type) {
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM room ${where} ORDER BY room_number`, params);
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM room WHERE room_id = $1', [req.params.id]);
  if (rows.length === 0) throw ApiError.notFound('Room not found');
  res.json(rows[0]);
});

const create = asyncHandler(async (req, res) => {
  const { room_number, type, status } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO room (room_number, type, status) VALUES ($1, $2, $3) RETURNING *',
    [room_number, type, status || 'Available']
  );
  res.status(201).json(rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { room_number, type, status } = req.body;
  const { rows } = await pool.query(
    `UPDATE room SET
       room_number = COALESCE($1, room_number),
       type = COALESCE($2, type),
       status = COALESCE($3, status)
     WHERE room_id = $4 RETURNING *`,
    [room_number || null, type || null, status || null, req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Room not found');
  res.json(rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM room WHERE room_id = $1', [req.params.id]);
  if (rowCount === 0) throw ApiError.notFound('Room not found');
  res.status(204).send();
});

module.exports = { list, getOne, create, update, remove };
