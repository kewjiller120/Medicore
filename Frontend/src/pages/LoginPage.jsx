import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { ErrorAlert } from '../components/Alerts';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username, password);
      const dest = location.state?.from?.pathname || '/dashboard';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-back-link">
          ← Back to MediCore
        </Link>
        <h1>MediCore</h1>
        <p className="auth-subtitle">Hospital Management System - sign in to continue</p>

        <ErrorAlert message={error} />

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="auth-switch">
          New patient? <Link to="/register">Create an account</Link>
        </div>
        <p className="muted mt-2" style={{ fontSize: 13 }}>
          Doctors and staff: your account is created by an administrator - you don't need to register.
        </p>

        <div className="demo-creds">
          <strong>Demo accounts</strong> (password: <code>Demo@1234</code>, admin: <code>Admin@12345</code>)<br />
          admin / dr.karim / reception1 / nurse1 / pharma1 / labtech1 / driver1 / accountant1 / patient1
        </div>
      </div>
    </div>
  );
}
