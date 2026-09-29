import { useEffect, useState } from 'react';
import { driverAssignmentsApi } from '../api/driverAssignments';
import { staffApi } from '../api/staff';
import { ambulancesApi } from '../api/ambulances';
import Modal from '../components/Modal';
import DynamicForm from '../components/DynamicForm';
import LoadingSpinner from '../components/LoadingSpinner';
import { ErrorAlert } from '../components/Alerts';
import { apiErrorMessage } from '../api/client';
import StatusBadge from '../components/StatusBadge';

export function DriverAssignmentsPage() {
  const [rows, setRows] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([driverAssignmentsApi.list(), staffApi.list({ role: 'Driver' }), ambulancesApi.list()])
      .then(([a, d, amb]) => {
        setRows(a);
        setDrivers(d);
        setAmbulances(amb);
      })
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleCreate(values) {
    setBusy(true);
    try {
      await driverAssignmentsApi.create(values);
      setShowCreate(false);
      load();
    } catch (err) {
      const e = new Error(apiErrorMessage(err));
      e.displayMessage = apiErrorMessage(err);
      setBusy(false);
      throw e;
    }
    setBusy(false);
  }

  async function handleRemove(row) {
    if (!window.confirm('Remove this driver-ambulance assignment?')) return;
    try {
      await driverAssignmentsApi.remove(row.staff_id, row.ambulance_id);
      load();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    }
  }

  const fields = [
    { name: 'staff_id', label: 'Driver', type: 'select', required: true, options: drivers.map((d) => ({ value: d.staff_id, label: d.name })) },
    { name: 'ambulance_id', label: 'Ambulance', type: 'select', required: true, options: ambulances.map((a) => ({ value: a.ambulance_id, label: a.vehicle_no })) },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Driver Assignments</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Assign driver
          </button>
        </div>
      </div>
      <ErrorAlert message={error} />

      {loading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <div className="table-wrap"><div className="empty-state">No driver assignments yet.</div></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Driver</th><th>Ambulance</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.staff_id}-${r.ambulance_id}`}>
                  <td>{r.driver_name}</td>
                  <td>{r.vehicle_no}</td>
                  <td><StatusBadge value={r.ambulance_status} /></td>
                  <td className="actions">
                    <button className="btn btn-sm btn-danger" onClick={() => handleRemove(r)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <Modal title="Assign driver to ambulance" onClose={() => setShowCreate(false)}>
          <DynamicForm fields={fields} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} busy={busy} submitLabel="Assign" />
        </Modal>
      )}
    </div>
  );
}

export function MyAmbulancePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    driverAssignmentsApi
      .mine()
      .then(setRows)
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="page-header">
        <h1>My Ambulance</h1>
      </div>
      <ErrorAlert message={error} />
      {rows.length === 0 ? (
        <div className="card">You are not currently assigned to an ambulance.</div>
      ) : (
        <div className="stat-grid">
          {rows.map((r) => (
            <div className="stat-card" key={r.ambulance_id}>
              <div className="stat-label">{r.vehicle_no}</div>
              <div style={{ marginBottom: 6 }}>
                <StatusBadge value={r.ambulance_status} />
              </div>
              <div className="muted">{r.current_location}</div>
            </div>
          ))}
        </div>
      )}
      <p className="muted mt-2">
        To update your ambulance's status or location, go to the Ambulances page.
      </p>
    </div>
  );
}
