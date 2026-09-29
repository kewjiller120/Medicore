import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RequireAuth, RequireRole } from './components/RouteGuards';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import DepartmentsPage from './pages/DepartmentsPage';
import RoomsPage from './pages/RoomsPage';
import DoctorsPage from './pages/DoctorsPage';
import StaffPage from './pages/StaffPage';
import PatientsPage from './pages/PatientsPage';
import PatientDetailPage from './pages/PatientDetailPage';
import MedicalRecordsPage from './pages/MedicalRecordsPage';
import MedicalRecordDetailPage from './pages/MedicalRecordDetailPage';
import MedicinesPage from './pages/MedicinesPage';
import AppointmentsPage from './pages/AppointmentsPage';
import AdmissionsPage from './pages/AdmissionsPage';
import LabTestsPage from './pages/LabTestsPage';
import LabResultsPage from './pages/LabResultsPage';
import BillingPage from './pages/BillingPage';
import AmbulancesPage from './pages/AmbulancesPage';
import AmbulanceRequestsPage from './pages/AmbulanceRequestsPage';
import { DriverAssignmentsPage, MyAmbulancePage } from './pages/DriverAssignmentsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import ReportsPage from './pages/ReportsPage';
import ProfilePage from './pages/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';

/** Redirects an already-logged-in user away from /login and /register. */
function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner label="Loading..." />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<PublicOnly><LandingPage /></PublicOnly>} />
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />

          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="profile" element={<ProfilePage />} />

            {/* Patient self-service + everyone: appointments / doctors / ambulance requests */}
            <Route
              path="appointments"
              element={
                <RequireRole roles={['admin', 'doctor', 'staff', 'patient']} staffRoles={['Receptionist', 'Pharmacist', 'LabTechnician', 'Accountant', 'Other']}>
                  <AppointmentsPage />
                </RequireRole>
              }
            />
            <Route path="doctors" element={<DoctorsPage />} />
            <Route
              path="ambulance-requests"
              element={
                <RequireRole roles={['admin', 'doctor', 'staff', 'patient']} staffRoles={['Driver']}>
                  <AmbulanceRequestsPage />
                </RequireRole>
              }
            />

            <Route
              path="patients"
              element={
                <RequireRole roles={['admin', 'doctor', 'staff']} staffRoles={['Receptionist', 'Nurse']}>
                  <PatientsPage />
                </RequireRole>
              }
            />
            <Route
              path="patients/:id"
              element={
                <RequireRole roles={['admin', 'doctor', 'staff']} staffRoles={['Receptionist', 'Nurse']}>
                  <PatientDetailPage />
                </RequireRole>
              }
            />

            <Route
              path="admissions"
              element={
                <RequireRole roles={['admin', 'doctor', 'staff']} staffRoles={['Receptionist', 'Nurse']}>
                  <AdmissionsPage />
                </RequireRole>
              }
            />
            <Route
              path="lab-tests"
              element={
                <RequireRole roles={['admin', 'doctor', 'staff', 'patient']} staffRoles={['LabTechnician']}>
                  <LabTestsPage />
                </RequireRole>
              }
            />
            <Route
              path="lab-results"
              element={
                <RequireRole roles={['admin', 'doctor', 'staff', 'patient']} staffRoles={['LabTechnician']}>
                  <LabResultsPage />
                </RequireRole>
              }
            />
            <Route
              path="medicines"
              element={
                <RequireRole roles={['admin', 'doctor', 'staff']} staffRoles={['Pharmacist']}>
                  <MedicinesPage />
                </RequireRole>
              }
            />
            <Route
              path="ambulances"
              element={
                <RequireRole roles={['admin', 'doctor', 'staff']} staffRoles={['Driver']}>
                  <AmbulancesPage />
                </RequireRole>
              }
            />

            <Route
              path="staff"
              element={
                <RequireRole roles={['admin', 'doctor', 'staff']}>
                  <StaffPage />
                </RequireRole>
              }
            />
            <Route
              path="departments"
              element={
                <RequireRole roles={['admin', 'doctor', 'staff']}>
                  <DepartmentsPage />
                </RequireRole>
              }
            />
            <Route
              path="rooms"
              element={
                <RequireRole roles={['admin', 'doctor', 'staff']} staffRoles={['Receptionist', 'Nurse']}>
                  <RoomsPage />
                </RequireRole>
              }
            />

            <Route
              path="medical-records"
              element={
                <RequireRole roles={['admin', 'doctor', 'patient']}>
                  <MedicalRecordsPage />
                </RequireRole>
              }
            />
            <Route
              path="medical-records/:id"
              element={
                <RequireRole roles={['admin', 'doctor', 'patient']}>
                  <MedicalRecordDetailPage />
                </RequireRole>
              }
            />

            <Route
              path="billing"
              element={
                <RequireRole roles={['admin', 'staff', 'patient']} staffRoles={['Receptionist', 'Accountant']}>
                  <BillingPage />
                </RequireRole>
              }
            />

            <Route
              path="reports"
              element={
                <RequireRole roles={['admin', 'staff']} staffRoles={['Accountant']}>
                  <ReportsPage />
                </RequireRole>
              }
            />

            <Route
              path="driver-assignments/mine"
              element={
                <RequireRole roles={['staff']} staffRoles={['Driver']}>
                  <MyAmbulancePage />
                </RequireRole>
              }
            />
            <Route
              path="driver-assignments"
              element={
                <RequireRole roles={['admin']}>
                  <DriverAssignmentsPage />
                </RequireRole>
              }
            />

            <Route
              path="admin/users"
              element={
                <RequireRole roles={['admin']}>
                  <AdminUsersPage />
                </RequireRole>
              }
            />

            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}