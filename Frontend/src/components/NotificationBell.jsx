import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api/notifications';
import { apiErrorMessage } from '../api/client';
import { formatDateTime } from '../utils/format';

const POLL_INTERVAL_MS = 30000;

/**
 * Bell in the top bar with an unread badge. Polls the unread count every
 * 30s (plus on mount/open), and drops down the latest notifications.
 * Opening a notification marks it read and navigates to its link.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const { count: c } = await notificationsApi.unreadCount();
        if (alive) setCount(c);
      } catch {
        /* network blip - keep whatever we had */
      }
    }
    refresh();
    const t = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Close the dropdown when clicking anywhere else.
  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setError('');
      try {
        const list = await notificationsApi.list({ limit: 25 });
        setItems(list);
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    }
  }

  async function markAllRead() {
    try {
      await notificationsApi.markAllRead();
    } catch {
      /* best effort */
    }
    setCount(0);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function openItem(item) {
    if (!item.is_read) {
      await notificationsApi.markRead(item.notification_id).catch(() => {});
      setCount((c) => Math.max(0, c - 1));
      setItems((prev) =>
        prev.map((x) => (x.notification_id === item.notification_id ? { ...x, is_read: true } : x))
      );
    }
    setOpen(false);
    if (item.link) navigate(item.link);
  }

  return (
    <div className="notification-bell" ref={wrapRef}>
      <button className="btn btn-sm" onClick={toggle} aria-label="Notifications">
        🔔
        {count > 0 && <span className="badge badge-red notification-count">{count}</span>}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <strong>Notifications</strong>
            {count > 0 && (
              <button className="btn btn-sm" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {error && <div className="muted" style={{ padding: '6px 12px' }}>{error}</div>}
          {!error && items.length === 0 && (
            <div className="muted" style={{ padding: 12 }}>
              No notifications yet.
            </div>
          )}
          {items.map((n) => (
            <button
              key={n.notification_id}
              className={'notification-item' + (n.is_read ? '' : ' unread')}
              onClick={() => openItem(n)}
            >
              <div className="notification-title">{n.title}</div>
              <div className="muted" style={{ fontSize: 12 }}>{n.message}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{formatDateTime(n.created_at)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}