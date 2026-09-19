import { useNavigate } from 'react-router-dom';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import useUnreadMessages from '../hooks/useUnreadMessages';

export default function MessageBell({ style }) {
  const navigate = useNavigate();
  const { total } = useUnreadMessages();

  return (
    <button
      onClick={() => navigate('/messages')}
      aria-label={total > 0 ? `Mensajes — ${total} sin leer` : 'Mensajes'}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line)',
        background: 'var(--paper)', cursor: 'pointer', flexShrink: 0,
        ...style,
      }}
    >
      <ChatBubbleLeftRightIcon style={{ width: 18, height: 18, color: 'var(--ink-soft)' }} aria-hidden="true" />
      {total > 0 && (
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
