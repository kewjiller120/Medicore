'use strict';

const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

async function getTestOwnerDoctorId(testId) {
  const { rows } = await pool.query('SELECT doctor_id FROM lab_test WHERE test_id = $1', [testId]);
  return rows.length ? rows[0].doctor_id : null;
}

const list = asyncHandler(async (req, res) => {
  const { test_id, patient_id, doctor_id } = req.query;
  const conditions = [];
  const params = [];

  if (req.user.role === 'doctor') {
    params.push(req.user.doctorId);
    conditions.push(`lt.doctor_id = $${params.length}`);
  }
  if (req.user.role === 'patient') {
    // A patient sees only their own lab results (via the parent test).
    params.push(req.user.patientId);
    conditions.push(`lt.patient_id = $${params.length}`);
  } else if (patient_id) {
    params.push(patient_id);
    conditions.push(`lt.patient_id = $${params.length}`);
  }
  // Doctors are already scoped to their own orders; the doctor_id filter
  // is offered to everyone else (admin / lab technicians / patients
  // filtering their own results by doctor).
  if (doctor_id && req.user.role !== 'doctor') {
    params.push(doctor_id);
    conditions.push(`lt.doctor_id = $${params.length}`);
  }
  if (test_id) {
    params.push(test_id);
    conditions.push(`lr.test_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT lr.*, lt.test_type, lt.patient_id, lt.doctor_id, s.name AS staff_name,
            p.name AS patient_name, d.name AS doctor_name
       FROM lab_result lr
       JOIN lab_test lt ON lt.test_id = lr.test_id
       JOIN patient p ON p.patient_id = lt.patient_id
       JOIN doctor d ON d.doctor_id = lt.doctor_id
       LEFT JOIN staff s ON s.staff_id = lr.staff_id
       ${where}
      ORDER BY lr.result_date DESC, lr.result_id DESC`,
    params
  );
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT lr.*, lt.test_type, lt.patient_id, lt.doctor_id, s.name AS staff_name,
            p.name AS patient_name, d.name AS doctor_name
       FROM lab_result lr
       JOIN lab_test lt ON lt.test_id = lr.test_id
       JOIN patient p ON p.patient_id = lt.patient_id
       JOIN doctor d ON d.doctor_id = lt.doctor_id
       LEFT JOIN staff s ON s.staff_id = lr.staff_id
      WHERE lr.result_id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Lab result not found');
  const result = rows[0];
  if (req.user.role === 'doctor' && result.doctor_id !== req.user.doctorId) {
    throw ApiError.forbidden('You can only view results for tests you ordered');
  }
  if (req.user.role === 'patient' && result.patient_id !== req.user.patientId) {
    throw ApiError.forbidden('You can only view your own lab results');
  }
  res.json(result);
});

// Entering a result also marks the parent lab_test as Completed, in the
// same transaction - this is application-level orchestration (as opposed
// to the six DB-trigger rules), which is an equally legitimate place for
// this particular one-time workflow step to live.
const create = asyncHandler(async (req, res) => {
  const { test_id, result_date, details } = req.body;

  const ownerDoctorId = await getTestOwnerDoctorId(test_id);
  if (ownerDoctorId === null) throw ApiError.notFound('Lab test not found');

  const staffId = req.user.role === 'staff' ? req.user.staffId : req.body.staff_id || null;

  const result = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO lab_result (test_id, result_date, details, staff_id)
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4) RETURNING *`,
      [test_id, result_date || null, details, staffId]
    );
    await client.query(`UPDATE lab_test SET status = 'Completed' WHERE test_id = $1`, [test_id]);
    return inserted.rows[0];
  });

  res.status(201).json(result);
});

const update = asyncHandler(async (req, res) => {
  const { rows: existingRows } = await pool.query(
    `SELECT lr.*, lt.doctor_id FROM lab_result lr JOIN lab_test lt ON lt.test_id = lr.test_id WHERE lr.result_id = $1`,
    [req.params.id]
  );
  if (existingRows.length === 0) throw ApiError.notFound('Lab result not found');
  const existing = existingRows[0];

  const isAuthor = req.user.role === 'staff' && req.user.staffId === existing.staff_id;
  if (req.user.role !== 'admin' && !isAuthor) {
    throw ApiError.forbidden('Only the lab technician who entered this result (or admin) can edit it');
  }

  const { details, result_date } = req.body;
  const { rows } = await pool.query(
    `UPDATE lab_result SET details = COALESCE($1, details), result_date = COALESCE($2, result_date)
     WHERE result_id = $3 RETURNING *`,
    [details || null, result_date || null, req.params.id]
  );
  res.json(rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM lab_result WHERE result_id = $1', [req.params.id]);
  if (rowCount === 0) throw ApiError.notFound('Lab result not found');
  res.status(204).send();
});

module.exports = { list, getOne, create, update, remove };
