'use strict';

const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { hashPassword, comparePassword, isPasswordStrongEnough } = require('../../utils/password');
const {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiryDate,
} = require('../../utils/tokens');
const env = require('../../config/env');

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/auth';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

/** Fetch role-specific ids/details needed for the JWT payload and profile responses. */
async function loadRoleContext(client, userId, role) {
  if (role === 'doctor') {
    const { rows } = await client.query(
      `SELECT doctor_id, name, department_id, specialization, status
         FROM doctor WHERE user_id = $1`,
      [userId]
    );
    if (rows.length === 0) throw ApiError.internal('Doctor profile missing for this account');
    return { doctorId: rows[0].doctor_id, name: rows[0].name };
  }
  if (role === 'staff') {
    const { rows } = await client.query(
      `SELECT staff_id, name, role AS staff_role, department_id
         FROM staff WHERE user_id = $1`,
      [userId]
    );
    if (rows.length === 0) throw ApiError.internal('Staff profile missing for this account');
    return { staffId: rows[0].staff_id, staffRole: rows[0].staff_role, name: rows[0].name };
  }
  if (role === 'patient') {
    const { rows } = await client.query(`SELECT patient_id, name FROM patient WHERE user_id = $1`, [userId]);
    if (rows.length === 0) throw ApiError.internal('Patient profile missing for this account');
    return { patientId: rows[0].patient_id, name: rows[0].name };
  }
  // admin - no separate profile table
  return { name: 'Administrator' };
}

async function createSession(client, userId, req) {
  const rawToken = generateRefreshToken();
  const tokenHash = hashToken(rawToken);
  const { rows } = await client.query(
    `INSERT INTO auth_session (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING session_id`,
    [userId, tokenHash, req.headers['user-agent'] || null, req.ip || null, refreshTokenExpiryDate()]
  );
  return { sessionId: rows[0].session_id, rawToken };
}

// ---------------------------------------------------------------------
// POST /api/auth/register/doctor
// ---------------------------------------------------------------------
const registerDoctor = asyncHandler(async (req, res) => {
  const { username, password, name, department_id, specialization, qualification, phone, email } = req.body;

  if (!isPasswordStrongEnough(password)) {
    throw ApiError.badRequest('Password must be at least 8 characters and include a letter and a number');
  }

  const result = await withTransaction(async (client) => {
    const passwordHash = await hashPassword(password);

    const userResult = await client.query(
      `INSERT INTO user_account (username, password_hash, role) VALUES ($1, $2, 'doctor') RETURNING user_id`,
      [username, passwordHash]
    );
    const userId = userResult.rows[0].user_id;

    const doctorResult = await client.query(
      `INSERT INTO doctor (user_id, department_id, name, specialization, qualification, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING doctor_id`,
      [userId, department_id || null, name, specialization || null, qualification || null, phone || null, email || null]
    );

    return { userId, doctorId: doctorResult.rows[0].doctor_id };
  });

  res.status(201).json({
    message: 'Doctor account created. You can now log in.',
    userId: result.userId,
    doctorId: result.doctorId,
  });
});

// ---------------------------------------------------------------------
// POST /api/auth/register/staff
// ---------------------------------------------------------------------
const registerStaff = asyncHandler(async (req, res) => {
  const { username, password, name, department_id, role, phone, shift_timing } = req.body;

  if (!isPasswordStrongEnough(password)) {
    throw ApiError.badRequest('Password must be at least 8 characters and include a letter and a number');
  }

  const result = await withTransaction(async (client) => {
    const passwordHash = await hashPassword(password);

    const userResult = await client.query(
      `INSERT INTO user_account (username, password_hash, role) VALUES ($1, $2, 'staff') RETURNING user_id`,
      [username, passwordHash]
    );
    const userId = userResult.rows[0].user_id;

    const staffResult = await client.query(
      `INSERT INTO staff (user_id, department_id, name, role, phone, shift_timing)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING staff_id`,
      [userId, department_id || null, name, role, phone || null, shift_timing || null]
    );

    return { userId, staffId: staffResult.rows[0].staff_id };
  });

  res.status(201).json({
    message: 'Staff account created. You can now log in.',
    userId: result.userId,
    staffId: result.staffId,
  });
});

