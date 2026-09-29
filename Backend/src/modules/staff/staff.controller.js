'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { department_id, role, search } = req.query;
  const conditions = [];
  const params = [];
  if (department_id) {
    params.push(department_id);
    conditions.push(`s.department_id = $${params.length}`);
  }
  if (role) {
    params.push(role);
    conditions.push(`s.role = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`s.name ILIKE $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT s.*, dep.name AS department_name
       FROM staff s
       LEFT JOIN department dep ON dep.department_id = s.department_id
       ${where}
      ORDER BY s.name`,
    params
  );
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, dep.name AS department_name
       FROM staff s
       LEFT JOIN department dep ON dep.department_id = s.department_id
      WHERE s.staff_id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Staff member not found');
  res.json(rows[0]);
});

/**
 * Same ownership pattern as doctors: admins can edit anything; a staff
 * member editing their own profile can update contact/shift details but
 * not their own name, department, or sub-role (those are HR decisions).
 */
const update = asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const isAdmin = req.user.role === 'admin';
  const isSelf = req.user.role === 'staff' && req.user.staffId === targetId;

  if (!isAdmin && !isSelf) {
    throw ApiError.forbidden('You can only edit your own staff profile');
  }

  const { name, department_id, role, phone, shift_timing } = req.body;

  if (!isAdmin && (name !== undefined || department_id !== undefined || role !== undefined)) {
    throw ApiError.forbidden('Only an admin can change a staff member\'s name, department, or role');
  }

  const { rows } = await pool.query(
    `UPDATE staff SET
       name = COALESCE($1, name),
       department_id = COALESCE($2, department_id),
       role = COALESCE($3, role),
       phone = COALESCE($4, phone),
       shift_timing = COALESCE($5, shift_timing)
     WHERE staff_id = $6 RETURNING *`,
    [
      isAdmin ? name ?? null : null,
      isAdmin ? department_id ?? null : null,
      isAdmin ? role ?? null : null,
      phone ?? null,
      shift_timing ?? null,
      targetId,
    ]
  );
  if (rows.length === 0) throw ApiError.notFound('Staff member not found');
  res.json(rows[0]);
});

module.exports = { list, getOne, update };
