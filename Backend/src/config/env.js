'use strict';

require('dotenv').config();

function bool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,

  DATABASE_URL: process.env.DATABASE_URL || null,
  PGHOST: process.env.PGHOST || '127.0.0.1',
  PGPORT: parseInt(process.env.PGPORT, 10) || 5432,
  PGDATABASE: process.env.PGDATABASE || 'medicore_db',
  PGUSER: process.env.PGUSER || 'postgres',
  PGPASSWORD: process.env.PGPASSWORD || '',

  CORS_ORIGIN: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET || 'dev_secret_change_me',
  ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL || '15m',
  REFRESH_TOKEN_TTL_DAYS: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS, 10) || 7,

  BOOTSTRAP_ADMIN_USERNAME: process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin',
  BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin@12345',

  ALLOW_PUBLIC_SIGNUP: bool(process.env.ALLOW_PUBLIC_SIGNUP, true),
};

if (env.NODE_ENV === 'production' && env.ACCESS_TOKEN_SECRET === 'dev_secret_change_me') {
  // eslint-disable-next-line no-console
  console.warn(
    '[WARN] ACCESS_TOKEN_SECRET is using the insecure default value. ' +
      'Set a strong secret in your .env before deploying to production.'
  );
}

module.exports = env;
