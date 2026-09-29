'use strict';

const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

// ---------------------------------------------------------------------
// GET /api/notifications?unread=true
// The notification feed for the signed-in user, newest first. Rows are
// created by DB triggers (see db/02_triggers.sql) so the feed is always
// accurate no matter which client performed the action.
// ---------------------------------------------------------------------
const list = asyncHandler(async (req, res) => {
  const { unread, limit } = req.query;
  const conditions = ['recipient_user_id = $1'];
  const params = [req.user.userId];

  if (unread === 'true') {
    params.push(false);
    conditions.push(`is_read = $${params.length}`);
  }

  let limitClause = 'LIMIT 100';
  const parsedLimit = parseInt(limit, 10);
  if (Number.isInteger(parsedLimit) && parsedLimit > 0 && parsedLimit <= 200) {
    limitClause = `LIMIT ${parsedLimit}`;
  }

  const { rows } = await pool.query(
    `SELECT notification_id, title, message, type, link, is_read, created_at
       FROM notification
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC, notification_id DESC
      ${limitClause}`,
    params
  );
  res.json(rows);
});

// ---------------------------------------------------------------------
// GET /api/notifications/unread-count
// Drives the unread badge on the notification bell.
// ---------------------------------------------------------------------
const unreadCount = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM notification WHERE recipient_user_id = $1 AND is_read = FALSE`,
    [req.user.userId]
  );
  res.json({ count: rows[0].count });
});

// ---------------------------------------------------------------------
// PATCH /api/notifications/:id/read
// Marks one of the current user's notifications as read.
// ---------------------------------------------------------------------
const markRead = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE notification
        SET is_read = TRUE
      WHERE notification_id = $1 AND recipient_user_id = $2
      RETURNING *`,
    [req.params.id, req.user.userId]
  );
  if (rows.length === 0) throw ApiError.notFound('Notification not found');
  res.json(rows[0]);
});

// ---------------------------------------------------------------------
// PATCH /api/notifications/read-all
// Marks every notification from the current user as read.
// ---------------------------------------------------------------------
const markAllRead = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query(
    `UPDATE notification SET is_read = TRUE WHERE recipient_user_id = $1 AND is_read = FALSE`,
    [req.user.userId]
  );
  res.json({ updated: rowCount });
});

module.exports = { list, unreadCount, markRead, markAllRead };