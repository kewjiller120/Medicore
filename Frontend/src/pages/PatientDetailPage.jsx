import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { patientsApi } from '../api/patients';
import { appointmentsApi } from '../api/appointments';
import { medicalRecordsApi } from '../api/medicalRecords';
import { admissionsApi } from '../api/admissions';
import { billingApi } from '../api/billing';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
import { formatDate, formatCurrency } from '../utils/format';

/**
 * Each related section is fetched independently and fails soft: if the
 * current role isn't allowed to see e.g. billing, that section just shows
 * "no access" instead of taking down the whole page - the backend is still
 * the one actually enforcing that boundary.
 */
function useSoftSection(fetcher) {
  const [state, setState] = useState({ loading: true, data: null, forbidden: false });
  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((data) => !cancelled && setState({ loading: false, data, forbidden: false }))
      .catch((err) => !cancelled && setState({ loading: false, data: null, forbidden: err?.response?.status === 403 }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

export default function PatientDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    patientsApi.getOne(id).then(setPatient).finally(() => setLoading(false));
  }, [id]);

  const appts = useSoftSection(() => appointmentsApi.list({ patient_id: id }));
  const records = useSoftSection(() => medicalRecordsApi.list({ patient_id: id }));
  const admissions = useSoftSection(() => admissionsApi.list({ patient_id: id }));
  const bills = useSoftSection(() => billingApi.list({ patient_id: id }));

  if (loading) return <LoadingSpinner />;
  if (!patient) return <div className="card">Patient not found.</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/patients" className="muted">&larr; Back to patients</Link>
          <h1>{patient.name}</h1>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="form-grid">
          <div><strong>DOB:</strong> {formatDate(patient.dob)}</div>
          <div><strong>Gender:</strong> {patient.gender || '-'}</div>
          <div><strong>Blood group:</strong> {patient.blood_group || '-'}</div>
          <div><strong>Phone:</strong> {patient.phone || '-'}</div>
          <div><strong>Emergency contact:</strong> {patient.emergency_contact || '-'}</div>
          <div><strong>Address:</strong> {patient.address || '-'}</div>
        </div>
      </div>

      <Section title="Appointments" state={appts}>
        {appts.data?.length ? (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Time</th><th>Doctor</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>
              {appts.data.map((a) => (
                <tr key={a.appointment_id}>
                  <td>{formatDate(a.appt_date)}</td>
                  <td>{a.appt_time?.slice(0, 5)}</td>
                  <td>{a.doctor_name}</td>
                  <td>{a.name}</td>
                  <td><StatusBadge value={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No appointments.</p>
        )}
      </Section>

      <Section title="Medical Records" state={records}>
        {records.data?.length ? (
          <table className="data-table">
            <thead><tr><th>Visit date</th><th>Doctor</th><th>Diagnosis</th></tr></thead>
            <tbody>
              {records.data.map((r) => (
                <tr key={r.record_id}>
                  <td>{formatDate(r.visit_date)}</td>
                  <td>{r.doctor_name}</td>
                  <td>
                    <Link to={`/medical-records/${r.record_id}`}>{r.diagnosis}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No medical records{user?.role === 'doctor' ? ' authored by you' : ''}.</p>
        )}
      </Section>

      <Section title="Admissions" state={admissions}>
        {admissions.data?.length ? (
          <table className="data-table">
            <thead><tr><th>Room</th><th>Doctor</th><th>Admit date</th><th>Discharge date</th><th>Status</th></tr></thead>
            <tbody>
              {admissions.data.map((a) => (
                <tr key={a.admission_id}>
                  <td>{a.room_number}</td>
                  <td>{a.doctor_name}</td>
                  <td>{formatDate(a.admit_date)}</td>
                  <td>{formatDate(a.discharge_date)}</td>
                  <td><StatusBadge value={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No admissions.</p>
        )}
      </Section>

      <Section title="Billing" state={bills}>
        {bills.data?.length ? (
          <table className="data-table">
            <thead><tr><th>Bill date</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead>
            <tbody>
              {bills.data.map((b) => (
                <tr key={b.bill_id}>
                  <td>{formatDate(b.bill_date)}</td>
                  <td>{formatCurrency(b.total_amt)}</td>
                  <td>{formatCurrency(b.amount_paid)}</td>
                  <td><StatusBadge value={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No bills.</p>
        )}
      </Section>
    </div>
  );
}

function Section({ title, state, children }) {
  return (
    <div className="section-title-wrap" style={{ marginBottom: 22 }}>
      <h3>{title}</h3>
      <div className="table-wrap">
        <div style={{ padding: 14 }}>
          {state.loading ? (
            <p className="muted">Loading...</p>
          ) : state.forbidden ? (
            <p className="muted">You don't have access to this section.</p>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
