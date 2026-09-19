import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

/**
 * Shared destructive-action confirmation modal — replaces the native
 * browser `confirm()` used inconsistently across Clubs.jsx (remove
 * admin, delete court) and Players.jsx (delete player) with something
 * that matches the app's visual language, and that the user can't
 * dismiss by accident the way a native confirm() sometimes gets muscle-
 * memory-clicked through.
 *
 * `requireTypedConfirmation`: when true, the confirm button stays
 * disabled until the user types the given word (defaults to "eliminar")
 * — for the handful of actions serious enough to want that extra bit of
 * friction (kept lighter than Clubs.jsx's existing random-code flow for
 * deleting a whole club, which stays as-is for that one very destructive
 * action).
 */
export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Eliminar',
  danger = true,
  requireTypedConfirmation = false,
  confirmWord = 'eliminar',
  onConfirm,
  onClose,
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const locked = requireTypedConfirmation && typed.trim().toLowerCase() !== confirmWord.toLowerCase();

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (ex) {
      setError(ex?.response?.data?.error || 'Error al confirmar');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--paper)', borderRadius: 16, padding: 22, width: '100%', maxWidth: 380,
        border: '1px solid var(--line)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: danger ? 'var(--crimson)' : 'var(--ink)' }}>
            {title}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>
            <XMarkIcon style={{ width: 20, height: 20 }} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5, marginBottom: requireTypedConfirmation ? 14 : 18 }}>
          {message}
        </p>

        {requireTypedConfirmation && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>
              Escribe "{confirmWord}" para confirmar
            </label>
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              autoFocus
              style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px',
                fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: 'var(--crimson)', background: 'var(--crimson-soft)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--line)',
              background: 'var(--bone-2)', color: 'var(--ink-soft)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            Cancelar
          </button>
          <button type="button" onClick={handleConfirm} disabled={busy || locked}
            style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
              background: (busy || locked) ? 'var(--line)' : (danger ? 'var(--crimson)' : 'var(--court)'),
              color: (busy || locked) ? 'var(--ink-soft)' : '#fff',
              fontWeight: 700, cursor: (busy || locked) ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
