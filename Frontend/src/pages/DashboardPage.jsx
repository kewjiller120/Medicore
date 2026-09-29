import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../api/dashboard';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { ErrorAlert } from '../components/Alerts';
import { apiErrorMessage } from '../api/client';
import { formatCurrency } from '../utils/format';
import StatusBadge from '../components/StatusBadge';

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi
      .summary()
      .then(setData)
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="page-header">
        <h1>Welcome, {user?.name || user?.username}</h1>
      </div>
      <ErrorAlert message={error} />

      {data?.role === 'admin' && (
        <>
          <div className="stat-grid">
            <StatCard label="Total Patients" value={data.totalPatients} />
            <StatCard label="Doctors" value={data.totalDoctors} />
            <StatCard label="Staff" value={data.totalStaff} />
            <StatCard label="Appointments Today" value={data.appointmentsToday} />
            <StatCard label="Pending Lab Tests" value={data.pendingLabTests} />
            <StatCard label="Outstanding Billing" value={formatCurrency(data.outstandingBillingTotal)} />
          </div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h3>Rooms by status</h3>
            <div className="flex-row" style={{ flexWrap: 'wrap', gap: 10 }}>
              {data.roomsByStatus.map((r) => (
                <span key={r.status} className="flex-row">
                  <StatusBadge value={r.status} /> <span className="muted">{r.count}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>Ambulances by status</h3>
            <div className="flex-row" style={{ flexWrap: 'wrap', gap: 10 }}>
              {data.ambulancesByStatus.map((r) => (
                <span key={r.status} className="flex-row">
                  <StatusBadge value={r.status} /> <span className="muted">{r.count}</span>
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {data?.role === 'patient' && (
        <>
          <div className="stat-grid">
            <StatCard label="Upcoming Appointments" value={data.upcomingAppointments} />
            <StatCard label="Unpaid Bills" value={data.unpaidBillsCount} />
            <StatCard label="Outstanding Balance" value={formatCurrency(data.outstandingBillingTotal)} />
            <StatCard label="Ambulance Requests" value={data.totalAmbulanceRequests} />
          </div>
          <div className="card">
            <h3>Quick actions</h3>
            <div className="flex-row" style={{ flexWrap: 'wrap', gap: 10 }}>
              <Link to="/doctors" className="btn">Find a doctor</Link>
              <Link to="/appointments" className="btn">Book an appointment</Link>
              <Link to="/ambulance-requests" className="btn">Request an ambulance</Link>
              <Link to="/billing" className="btn">Pay a bill</Link>
            </div>
          </div>
        </>
      )}

      {data?.role === 'doctor' && (
        <>
          <div className="stat-grid">
            <StatCard label="Appointments Today" value={data.appointmentsToday} />
            <StatCard label="Distinct Patients Seen" value={data.distinctPatientsSeen} />
            <StatCard label="Pending Lab Tests Ordered" value={data.pendingLabTestsOrdered} />
            <StatCard label="Total Medical Records" value={data.totalMedicalRecords} />
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <h3>Requests awaiting your decision</h3>
            <div className="flex-row" style={{ flexWrap: 'wrap', gap: 14 }}>
              <span className="flex-row">
                <StatusBadge value="Pending" />{' '}
                <Link to="/appointments" style={{ fontWeight: 600 }}>
                  {data.pendingAppointmentRequests} appointment request{data.pendingAppointmentRequests === 1 ? '' : 's'}
                </Link>
              </span>
              <span className="flex-row">
                <StatusBadge value="Pending" />{' '}
                <Link to="/ambulance-requests" style={{ fontWeight: 600 }}>
                  {data.pendingAmbulanceRequests} ambulance request{data.pendingAmbulanceRequests === 1 ? '' : 's'}
                </Link>
              </span>
            </div>
          </div>
        </>
      )}

      {data?.role === 'staff' && (
        <div className="stat-grid">
          {data.staffRole === 'Receptionist' && (
            <>
              <StatCard label="Appointments Today" value={data.appointmentsToday} />
              <StatCard label="Currently Admitted" value={data.currentlyAdmitted} />
              <StatCard label="Unpaid Bills" value={data.unpaidBills} />
            </>
          )}
          {data.staffRole === 'Nurse' && (
            <>
              <StatCard label="Currently Admitted" value={data.currentlyAdmitted} />
              <StatCard label="Appointments Today" value={data.appointmentsToday} />
            </>
          )}
          {data.staffRole === 'Pharmacist' && (
            <>
              <StatCard label="Low Stock Medicines" value={data.lowStockMedicines} />
              <StatCard label="Prescriptions Issued Today" value={data.prescriptionsIssuedToday} />
            </>
          )}
          {data.staffRole === 'LabTechnician' && (
            <>
              <StatCard label="Pending Lab Tests" value={data.pendingLabTests} />
              <StatCard label="Results Entered Today" value={data.resultsEnteredToday} />
            </>
          )}
          {data.staffRole === 'Accountant' && (
            <>
              <StatCard label="Outstanding Billing" value={formatCurrency(data.outstandingBillingTotal)} />
              <StatCard label="Revenue Today" value={formatCurrency(data.revenueToday)} />
            </>
          )}
          {data.staffRole === 'Driver' && (
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <h3>Your assigned ambulance(s)</h3>
              {data.assignedAmbulances?.length ? (
                <ul>
                  {data.assignedAmbulances.map((a) => (
                    <li key={a.vehicle_no}>
                      {a.vehicle_no} - <StatusBadge value={a.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No ambulance assigned yet.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
