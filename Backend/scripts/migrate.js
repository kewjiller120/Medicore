'use strict';

/**
 * Applies every db/*.sql file in sorted order against the configured
 * database. Safe to re-run: 01_schema.sql DROPs and re-CREATEs the tables,
 * 02_triggers.sql / 03_functions_procedures.sql use CREATE OR REPLACE, and
 * 04_upgrade_patch.sql is purely additive (IF NOT EXISTS), so an older
 * database is brought up to date without ever breaking.
 *
 * Files are discovered automatically from db/ so a newly added SQL file can
 * never be forgotten here.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const env = require('../src/config/env');

async function run() {
  const client = new Client(
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

  await client.connect();
  console.log(`Connected to ${env.PGDATABASE || '(DATABASE_URL)'} - running migrations...`);

  const dbDir = path.join(__dirname, '..', 'db');
  const files = fs.readdirSync(dbDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const filePath = path.join(__dirname, '..', 'db', file);
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`  applying ${file} ...`);
    await client.query(sql);
  }

  console.log('Migrations complete.');
  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
