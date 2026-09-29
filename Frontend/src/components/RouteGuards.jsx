import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';
import { isAllowed } from '../utils/roles';

/** Blocks the route entirely until we know whether a session exists. */
export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingSpinner label="Checking session..." />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

/** Further restricts a route to specific top-level roles / staff sub-roles. */
export function RequireRole({ roles, staffRoles, children }) {
  const { user } = useAuth();
  if (!isAllowed(user, roles, staffRoles)) {
    return (
      <div className="card">
        <h2>Access restricted</h2>
        <p className="muted">You don't have permission to view this page.</p>
      </div>
    );
  }
  return children;
}
