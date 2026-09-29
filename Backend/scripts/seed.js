'use strict';

/**
 * Idempotent seed script. Safe to run multiple times - every insert first
 * checks whether the row already exists.
 *
 * Creates:
 *  - the bootstrap admin (from .env BOOTSTRAP_ADMIN_USERNAME/PASSWORD)
 *  - one demo account for the doctor role and for EVERY staff sub-role,
 *    so a grader can log in as every role from a clean database without
 *    needing to use the public self-registration form at all
 *  - one demo patient account (with a login) plus a few login-less
 *    walk-in patient records, so both patterns are represented
 *  - a handful of departments, rooms, medicines, and ambulances so the
 *    app isn't empty on first login
 */

const { Client } = require('pg');
const env = require('../src/config/env');
const { hashPassword } = require('../src/utils/password');

const DEMO_PASSWORD = 'Demo@1234';

async function ensureDepartment(client, name, location) {
  const { rows } = await client.query('SELECT department_id FROM department WHERE name = $1', [name]);
  if (rows.length) return rows[0].department_id;
  const inserted = await client.query(
    'INSERT INTO department (name, location) VALUES ($1, $2) RETURNING department_id',
    [name, location]
  );
  return inserted.rows[0].department_id;
}

async function ensureRoom(client, roomNumber, type) {
  const { rows } = await client.query('SELECT room_id FROM room WHERE room_number = $1', [roomNumber]);
  if (rows.length) return rows[0].room_id;
  const inserted = await client.query(
    'INSERT INTO room (room_number, type) VALUES ($1, $2) RETURNING room_id',
    [roomNumber, type]
  );
  return inserted.rows[0].room_id;
}

async function ensureMedicine(client, name, unitPrice, stock, manufacturer) {
  const { rows } = await client.query('SELECT medicine_id FROM medicine WHERE name = $1', [name]);
  if (rows.length) return rows[0].medicine_id;
  const inserted = await client.query(
    'INSERT INTO medicine (name, unit_price, stock_quantity, manufacturer) VALUES ($1,$2,$3,$4) RETURNING medicine_id',
    [name, unitPrice, stock, manufacturer]
  );
  return inserted.rows[0].medicine_id;
}

async function ensureAmbulance(client, vehicleNo, location) {
  const { rows } = await client.query('SELECT ambulance_id FROM ambulance WHERE vehicle_no = $1', [vehicleNo]);
  if (rows.length) return rows[0].ambulance_id;
  const inserted = await client.query(
    'INSERT INTO ambulance (vehicle_no, current_location) VALUES ($1,$2) RETURNING ambulance_id',
    [vehicleNo, location]
  );
  return inserted.rows[0].ambulance_id;
}

/** Links a driver to an ambulance (idempotent - the table has a composite PK). */
async function ensureDriverAssignment(client, staffId, ambulanceId) {
  await client.query(
    'INSERT INTO driver_assignment (staff_id, ambulance_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [staffId, ambulanceId]
  );
}

async function ensurePatient(client, name, dob, gender, bloodGroup, phone) {
  const { rows } = await client.query('SELECT patient_id FROM patient WHERE name = $1 AND phone = $2', [
    name,
    phone,
  ]);
  if (rows.length) return rows[0].patient_id;
  const inserted = await client.query(
    `INSERT INTO patient (name, dob, gender, blood_group, phone, address, emergency_contact)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING patient_id`,
    [name, dob, gender, bloodGroup, phone, 'Dhaka, Bangladesh', '01700000000']
  );
  return inserted.rows[0].patient_id;
}

// Like ensurePatient, but also creates a 'patient' user_account so this one
// can actually log in and use the patient self-service side of the site -
// the other sample patients stay walk-in records with no login, the way a
// receptionist would register most patients in real life.
async function ensurePatientWithLogin(client, username, password, profile) {
  const { rows } = await client.query('SELECT user_id FROM user_account WHERE username = $1', [username]);
  let patientId;
  if (rows.length) {
    const existing = await client.query('SELECT patient_id FROM patient WHERE user_id = $1', [rows[0].user_id]);
    return existing.rows[0]?.patient_id;
  }
  const hash = await hashPassword(password);
  const userResult = await client.query(
    `INSERT INTO user_account (username, password_hash, role) VALUES ($1, $2, 'patient') RETURNING user_id`,
    [username, hash]
  );
  const patientResult = await client.query(
    `INSERT INTO patient (user_id, name, dob, gender, blood_group, address, phone, emergency_contact)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING patient_id`,
    [
      userResult.rows[0].user_id,
      profile.name,
      profile.dob,
      profile.gender,
      profile.bloodGroup,
      profile.address,
      profile.phone,
      profile.emergencyContact,
    ]
  );
  patientId = patientResult.rows[0].patient_id;
  console.log(`  created patient '${username}' / '${password}' (${profile.name})`);
  return patientId;
}

