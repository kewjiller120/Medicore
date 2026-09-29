'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT da.*, s.name AS driver_name, a.vehicle_no, a.status AS ambulance_status
       FROM driver_assignment da
       JOIN staff s ON s.staff_id = da.staff_id
       JOIN ambulance a ON a.ambulance_id = da.ambulance_id
      ORDER BY a.vehicle_no`
  );
  res.json(rows);
});

/** A driver can see their own assignment list without admin rights. */
const myAssignments = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT da.*, a.vehicle_no, a.status AS ambulance_status, a.current_location
       FROM driver_assignment da
       JOIN ambulance a ON a.ambulance_id = da.ambulance_id
      WHERE da.staff_id = $1`,
    [req.user.staffId]
  );
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const { staff_id, ambulance_id } = req.body;

  const { rows: staffRows } = await pool.query('SELECT role FROM staff WHERE staff_id = $1', [staff_id]);
  if (staffRows.length === 0) throw ApiError.notFound('Staff member not found');
  if (staffRows[0].role !== 'Driver') {
    throw ApiError.badRequest('Only a staff member with role "Driver" can be assigned to an ambulance');
  }

  // One vehicle per driver / one driver per vehicle: a driver on an active
  // trip already holds that trip's vehicle (and an On-Trip ambulance is
  // already held by its trip's driver), so pause the user with 409 before
  // the UNIQUE keys would reject the insert.
  const { rows: busy } = await pool.query(
    `SELECT 1 FROM ambulance_request ar
      WHERE ar.assigned_driver_id = $1
        AND ar.status NOT IN ('Completed','Cancelled','Rejected')`,
    [staff_id]
  );
  if (busy.length > 0) {
    throw ApiError.conflict('This driver is on an active trip and already has a vehicle assigned - complete the trip first');
  }
  const { rows: ambRows } = await pool.query('SELECT status FROM ambulance WHERE ambulance_id = $1', [ambulance_id]);
  if (ambRows.length === 0) throw ApiError.notFound('Ambulance not found');
  if (ambRows[0].status !== 'Available') {
    throw ApiError.conflict('This ambulance is not available (it is On Trip or already assigned)');
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO driver_assignment (staff_id, ambulance_id) VALUES ($1, $2) RETURNING *',
      [staff_id, ambulance_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    // Final safety net: the UNIQUE(staff_id) / UNIQUE(ambulance_id) keys.
    if (err.code === '23505') {
      throw ApiError.conflict('That driver already has a vehicle assigned, or that ambulance is already assigned to a driver');
    }
    throw err;
  }
});

const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM driver_assignment WHERE staff_id = $1 AND ambulance_id = $2',
    [req.params.staffId, req.params.ambulanceId]
  );
  if (rowCount === 0) throw ApiError.notFound('Assignment not found');
  res.status(204).send();
});

module.exports = { list, myAssignments, create, remove };
