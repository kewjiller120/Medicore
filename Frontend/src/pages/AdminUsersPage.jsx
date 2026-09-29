import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../api/admin';
import { departmentsApi } from '../api/departments';
import Modal from '../components/Modal';
import DynamicForm from '../components/DynamicForm';
import LoadingSpinner from '../components/LoadingSpinner';
import { ErrorAlert, SuccessAlert } from '../components/Alerts';
import { apiErrorMessage } from '../api/client';
import { formatDateTime } from '../utils/format';
import { STAFF_ROLES } from '../utils/roles';

const TOP_LEVEL_ROLES = ['admin', 'doctor', 'staff'];

/**
 * Admin-only account management: create a login for any role (including
 * another admin), reset a user's password, or delete an account. This is
 * the "sign-up" surface for accounts that aren't self-registered.
 */
export default function AdminUsersPage() {
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createRole, setCreateRole] = useState('doctor');
  const [resetFor, setResetFor] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await adminApi.listUsers());
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    departmentsApi.list().then(setDepartments).catch(() => {});
  }, [load]);

  async function handleCreate(values) {
    setBusy(true);
    try {
      await adminApi.createUser(values);
      setShowCreate(false);
      setSuccess(`${values.role} account "${values.username}" created.`);
      await load();
    } catch (err) {
      const e = new Error(apiErrorMessage(err));
      e.displayMessage = apiErrorMessage(err);
      setBusy(false);
      throw e;
    }
    setBusy(false);
  }

  async function handleResetPassword(values) {
    setBusy(true);
    try {
      await adminApi.updateUser(resetFor.user_id, { newPassword: values.newPassword });
      setResetFor(null);
      setSuccess(`Password reset for "${resetFor.username}". Their other sessions were logged out.`);
    } catch (err) {
      const e = new Error(apiErrorMessage(err));
      e.displayMessage = apiErrorMessage(err);
      setBusy(false);
      throw e;
    }
    setBusy(false);
  }

  async function handleDelete(row) {
    if (!window.confirm(`Delete the account "${row.username}" (${row.role})? This cannot be undone.`)) return;
    try {
      await adminApi.deleteUser(row.user_id);
      await load();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    }
  }

  const departmentOptions = departments.map((d) => ({ value: d.department_id, label: d.name }));

  const baseFields = [
    { name: 'username', label: 'Username', required: true },
    { name: 'password', label: 'Temporary password', type: 'password', required: true, hint: 'At least 8 characters, with a letter and a number' },
    {
      name: 'role',
      label: 'Role',
      type: 'select',
      required: true,
      options: TOP_LEVEL_ROLES.map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) })),
    },
  ];
  const doctorFields = [
    { name: 'name', label: 'Full name', required: true },
    { name: 'department_id', label: 'Department', type: 'select', options: departmentOptions },
    { name: 'specialization', label: 'Specialization' },
    { name: 'qualification', label: 'Qualification' },
    { name: 'phone', label: 'Phone' },
    { name: 'email', label: 'Email' },
  ];
  const staffFields = [
    { name: 'name', label: 'Full name', required: true },
    { name: 'department_id', label: 'Department', type: 'select', options: departmentOptions },
    { name: 'staffRole', label: 'Staff role', type: 'select', required: true, options: STAFF_ROLES.map((r) => ({ value: r, label: r })) },
    { name: 'phone', label: 'Phone' },
    { name: 'shift_timing', label: 'Shift timing' },
  ];

  const createFields =
    createRole === 'doctor' ? [...baseFields, ...doctorFields] : createRole === 'staff' ? [...baseFields, ...staffFields] : baseFields;

  return (
    <div>
      <div className="page-header">
        <h1>User Accounts</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => { setCreateRole('doctor'); setShowCreate(true); }}>
            + Create account
          </button>
        </div>
      </div>

      <ErrorAlert message={error} />
      <SuccessAlert message={success} />

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>ID</th><th>Username</th><th>Name</th><th>Role</th><th>Last login</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.user_id}>
                  <td>{u.user_id}</td>
                  <td>{u.username}</td>
                  <td>{u.name}</td>
                  <td>{u.role === 'staff' ? `Staff · ${u.staff_role}` : u.role}</td>
                  <td>{u.last_login ? formatDateTime(u.last_login) : <span className="muted">Never</span>}</td>
                  <td className="actions">
                    <button className="btn btn-sm" onClick={() => setResetFor(u)}>Reset password</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <Modal title="Create account" onClose={() => setShowCreate(false)} width={560}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Account type</label>
            <select value={createRole} onChange={(e) => setCreateRole(e.target.value)}>
              <option value="doctor">Doctor</option>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {/* key forces the form to remount (and reset its internal state) whenever the role changes */}
          <DynamicForm
            key={createRole}
            fields={createFields.filter((f) => f.name !== 'role')}
            onSubmit={(values) => handleCreate({ ...values, role: createRole })}
            onCancel={() => setShowCreate(false)}
            busy={busy}
            submitLabel="Create account"
          />
        </Modal>
      )}

      {resetFor && (
        <Modal title={`Reset password - ${resetFor.username}`} onClose={() => setResetFor(null)}>
          <DynamicForm
            fields={[{ name: 'newPassword', label: 'New password', type: 'password', required: true, hint: 'At least 8 characters, with a letter and a number' }]}
            onSubmit={handleResetPassword}
            onCancel={() => setResetFor(null)}
            busy={busy}
            submitLabel="Reset password"
          />
        </Modal>
      )}
    </div>
  );
}
