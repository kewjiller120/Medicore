import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { visibleNavItems } from '../utils/roles';
import NotificationBell from './NotificationBell';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = visibleNavItems(user);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const roleLabel =
    user?.role === 'staff' ? `Staff · ${user.staffRole}` : user?.role ? user.role[0].toUpperCase() + user.role.slice(1) : '';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          Medi<span>Core</span>
        </div>
        <nav className="sidebar-nav">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="btn btn-sm" style={{ width: '100%' }} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <NotificationBell />
          </div>
          <div className="topbar-user">
            <span className="role-badge">{roleLabel}</span>
            <NavLink to="/profile" className="muted">
              {user?.name || user?.username}
            </NavLink>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
