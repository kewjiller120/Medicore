'use strict';

const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { hashPassword, isPasswordStrongEnough } = require('../../utils/password');
const { setAuditActor } = require('../../utils/auditContext');

// ---------------------------------------------------------------------
// GET /api/admin/users
// ---------------------------------------------------------------------
const listUsers = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ua.user_id, ua.username, ua.role, ua.last_login,
            COALESCE(d.name, s.name, 'Administrator') AS name,
            d.doctor_id, s.staff_id, s.role AS staff_role
       FROM user_account ua
       LEFT JOIN doctor d ON d.user_id = ua.user_id
       LEFT JOIN staff s ON s.user_id = ua.user_id
      ORDER BY ua.user_id`
  );
  res.json(rows);
});

// ---------------------------------------------------------------------
// POST /api/admin/users  (admin creates a user of ANY role, including admin)
// ---------------------------------------------------------------------
const createUser = asyncHandler(async (req, res) => {
  const { username, password, role, name, department_id, ...rest } = req.body;

  if (!isPasswordStrongEnough(password)) {
    throw ApiError.badRequest('Password must be at least 8 characters and include a letter and a number');
  }

  const result = await withTransaction(async (client) => {
    const passwordHash = await hashPassword(password);
    const userResult = await client.query(
      `INSERT INTO user_account (username, password_hash, role) VALUES ($1, $2, $3) RETURNING user_id`,
      [username, passwordHash, role]
    );
    const userId = userResult.rows[0].user_id;

    if (role === 'doctor') {
      const { specialization, qualification, phone, email } = rest;
      const r = await client.query(
        `INSERT INTO doctor (user_id, department_id, name, specialization, qualification, phone, email)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING doctor_id`,
        [userId, department_id || null, name, specialization || null, qualification || null, phone || null, email || null]
      );
      return { userId, doctorId: r.rows[0].doctor_id };
    }

    if (role === 'staff') {
      const { staffRole, phone, shift_timing } = rest;
      const r = await client.query(
        `INSERT INTO staff (user_id, department_id, name, role, phone, shift_timing)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING staff_id`,
        [userId, department_id || null, name, staffRole, phone || null, shift_timing || null]
      );
      return { userId, staffId: r.rows[0].staff_id };
    }

    // role === 'admin' - no profile table
    return { userId };
  });

  res.status(201).json({ message: `${role} account created`, ...result });
});

// ---------------------------------------------------------------------
// PATCH /api/admin/users/:id  (username change and/or password reset)
// ---------------------------------------------------------------------
const updateUser = asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const { username, newPassword } = req.body;

  if (!username && !newPassword) {
    throw ApiError.badRequest('Provide username and/or newPassword to update');
  }
  if (newPassword && !isPasswordStrongEnough(newPassword)) {
    throw ApiError.badRequest('New password must be at least 8 characters and include a letter and a number');
  }

  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT user_id FROM user_account WHERE user_id = $1 FOR UPDATE', [
      targetId,
    ]);
    if (rows.length === 0) throw ApiError.notFound('User not found');

    // Attribute this change to the acting admin in audit_log (see fn_audit_user_account).
    await setAuditActor(client, req.user.userId);

    if (username) {
      await client.query('UPDATE user_account SET username = $1 WHERE user_id = $2', [username, targetId]);
    }
    if (newPassword) {
      const hash = await hashPassword(newPassword);
      await client.query('UPDATE user_account SET password_hash = $1 WHERE user_id = $2', [hash, targetId]);
      // A password reset by an admin should also kill that user's existing sessions.
      await client.query(
        'UPDATE auth_session SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
        [targetId]
      );
    }
  });

  res.json({ message: 'User updated' });
});

// ---------------------------------------------------------------------
// DELETE /api/admin/users/:id
// ---------------------------------------------------------------------
const deleteUser = asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  if (targetId === req.user.userId) {
    throw ApiError.badRequest('You cannot delete your own account while logged in as it');
  }

  const { rows } = await pool.query('SELECT role FROM user_account WHERE user_id = $1', [targetId]);
  if (rows.length === 0) throw ApiError.notFound('User not found');

  if (rows[0].role === 'admin') {
    const { rows: adminCountRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM user_account WHERE role = 'admin'`
    );
    if (adminCountRows[0].count <= 1) {
      throw ApiError.badRequest('Cannot delete the last remaining admin account');
    }
  }

  // ON DELETE CASCADE removes the doctor/staff profile + auth_session rows automatically.
  // ON DELETE RESTRICT on medical_record/admission/lab_test.doctor_id will correctly block
  // deleting a doctor who has historical records - surfaced to the client as 409 Conflict.
  await pool.query('DELETE FROM user_account WHERE user_id = $1', [targetId]);
  res.json({ message: 'User deleted' });
});

module.exports = { listUsers, createUser, updateUser, deleteUser };
