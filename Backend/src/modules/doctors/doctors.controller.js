'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { department_id, status, search } = req.query;
  const conditions = [];
  const params = [];
  if (department_id) {
    params.push(department_id);
    conditions.push(`d.department_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`d.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(d.name ILIKE $${params.length} OR d.specialization ILIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT d.*, dep.name AS department_name
       FROM doctor d
       LEFT JOIN department dep ON dep.department_id = d.department_id
       ${where}
      ORDER BY d.name`,
    params
  );
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.*, dep.name AS department_name
       FROM doctor d
       LEFT JOIN department dep ON dep.department_id = d.department_id
      WHERE d.doctor_id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Doctor not found');
  res.json(rows[0]);
});

/**
 * Admins may edit any field, including identity/org fields (name,
 * department_id). A doctor editing their own profile may only touch the
 * clinical/contact fields, not their own name or department assignment -
 * those are administrative decisions.
 */
const update = asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const isAdmin = req.user.role === 'admin';
  const isSelf = req.user.role === 'doctor' && req.user.doctorId === targetId;

  if (!isAdmin && !isSelf) {
    throw ApiError.forbidden('You can only edit your own doctor profile');
  }

  const { specialization, qualification, phone, email, status, name, department_id } = req.body;

  if (!isAdmin && (name !== undefined || department_id !== undefined)) {
    throw ApiError.forbidden('Only an admin can change a doctor\'s name or department');
  }

  const { rows } = await pool.query(
    `UPDATE doctor SET
       name = COALESCE($1, name),
       department_id = COALESCE($2, department_id),
       specialization = COALESCE($3, specialization),
       qualification = COALESCE($4, qualification),
       phone = COALESCE($5, phone),
       email = COALESCE($6, email),
       status = COALESCE($7, status)
     WHERE doctor_id = $8 RETURNING *`,
    [
      isAdmin ? name ?? null : null,
      isAdmin ? department_id ?? null : null,
      specialization ?? null,
      qualification ?? null,
      phone ?? null,
      email ?? null,
      status || null,
      targetId,
    ]
  );
  if (rows.length === 0) throw ApiError.notFound('Doctor not found');
  res.json(rows[0]);
});

module.exports = { list, getOne, update };
