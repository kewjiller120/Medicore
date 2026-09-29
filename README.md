# MediCore — Hospital Management System

Full-stack hospital management application built for the CSE 216 Database
Sessional course project. 

- **Frontend:** React 19 (Vite) + React Router, plain CSS, JavaScript only
- **Backend:** Node.js + Express 5, raw parameterized SQL via `pg` — **no ORM**
- **Database:** PostgreSQL ≥ 13, with business rules enforced by **PL/pgSQL
  triggers** and workflow logic exposed as **stored procedures / functions**
  (`db/03_functions_procedures.sql`)

```
medicore/
├── Backend/     Express API, database schema + triggers, seed data
└── Frontend/    React single-page app
```
---

## Quick start

### Prerequisites
- Node.js ≥ 18
- PostgreSQL ≥ 13 running locally (or reachable via `DATABASE_URL`)

### 1. Database + Backend

```bash
cd Backend
npm install
cp .env.example .env         # edit DB credentials / secrets if needed
createdb medicore_db         # or: psql -c "CREATE DATABASE medicore_db;"
npm run db:migrate           # applies 01_schema.sql + 02_triggers.sql + 03_functions_procedures.sql
npm run db:seed              # bootstrap admin + one demo account per role + demo workflow records
npm run dev                  # http://localhost:5000
```

`npm run db:reset` runs migrate + seed in one step and is safe to repeat
(every file `DROP ... IF EXISTS` / `CREATE OR REPLACE`; the seed is
idempotent).

### 2. Frontend

```bash
cd Frontend
npm install
cp .env.example .env         # VITE_API_URL, defaults to http://localhost:5000/api
npm run dev                  # http://localhost:5173
```

Open `http://localhost:5173` and log in (see demo credentials below, also
shown on the login page itself).

---

## Demo credentials

`npm run db:seed` creates one account per role/sub-role so every role can be
demonstrated from a clean database without needing to self-register:

| Username       | Password      | Role                    |
|-----------------|--------------|-------------------------|
| `admin`         | `Admin@12345`| Admin                   |
| `dr.karim`      | `Demo@1234`  | Doctor (Cardiology)     |
| `dr.nadia`      | `Demo@1234`  | Doctor (Neurology)      |
| `reception1`    | `Demo@1234`  | Staff · Receptionist    |
| `nurse1`        | `Demo@1234`  | Staff · Nurse           |
| `pharma1`       | `Demo@1234`  | Staff · Pharmacist      |
| `labtech1`      | `Demo@1234`  | Staff · LabTechnician   |
| `driver1`       | `Demo@1234`  | Staff · Driver          |
| `driver2`       | `Demo@1234`  | Staff · Driver          |
| `accountant1`   | `Demo@1234`  | Staff · Accountant      |
| `patient1`      | `Demo@1234`  | Patient (Shamim Reza)   |


New patient accounts can be self-registered from the landing page / login
page (`ALLOW_PUBLIC_SIGNUP=true` in `Backend/.env` — see §6). Doctor and
staff accounts are never self-registered — only an existing admin can create
one, from the **User Accounts** screen.

---
