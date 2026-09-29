import { useEffect, useState } from 'react';
import { reportsApi } from '../api/reports';
import { departmentsApi } from '../api/departments';
import LoadingSpinner from '../components/LoadingSpinner';
import { ErrorAlert } from '../components/Alerts';
import { apiErrorMessage } from '../api/client';
import { formatCurrency } from '../utils/format';

/**
 * Management reports (admin / Accountant staff). Each section is backed by
 * a fun_* function in db/03_functions_procedures.sql - see the route
 * comments over there for what the query params do.
 */
export default function ReportsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [revenue, lowStock, occupancy, censusGender, censusBlood, departments] = await Promise.all([
          reportsApi.revenueSummary(),
          reportsApi.lowStock(),
          reportsApi.roomOccupancy(),
          reportsApi.patientCensus({ group: 'gender' }),
          reportsApi.patientCensus({ group: 'blood_group' }),
          departmentsApi.list(),
        ]);
        const depDoctors = await Promise.all(
          departments.map(async (d) => ({
            department: d,
            doctors: await reportsApi.departmentDoctors(d.department_id),
          }))
        );
        setData({ revenue, lowStock, occupancy, censusGender, censusBlood, depDoctors });
      } catch (err) {
        setError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p className="muted" style={{ margin: 0 }}>
            Revenue, stock, occupancy and demographic snapshots for management.
          </p>
        </div>
      </div>
      <ErrorAlert message={error} />

      {data && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div className="card">
            <h3>Revenue by payment method</h3>
            {data.revenue.length === 0 ? (
              <p className="muted">No payments recorded yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Payment method</th><th>Transactions</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {data.revenue.map((r) => (
                    <tr key={r.payment_method}>
                      <td>{r.payment_method}</td>
                      <td>{r.tx_count}</td>
                      <td>{formatCurrency(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h3>Low-stock medicines</h3>
            {data.lowStock.length === 0 ? (
              <p className="muted">Everything is within stock limits.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Medicine</th><th>Stock</th><th>Unit price</th><th>Manufacturer</th></tr>
                </thead>
                <tbody>
                  {data.lowStock.map((m) => (
                    <tr key={m.medicine_id}>
                      <td>{m.name}</td>
                      <td><span className="badge badge-red">{m.stock_quantity}</span></td>
                      <td>{formatCurrency(m.unit_price)}</td>
                      <td>{m.manufacturer || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h3>Room occupancy by type</h3>
            {data.occupancy.length === 0 ? (
              <p className="muted">No rooms registered.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Type</th><th>Total</th><th>Available</th><th>Occupied</th><th>Maintenance</th></tr>
                </thead>
                <tbody>
                  {data.occupancy.map((r) => (
                    <tr key={r.type}>
                      <td>{r.type}</td>
                      <td>{r.total_rooms}</td>
                      <td>{r.available}</td>
                      <td>{r.occupied}</td>
                      <td>{r.maintenance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h3>Patient census</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <div>
                <h4 style={{ margin: '6px 0' }}>By gender</h4>
                {data.censusGender.length === 0 ? (
                  <p className="muted">No patients yet.</p>
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Gender</th><th>Count</th></tr></thead>
                    <tbody>
                      {data.censusGender.map((g) => (
                        <tr key={g.gender}><td>{g.gender || 'Not set'}</td><td>{g.patient_count}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <h4 style={{ margin: '6px 0' }}>By blood group</h4>
                {data.censusBlood.length === 0 ? (
                  <p className="muted">No patients yet.</p>
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Blood group</th><th>Count</th></tr></thead>
                    <tbody>
                      {data.censusBlood.map((b) => (
                        <tr key={b.blood_group}><td>{b.blood_group || 'Not set'}</td><td>{b.patient_count}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Doctors by department</h3>
            {data.depDoctors.every((d) => d.doctors.length === 0) ? (
              <p className="muted">No doctors assigned yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Department</th><th>Doctor</th><th>Specialization</th></tr>
                </thead>
                <tbody>
                  {data.depDoctors.map((d) =>
                    d.doctors.map((doc) => (
                      <tr key={`${d.department.department_id}-${doc.doctor_id}`}>
                        <td>{d.department.name}</td>
                        <td>Dr. {doc.name}</td>
                        <td>{doc.specialization || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}