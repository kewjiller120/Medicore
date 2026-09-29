import { useEffect, useState } from 'react';
import { doctorsApi } from '../api/doctors';
import { departmentsApi } from '../api/departments';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import DynamicForm from '../components/DynamicForm';
import FilterBar from '../components/FilterBar';
import LoadingSpinner from '../components/LoadingSpinner';
import { ErrorAlert } from '../components/Alerts';
import { apiErrorMessage } from '../api/client';
import StatusBadge from '../components/StatusBadge';

const STATUSES = ['Active', 'Inactive', 'On Leave'];

export default function DoctorsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filterParams, setFilterParams] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([doctorsApi.list(filterParams), departmentsApi.list()])
      .then(([d, dep]) => {
        setRows(d);
        setDepartments(dep);
      })
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(load, [filterParams]);

  const isAdmin = user?.role === 'admin';

  function canEditRow(row) {
    return isAdmin || (user?.role === 'doctor' && user.doctorId === row.doctor_id);
  }

  // Admins can rename/reassign department; a doctor editing their own
  // profile can only touch the clinical/contact fields - mirrors the
  // backend's field-level ownership rule exactly.
  const fields = isAdmin
    ? [
        { name: 'name', label: 'Name', required: true },
        {
          name: 'department_id',
          label: 'Department',
          type: 'select',
          options: departments.map((d) => ({ value: d.department_id, label: d.name })),
        },
        { name: 'specialization', label: 'Specialization' },
        { name: 'qualification', label: 'Qualification' },
        { name: 'phone', label: 'Phone' },
        { name: 'email', label: 'Email' },
        { name: 'status', label: 'Status', type: 'select', options: STATUSES.map((s) => ({ value: s, label: s })) },
      ]
    : [
        { name: 'specialization', label: 'Specialization' },
        { name: 'qualification', label: 'Qualification' },
        { name: 'phone', label: 'Phone' },
        { name: 'email', label: 'Email' },
        { name: 'status', label: 'Status', type: 'select', options: STATUSES.map((s) => ({ value: s, label: s })) },
      ];

  async function handleUpdate(values) {
    setBusy(true);
    try {
      await doctorsApi.update(editing.doctor_id, values);
      setEditing(null);
      load();
    } catch (err) {
      const e = new Error(apiErrorMessage(err));
      e.displayMessage = apiErrorMessage(err);
      setBusy(false);
      throw e;
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Doctors</h1>
      </div>
      <ErrorAlert message={error} />
      <FilterBar
        filters={[
          { name: 'search', label: 'Search name / specialization', type: 'search', placeholder: 'Search doctors...' },
          {
            name: 'department_id',
            label: 'All departments',
            type: 'select',
            options: departments.map((d) => ({ value: d.department_id, label: d.name })),
          },
        ]}
        onChange={setFilterParams}
      />

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Department</th>
                <th>Specialization</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.doctor_id}>
                  <td>{r.name}</td>
                  <td>{r.department_name || <span className="muted">-</span>}</td>
                  <td>{r.specialization || <span className="muted">-</span>}</td>
                  <td>{r.phone || <span className="muted">-</span>}</td>
                  <td>{r.email || <span className="muted">-</span>}</td>
                  <td><StatusBadge value={r.status} /></td>
                  <td className="actions">
                    {canEditRow(r) && (
                      <button className="btn btn-sm" onClick={() => setEditing(r)}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={`Edit Dr. ${editing.name}`} onClose={() => setEditing(null)}>
          <DynamicForm fields={fields} initialValues={editing} onSubmit={handleUpdate} onCancel={() => setEditing(null)} busy={busy} />
        </Modal>
      )}
    </div>
  );
}