async function ensureAdmin(client, username, password) {
  const { rows } = await client.query('SELECT user_id FROM user_account WHERE username = $1', [username]);
  if (rows.length) return rows[0].user_id;
  const hash = await hashPassword(password);
  const inserted = await client.query(
    `INSERT INTO user_account (username, password_hash, role) VALUES ($1, $2, 'admin') RETURNING user_id`,
    [username, hash]
  );
  console.log(`  created admin '${username}' / '${password}'`);
  return inserted.rows[0].user_id;
}

async function ensureDoctor(client, username, password, profile) {
  const { rows } = await client.query('SELECT user_id FROM user_account WHERE username = $1', [username]);
  let doctorId;
  if (rows.length) {
    const existing = await client.query('SELECT doctor_id FROM doctor WHERE user_id = $1', [rows[0].user_id]);
    return existing.rows[0]?.doctor_id;
  }
  const hash = await hashPassword(password);
  const userResult = await client.query(
    `INSERT INTO user_account (username, password_hash, role) VALUES ($1, $2, 'doctor') RETURNING user_id`,
    [username, hash]
  );
  const doctorResult = await client.query(
    `INSERT INTO doctor (user_id, department_id, name, specialization, qualification, phone, email)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING doctor_id`,
    [
      userResult.rows[0].user_id,
      profile.department_id,
      profile.name,
      profile.specialization,
      profile.qualification,
      profile.phone,
      profile.email,
    ]
  );
  doctorId = doctorResult.rows[0].doctor_id;
  console.log(`  created doctor '${username}' / '${password}' (${profile.name})`);
  return doctorId;
}

