'use strict';

const { Pool } = require('pg');
const env = require('./env');

// A single shared connection pool for the whole process. Using a pool
// (rather than opening a fresh client per request) is what "Database
// connectivity ... using a connection pool" in the 40% baseline and
// "Backend must be efficient" in the 60% brief both call for.
const pool = new Pool(
  env.DATABASE_URL
    ? { connectionString: env.DATABASE_URL }
    : {
        host: env.PGHOST,
        port: env.PGPORT,
        database: env.PGDATABASE,
        user: env.PGUSER,
        password: env.PGPASSWORD,
      }
);

pool.on('error', (err) => {
  // A backend connection was terminated unexpectedly (e.g. network blip).
  // Log and let the pool recycle the connection; do not crash the process.
  // eslint-disable-next-line no-console
  console.error('[db] Unexpected error on idle client', err);
});

/**
 * Run a single parameterized query against the pool.
 * ALWAYS use parameterized queries ($1, $2, ...) - never string-concatenate
 * user input into SQL. This is enforced by convention across every module.
 */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run a callback inside a single DB transaction using one dedicated client.
 * Automatically COMMITs on success and ROLLBACKs on any thrown error.
 *
 * Usage:
 *   const result = await withTransaction(async (client) => {
 *     await client.query('...', [...]);
 *     return await client.query('...', [...]);
 *   });
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
