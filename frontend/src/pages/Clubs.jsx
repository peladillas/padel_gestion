import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { clubService, tournamentTypeService } from '../services/api';
import {
  BuildingOffice2Icon, PlusIcon, ChevronDownIcon, ChevronUpIcon,
  XMarkIcon, TrashIcon, PencilSquareIcon, MapPinIcon, EyeIcon,
} from '@heroicons/react/24/outline';
import Switch from '../components/ui/Switch';
import ConfirmModal from '../components/ui/ConfirmModal';
import { Link } from 'react-router-dom';
import EditClubModal from '../components/club/EditClubModal';
import ClubDetailModal from '../components/club/ClubDetailModal';
import ClubCourtsSection from '../components/club/ClubCourtsSection';
import { ServiceList } from '../components/club/clubServices';

const STATUS_COLOR = { active: 'var(--ok)', draft: 'var(--amber)', completed: 'var(--ink-soft)' };

// ── Shared styles ────────────────────────────────────────────────────────────
const inp = {
  border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px',
  fontSize: 13, background: 'var(--paper)', color: 'var(--ink)', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};
const label11 = {
  fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)',
  display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
};
const btnCancel = {
  flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--line)',
  background: 'var(--bone-2)', color: 'var(--ink-soft)', fontWeight: 600, cursor: 'pointer', fontSize: 13,
};
const btnPrimary = (disabled) => ({
  flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
  background: disabled ? 'var(--line)' : 'var(--court)', color: disabled ? 'var(--ink-soft)' : '#fff',
  fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13,
});

