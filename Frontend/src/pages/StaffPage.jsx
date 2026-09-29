import { useEffect, useState } from 'react';
import { staffApi } from '../api/staff';
import { departmentsApi } from '../api/departments';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import DynamicForm from '../components/DynamicForm';
import FilterBar from '../components/FilterBar';
import LoadingSpinner from '../components/LoadingSpinner';
import { ErrorAlert } from '../components/Alerts';
import { apiErrorMessage } from '../api/client';
import { STAFF_ROLES } from '../utils/roles';

export default function StaffPage() {
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
    Promise.all([staffApi.list(filterParams), departmentsApi.list()])
      .then(([s, dep]) => {
        setRows(s);
        setDepartments(dep);
      })
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(load, [filterParams]);

  const isAdmin = user?.role === 'admin';

  function canEditRow(row) {
    return isAdmin || (user?.role === 'staff' && user.staffId === row.staff_id);
  }

  const fields = isAdmin
    ? [
        { name: 'name', label: 'Name', required: true },
        {
          name: 'department_id',
          label: 'Department',
          type: 'select',
          options: departments.map((d) => ({ value: d.department_id, label: d.name })),
        },
        { name: 'role', label: 'Role', type: 'select', options: STAFF_ROLES.map((r) => ({ value: r, label: r })) },
        { name: 'phone', label: 'Phone' },
        { name: 'shift_timing', label: 'Shift timing' },
      ]
    : [
        { name: 'phone', label: 'Phone' },
        { name: 'shift_timing', label: 'Shift timing' },
      ];

  async function handleUpdate(values) {
    setBusy(true);
    try {
      await staffApi.update(editing.staff_id, values);
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
        <h1>Staff</h1>
      </div>
      <ErrorAlert message={error} />
      <FilterBar
        filters={[
          { name: 'search', label: 'Search name', type: 'search', placeholder: 'Search staff...' },
          { name: 'role', label: 'All roles', type: 'select', options: STAFF_ROLES.map((r) => ({ value: r, label: r })) },
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
                <th>Role</th>
                <th>Department</th>
                <th>Phone</th>
                <th>Shift</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.staff_id}>
                  <td>{r.name}</td>
                  <td><span className="badge badge-blue">{r.role}</span></td>
                  <td>{r.department_name || <span className="muted">-</span>}</td>
                  <td>{r.phone || <span className="muted">-</span>}</td>
                  <td>{r.shift_timing || <span className="muted">-</span>}</td>
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
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <DynamicForm fields={fields} initialValues={editing} onSubmit={handleUpdate} onCancel={() => setEditing(null)} busy={busy} />
        </Modal>
      )}
    </div>
  );
}
