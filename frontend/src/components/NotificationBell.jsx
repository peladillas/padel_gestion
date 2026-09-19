import { useNavigate } from 'react-router-dom';
import { BellIcon } from '@heroicons/react/24/outline';
import useUnreadNotifications from '../hooks/useUnreadNotifications';

export default function NotificationBell({ style }) {
  const navigate = useNavigate();
  const { count } = useUnreadNotifications();

  return (
    <button
      onClick={() => navigate('/notifications')}
      aria-label={count > 0 ? `Notificaciones — ${count} sin leer` : 'Notificaciones'}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line)',
        background: 'var(--paper)', cursor: 'pointer', flexShrink: 0,
        ...style,
      }}
    >
      <BellIcon style={{ width: 18, height: 18, color: 'var(--ink-soft)' }} aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%',
            background: 'var(--crimson)', border: '1.5px solid var(--paper)',
          }}
        />
      )}
    </button>
  );
}