// ---------------------------------------------------------------------
// POST /api/auth/register/patient
// ---------------------------------------------------------------------
const registerPatient = asyncHandler(async (req, res) => {
  const { username, password, name, dob, gender, blood_group, address, phone, emergency_contact } = req.body;

  if (!isPasswordStrongEnough(password)) {
    throw ApiError.badRequest('Password must be at least 8 characters and include a letter and a number');
  }

  if (dob && new Date(`${dob}T00:00:00`) > new Date()) {
    throw ApiError.badRequest('Date of birth cannot be in the future');
  }

  const result = await withTransaction(async (client) => {
    const passwordHash = await hashPassword(password);

    const userResult = await client.query(
      `INSERT INTO user_account (username, password_hash, role) VALUES ($1, $2, 'patient') RETURNING user_id`,
      [username, passwordHash]
    );
    const userId = userResult.rows[0].user_id;

    const patientResult = await client.query(
      `INSERT INTO patient (user_id, name, dob, gender, blood_group, address, phone, emergency_contact)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING patient_id`,
      [
        userId,
        name,
        dob || null,
        gender || null,
        blood_group || null,
        address || null,
        phone || null,
        emergency_contact || null,
      ]
    );

    return { userId, patientId: patientResult.rows[0].patient_id };
  });

  res.status(201).json({
    message: 'Patient account created. You can now log in.',
    userId: result.userId,
    patientId: result.patientId,
  });
});

// ---------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const { rows } = await pool.query(
    `SELECT user_id, username, password_hash, role FROM user_account WHERE username = $1`,
    [username]
  );

  // Same generic message whether the username doesn't exist or the password
  // is wrong - never reveal which one to an attacker.
  if (rows.length === 0) throw ApiError.unauthorized('Invalid username or password');

  const account = rows[0];
  const passwordOk = await comparePassword(password, account.password_hash);
  if (!passwordOk) throw ApiError.unauthorized('Invalid username or password');

  const { sessionId, rawToken, name, doctorId, staffId, staffRole, patientId } = await withTransaction(
    async (client) => {
      const ctx = await loadRoleContext(client, account.user_id, account.role);
      const session = await createSession(client, account.user_id, req);
      await client.query('UPDATE user_account SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1', [
        account.user_id,
      ]);
      return { ...session, ...ctx };
    }
  );

  const payload = {
    userId: account.user_id,
    username: account.username,
    role: account.role,
    doctorId,
    staffId,
    staffRole,
    patientId,
  };
  const accessToken = signAccessToken(payload);

  res.cookie(REFRESH_COOKIE_NAME, `${sessionId}.${rawToken}`, refreshCookieOptions());
  res.json({ accessToken, user: { ...payload, name } });
});

