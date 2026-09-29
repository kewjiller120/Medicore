'use strict';

const { pool } = require('../../config/db');
const asyncHandler = require('../../utils/asyncHandler');

async function adminSummary() {
  const [patients, doctors, staff, rooms, apptsToday, pendingLabs, unpaidBills, ambulances] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM patient'),
    pool.query('SELECT COUNT(*)::int AS count FROM doctor'),
    pool.query('SELECT COUNT(*)::int AS count FROM staff'),
    pool.query(
      `SELECT status, COUNT(*)::int AS count FROM room GROUP BY status`
    ),
    pool.query(`SELECT COUNT(*)::int AS count FROM appointment WHERE appt_date = CURRENT_DATE`),
    pool.query(`SELECT COUNT(*)::int AS count FROM lab_test WHERE status IN ('Pending','In Progress')`),
    pool.query(`SELECT COALESCE(SUM(total_amt),0)::float AS total FROM billing WHERE status != 'Paid'`),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM ambulance GROUP BY status`),
  ]);

  return {
    role: 'admin',
    totalPatients: patients.rows[0].count,
    totalDoctors: doctors.rows[0].count,
    totalStaff: staff.rows[0].count,
    roomsByStatus: rooms.rows,
    appointmentsToday: apptsToday.rows[0].count,
    pendingLabTests: pendingLabs.rows[0].count,
    outstandingBillingTotal: unpaidBills.rows[0].total,
    ambulancesByStatus: ambulances.rows,
  };
}

async function doctorSummary(doctorId) {
  const [apptsToday, pendingRequests, pendingAmbulance, patients, pendingLabs, records] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count FROM appointment WHERE doctor_id = $1 AND appt_date = CURRENT_DATE AND status = 'Approved'`,
      [doctorId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM appointment WHERE doctor_id = $1 AND status = 'Pending'`,
      [doctorId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM ambulance_request
        WHERE department_id = (SELECT department_id FROM doctor WHERE doctor_id = $1)
          AND status = 'Pending'`,
      [doctorId]
    ),
    pool.query(`SELECT COUNT(DISTINCT patient_id)::int AS count FROM medical_record WHERE doctor_id = $1`, [
      doctorId,
    ]),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM lab_test WHERE doctor_id = $1 AND status IN ('Pending','In Progress')`,
      [doctorId]
    ),
    pool.query(`SELECT COUNT(*)::int AS count FROM medical_record WHERE doctor_id = $1`, [doctorId]),
  ]);

  return {
    role: 'doctor',
    appointmentsToday: apptsToday.rows[0].count,
    pendingAppointmentRequests: pendingRequests.rows[0].count,
    pendingAmbulanceRequests: pendingAmbulance.rows[0].count,
    distinctPatientsSeen: patients.rows[0].count,
    pendingLabTestsOrdered: pendingLabs.rows[0].count,
    totalMedicalRecords: records.rows[0].count,
  };
}

const STAFF_SUMMARY_BUILDERS = {
  Receptionist: async () => {
    const [apptsToday, admitted, unpaidBills] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM appointment WHERE appt_date = CURRENT_DATE`),
      pool.query(`SELECT COUNT(*)::int AS count FROM admission WHERE status = 'Admitted'`),
      pool.query(`SELECT COUNT(*)::int AS count FROM billing WHERE status != 'Paid'`),
    ]);
    return {
      appointmentsToday: apptsToday.rows[0].count,
      currentlyAdmitted: admitted.rows[0].count,
      unpaidBills: unpaidBills.rows[0].count,
    };
  },
  Nurse: async () => {
    const [admitted, apptsToday] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM admission WHERE status = 'Admitted'`),
      pool.query(`SELECT COUNT(*)::int AS count FROM appointment WHERE appt_date = CURRENT_DATE`),
    ]);
    return { currentlyAdmitted: admitted.rows[0].count, appointmentsToday: apptsToday.rows[0].count };
  },
  Pharmacist: async () => {
    const [lowStock, prescriptionsToday] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM medicine WHERE stock_quantity < 20`),
      pool.query(`SELECT COUNT(*)::int AS count FROM prescription WHERE date_issued = CURRENT_DATE`),
    ]);
    return { lowStockMedicines: lowStock.rows[0].count, prescriptionsIssuedToday: prescriptionsToday.rows[0].count };
  },
  LabTechnician: async () => {
    const [pending, completedToday] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM lab_test WHERE status IN ('Pending','In Progress')`),
      pool.query(`SELECT COUNT(*)::int AS count FROM lab_result WHERE result_date = CURRENT_DATE`),
    ]);
    return { pendingLabTests: pending.rows[0].count, resultsEnteredToday: completedToday.rows[0].count };
  },
  Driver: async (staffId) => {
    const { rows } = await pool.query(
      `SELECT a.vehicle_no, a.status FROM driver_assignment da JOIN ambulance a ON a.ambulance_id = da.ambulance_id WHERE da.staff_id = $1`,
      [staffId]
    );
    return { assignedAmbulances: rows };
  },
  Accountant: async () => {
    const [unpaidTotal, todayRevenue] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total_amt),0)::float AS total FROM billing WHERE status != 'Paid'`),
      pool.query(`SELECT COALESCE(SUM(amount),0)::float AS total FROM payment WHERE payment_date = CURRENT_DATE AND status = 'Confirmed'`),
    ]);
    return { outstandingBillingTotal: unpaidTotal.rows[0].total, revenueToday: todayRevenue.rows[0].total };
  },
};

async function staffSummary(staffId, staffRole) {
  const builder = STAFF_SUMMARY_BUILDERS[staffRole];
  const details = builder ? await builder(staffId) : {};
  return { role: 'staff', staffRole, ...details };
}

async function patientSummary(patientId) {
  const [upcoming, unpaidBills, ambulanceRequests] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count FROM appointment
        WHERE patient_id = $1 AND status IN ('Pending', 'Approved') AND appt_date >= CURRENT_DATE`,
      [patientId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amt),0)::float AS total
         FROM billing WHERE patient_id = $1 AND status != 'Paid'`,
      [patientId]
    ),
    pool.query(`SELECT COUNT(*)::int AS count FROM ambulance_request WHERE patient_id = $1`, [patientId]),
  ]);

  return {
    role: 'patient',
    upcomingAppointments: upcoming.rows[0].count,
    unpaidBillsCount: unpaidBills.rows[0].count,
    outstandingBillingTotal: unpaidBills.rows[0].total,
    totalAmbulanceRequests: ambulanceRequests.rows[0].count,
  };
}

const summary = asyncHandler(async (req, res) => {
  const { role, doctorId, staffId, staffRole, patientId } = req.user;

  let payload;
  if (role === 'admin') payload = await adminSummary();
  else if (role === 'doctor') payload = await doctorSummary(doctorId);
  else if (role === 'patient') payload = await patientSummary(patientId);
  else payload = await staffSummary(staffId, staffRole);

  res.json(payload);
});

module.exports = { summary };
