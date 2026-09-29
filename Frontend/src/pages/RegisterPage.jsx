import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerPatient } from '../api/auth';
import { apiErrorMessage } from '../api/client';
import { ErrorAlert, SuccessAlert } from '../components/Alerts';
import { todayISO } from '../utils/format';

const GENDERS = ['Male', 'Female', 'Other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const emptyForm = {
  name: '',
  username: '',
  password: '',
  dob: '',
  gender: '',
  blood_group: '',
  phone: '',
  emergency_contact: '',
  address: '',
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      await registerPatient({
        name: form.name,
        username: form.username,
        password: form.password,
        dob: form.dob || null,
        gender: form.gender || null,
        blood_group: form.blood_group || null,
        phone: form.phone || null,
        emergency_contact: form.emergency_contact || null,
        address: form.address || null,
      });
      setSuccess('Account created! You can now sign in.');
      setForm(emptyForm);
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <h1>Create your patient account</h1>
        <p className="auth-subtitle">
          Book appointments, request an ambulance, and pay your bills online.
        </p>

        <ErrorAlert message={error} />
        <SuccessAlert message={success} />

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Full name *</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="field">
            <label>Username *</label>
            <input value={form.username} onChange={(e) => set('username', e.target.value)} required />
          </div>
          <div className="field">
            <label>Password *</label>
            <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required />
            <span className="field-hint">At least 8 characters, with a letter and a number.</span>
          </div>
          <div className="field">
            <label>Date of birth</label>
            <input type="date" max={todayISO()} value={form.dob} onChange={(e) => set('dob', e.target.value)} />
            <span className="field-hint">Must be a date in the past.</span>
          </div>
          <div className="field">
            <label>Gender</label>
            <select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="">-- select --</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Blood group</label>
            <select value={form.blood_group} onChange={(e) => set('blood_group', e.target.value)}>
              <option value="">-- select --</option>
              {BLOOD_GROUPS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="field">
            <label>Emergency contact</label>
            <input value={form.emergency_contact} onChange={(e) => set('emergency_contact', e.target.value)} />
          </div>
          <div className="field">
            <label>Address</label>
            <textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
        <p className="muted mt-2" style={{ fontSize: 13 }}>
          Doctor or staff member? Your administrator sets up your account for you - just{' '}
          <Link to="/login">sign in</Link> with the credentials you were given.
        </p>
      </div>
    </div>
  );
}