async function ensureStaff(client, username, password, profile) {
  const { rows } = await client.query('SELECT user_id FROM user_account WHERE username = $1', [username]);
  if (rows.length) return;
  const hash = await hashPassword(password);
  const userResult = await client.query(
    `INSERT INTO user_account (username, password_hash, role) VALUES ($1, $2, 'staff') RETURNING user_id`,
    [username, hash]
  );
  await client.query(
    `INSERT INTO staff (user_id, department_id, name, role, phone, shift_timing)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [userResult.rows[0].user_id, profile.department_id, profile.name, profile.role, profile.phone, profile.shift_timing]
  );
  console.log(`  created staff '${username}' / '${password}' (${profile.name}, ${profile.role})`);
}

// One demo appointment and one demo ambulance request so the
// doctor-approves-appointment / doctor-accepts-ambulance workflows have
// something to act on right after a fresh seed. Both are idempotent.
async function ensurePendingAppointment(client, patientId, doctorId, name, daysAhead) {
  const { rows } = await client.query(
    `SELECT appointment_id FROM appointment
      WHERE patient_id = $1 AND doctor_id = $2 AND name = $3 AND status = 'Pending'`,
    [patientId, doctorId, name]
  );
  if (rows.length) return;
  await client.query(
    `INSERT INTO appointment (patient_id, doctor_id, appt_date, appt_time, name, status)
     VALUES ($1, $2, CURRENT_DATE + $3::int, '10:30', $4, 'Pending')`,
    [patientId, doctorId, daysAhead, name]
  );
  console.log(`  created demo pending appointment (${name})`);
}

async function ensurePendingAmbulanceRequest(client, patientId, departmentId, pickup, drop) {
  const { rows } = await client.query(
    `SELECT request_id FROM ambulance_request
      WHERE patient_id = $1 AND department_id = $2 AND pickup_location = $3 AND status = 'Pending'`,
    [patientId, departmentId, pickup]
  );
  if (rows.length) return;
  await client.query(
    `INSERT INTO ambulance_request (patient_id, department_id, pickup_location, drop_location, status)
     VALUES ($1, $2, $3, $4, 'Pending')`,
    [patientId, departmentId, pickup, drop]
  );
  console.log('  created demo pending ambulance request');
}

// One demo bill + one Pending payment so the
// accountant-confirms-payment workflow has something to act on right
// after a fresh seed. Idempotent: never creates a duplicate Pending
// payment for the same patient/amount signature.
async function ensurePendingPayment(client, patientId, total, amount, method) {
  const { rows: existing } = await client.query(
    `SELECT p.payment_id
       FROM payment p JOIN billing b ON b.bill_id = p.bill_id
      WHERE b.patient_id = $1 AND p.amount = $2 AND p.status = 'Pending'`,
    [patientId, amount]
  );
  if (existing.length) return;
  const { rows: billRows } = await client.query(
    `INSERT INTO billing (patient_id, total_amt, bill_date)
     VALUES ($1, $2, CURRENT_DATE) RETURNING bill_id`,
    [patientId, total]
  );
  await client.query(
    `INSERT INTO payment (bill_id, amount, payment_method, payment_date, status)
     VALUES ($1, $2, $3, CURRENT_DATE, 'Pending')`,
    [billRows[0].bill_id, amount, method]
  );
  console.log(`  created demo pending payment (${amount} on Bill #${billRows[0].bill_id})`);
}

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
  console.log('Seeding database...');

  // --- Bootstrap admin -------------------------------------------------
  await ensureAdmin(client, env.BOOTSTRAP_ADMIN_USERNAME, env.BOOTSTRAP_ADMIN_PASSWORD);

  // --- Departments -------------------------------------------------------
  const cardiology = await ensureDepartment(client, 'Cardiology', 'Block A, 2nd Floor');
  const neurology = await ensureDepartment(client, 'Neurology', 'Block B, 3rd Floor');
  await ensureDepartment(client, 'Orthopedics', 'Block A, 1st Floor');
  const generalMed = await ensureDepartment(client, 'General Medicine', 'Block C, Ground Floor');
  await ensureDepartment(client, 'Emergency', 'Block D, Ground Floor');

  // --- Rooms ---------------------------------------------------------
  await ensureRoom(client, 'R-101', 'General');
  await ensureRoom(client, 'R-102', 'General');
  await ensureRoom(client, 'R-201', 'Private');
  await ensureRoom(client, 'ICU-01', 'ICU');
  await ensureRoom(client, 'OT-01', 'Operation Theatre');
  await ensureRoom(client, 'ER-01', 'Emergency');

  // --- Medicines -------------------------------------------------------
  await ensureMedicine(client, 'Paracetamol 500mg', 2.5, 500, 'Square Pharmaceuticals');
  await ensureMedicine(client, 'Amoxicillin 250mg', 5.0, 300, 'Beximco Pharma');
  await ensureMedicine(client, 'Ibuprofen 400mg', 3.0, 250, 'Incepta Pharmaceuticals');
  await ensureMedicine(client, 'Omeprazole 20mg', 6.5, 200, 'ACI Limited');
  await ensureMedicine(client, 'Metformin 500mg', 4.0, 15, 'Square Pharmaceuticals'); // intentionally low stock for demo

  // --- Ambulances ------------------------------------------------------
  await ensureAmbulance(client, 'DHK-AMB-01', 'Hospital HQ');
  await ensureAmbulance(client, 'DHK-AMB-02', 'Hospital HQ');
  await ensureAmbulance(client, 'DHK-AMB-03', 'Hospital HQ');

  // --- Demo doctor + one staff member per sub-role ----------------------
  await ensureDoctor(client, 'dr.karim', DEMO_PASSWORD, {
    department_id: cardiology,
    name: 'Dr. Abdul Karim',
    specialization: 'Cardiologist',
    qualification: 'MBBS, FCPS (Cardiology)',
    phone: '01711000001',
    email: 'dr.karim@medicore.example',
  });
  await ensureDoctor(client, 'dr.nadia', DEMO_PASSWORD, {
    department_id: neurology,
    name: 'Dr. Nadia Islam',
    specialization: 'Neurologist',
    qualification: 'MBBS, MD (Neurology)',
    phone: '01711000002',
    email: 'dr.nadia@medicore.example',
  });

  const staffProfiles = [
    { username: 'reception1', name: 'Farhana Akter', role: 'Receptionist', dept: generalMed, shift: '8am - 4pm' },
    { username: 'nurse1', name: 'Rehana Sultana', role: 'Nurse', dept: generalMed, shift: '8am - 8pm' },
    { username: 'pharma1', name: 'Kamal Hossain', role: 'Pharmacist', dept: generalMed, shift: '9am - 5pm' },
    { username: 'labtech1', name: 'Shirin Akhter', role: 'LabTechnician', dept: generalMed, shift: '9am - 5pm' },
    { username: 'driver1', name: 'Jamal Uddin', role: 'Driver', dept: generalMed, shift: '24hr rotation' },
    { username: 'driver2', name: 'Rafiq Ahmed', role: 'Driver', dept: generalMed, shift: '24hr rotation' },
    { username: 'accountant1', name: 'Nasrin Begum', role: 'Accountant', dept: generalMed, shift: '9am - 5pm' },
  ];
  for (const p of staffProfiles) {
    await ensureStaff(client, p.username, DEMO_PASSWORD, {
      department_id: p.dept,
      name: p.name,
      role: p.role,
      phone: '017' + Math.floor(10000000 + Math.random() * 89999999),
      shift_timing: p.shift,
    });
  }

  // --- Sample patients ---------------------------------------------------
  await ensurePatient(client, 'Rahim Sheikh', '1985-03-14', 'Male', 'B+', '01800000001');
  await ensurePatient(client, 'Ayesha Khatun', '1992-07-22', 'Female', 'O+', '01800000002');
  await ensurePatient(client, 'Kamrul Hasan', '1978-11-05', 'Male', 'A-', '01800000003');

  // A fourth patient that can actually log in and use the self-service site.
  const shamimPatientId = await ensurePatientWithLogin(client, 'patient1', DEMO_PASSWORD, {
    name: 'Shamim Reza',
    dob: '1990-01-18',
    gender: 'Male',
    bloodGroup: 'B+',
    address: 'Mirpur, Dhaka, Bangladesh',
    phone: '01800000004',
    emergencyContact: '01900000004',
  });

  // Give each demo driver one vehicle straight away so the Driver role is
  // usable from the first login (dashboard shows the ambulance, and
  // requests dispatched to that ambulance appear in the driver's list). A
  // driver can only ever hold ONE vehicle at a time (driver_assignment
  // enforces it) - accepting a trip sets the pairing to that trip's
  // ambulance, and completing the trip frees both driver and vehicle again.
  const driverStaffRow1 = await client.query(
    `SELECT staff_id FROM staff
      WHERE user_id = (SELECT user_id FROM user_account WHERE username = 'driver1')`
  );
  const driverStaffRow2 = await client.query(
    `SELECT staff_id FROM staff
      WHERE user_id = (SELECT user_id FROM user_account WHERE username = 'driver2')`
  );
  const ambRows = await client.query('SELECT ambulance_id, vehicle_no FROM ambulance ORDER BY ambulance_id');
  const amb1 = ambRows.rows.find((a) => a.vehicle_no === 'DHK-AMB-01');
  const amb2 = ambRows.rows.find((a) => a.vehicle_no === 'DHK-AMB-02');
  if (driverStaffRow1.rows[0] && amb1) {
    await ensureDriverAssignment(client, driverStaffRow1.rows[0].staff_id, amb1.ambulance_id);
    console.log('  linked driver1 to DHK-AMB-01');
  }
  if (driverStaffRow2.rows[0] && amb2) {
    await ensureDriverAssignment(client, driverStaffRow2.rows[0].staff_id, amb2.ambulance_id);
    console.log('  linked driver2 to DHK-AMB-02');
  }

  // --- Demo workflow records ---------------------------------------------
  // A pending appointment for dr. Karim and a pending ambulance request
  // for the Cardiology department, so the approve/reject workflows have
  // something to act on immediately after a fresh seed.
  const karimDoctorId = await client.query(`SELECT doctor_id FROM doctor WHERE user_id = (SELECT user_id FROM user_account WHERE username = 'dr.karim')`);
  const cardiologyDept = await client.query(`SELECT department_id FROM department WHERE name = 'Cardiology'`);
  if (shamimPatientId && karimDoctorId.rows[0]) {
    await ensurePendingAppointment(client, shamimPatientId, karimDoctorId.rows[0].doctor_id, 'Routine checkup', 3);
  }
  if (shamimPatientId && cardiologyDept.rows[0]) {
    await ensurePendingAmbulanceRequest(client, shamimPatientId, cardiologyDept.rows[0].department_id, 'Mirpur, Dhaka', 'MediCore Hospital');
  }
  // A demo bill with a Pending payment for patient1, so the
  // accountant-approves-payment workflow has data immediately (the bill
  // stays Unpaid until the accountant confirms the Pending payment).
  if (shamimPatientId) {
    await ensurePendingPayment(client, shamimPatientId, 3500.0, 1500.0, 'Mobile Banking');
  }

  console.log('Seeding complete.');
  console.log('\nDemo credentials (username / password):');
  console.log(`  admin:     ${env.BOOTSTRAP_ADMIN_USERNAME} / ${env.BOOTSTRAP_ADMIN_PASSWORD}`);
  console.log(`  doctor:    dr.karim / ${DEMO_PASSWORD}  (and dr.nadia)`);
  for (const p of staffProfiles) {
    console.log(`  staff:     ${p.username} / ${DEMO_PASSWORD}  (${p.role})`);
  }
  console.log(`  patient:   patient1 / ${DEMO_PASSWORD}  (Shamim Reza)`);

  await client.end();
}

run().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
