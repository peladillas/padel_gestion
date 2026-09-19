import { useState, useEffect, useCallback } from 'react';
import { BellIcon, ArchiveBoxIcon, ArrowUturnLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { notificationService } from '../services/api';
import useUnreadNotifications from '../hooks/useUnreadNotifications';

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function NotificationRow({ n, onRead, onArchive, onUnarchive, archived }) {
  return (
    <div
      onClick={() => !n.isRead && onRead(n.id)}
      style={{
        display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 14,
        background: n.isRead ? 'var(--paper)' : 'var(--court-soft)',
        border: '1px solid var(--line)', cursor: n.isRead ? 'default' : 'pointer',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ marginTop: 3, flexShrink: 0 }}>
        {!n.isRead
          ? <span aria-hidden="true" style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', background: 'var(--court-deep)' }} />
          : <span style={{ display: 'block', width: 8, height: 8 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontWeight: n.isRead ? 600 : 800, fontSize: 13, color: 'var(--ink)' }}>{n.title}</span>
          <span style={{ fontSize: 11, color: 'var(--ink-soft)', flexShrink: 0, whiteSpace: 'nowrap' }}>{timeAgo(n.createdAt)}</span>
        </div>
        {n.body && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.4 }}>{n.body}</div>}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); archived ? onUnarchive(n.id) : onArchive(n.id); }}
        title={archived ? 'Restaurar' : 'Archivar'}
        aria-label={archived ? 'Restaurar notificación' : 'Archivar notificación'}
        style={{
          flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--ink-soft)', padding: 4, borderRadius: 8,
        }}
      >
        {archived
          ? <ArrowUturnLeftIcon style={{ width: 16, height: 16 }} aria-hidden="true" />
          : <ArchiveBoxIcon style={{ width: 16, height: 16 }} aria-hidden="true" />}
      </button>
    </div>
  );
}

export default function Notifications() {
  const [tab, setTab] = useState('inbox'); // 'inbox' | 'archived'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { refresh: refreshUnread } = useUnreadNotifications();

  const load = useCallback(async (which) => {
    setLoading(true); setError('');
    try {
      const r = await notificationService.getAll(which === 'archived');
      setItems(r.data || []);
    } catch { setError('No se pudieron cargar las notificaciones'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  const handleRead = async (id) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    try { await notificationService.markRead(id); refreshUnread(); } catch { /* optimistic, ignore */ }
  };

  const handleArchive = async (id) => {
    setItems(prev => prev.filter(n => n.id !== id));
    try { await notificationService.archive(id); refreshUnread(); } catch { load(tab); }
  };

  const handleUnarchive = async (id) => {
    setItems(prev => prev.filter(n => n.id !== id));
    try { await notificationService.unarchive(id); } catch { load(tab); }
  };

  const handleMarkAllRead = async () => {
    setItems(prev => prev.map(n => ({ ...n, isRead: true })));
    try { await notificationService.markAllRead(); refreshUnread(); } catch { load(tab); }
  };

  const hasUnread = items.some(n => !n.isRead);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
          <em style={{ color: 'var(--court-deep)', fontStyle: 'normal' }}>Notificaciones.</em>
        </h1>
        {tab === 'inbox' && hasUnread && (
          <button onClick={handleMarkAllRead}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--court-deep)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            <CheckCircleIcon style={{ width: 15, height: 15 }} aria-hidden="true" />
            Marcar todas como leídas
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, background: 'var(--bone-3)', borderRadius: 12, padding: 4 }}>
        {[['inbox', 'Bandeja'], ['archived', 'Archivadas']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: '8px 2px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: tab === id ? 'white' : 'transparent', color: tab === id ? 'var(--ink-2)' : 'var(--ink-soft)' }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink-soft)', fontSize: 13 }}>Cargando…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--crimson-soft)', borderRadius: 16, fontSize: 13, color: 'var(--crimson)' }}>
          {error}
          <button onClick={() => load(tab)} style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', color: 'var(--crimson)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}>Reintentar</button>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-soft)' }}>
          <BellIcon style={{ width: 36, height: 36, margin: '0 auto 10px', opacity: 0.4 }} aria-hidden="true" />
          <div style={{ fontSize: 13 }}>{tab === 'inbox' ? 'No tenés notificaciones' : 'No hay notificaciones archivadas'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(n => (
            <NotificationRow key={n.id} n={n} archived={tab === 'archived'}
              onRead={handleRead} onArchive={handleArchive} onUnarchive={handleUnarchive} />
          ))}
        </div>
      )}
    </div>
  );
}
