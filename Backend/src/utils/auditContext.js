'use strict';

/**
 * Sets the session-local GUC 'app.current_user_id' for the lifetime of
 * the current transaction on `client`. The fn_audit_user_account()
 * trigger (see db/02_triggers.sql) reads this via current_setting() to
 * attribute an admin's edit of someone else's account in audit_log.
 *
 * Must be called with a `client` obtained from pool.connect() (i.e.
 * inside withTransaction), NOT the shared pool - `SET LOCAL` only makes
 * sense scoped to one transaction on one connection.
 */
async function setAuditActor(client, userId) {
  // set_config(..., true) = session-local (reverts at COMMIT/ROLLBACK), avoids SQL injection risk of SET LOCAL string interpolation
  await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', String(userId)]);
}

module.exports = { setAuditActor };