// ---------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------
const refresh = asyncHandler(async (req, res) => {
  const cookie = req.cookies[REFRESH_COOKIE_NAME];
  if (!cookie || !cookie.includes('.')) throw ApiError.unauthorized('Not logged in');

  const [sessionIdRaw, rawToken] = cookie.split('.');
  const sessionId = parseInt(sessionIdRaw, 10);
  if (!sessionId || !rawToken) throw ApiError.unauthorized('Not logged in');

  const { rows } = await pool.query(
    `SELECT session_id, user_id, refresh_token_hash
       FROM auth_session
      WHERE session_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
    [sessionId]
  );

  if (rows.length === 0) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    throw ApiError.unauthorized('Session expired, please log in again');
  }

  const session = rows[0];
  if (hashToken(rawToken) !== session.refresh_token_hash) {
    // Token mismatch on an otherwise-valid session id - treat as a compromised
    // session and kill it outright rather than silently ignoring the attempt.
    await pool.query('UPDATE auth_session SET revoked_at = CURRENT_TIMESTAMP WHERE session_id = $1', [
      session.session_id,
    ]);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    throw ApiError.unauthorized('Session invalid, please log in again');
  }

  const { rows: userRows } = await pool.query(
    `SELECT user_id, username, role FROM user_account WHERE user_id = $1`,
    [session.user_id]
  );
  if (userRows.length === 0) throw ApiError.unauthorized('Account no longer exists');
  const account = userRows[0];

  const { name, doctorId, staffId, staffRole, patientId, newRawToken } = await withTransaction(async (client) => {
    const ctx = await loadRoleContext(client, account.user_id, account.role);

    // Rotate the refresh token on every use - limits the value of a stolen token.
    const rotated = generateRefreshToken();
    await client.query(
      `UPDATE auth_session SET refresh_token_hash = $1, expires_at = $2 WHERE session_id = $3`,
      [hashToken(rotated), refreshTokenExpiryDate(), session.session_id]
    );

    return { ...ctx, newRawToken: rotated };
  });

  const payload = {
    userId: account.user_id,
    username: account.username,
    role: account.role,
    doctorId,
    staffId,
    staffRole,
    patientId,
  };
  const accessToken = signAccessToken(payload);

  res.cookie(REFRESH_COOKIE_NAME, `${session.session_id}.${newRawToken}`, refreshCookieOptions());
  res.json({ accessToken, user: { ...payload, name } });
});

// ---------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------
const logout = asyncHandler(async (req, res) => {
  const cookie = req.cookies[REFRESH_COOKIE_NAME];

  if (cookie && cookie.includes('.')) {
    const [sessionIdRaw, rawToken] = cookie.split('.');
    const sessionId = parseInt(sessionIdRaw, 10);

    if (sessionId) {
      const { rows } = await pool.query(
        `SELECT session_id, refresh_token_hash FROM auth_session WHERE session_id = $1 AND revoked_at IS NULL`,
        [sessionId]
      );
      // Only revoke if the presented token actually matches - this makes
      // logout an authenticated action, not just "guess a session id".
      if (rows.length > 0 && hashToken(rawToken) === rows[0].refresh_token_hash) {
        await pool.query('UPDATE auth_session SET revoked_at = CURRENT_TIMESTAMP WHERE session_id = $1', [
          sessionId,
        ]);
      }
    }
  }

  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.json({ message: 'Logged out' });
});

// ---------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------
const me = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT user_id, username, role, last_login FROM user_account WHERE user_id = $1`,
    [req.user.userId]
  );
  if (rows.length === 0) throw ApiError.notFound('Account not found');
  const account = rows[0];

  const ctx = await loadRoleContext(pool, account.user_id, account.role);

  res.json({
    userId: account.user_id,
    username: account.username,
    role: account.role,
    lastLogin: account.last_login,
    ...ctx,
  });
});

// ---------------------------------------------------------------------
// PUT /api/auth/change-password
// ---------------------------------------------------------------------
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!isPasswordStrongEnough(newPassword)) {
    throw ApiError.badRequest('New password must be at least 8 characters and include a letter and a number');
  }

  const { rows } = await pool.query('SELECT password_hash FROM user_account WHERE user_id = $1', [
    req.user.userId,
  ]);
  if (rows.length === 0) throw ApiError.notFound('Account not found');

  const ok = await comparePassword(currentPassword, rows[0].password_hash);
  if (!ok) throw ApiError.badRequest('Current password is incorrect');

  const newHash = await hashPassword(newPassword);

  await withTransaction(async (client) => {
    await client.query('UPDATE user_account SET password_hash = $1 WHERE user_id = $2', [
      newHash,
      req.user.userId,
    ]);
    // Force re-login everywhere else, a standard reaction to a password change.
    await client.query(
      'UPDATE auth_session SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
      [req.user.userId]
    );
  });

  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.json({ message: 'Password changed. Please log in again.' });
});

module.exports = { registerDoctor, registerStaff, registerPatient, login, refresh, logout, me, changePassword };
