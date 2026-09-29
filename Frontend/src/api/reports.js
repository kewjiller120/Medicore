import client from './client';

/**
 * Analytical reports backed by the fun_* / sp_* stored functions and
 * procedures in db/03_functions_procedures.sql. Admin and Accountant
 * staff are the main audience; patient-history is additionally open to
 * the patient themselves (scoped inside the controller).
 */
export const reportsApi = {
  revenueSummary: async (params) => (await client.get('/reports/revenue-summary', { params })).data,
  roomOccupancy: async () => (await client.get('/reports/room-occupancy')).data,
  patientHistory: async (patientId) => (await client.get(`/reports/patient-history/${patientId}`)).data,
  doctorAppointments: async (doctorId, params) =>
    (await client.get(`/reports/doctor-appointments/${doctorId}`, { params })).data,
  doctorWorkload: async (doctorId) => (await client.get(`/reports/doctor-workload/${doctorId}`)).data,
  lowStock: async (params) => (await client.get('/reports/low-stock', { params })).data,
  departmentDoctors: async (departmentId) => (await client.get(`/reports/department-doctors/${departmentId}`)).data,
  patientCensus: async (params) => (await client.get('/reports/patient-census', { params })).data,
};