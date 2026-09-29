'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

// ---------------------------------------------------------------------
// GET /api/ambulance-requests?status=&department_id=&patient_id=
// Scoped per role: patients see their own requests, doctors see requests
// for their department (the ones they must accept/reject), drivers see the
// trips routed to them, and admin sees everything.
// ---------------------------------------------------------------------
const list = asyncHandler(async (req, res) => {
  const { patient_id, status, department_id } = req.query;
  const conditions = [];
  const params = [];

  if (req.user.role === 'patient') {
    params.push(req.user.patientId);
    conditions.push(`ar.patient_id = $${params.length}`);
  } else if (patient_id) {
    params.push(patient_id);
    conditions.push(`ar.patient_id = $${params.length}`);
  }

  if (req.user.role === 'doctor') {
    // A doctor only sees requests addressed to their own department -
    // they are the ones who accept/reject them.
    params.push(req.user.doctorId);
    conditions.push(`ar.department_id = (SELECT department_id FROM doctor WHERE doctor_id = $${params.length})`);
  } else if (req.user.role === 'staff' && req.user.staffRole === 'Driver') {
    // A driver sees requests for the ambulances they are assigned to,
    // plus any request that has been assigned to them directly.
    params.push(req.user.staffId);
    conditions.push(
      `(ar.ambulance_id IN (SELECT ambulance_id FROM driver_assignment WHERE staff_id = $${params.length})
        OR ar.assigned_driver_id = $${params.length})`
    );
  } else if (department_id) {
    params.push(department_id);
    conditions.push(`ar.department_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`ar.status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT ar.*, p.name AS patient_name, d.name AS department_name, a.vehicle_no, a.status AS ambulance_status,
            drv.name AS driver_name
       FROM ambulance_request ar
       JOIN patient p ON p.patient_id = ar.patient_id
       LEFT JOIN department d ON d.department_id = ar.department_id
       LEFT JOIN ambulance a ON a.ambulance_id = ar.ambulance_id
       LEFT JOIN staff drv ON drv.staff_id = ar.assigned_driver_id
       ${where}
      ORDER BY ar.request_time DESC`,
    params
  );
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ar.*, p.name AS patient_name, d.name AS department_name, a.vehicle_no, a.status AS ambulance_status,
            drv.name AS driver_name
       FROM ambulance_request ar
       JOIN patient p ON p.patient_id = ar.patient_id
       LEFT JOIN department d ON d.department_id = ar.department_id
       LEFT JOIN ambulance a ON a.ambulance_id = ar.ambulance_id
       LEFT JOIN staff drv ON drv.staff_id = ar.assigned_driver_id
      WHERE ar.request_id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Ambulance request not found');
  const request = rows[0];

  if (req.user.role === 'patient' && request.patient_id !== req.user.patientId) {
    throw ApiError.forbidden('You can only view your own ambulance requests');
  }
  if (req.user.role === 'doctor') {
    const { rows: dept } = await pool.query('SELECT department_id FROM doctor WHERE doctor_id = $1', [
      req.user.doctorId,
    ]);
    if (!dept.length || request.department_id !== dept[0].department_id) {
      throw ApiError.forbidden('You can only view requests for your own department');
    }
  }
  if (req.user.role === 'staff' && req.user.staffRole === 'Driver') {
    const { rows: assigned } = await pool.query(
      `SELECT 1 FROM driver_assignment WHERE staff_id = $1 AND ambulance_id = $2`,
      [req.user.staffId, request.ambulance_id]
    );
    const isAssignedDriver = request.assigned_driver_id === req.user.staffId;
    if (assigned.length === 0 && !isAssignedDriver) {
      throw ApiError.forbidden('You can only view requests assigned to you');
    }
  }
  res.json(request);
});

// ---------------------------------------------------------------------
// POST /api/ambulance-requests
// The patient picks a department; that department's doctor accepts AND
// dispatches (attaches an unoccupied ambulance + driver) or rejects. The
// request itself never picks a vehicle - that happens at accept time.
// ---------------------------------------------------------------------
const create = asyncHandler(async (req, res) => {
  const { department_id, pickup_location, drop_location } = req.body;
  let { patient_id } = req.body;

  if (req.user.role === 'patient') {
    patient_id = req.user.patientId; // a patient can only ever request for themselves
  } else if (!patient_id) {
    throw ApiError.badRequest('patient_id is required');
  }

  if (!department_id) {
    throw ApiError.badRequest('department_id is required - choose the department handling the emergency');
  }

  const { rows } = await pool.query(
    `INSERT INTO ambulance_request (patient_id, department_id, pickup_location, drop_location)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [patient_id, department_id, pickup_location, drop_location]
  );
  res.status(201).json(rows[0]);
});

// ---------------------------------------------------------------------
// PUT /api/ambulance-requests/:id/accept   (doctor of the target dept)
// Accepting IS the dispatch: the doctor attaches an unoccupied ambulance
// and an unoccupied driver in the same action (both validated and locked
// inside sp_accept_ambulance_request). The task is assigned to the driver,
// the ambulance goes 'On Trip', and the driver's single vehicle becomes
// this ambulance.
// ---------------------------------------------------------------------
const accept = asyncHandler(async (req, res) => {
  const { ambulance_id, staff_id } = req.body;
  await pool.query('CALL sp_accept_ambulance_request($1, $2, $3, $4)', [
    req.params.id,
    req.user.doctorId,
    ambulance_id,
    staff_id,
  ]);
  const { rows } = await pool.query('SELECT * FROM ambulance_request WHERE request_id = $1', [req.params.id]);
  res.json(rows[0]);
});

// ---------------------------------------------------------------------
// PUT /api/ambulance-requests/:id/reject   (doctor of the target dept)
// ---------------------------------------------------------------------
const reject = asyncHandler(async (req, res) => {
  await pool.query('CALL sp_reject_ambulance_request($1, $2)', [req.params.id, req.user.doctorId]);
  const { rows } = await pool.query('SELECT * FROM ambulance_request WHERE request_id = $1', [req.params.id]);
  res.json(rows[0]);
});

// ---------------------------------------------------------------------
// PUT /api/ambulance-requests/:id/assign   (admin)
// Attaches (or changes) the ambulance on an approved request. The doctor
// already attaches a vehicle when accepting; this lets admin correct or
// re-route a dispatch. sp_assign_ambulance re-checks availability and, if
// a driver is on the request, follows the vehicle for the driver too.
// ---------------------------------------------------------------------
const assign = asyncHandler(async (req, res) => {
  const { ambulance_id } = req.body;
  if (!ambulance_id) throw ApiError.badRequest('ambulance_id is required');
  await pool.query('CALL sp_assign_ambulance($1, $2)', [req.params.id, ambulance_id]);
  const { rows } = await pool.query('SELECT * FROM ambulance_request WHERE request_id = $1', [req.params.id]);
  res.json(rows[0]);
});

// ---------------------------------------------------------------------
// GET /api/ambulance-requests/available-drivers (admin / doctor)
// Drivers who are free to take a trip right now: everyone with the
// Driver role EXCEPT those already assigned to an active (not yet
// completed/cancelled/rejected) ambulance request. Mirrors the rule
// enforced inside sp_assign_driver.
// ---------------------------------------------------------------------
const listAvailableDrivers = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.staff_id, s.name, s.phone, s.department_id
       FROM staff s
       LEFT JOIN department dep ON dep.department_id = s.department_id
      WHERE s.role = 'Driver'
        AND NOT EXISTS (
          SELECT 1 FROM ambulance_request ar
           WHERE ar.assigned_driver_id = s.staff_id
             AND ar.status NOT IN ('Completed', 'Cancelled', 'Rejected')
        )
      ORDER BY s.name`
  );
  res.json(rows);
});

// ---------------------------------------------------------------------
// PUT /api/ambulance-requests/:id/assign-driver   (admin / dept. doctor)
// Picks which driver drives the assigned ambulance for an accepted
// request. Only possible once the request is Approved AND already has an
// ambulance - sp_assign_driver enforces both, refuses to double-book a
// driver onto a second active trip, and the trigger notifies the driver
// the moment they are assigned. A doctor may only pick for a request of
// their own department, exactly like accept/reject.
// ---------------------------------------------------------------------
const assignDriver = asyncHandler(async (req, res) => {
  const { staff_id } = req.body;
  if (!staff_id) throw ApiError.badRequest('staff_id is required - choose the driver who will drive this trip');

  if (req.user.role === 'doctor') {
    const { rows: reqRows } = await pool.query(
      'SELECT department_id FROM ambulance_request WHERE request_id = $1',
      [req.params.id]
    );
    if (reqRows.length === 0) throw ApiError.notFound('Ambulance request not found');
    const { rows: docDept } = await pool.query('SELECT department_id FROM doctor WHERE doctor_id = $1', [
      req.user.doctorId,
    ]);
    if (!docDept.length || reqRows[0].department_id !== docDept[0].department_id) {
      throw ApiError.forbidden('You can only assign a driver to a request for your own department');
    }
  }

  await pool.query('CALL sp_assign_driver($1, $2)', [req.params.id, staff_id]);
  const { rows } = await pool.query('SELECT * FROM ambulance_request WHERE request_id = $1', [req.params.id]);
  res.json(rows[0]);
});

// ---------------------------------------------------------------------
// PUT /api/ambulance-requests/:id/complete   (admin or the assigned driver)
// Marks the trip done. The release trigger (trg_ambulance_request_release)
// immediately returns the ambulance to 'Available' and unassigns the driver
// (their single-vehicle pairing is removed), so both are vacant for the
// next dispatch.
// ---------------------------------------------------------------------
const complete = asyncHandler(async (req, res) => {
  const { rows: existing } = await pool.query('SELECT * FROM ambulance_request WHERE request_id = $1', [
    req.params.id,
  ]);
  if (existing.length === 0) throw ApiError.notFound('Ambulance request not found');
  if (existing[0].status !== 'Approved') {
    throw ApiError.badRequest('Only an approved ambulance request can be completed');
  }
  // A driver may only complete the trip they are actually assigned to.
  if (req.user.role === 'staff' && existing[0].assigned_driver_id !== req.user.staffId) {
    throw ApiError.forbidden('You can only complete a trip that is assigned to you');
  }
  const { rows } = await pool.query(
    `UPDATE ambulance_request SET status = 'Completed' WHERE request_id = $1 RETURNING *`,
    [req.params.id]
  );
  res.json(rows[0]);
});

// ---------------------------------------------------------------------
// PUT /api/ambulance-requests/:id   (admin)
// Admin may tidy up the pickup/drop-off details of a request or cancel
// it. Assigned ambulance is managed through /assign only.
// ---------------------------------------------------------------------
const update = asyncHandler(async (req, res) => {
  const { pickup_location, drop_location, status } = req.body;
  if (status !== undefined && status !== 'Cancelled') {
    throw ApiError.forbidden('Use the Accept/Reject/Assign/Complete actions for this request');
  }
  const { rows } = await pool.query(
    `UPDATE ambulance_request SET
       pickup_location = COALESCE($1, pickup_location),
       drop_location = COALESCE($2, drop_location),
       status = COALESCE($3, status)
     WHERE request_id = $4 RETURNING *`,
    [pickup_location || null, drop_location || null, status || null, req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Ambulance request not found');
  res.json(rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM ambulance_request WHERE request_id = $1', [req.params.id]);
  if (rowCount === 0) throw ApiError.notFound('Ambulance request not found');
  res.status(204).send();
});

module.exports = { list, getOne, create, update, accept, reject, assign, assignDriver, listAvailableDrivers, complete, remove };