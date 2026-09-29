# MediCore — Backend

Express + PostgreSQL API for the MediCore Hospital Management System, using
raw parameterized SQL only (no ORM). See the **root `README.md`** (one level
up) for full project documentation: setup for both Backend and Frontend,
roles/permissions, trigger docs, and demo credentials.

## Quick start

```bash
npm install
cp .env.example .env       # edit DB credentials if they differ from the defaults
createdb medicore_db        # or: psql -c "CREATE DATABASE medicore_db;"
npm run db:migrate          # applies db/01_schema.sql + db/02_triggers.sql + db/03_functions_procedures.sql
npm run db:seed             # bootstrap admin + one demo account per role + demo workflow records
npm run dev                  # http://localhost:5000
```

## Scripts

- `npm run dev` — start the API with nodemon (auto-restart on change)
- `npm start` — start the API with plain node (production)
- `npm run db:migrate` — (re-)apply schema, triggers, and functions/procedures (safe to re-run)
- `npm run db:seed` — idempotent: bootstrap admin + one account per role/sub-role + sample data
- `npm run db:reset` — migrate then seed, in one step

## Layout

```
db/
├── 01_schema.sql                  All 19 approved entities + additive auth/audit/notification tables
├── 02_triggers.sql                PL/pgSQL trigger functions + bindings (business rules, dates, notifications)
└── 03_functions_procedures.sql    sp_* workflow procedures + fun_* report functions  (see root README §4)
scripts/
├── migrate.js        Applies the three SQL files above
└── seed.js           Bootstrap admin + one demo account per role
src/
├── config/           env loader, pg Pool + transaction helper
├── middleware/        authenticate, authorize, validate, error handler
├── utils/             ApiError, password hashing, JWT/session tokens
└── modules/<name>/    routes.js + controller.js per REST resource
```