// ── Avatar mini ──────────────────────────────────────────────────────────────
function AvatarMini({ player, size = 32 }) {
  const initials = (player?.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  if (player?.avatarUrl)
    return <img src={player.avatarUrl} alt={player.name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--court-soft)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 800, color: 'var(--court-deep)', flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// ── Admin form modal (create or edit) ────────────────────────────────────────
function AdminFormModal({ clubId, admin, onClose, onSaved }) {
  const isEdit = !!admin;
  const [form, setForm] = useState({
    name:     admin?.player?.name               || '',
    email:    admin?.player?.user?.email        || '',
    username: admin?.player?.user?.username     || '',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleEmail = (e) => {
    const v = e.target.value;
    setForm(f => ({
      ...f, email: v,
      username: f.username ? f.username : v.split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, ''),
    }));
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { setErr('Nombre y email son requeridos'); return; }
    if (!isEdit && !form.password) { setErr('La contraseña es requerida'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { name: form.name, email: form.email, username: form.username };
      if (form.password) payload.password = form.password;
      const res = isEdit
        ? await clubService.updateAdmin(clubId, admin.player.id, payload)
        : await clubService.createAdmin(clubId, payload);
      onSaved(res.data);
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--paper)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400,
        border: '1px solid var(--line)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
            {isEdit ? 'Editar admin' : 'Nuevo admin'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>
            <XMarkIcon style={{ width: 20, height: 20 }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={label11}>NOMBRE</label>
            <input style={inp} value={form.name} onChange={set('name')} placeholder="Nombre completo" />
          </div>
          <div>
            <label style={label11}>EMAIL</label>
            <input type="email" style={inp} value={form.email} onChange={handleEmail} placeholder="admin@club.com" />
          </div>
          <div>
            <label style={label11}>USUARIO</label>
            <input style={inp} value={form.username} onChange={set('username')} placeholder="nombreusuario" />
          </div>
          <div>
            <label style={label11}>
              {isEdit ? 'NUEVA CONTRASEÑA (vacío = no cambiar)' : 'CONTRASEÑA'}
            </label>
            <input type="password" style={inp} value={form.password} onChange={set('password')} placeholder="••••••••" />
          </div>
          {err && (
            <div style={{ fontSize: 12, color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 8, padding: '8px 12px' }}>
              {err}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={btnCancel}>Cancelar</button>
            <button type="submit" disabled={saving} style={btnPrimary(saving)}>
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete club modal ────────────────────────────────────────────────────────
function DeleteClubModal({ club, onClose, onDeleted }) {
  const [code]     = useState(() => Math.random().toString(36).slice(2, 8).toUpperCase());
  const [input, setInput]   = useState('');
  const [deleting, setDeleting] = useState(false);
  const [err, setErr]       = useState('');

  const handleDelete = async () => {
    if (input !== code) { setErr('El código no coincide'); return; }
    setDeleting(true); setErr('');
    try {
      await clubService.delete(club.id);
      onDeleted(club.id);
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Error al eliminar');
      setDeleting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--paper)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400,
        border: '1px solid var(--line)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--crimson)' }}>Eliminar club</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>
            <XMarkIcon style={{ width: 20, height: 20 }} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 16, lineHeight: 1.5 }}>
          Esta acción eliminará <strong>{club.name}</strong> y todos sus admins de forma permanente.
          Los torneos quedarán sin club asignado.
        </p>
        <div style={{ background: 'var(--crimson-soft)', borderRadius: 12, padding: '14px 16px', textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crimson)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Código de confirmación
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--crimson)', letterSpacing: 8, fontFamily: 'monospace' }}>
            {code}
          </div>
        </div>
        <label style={label11}>Escribe el código para confirmar</label>
        <input style={{ ...inp, textAlign: 'center', letterSpacing: 4, fontWeight: 700, fontSize: 14 }}
          value={input} onChange={e => setInput(e.target.value.toUpperCase())}
          placeholder="XXXXXX" maxLength={6} autoFocus />
        {err && <div style={{ fontSize: 12, color: 'var(--crimson)', marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={btnCancel}>Cancelar</button>
          <button onClick={handleDelete} disabled={deleting || input !== code}
            style={{ ...btnPrimary(deleting || input !== code), background: input === code ? 'var(--crimson)' : 'var(--line)', flex: 1 }}>
            {deleting ? 'Eliminando…' : 'Eliminar club'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tournament types panel (super admin only) ────────────────────────────────
// Rebuilt to read the DB-backed tournament-type registry
// (GET /api/tournament-types) instead of a hardcoded list of the old
// Express Strategy Registry's string keys (round_robin, mexicano...),
// which no longer matches what the backend can actually run. Also
// collapses the old two-list (structures + pairing systems) allow-list
// into one, since a tournament TYPE now bundles its own pairing mode as
// part of its config rather than the club choosing it separately.
function TournamentTypesPanel({ clubId, initialStructures }) {
  const [types,    setTypes]    = useState(null); // null = still loading
  const [allowed,  setAllowed]  = useState(initialStructures ?? null); // null = all allowed
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    tournamentTypeService.getAll()
      .then(r => setTypes(r.data || []))
      .catch(() => setLoadError('No se pudieron cargar los tipos de torneo'));
  }, []);

  const allAllowed = allowed === null;

  const toggleAll = () => setAllowed(a => a === null ? (types||[]).map(t=>t.key) : null);

  const toggleItem = (key) => {
    setAllowed(cur => {
      const list = cur ?? (types||[]).map(t=>t.key);
      return list.includes(key) ? list.filter(k=>k!==key) : [...list, key];
    });
  };

  const handleSave = async () => {
    setSaving(true); setMsg('');
    try {
      await clubService.updateTournamentTypes(clubId, { allowedStructures: allowed });
      setMsg('Guardado');
      setTimeout(() => setMsg(''), 2500);
    } catch { setMsg('Error al guardar'); }
    finally { setSaving(false); }
  };

  const row = { display:'flex', alignItems:'center', gap:8, padding:'6px 0', cursor:'pointer' };
  const chk = (checked) => ({
    width:16, height:16, borderRadius:4, border:'2px solid var(--court)',
    background: checked ? 'var(--court)' : 'transparent',
    flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
  });

  return (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:'var(--ink-soft)',textTransform:'uppercase',
        letterSpacing:'0.06em',marginBottom:10}}>
        Tipos de torneo disponibles
      </div>

      {loadError && (
        <div style={{fontSize:12,color:'var(--crimson)',background:'var(--crimson-soft)',borderRadius:8,padding:'8px 12px',marginBottom:10}}>
          {loadError}
        </div>
      )}

      {types === null && !loadError ? (
        <div style={{fontSize:12,color:'var(--ink-soft)',padding:'8px 0'}}>Cargando tipos de torneo…</div>
      ) : (
        <>
          <div style={row} onClick={toggleAll}>
            <div style={chk(allAllowed)}>
              {allAllowed && <span style={{color:'#fff',fontSize:10,fontWeight:700}}>✓</span>}
            </div>
            <span style={{fontSize:13,color:'var(--ink-soft)',fontStyle:'italic'}}>Todos (sin restricción)</span>
          </div>
          {(types||[]).map(({key,label,description})=>{
            const on = allowed === null ? true : allowed.includes(key);
            return (
              <div key={key} style={{...row, opacity: allAllowed ? 0.4 : 1, pointerEvents: allAllowed ? 'none':'auto', alignItems:'flex-start'}}
                onClick={()=>toggleItem(key)}>
                <div style={{...chk(on && !allAllowed), marginTop:2}}>
                  {on && !allAllowed && <span style={{color:'#fff',fontSize:10,fontWeight:700}}>✓</span>}
                </div>
                <div>
                  <div style={{fontSize:13,color:'var(--ink)'}}>{label}</div>
                  {description && <div style={{fontSize:11,color:'var(--ink-soft)',marginTop:1}}>{description}</div>}
                </div>
              </div>
            );
          })}

          <div style={{marginTop:12,display:'flex',alignItems:'center',gap:10}}>
            <button onClick={handleSave} disabled={saving}
              style={{padding:'8px 18px',borderRadius:9,border:'none',
                background:saving?'var(--line)':'var(--court)',color:'#fff',
                fontWeight:700,fontSize:13,cursor:saving?'not-allowed':'pointer'}}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            {msg && <span style={{fontSize:12,color:msg==='Guardado'?'var(--ok)':'var(--crimson)'}}>{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}

// ── Courts panel ────────────────────────────────────────────────────────────
// ── Club detail ──────────────────────────────────────────────────────────────
function ClubDetail({ clubId, isSuperAdmin, onMembershipChange }) {
  const [detail, setDetail]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState('');
  const [adminModal, setAdminModal] = useState(null); // null | 'new' | membership-object
  const [removeTarget, setRemoveTarget] = useState(null); // null | { playerId, name }

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { const res = await clubService.getById(clubId); setDetail(res.data); }
    catch { setLoadError('No se pudo cargar el detalle del club'); }
    finally { setLoading(false); }
  }, [clubId]);

  useEffect(() => { load(); }, [load]);

  const confirmRemove = async () => {
    const { playerId } = removeTarget;
    await clubService.removeAdmin(clubId, playerId);
    setDetail(d => ({ ...d, memberships: d.memberships.filter(m => m.player.id !== playerId) }));
    onMembershipChange?.();
    setRemoveTarget(null);
  };

  const handleSaved = (membership) => {
    if (adminModal === 'new') {
      setDetail(d => ({ ...d, memberships: [...(d.memberships || []), membership] }));
    } else {
      setDetail(d => ({
        ...d,
        memberships: d.memberships.map(m => m.player.id === adminModal.player.id ? membership : m)
      }));
    }
    setAdminModal(null);
    onMembershipChange?.();
  };

  if (loading) return <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>Cargando…</div>;
  if (loadError) return <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--crimson)' }}>{loadError}</div>;
  if (!detail)  return null;

  const admins = detail.memberships || [];

  return (
    <div style={{ padding: '0 16px 16px' }}>

      {/* Admins */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 10 }}>
        Admins ({admins.length})
      </div>

      {admins.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', padding: '10px 0', marginBottom: 8 }}>
          Este club aún no tiene admins.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {admins.map(m => (
            <div key={m.player?.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', background: 'var(--bone-2)', borderRadius: 10 }}>
              <AvatarMini player={m.player} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.player?.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                  {m.player?.user?.email}
                  {m.player?.user?.username ? ` · @${m.player.user.username}` : ''}
                </div>
              </div>
              {isSuperAdmin && (
                <>
                  <button onClick={() => setAdminModal(m)} title="Editar"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: 4, flexShrink: 0 }}>
                    <PencilSquareIcon style={{ width: 15, height: 15 }} />
                  </button>
                  <button onClick={() => setRemoveTarget({ playerId: m.player.id, name: m.player.name })} title="Eliminar admin"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crimson)', padding: 4, flexShrink: 0 }}>
                    <XMarkIcon style={{ width: 15, height: 15 }} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {isSuperAdmin && (
        <button onClick={() => setAdminModal('new')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            borderRadius: 10, border: '1px dashed var(--court)', background: 'var(--court-soft)',
            color: 'var(--court-deep)', fontWeight: 600, fontSize: 12, cursor: 'pointer', marginBottom: 14 }}>
          <PlusIcon style={{ width: 14, height: 14 }} />
          Nuevo admin
        </button>
      )}

      {/* Courts */}
      <ClubCourtsSection clubId={clubId} />

      {/* Separator */}
      <div style={{ height: 1, background: 'var(--line)', margin: '14px 0' }} />

      {/* Tournament types (super admin only) */}
      {isSuperAdmin && (
        <>
          <TournamentTypesPanel
            clubId={clubId}
            initialStructures={detail.allowedStructures ?? null}
          />
          <div style={{ height: 1, background: 'var(--line)', margin: '14px 0' }} />
        </>
      )}

      {/* Tournaments summary */}
      {(detail.tournamentInstances || []).length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 8 }}>
            Torneos ({detail.tournamentInstances.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {detail.tournamentInstances.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 12px', background: 'var(--bone-2)', borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{t.name}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[t.status] || 'var(--ink-soft)' }}>
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Admin modal */}
      {adminModal && (
        <AdminFormModal
          clubId={clubId}
          admin={adminModal === 'new' ? null : adminModal}
          onClose={() => setAdminModal(null)}
          onSaved={handleSaved}
        />
      )}

      {removeTarget && (
        <ConfirmModal
          title="Eliminar admin"
          message={`¿Eliminar a ${removeTarget.name} como admin? Su cuenta pasará a ser de jugador.`}
          confirmLabel="Eliminar admin"
          onConfirm={confirmRemove}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}

// ── Club card ────────────────────────────────────────────────────────────────
function ClubCard({ club, isSuperAdmin, onUpdated, onDeleted }) {
  const [open, setOpen]           = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showEdit, setShowEdit]   = useState(false);
  const [preview, setPreview]     = useState(null);   // the public card, as players see it
  const [previewErr, setPreviewErr] = useState('');

  const openPreview = async (e) => {
    const opener = e.currentTarget;   // focus goes back here when the sheet closes
    setPreviewErr('');
    try { setPreview({ card: (await clubService.card(club.id)).data, opener }); }
    catch { setPreviewErr('No se pudo cargar la ficha pública.'); }
  };

  return (
    <div style={{ background: 'var(--paper)', borderRadius: 16, border: '1px solid var(--line)', overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button onClick={() => setOpen(v => !v)}
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--court-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {club.logoUrl
              ? <img src={club.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} />
              : <BuildingOffice2Icon style={{ width: 22, height: 22, color: 'var(--court-deep)' }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{club.name}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>/{club.slug}</div>
            {club.description && (
              <div style={{ fontSize: 12, color: 'var(--ink-mid)', marginTop: 4, lineHeight: 1.35 }}>{club.description}</div>
            )}
            {(club.address || club.city) && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>{[club.address, club.city].filter(Boolean).join(', ')}</div>}
            {club.services?.length > 0 && <div style={{ marginTop: 8 }}><ServiceList keys={club.services} max={6} /></div>}
            {club.profile && club.profile.percent < 100 && (
              <div style={{ marginTop: 8 }} title={`Falta: ${club.profile.missing.join(', ')}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, maxWidth: 160, height: 5, borderRadius: 3, background: 'var(--bone-3)', overflow: 'hidden' }}>
                    <div style={{ width: `${club.profile.percent}%`, height: '100%', background: 'var(--court)' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>Perfil {club.profile.percent}%</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>Falta: {club.profile.missing.slice(0, 3).join(', ')}{club.profile.missing.length > 3 ? '…' : ''}</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{club._count?.memberships ?? 0}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>admins</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{club._count?.tournamentInstances ?? 0}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>torneos</div>
            </div>
            {open
              ? <ChevronUpIcon style={{ width: 18, height: 18, color: 'var(--ink-soft)' }} />
              : <ChevronDownIcon style={{ width: 18, height: 18, color: 'var(--ink-soft)' }} />}
          </div>
        </button>
        <button onClick={openPreview} title="Ver ficha pública" aria-label="Ver ficha pública"
          style={{ padding: '14px 14px', background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ink-soft)', borderLeft: '1px solid var(--line)', flexShrink: 0 }}>
          <EyeIcon style={{ width: 17, height: 17 }} />
        </button>
        {/* The list is already scoped: a club admin only sees their own club(s). */}
        <button onClick={() => setShowEdit(true)} title="Editar club"
          style={{ padding: '14px 14px', background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ink-soft)', borderLeft: '1px solid var(--line)', flexShrink: 0 }}>
          <PencilSquareIcon style={{ width: 17, height: 17 }} />
        </button>
        {isSuperAdmin && (
          <button onClick={() => setShowDelete(true)} title="Eliminar club"
            style={{ padding: '14px 14px', background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--crimson)', borderLeft: '1px solid var(--line)', flexShrink: 0 }}>
            <TrashIcon style={{ width: 17, height: 17 }} />
          </button>
        )}
      </div>

      {open && (
        <>
          <div style={{ height: 1, background: 'var(--line)' }} />
          <ClubDetail clubId={club.id} isSuperAdmin={isSuperAdmin} onMembershipChange={onUpdated} />
        </>
      )}

      {previewErr && <div role="alert" style={{ padding: '0 16px 10px', fontSize: 12, color: 'var(--crimson)' }}>{previewErr}</div>}
      {preview && <ClubDetailModal club={preview.card} returnFocusTo={preview.opener} onClose={() => setPreview(null)} />}

      {showEdit && (
        <EditClubModal club={club} canEditIdentity={isSuperAdmin} onClose={() => setShowEdit(false)} onChanged={onUpdated} />
      )}

      {showDelete && (
        <DeleteClubModal
          club={club}
          onClose={() => setShowDelete(false)}
          onDeleted={(id) => { setShowDelete(false); onDeleted(id); }}
        />
      )}
    </div>
  );
}

// ── Create club modal (2 steps) ──────────────────────────────────────────────
function CreateClubModal({ onClose, onCreate }) {
  const [step, setStep]     = useState('club');
  const [clubForm, setClubForm] = useState({ name: '', slug: '', description: '' });
  const [adminForm, setAdminForm] = useState({ name: '', email: '', username: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const handleClubName = (v) => {
    setClubForm(f => ({ ...f, name: v, slug: v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') }));
  };
  const setAdm = (k) => (e) => setAdminForm(f => ({ ...f, [k]: e.target.value }));
  const handleAdmEmail = (e) => {
    const v = e.target.value;
    setAdminForm(f => ({
      ...f, email: v,
      username: f.username ? f.username : v.split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, ''),
    }));
  };

  const doCreate = async (includeAdmin) => {
    setSaving(true); setErr('');
    try {
      const clubRes = await clubService.create(clubForm);
      const club = clubRes.data;
      if (includeAdmin) {
        try {
          await clubService.createAdmin(club.id, adminForm);
        } catch (admErr) {
          setErr(`Club creado, pero el admin falló: ${admErr.response?.data?.error || 'Error'}`);
          setSaving(false);
          onCreate(club);
          return;
        }
      }
      onCreate(club);
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Error al crear el club');
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (!clubForm.name.trim()) { setErr('El nombre del club es obligatorio'); return; }
    setErr('');
    setStep('admin');
  };

  const handleCreateOnly = () => doCreate(false);

  const handleCreateWithAdmin = (e) => {
    e.preventDefault();
    if (!adminForm.name.trim() || !adminForm.email.trim() || !adminForm.password) {
      setErr('Nombre, email y contraseña del admin son requeridos'); return;
    }
    doCreate(true);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--paper)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420,
        border: '1px solid var(--line)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
              {step === 'club' ? 'Nuevo club' : 'Admin del club'}
            </span>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
              {step === 'club' ? 'Paso 1 de 2' : `Paso 2 de 2 — ${clubForm.name}`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>
            <XMarkIcon style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* Step 1: club */}
        {step === 'club' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={label11}>NOMBRE DEL CLUB</label>
              <input style={inp} value={clubForm.name} onChange={e => handleClubName(e.target.value)} placeholder="Nombre del club" />
            </div>
            <div>
              <label style={label11}>SLUG (URL)</label>
              <input style={inp} value={clubForm.slug} onChange={e => setClubForm(f => ({ ...f, slug: e.target.value }))} placeholder="nombre-del-club" />
            </div>
            <div>
              <label style={label11}>DESCRIPCIÓN (opcional)</label>
              <textarea style={{ ...inp, resize: 'vertical', minHeight: 60 }}
                value={clubForm.description} onChange={e => setClubForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descripción breve" />
            </div>
            {err && <div style={{ fontSize: 12, color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={onClose} style={btnCancel}>Cancelar</button>
              <button type="button" onClick={handleNext} style={btnPrimary(saving)}>
                Siguiente: añadir admin →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: admin */}
        {step === 'admin' && (
          <form onSubmit={handleCreateWithAdmin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={label11}>NOMBRE DEL ADMIN</label>
              <input style={inp} value={adminForm.name} onChange={setAdm('name')} placeholder="Nombre completo" />
            </div>
            <div>
              <label style={label11}>EMAIL</label>
              <input type="email" style={inp} value={adminForm.email} onChange={handleAdmEmail} placeholder="admin@club.com" />
            </div>
            <div>
              <label style={label11}>USUARIO</label>
              <input style={inp} value={adminForm.username} onChange={setAdm('username')} placeholder="nombreusuario" />
            </div>
            <div>
              <label style={label11}>CONTRASEÑA</label>
              <input type="password" style={inp} value={adminForm.password} onChange={setAdm('password')} placeholder="••••••••" />
            </div>
            {err && <div style={{ fontSize: 12, color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={() => { setErr(''); setStep('club'); }} style={btnCancel}>
                ← Atrás
              </button>
              <button type="submit" disabled={saving} style={btnPrimary(saving)}>
                {saving ? 'Creando…' : 'Crear club y admin'}
              </button>
            </div>
            <button type="button" onClick={handleCreateOnly} disabled={saving}
              style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 12,
                cursor: 'pointer', textAlign: 'center', textDecoration: 'underline' }}>
              Crear solo el club sin admin
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
const CLUBS_PAGE_SIZE = 8;

export default function Clubs() {
  const { isSuperAdmin } = useAuth();
  const sa = isSuperAdmin();

  const [clubs, setClubs]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { const res = await clubService.getAll(); setClubs(res.data || []); }
    catch { setLoadError('No se pudieron cargar los clubs. Intenta de nuevo.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (club) => {
    setClubs(cs => [...cs, { ...club, _count: { memberships: 0, tournamentInstances: 0 } }]);
    setShowCreate(false);
    setPage(1);
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? clubs.filter(c => c.name?.toLowerCase().includes(q) || c.slug?.toLowerCase().includes(q))
    : clubs;
  const totalPages = Math.ceil(filtered.length / CLUBS_PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * CLUBS_PAGE_SIZE, page * CLUBS_PAGE_SIZE);

  return (
    <div style={{ paddingBottom: 24 }}>

      <div style={{ padding: '20px 16px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 26, fontWeight: 700, color: 'var(--ink)',
            letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 4 }}>
            <em style={{ color: 'var(--court-deep)', fontStyle: 'normal' }}>Clubs.</em>
          </h1>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {q ? `${filtered.length} de ${clubs.length}` : clubs.length} club{clubs.length !== 1 ? 's' : ''} registrado{clubs.length !== 1 ? 's' : ''}
          </div>
        </div>
        <Link to="/club-directory" style={{ fontSize: 12, fontWeight: 700, color: 'var(--court-deep)', textDecoration: 'none', marginRight: 12, alignSelf: 'center' }}>Ver directorio →</Link>
        {sa && (
          <button onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12,
              border: 'none', background: 'var(--court)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <PlusIcon style={{ width: 16, height: 16 }} />
            Nuevo club
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ padding: '0 16px 12px', position: 'relative' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Buscar por nombre o slug..."
          style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 32px 9px 12px',
            fontSize: 13, outline: 'none', background: 'var(--paper)', color: 'var(--ink)', boxSizing: 'border-box' }}
        />
        {search && (
          <button onClick={() => { setSearch(''); setPage(1); }}
            style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        )}
      </div>

      <div style={{ padding: '0 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink-soft)', fontSize: 13 }}>Cargando…</div>
        ) : loadError ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--crimson-soft)', borderRadius: 16,
            fontSize: 13, color: 'var(--crimson)' }}>
            {loadError}
            <button onClick={load} style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none',
              color: 'var(--crimson)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}>
              Reintentar
            </button>
          </div>
        ) : clubs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bone-2)', borderRadius: 16,
            fontSize: 13, color: 'var(--ink-soft)' }}>
            No hay clubs registrados aún.
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bone-2)', borderRadius: 16,
            fontSize: 13, color: 'var(--ink-soft)' }}>
            Sin resultados para "{search}"
          </div>
        ) : (
          <>
            {paginated.map(c => (
              <ClubCard key={c.id} club={c} isSuperAdmin={sa} onUpdated={load}
                onDeleted={id => setClubs(cs => cs.filter(x => x.id !== id))} />
            ))}

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                  {(page - 1) * CLUBS_PAGE_SIZE + 1}–{Math.min(page * CLUBS_PAGE_SIZE, filtered.length)} de {filtered.length}
                </span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)',
                      background: 'var(--paper)', color: page === 1 ? 'var(--line)' : 'var(--ink-mid)',
                      cursor: page === 1 ? 'default' : 'pointer', fontSize: 13, fontWeight: 600 }}>‹</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .map((p, i, arr) => (
                      <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {arr[i - 1] && p - arr[i - 1] > 1 && <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>…</span>}
                        <button onClick={() => setPage(p)}
                          style={{ width: 32, height: 32, borderRadius: 8,
                            border: `1px solid ${p === page ? 'var(--court)' : 'var(--line)'}`,
                            background: p === page ? 'var(--court)' : 'var(--paper)',
                            color: p === page ? '#fff' : 'var(--ink-mid)',
                            cursor: 'pointer', fontSize: 13, fontWeight: p === page ? 800 : 400 }}>
                          {p}
                        </button>
                      </span>
                    ))}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)',
                      background: 'var(--paper)', color: page === totalPages ? 'var(--line)' : 'var(--ink-mid)',
                      cursor: page === totalPages ? 'default' : 'pointer', fontSize: 13, fontWeight: 600 }}>›</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && sa && (
        <CreateClubModal onClose={() => setShowCreate(false)} onCreate={handleCreated} />
      )}
    </div>
  );
}
