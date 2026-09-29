'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

// The statuses a new booking may be created with and the ones front-desk
// staff / admin may set when rescheduling. Approving/rejecting is always
// the attending doctor's decision and has its own endpoints.
const FRONT_DESK_STATUSES = ['Pending', 'Completed', 'No-show', 'Cancelled'];
const DOCTOR_UPDATE_STATUSES = ['Completed', 'No-show'];

const list = asyncHandler(async (req, res) => {
  const { patient_id, doctor_id, date, status } = req.query;
  const conditions = [];
  const params = [];

  if (req.user.role === 'doctor') {
    params.push(req.user.doctorId);
    conditions.push(`a.doctor_id = $${params.length}`);
  } else if (doctor_id) {
    params.push(doctor_id);
    conditions.push(`a.doctor_id = $${params.length}`);
  }
  if (req.user.role === 'patient') {
    // A patient only ever sees their own appointments - any patient_id
    // query param is ignored rather than trusted.
    params.push(req.user.patientId);
    conditions.push(`a.patient_id = $${params.length}`);
  } else if (patient_id) {
    params.push(patient_id);
    conditions.push(`a.patient_id = $${params.length}`);
  }
  if (date) {
    params.push(date);
    conditions.push(`a.appt_date = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`a.status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT a.*, p.name AS patient_name, d.name AS doctor_name
       FROM appointment a
       JOIN patient p ON p.patient_id = a.patient_id
       JOIN doctor d ON d.doctor_id = a.doctor_id
       ${where}
      ORDER BY a.appt_date, a.appt_time`,
    params
  );
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, p.name AS patient_name, d.name AS doctor_name
       FROM appointment a
       JOIN patient p ON p.patient_id = a.patient_id
       JOIN doctor d ON d.doctor_id = a.doctor_id
      WHERE a.appointment_id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Appointment not found');
  const appt = rows[0];
  if (req.user.role === 'doctor' && appt.doctor_id !== req.user.doctorId) {
    throw ApiError.forbidden('You can only view your own appointments');
  }
  if (req.user.role === 'patient' && appt.patient_id !== req.user.patientId) {
    throw ApiError.forbidden('You can only view your own appointments');
  }
  res.json(appt);
});

// Every new booking enters the queue as 'Pending' - the doctor decides
// whether to approve or reject it. Doctor double-booking and past dates
// are enforced by DB triggers (fn_prevent_appointment_conflict,
// fn_enforce_date_rules).
const create = asyncHandler(async (req, res) => {
  const { appt_date, appt_time, name } = req.body;
  let { doctor_id, patient_id } = req.body;

  if (req.user.role === 'doctor') {
    doctor_id = req.user.doctorId; // a doctor can only book against their own calendar
  } else if (!doctor_id) {
    throw ApiError.badRequest('doctor_id is required');
  }

  if (req.user.role === 'patient') {
    patient_id = req.user.patientId; // a patient can only ever book for themselves
  } else if (!patient_id) {
    throw ApiError.badRequest('patient_id is required');
  }

  const { rows } = await pool.query(
    `INSERT INTO appointment (patient_id, doctor_id, appt_date, appt_time, name, status)
     VALUES ($1, $2, $3, $4, $5, 'Pending') RETURNING *`,
    [patient_id, doctor_id, appt_date, appt_time, name]
  );
  res.status(201).json(rows[0]);
});

// ---------------------------------------------------------------------
// PUT /api/appointments/:id  (reschedule / mark outcome)
// Role-aware update - the same row means different things to different
// people, which is exactly what the "correct role-based features"
// requirement is about:
//   - patient          -> can only CANCEL their own appointment
//   - owner doctor     -> can only mark their own appointment
//                         Completed / No-show (approve/reject has its
//                         own endpoints; doctors never reschedule)
//   - admin/front desk -> can reschedule date/time/reason and set
//                         Pending / Completed / No-show / Cancelled
//                         (the doctor's approve/reject decision is out
//                         of their hands)
// ---------------------------------------------------------------------
const update = asyncHandler(async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM appointment WHERE appointment_id = $1', [
    req.params.id,
  ]);
  if (existingRows.length === 0) throw ApiError.notFound('Appointment not found');
  const existing = existingRows[0];

  const { appt_date, appt_time, name, status } = req.body;
  const touchedDateFields = appt_date !== undefined || appt_time !== undefined || name !== undefined;

  const isOwnerDoctor = req.user.role === 'doctor' && existing.doctor_id === req.user.doctorId;
  const isOwnerPatient = req.user.role === 'patient' && existing.patient_id === req.user.patientId;
  const isFrontDesk = req.user.role === 'staff' && req.user.staffRole === 'Receptionist';

  if (isOwnerPatient) {
    // A patient may only cancel their own appointment - no other field or
    // status value is theirs to change.
    const onlyCancelling = status === 'Cancelled' && !touchedDateFields;
    if (!onlyCancelling) {
      throw ApiError.forbidden('You can only cancel your own appointment');
    }
  } else if (isOwnerDoctor) {
    // Doctors decide approve/reject and outcome; they never edit the slot.
    if (touchedDateFields) {
      throw ApiError.forbidden('Doctors cannot change the appointment date, time or reason');
    }
    if (status && !DOCTOR_UPDATE_STATUSES.includes(status)) {
      throw ApiError.forbidden('Use the Approve/Reject actions for pending appointments');
    }
  } else if (req.user.role === 'admin' || isFrontDesk) {
    if (status && !FRONT_DESK_STATUSES.includes(status)) {
      throw ApiError.forbidden('Approving/rejecting an appointment is the doctor\u2019s decision');
    }
  } else {
    throw ApiError.forbidden('You can only modify your own appointments');
  }

  const { rows } = await pool.query(
    `UPDATE appointment SET
       appt_date = COALESCE($1, appt_date),
       appt_time = COALESCE($2, appt_time),
       name = COALESCE($3, name),
       status = COALESCE($4, status)
     WHERE appointment_id = $5 RETURNING *`,
    [appt_date || null, appt_time || null, name || null, status || null, req.params.id]
  );
  res.json(rows[0]);
});

// ---------------------------------------------------------------------
// PUT /api/appointments/:id/approve   (attending doctor only)
// ---------------------------------------------------------------------
const approve = asyncHandler(async (req, res) => {
  await pool.query('CALL sp_approve_appointment($1, $2)', [req.params.id, req.user.doctorId]);
  const { rows } = await pool.query('SELECT * FROM appointment WHERE appointment_id = $1', [req.params.id]);
  res.json(rows[0]);
});

// ---------------------------------------------------------------------
// PUT /api/appointments/:id/reject   (attending doctor only)
// ---------------------------------------------------------------------
const reject = asyncHandler(async (req, res) => {
  await pool.query('CALL sp_reject_appointment($1, $2)', [req.params.id, req.user.doctorId]);
  const { rows } = await pool.query('SELECT * FROM appointment WHERE appointment_id = $1', [req.params.id]);
  res.json(rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  // Route-level guard restricts this to admin/Receptionist already.
  const { rowCount } = await pool.query('DELETE FROM appointment WHERE appointment_id = $1', [req.params.id]);
  if (rowCount === 0) throw ApiError.notFound('Appointment not found');
  res.status(204).send();
});

module.exports = { list, getOne, create, update, approve, reject, remove };