'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

const authRoutes = require('./modules/auth/auth.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const departmentRoutes = require('./modules/departments/departments.routes');
const roomRoutes = require('./modules/rooms/rooms.routes');
const doctorRoutes = require('./modules/doctors/doctors.routes');
const staffRoutes = require('./modules/staff/staff.routes');
const patientRoutes = require('./modules/patients/patients.routes');
const medicalRecordRoutes = require('./modules/medicalRecords/medicalRecords.routes');
const prescriptionRoutes = require('./modules/prescriptions/prescriptions.routes');
const medicineRoutes = require('./modules/medicines/medicines.routes');
const appointmentRoutes = require('./modules/appointments/appointments.routes');
const admissionRoutes = require('./modules/admissions/admissions.routes');
const labTestRoutes = require('./modules/labTests/labTests.routes');
const labResultRoutes = require('./modules/labResults/labResults.routes');
const billingRoutes = require('./modules/billing/billing.routes');
const paymentRoutes = require('./modules/payments/payments.routes');
const ambulanceRoutes = require('./modules/ambulances/ambulances.routes');
const ambulanceRequestRoutes = require('./modules/ambulanceRequests/ambulanceRequests.routes');
const driverAssignmentRoutes = require('./modules/driverAssignments/driverAssignments.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const notificationRoutes = require('./modules/notifications/notifications.routes');
const reportRoutes = require('./modules/reports/reports.routes');

const app = express();

// Behind a reverse proxy (Render, Railway, nginx...) in production, so
// req.ip / secure cookies resolve correctly.
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true, // required so the refresh-token cookie is sent/received
  })
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/medical-records', medicalRecordRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/lab-tests', labTestRoutes);
app.use('/api/lab-results', labResultRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ambulances', ambulanceRoutes);
app.use('/api/ambulance-requests', ambulanceRequestRoutes);
app.use('/api/driver-assignments', driverAssignmentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
