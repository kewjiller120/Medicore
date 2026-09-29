'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = 'WHERE status = $1';
  }
  const { rows } = await pool.query(`SELECT * FROM ambulance ${where} ORDER BY vehicle_no`, params);
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM ambulance WHERE ambulance_id = $1', [req.params.id]);
  if (rows.length === 0) throw ApiError.notFound('Ambulance not found');
  res.json(rows[0]);
});

const create = asyncHandler(async (req, res) => {
  const { vehicle_no, current_location, status } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO ambulance (vehicle_no, current_location, status) VALUES ($1, $2, $3) RETURNING *',
    [vehicle_no, current_location || null, status || 'Available']
  );
  res.status(201).json(rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { vehicle_no, current_location, status } = req.body;

  // A Driver may only update the ambulance(s) they are actually assigned to
  // (via driver_assignment) - admins bypass this ownership check entirely.
  if (req.user.role === 'staff' && req.user.staffRole === 'Driver') {
    const { rows: assigned } = await pool.query(
      'SELECT 1 FROM driver_assignment WHERE staff_id = $1 AND ambulance_id = $2',
      [req.user.staffId, req.params.id]
    );
    if (assigned.length === 0) {
      throw ApiError.forbidden('You are not assigned to this ambulance');
    }
    // Drivers may only change location/status, never the vehicle registration number.
    if (vehicle_no) {
      throw ApiError.forbidden('Drivers cannot change the vehicle number');
    }
  }

  const { rows } = await pool.query(
    `UPDATE ambulance SET
       vehicle_no = COALESCE($1, vehicle_no),
       current_location = COALESCE($2, current_location),
       status = COALESCE($3, status)
     WHERE ambulance_id = $4 RETURNING *`,
    [vehicle_no || null, current_location ?? null, status || null, req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Ambulance not found');
  res.json(rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM ambulance WHERE ambulance_id = $1', [req.params.id]);
  if (rowCount === 0) throw ApiError.notFound('Ambulance not found');
  res.status(204).send();
});

module.exports = { list, getOne, create, update, remove };
