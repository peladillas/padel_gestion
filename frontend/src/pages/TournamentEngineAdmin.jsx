import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { tournamentEngineService, tournamentTypeService, clubService, playerService } from '../services/api';
import {
  TrophyIcon, PlusIcon, XMarkIcon, UserPlusIcon, UserMinusIcon,
  LinkIcon, ArrowUturnLeftIcon, CheckCircleIcon, 
  TrashIcon, PauseCircleIcon, PlayCircleIcon, ArrowPathIcon,
  RocketLaunchIcon, ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import ConfirmModal from '../components/ui/ConfirmModal';
import SettingsTab from '../components/tournament/TournamentSettings';
import { PlayerAvatar, MatchCard } from '../components/tournament/matchDisplay';
import { buildPlayerLabels } from '../utils/matchDisplay';

/*
 * Admin management UI for the NEW configurable tournament engine (see
 * laravel/MIGRATION.md, section 5). This is a fresh page, not a rewrite
 * of the old TournamentInstances.jsx (2955 lines, tied to the retired
 * Strategy Registry — invite links, pair-requests, CimaPadel round
 * editing, start/reset/archive... none of that exists on the new
 * backend yet). Scope here matches exactly what
 * /api/tournament-instances supports today: create, enroll, pair,
 * substitute, generate a round, register a result, view the table.
 */

const STATUS_STYLE = {
  draft:     { label: 'Borrador',   bg: 'var(--bone-3)',     color: 'var(--ink-soft)' },
  active:    { label: 'Activo',     bg: 'var(--ok-soft)',    color: 'var(--ok)' },
  suspended: { label: 'Suspendido', bg: 'var(--crimson-soft)', color: 'var(--crimson)' },
  completed: { label: 'Finalizado', bg: 'var(--court-soft)', color: 'var(--court-deep)' },
  archived:  { label: 'Archivado',  bg: 'var(--bone-3)',     color: 'var(--ink-soft)' },
};

// action -> friendly Spanish label, for the Eventos tab.
const LOG_ACTION_LABELS = {
  tournament_created: 'Torneo creado',
  tournament_updated: 'Torneo editado',
  tournament_started: 'Torneo iniciado',
  tournament_suspended: 'Torneo suspendido',
  tournament_resumed: 'Torneo reanudado',
  participant_added: 'Jugador agregado',
  participant_removed: 'Jugador quitado',
  paired: 'Pareja formada',
  unpaired: 'Pareja deshecha',
  auto_paired: 'Emparejamiento automático',
  substitute_set: 'Baja registrada',
  substitute_reverted: 'Baja revertida',
  round_generated: 'Fecha generada',
  result_set: 'Resultado registrado',
  match_suspended: 'Partido suspendido',
  match_resumed: 'Partido reanudado',
  participant_joined: 'Inscripción por enlace',
  pair_requested: 'Solicitud de pareja',
  pair_confirmed: 'Pareja confirmada',
  pair_rejected: 'Solicitud rechazada',
  pair_request_cancelled: 'Solicitud cancelada',
  result_proposed: 'Resultado propuesto',
  result_accepted: 'Resultado confirmado',
  result_rejected: 'Resultado rechazado',
  result_auto_confirmed: 'Resultado confirmado (24h)',
  result_mode_changed: 'Modo de resultados cambiado',
  max_participants_changed: 'Cupo máximo cambiado',
  tournament_reset: 'Torneo reiniciado',
  tournament_archived: 'Torneo archivado',
  tournament_unarchived: 'Torneo restaurado',
};

const inp = { border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 13,
  background: 'var(--paper)', color: 'var(--ink)', outline: 'none', width: '100%', boxSizing: 'border-box' };
const label11 = { fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: '0.05em' };

// ── Create tournament modal ─────────────────────────────────────────────────
function CreateTournamentModal({ isSuperAdmin, onClose, onCreated }) {
  const [types, setTypes] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', typeKey: '', clubId: '', maxParticipants: '', pairingMode: 'fixed_pairs', bestOf: '3', resultMode: 'creador' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    tournamentTypeService.getAll().then(r => {
      const list = r.data || [];
      setTypes(list);
      // Only one type in the catalog today — skip making the admin pick.
      if (list.length === 1) setForm(f => ({ ...f, typeKey: list[0].key }));
    }).catch(() => {});
    if (isSuperAdmin) clubService.getAll().then(r => setClubs(r.data || [])).catch(() => {});
  }, [isSuperAdmin]);

  const selectedType = types.find(t => t.key === form.typeKey);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr('El nombre es obligatorio'); return; }
    if (!form.typeKey) { setErr('Elige un tipo de torneo'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        typeKey: form.typeKey,
        pairingMode: form.pairingMode,
        maxParticipants: form.maxParticipants ? parseInt(form.maxParticipants, 10) : null,
        bestOf: parseInt(form.bestOf, 10) || 3,
        resultMode: form.resultMode,
      };
      if (isSuperAdmin && form.clubId) payload.clubId = form.clubId;
      const res = await tournamentEngineService.create(payload);
      onCreated(res.data);
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Error al crear el torneo');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--paper)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440,
        border: '1px solid var(--line)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>Nuevo torneo</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>
            <XMarkIcon style={{ width: 20, height: 20 }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={label11}>NOMBRE</label>
            <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Liga de verano" autoFocus />
          </div>
          <div>
            <label style={label11}>DESCRIPCIÓN (opcional)</label>
            <textarea style={{ ...inp, resize: 'vertical', minHeight: 50 }} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción breve" />
          </div>
          {types.length > 1 && (
            <div>
              <label style={label11}>TIPO DE TORNEO</label>
              <select style={inp} value={form.typeKey} onChange={e => setForm(f => ({ ...f, typeKey: e.target.value }))}>
                <option value="">Elegir…</option>
                {types.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              {selectedType?.description && (
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>{selectedType.description}</div>
              )}
            </div>
          )}
          <div>
            <label style={label11}>EMPAREJAMIENTO</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, background: 'var(--bone-3)', borderRadius: 10, padding: 3 }}>
              {[['fixed_pairs', 'Parejas'], ['individual', 'Individual']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setForm(f => ({ ...f, pairingMode: id }))}
                  style={{ padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    background: form.pairingMode === id ? 'white' : 'transparent', color: form.pairingMode === id ? 'var(--ink-2)' : 'var(--ink-soft)' }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
              {form.pairingMode === 'fixed_pairs' ? 'Cada jugador tendrá una pareja fija para todo el torneo.' : '1 jugador contra 1 jugador, sin parejas.'}
            </div>
          </div>
          <div>
            <label style={label11}>MEJOR DE (sets)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, background: 'var(--bone-3)', borderRadius: 10, padding: 3 }}>
              {['1', '3', '5'].map(n => (
                <button key={n} type="button" onClick={() => setForm(f => ({ ...f, bestOf: n }))}
                  style={{ padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    background: form.bestOf === n ? 'white' : 'transparent', color: form.bestOf === n ? 'var(--ink-2)' : 'var(--ink-soft)' }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={label11}>QUIÉN CARGA LOS RESULTADOS</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, background: 'var(--bone-3)', borderRadius: 10, padding: 3 }}>
              {[['creador', 'Organizador'], ['jugador', 'Jugadores']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setForm(f => ({ ...f, resultMode: id }))}
                  style={{ padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    background: form.resultMode === id ? 'white' : 'transparent', color: form.resultMode === id ? 'var(--ink-2)' : 'var(--ink-soft)' }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
              {form.resultMode === 'jugador'
                ? 'Un jugador propone el resultado y el equipo rival lo confirma (o se confirma solo a las 24h).'
                : 'Solo quien organiza el torneo registra los resultados.'}
            </div>
          </div>
          {isSuperAdmin && (
            <div>
              <label style={label11}>CLUB (opcional)</label>
              <select style={inp} value={form.clubId} onChange={e => setForm(f => ({ ...f, clubId: e.target.value }))}>
                <option value="">Sin club</option>
                {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={label11}>CUPO MÁXIMO (opcional)</label>
            <input type="number" min="2" style={inp} value={form.maxParticipants}
              onChange={e => setForm(f => ({ ...f, maxParticipants: e.target.value }))} placeholder="Sin límite" />
          </div>
          {err && <div style={{ fontSize: 12, color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bone-2)', color: 'var(--ink-soft)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: saving ? 'var(--line)' : 'var(--court)', color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13 }}>
              {saving ? 'Creando…' : 'Crear torneo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── List view ────────────────────────────────────────────────────────────────
function TournamentListView({ onSelect }) {
  const { isAdmin, isSuperAdmin } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const r = await tournamentEngineService.getAll();
      setTournaments(r.data || []);
    } catch { setLoadError('No se pudieron cargar los torneos'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            <em style={{ color: 'var(--court-deep)', fontStyle: 'normal' }}>Torneos.</em>
          </h1>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{tournaments.length} torneo{tournaments.length !== 1 ? 's' : ''}</div>
        </div>
        {isAdmin() && (
          <button onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, border: 'none',
              background: 'var(--court)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <PlusIcon style={{ width: 16, height: 16 }} /> Nuevo torneo
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink-soft)', fontSize: 13 }}>Cargando…</div>
      ) : loadError ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--crimson-soft)', borderRadius: 16, fontSize: 13, color: 'var(--crimson)' }}>
          {loadError}
          <button onClick={load} style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', color: 'var(--crimson)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}>Reintentar</button>
        </div>
      ) : tournaments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bone-2)', borderRadius: 16, fontSize: 13, color: 'var(--ink-soft)' }}>
          No hay torneos todavía.
        </div>
      ) : (
        tournaments.map(t => {
          const st = STATUS_STYLE[t.status] || STATUS_STYLE.draft;
          return (
            <div key={t.id} onClick={() => onSelect(t.id)}
              style={{ background: 'var(--paper)', borderRadius: 16, border: '1px solid var(--line)', padding: '14px 16px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <TrophyIcon style={{ width: 16, height: 16, color: 'var(--court-deep)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, background: st.bg, color: st.color, borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>{st.label}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--ink-soft)' }}>
                <span>{(t.participants || []).length} participantes</span>
                <span>{t.club?.name || 'Sin club'}</span>
              </div>
            </div>
          );
        })
      )}

      {showCreate && (
        <CreateTournamentModal
          isSuperAdmin={isSuperAdmin()}
          onClose={() => setShowCreate(false)}
          onCreated={(t) => { setShowCreate(false); setTournaments(ts => [t, ...ts]); onSelect(t.id); }}
        />
      )}
    </div>
  );
}

// ── Add participant modal ───────────────────────────────────────────────────
function AddParticipantModal({ excludePlayerIds, maxParticipants, onClose, onAdded, addParticipant, onOpenSettings }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState('');
  const [justAdded, setJustAdded] = useState(null); // last-added player's name, for feedback
  const [capReached, setCapReached] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setSearching(true);
      await new Promise(resolve => setTimeout(resolve, 250));
      if (!active) return;
      try {
        const r = await playerService.search(query);
        if (active) setResults((r.data || []).filter(p => !excludePlayerIds.includes(p.id)));
      } catch { if (active) setResults([]); }
      finally { if (active) setSearching(false); }
    })();
    return () => { active = false; };
  }, [query, excludePlayerIds]);

  const handleAdd = async (player) => {
    setErr(''); setJustAdded(null);
    try {
      await addParticipant({ playerId: player.id });
      // Stays open on purpose — an admin adding a whole tournament's
      // worth of players shouldn't have to reopen this for every one.
      // onAdded() refreshes the parent's participant list, which flows
      // back down through `excludePlayerIds` and drops this player out
      // of `results` on its own.
      onAdded();
      setJustAdded(player.name);
      // excludePlayerIds is the pre-add count — +1 accounts for the
      // player we just added, without waiting on the async refresh.
      if (maxParticipants && excludePlayerIds.length + 1 >= maxParticipants) {
        setCapReached(true);
      }
    } catch (ex) {
      if (ex.response?.data?.full) setCapReached(true);
      else setErr(ex.response?.data?.error || 'Error al agregar');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--paper)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400,
        border: '1px solid var(--line)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Agregar jugador</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {capReached ? (
          <div style={{ background: 'var(--amber-soft)', border: '1px solid var(--amber-soft)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)' }}>Cupo alcanzado ({maxParticipants}/{maxParticipants})</div>
            <div style={{ fontSize: 12, color: 'var(--ink-mid)' }}>No se pueden agregar más jugadores hasta que cambies el cupo máximo del torneo.</div>
            <button onClick={() => { onClose(); onOpenSettings(); }}
              style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--amber)', color: 'var(--ink)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              Cambiar cupo máximo →
            </button>
          </div>
        ) : (
          <>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre…" autoFocus style={{ ...inp, marginBottom: 10 }} />
            {justAdded && <div style={{ fontSize: 12, color: 'var(--ok)', background: 'var(--ok-soft)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>✓ {justAdded} agregado. Podés seguir agregando.</div>}
            {err && <div style={{ fontSize: 12, color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>{err}</div>}
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {searching ? (
                <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)', padding: '12px 0' }}>Buscando…</div>
              ) : results.length === 0 ? (
                <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)', padding: '12px 0' }}>Sin resultados.</div>
              ) : results.map(p => (
                <button key={p.id} onClick={() => handleAdd(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'white', cursor: 'pointer', textAlign: 'left' }}>
                  <PlayerAvatar player={p} size={28} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
                  <UserPlusIcon style={{ width: 14, height: 14, color: 'var(--court-deep)', marginLeft: 'auto', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Substitute (baja) modal ──────────────────────────────────────────────────
function SubstituteModal({ participant, onClose, onSaved, setSubstitute }) {
  const isReverting = participant.status === 'absent';
  const [reason, setReason] = useState('injury');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [subId, setSubId] = useState(null);
  const [subName, setSubName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let active = true;

    (async () => {
      if (isReverting || !query) {
        if (active) setResults([]);

        return;
      }

      await new Promise(resolve => setTimeout(resolve, 250));
      if (!active) return;

      try {
        const r = await playerService.search(query);
        if (active) setResults(r.data || []);
      } catch { if (active) setResults([]); }
    })();

    return () => { active = false; };
  }, [query, isReverting]);

  const handleSave = async () => {
    setSaving(true); setErr('');
    try {
      if (isReverting) {
        await setSubstitute(participant.id, { substitutePlayerId: null, absenceReason: null, absenceNote: null });
      } else {
        if (!subId) { setErr('Elige un jugador sustituto'); setSaving(false); return; }
        await setSubstitute(participant.id, { substitutePlayerId: subId, absenceReason: reason, absenceNote: note || null });
      }
      onSaved();
    } catch (ex) { setErr(ex.response?.data?.error || 'Error'); setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--paper)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400,
        border: '1px solid var(--line)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
            {isReverting ? 'Revertir baja' : `Baja de ${participant.player?.name}`}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {isReverting ? (
          <p style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 16 }}>
            {participant.player?.name} volverá a estar activo y se quitará el sustituto asignado.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={label11}>MOTIVO</label>
              <select style={inp} value={reason} onChange={e => setReason(e.target.value)}>
                <option value="injury">Lesión</option>
                <option value="travel">Viaje</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label style={label11}>NOTA (opcional)</label>
              <input style={inp} value={note} onChange={e => setNote(e.target.value)} placeholder="Detalle breve" />
            </div>
            <div>
              <label style={label11}>SUSTITUTO</label>
              {subId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--court)', background: 'var(--court-soft)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--court-deep)', flex: 1 }}>{subName}</span>
                  <button onClick={() => { setSubId(null); setSubName(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--court-deep)' }}>
                    <XMarkIcon style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              ) : (
                <>
                  <input style={inp} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar jugador…" />
                  {results.length > 0 && (
                    <div style={{ marginTop: 4, maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {results.map(p => (
                        <button key={p.id} onClick={() => { setSubId(p.id); setSubName(p.name); setResults([]); setQuery(''); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'white', cursor: 'pointer', textAlign: 'left', fontSize: 12 }}>
                          <PlayerAvatar player={p} size={22} />{p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {err && <div style={{ fontSize: 12, color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bone-2)', color: 'var(--ink-soft)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: saving ? 'var(--line)' : (isReverting ? 'var(--ok)' : 'var(--crimson)'), color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            {saving ? 'Guardando…' : isReverting ? 'Revertir' : 'Confirmar baja'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Participants tab ─────────────────────────────────────────────────────────
// Roster management only (add / remove / baja). Pairing lives in its own
// tab now (see PairsTab below) — "todo esto antes de iniciar el torneo",
// per the user's request, needed a dedicated place instead of being
// mixed into the roster list.
function ParticipantsTab({ tournament, canManage, onRefresh, onOpenSettings }) {
  const participants = tournament.participants || [];
  const isPairs = tournament.pairingSystem === 'fixed_pairs';
  const [showAdd, setShowAdd] = useState(false);
  const [substituteTarget, setSubstituteTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  const addParticipant = (data) => tournamentEngineService.addParticipant(tournament.id, data);
  const setSubstitute = (pid, data) => tournamentEngineService.setSubstitute(tournament.id, pid, data);

  const confirmRemove = async () => {
    await tournamentEngineService.removeParticipant(tournament.id, removeTarget.id);
    setRemoveTarget(null);
    onRefresh();
  };

  // Group into pairs / solos purely for display (partner name inline) —
  // no pairing actions here anymore, see PairsTab.
  const pairs = []; const solos = []; const used = new Set();
  if (isPairs) {
    participants.forEach(p => {
      if (used.has(p.id)) return;
      if (p.partnerId) {
        const partner = participants.find(q => q.playerId === p.partnerId && !used.has(q.id));
        if (partner) { pairs.push([p, partner]); used.add(p.id); used.add(partner.id); return; }
      }
      solos.push(p); used.add(p.id);
    });
  }

  const rows = isPairs ? null : participants; // individual mode just lists everyone

  const renderRow = (p, partner = null) => {
    const isAbsent = p.status === 'absent' || partner?.status === 'absent';
    return (
      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
        background: 'white', border: '1px solid var(--bone-3)', borderRadius: 10 }}>
        <PlayerAvatar player={p.player} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {p.player?.name}
            {partner && <><span style={{ color: 'var(--ink-soft)' }}>&</span>{partner.player?.name}</>}
            {isPairs && !partner && !isAbsent && (
              <span style={{ fontSize: 9, background: 'var(--amber-soft)', color: 'var(--amber)', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>SIN PAREJA</span>
            )}
            {isAbsent && <span style={{ fontSize: 9, background: '#fee2e2', color: '#b91c1c', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>BAJA</span>}
          </div>
          {(p.status === 'absent' && p.substitute) && (
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>Sustituto: {p.substitute.name}</div>
          )}
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button onClick={() => setSubstituteTarget(p)} title={p.status === 'absent' ? 'Revertir baja' : 'Registrar baja'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.status === 'absent' ? 'var(--ok)' : 'var(--amber)', padding: 4 }}>
              {p.status === 'absent' ? <CheckCircleIcon style={{ width: 15, height: 15 }} /> : <UserMinusIcon style={{ width: 15, height: 15 }} />}
            </button>
            <button onClick={() => setRemoveTarget(p)} title="Quitar del torneo" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crimson)', padding: 4 }}>
              <XMarkIcon style={{ width: 15, height: 15 }} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {canManage && (
        <button onClick={() => setShowAdd(true)} title="Agregar jugador"
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: '1px dashed var(--court)',
            background: 'var(--court-soft)', color: 'var(--court-deep)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
          <UserPlusIcon style={{ width: 14, height: 14 }} /> Agregar jugador
        </button>
      )}

      {participants.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-soft)', fontSize: 13 }}>Sin participantes todavía.</div>
      ) : isPairs ? (
        <>
          {pairs.map(([p, partner]) => renderRow(p, partner))}
          {solos.map(p => renderRow(p))}
        </>
      ) : rows.map(p => renderRow(p))}

      {showAdd && (
        <AddParticipantModal
          excludePlayerIds={participants.map(p => p.playerId)}
          maxParticipants={tournament.maxParticipants}
          addParticipant={addParticipant}
          onClose={() => setShowAdd(false)}
          onAdded={onRefresh}
          onOpenSettings={() => { setShowAdd(false); onOpenSettings(); }}
        />
      )}
      {substituteTarget && (
        <SubstituteModal
          participant={substituteTarget}
          setSubstitute={setSubstitute}
          onClose={() => setSubstituteTarget(null)}
          onSaved={() => { setSubstituteTarget(null); onRefresh(); }}
        />
      )}
      {removeTarget && (
        <ConfirmModal
          title="Quitar participante"
          message={`¿Quitar a ${removeTarget.player?.name} del torneo?`}
          confirmLabel="Quitar"
          onConfirm={confirmRemove}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}

// ── Pairs tab ─────────────────────────────────────────────────────────────────
// New — dedicated place for pairing/regeneration, editable only while the
// tournament is still 'draft' (locked once started, same checkpoint
// TournamentService::assertFullyPaired() enforces server-side).
function PairsTab({ tournament, canManage, onRefresh }) {
  const participants = tournament.participants || [];
  const locked = tournament.status !== 'draft';
  const editable = canManage && !locked;
  const [pairFirst, setPairFirst] = useState(null);
  const [autoPairing, setAutoPairing] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgIsError, setMsgIsError] = useState(true);

  const notify = (m, isError = true) => { setMsg(m); setMsgIsError(isError); setTimeout(() => setMsg(''), 3500); };

  if (tournament.pairingSystem !== 'fixed_pairs') {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-soft)', fontSize: 13 }}>
        Este torneo no usa parejas fijas — cada jugador participa individualmente.
      </div>
    );
  }

  const handleAutoPair = async () => {
    setAutoPairing(true);
    try {
      const res = await tournamentEngineService.autoPairParticipants(tournament.id);
      notify(res.data.unpaired
        ? `${res.data.pairs} pareja(s) formada(s). ${res.data.unpaired} quedó sin pareja (cantidad impar).`
        : `${res.data.pairs} pareja(s) formada(s).`, false);
      onRefresh();
    } catch (ex) { notify(ex.response?.data?.error || 'Error al emparejar automáticamente'); }
    finally { setAutoPairing(false); }
  };

  const handleUnpair = async (participantId) => {
    try {
      await tournamentEngineService.unpairParticipant(tournament.id, { participantId });
      onRefresh();
    } catch (ex) { notify(ex.response?.data?.error || 'Error'); }
  };

  const handlePairClick = async (participant) => {
    if (!pairFirst) { setPairFirst(participant.id); return; }
    if (pairFirst === participant.id) { setPairFirst(null); return; }
    try {
      await tournamentEngineService.pairParticipants(tournament.id, { participantId1: pairFirst, participantId2: participant.id });
      setPairFirst(null);
      onRefresh();
    } catch (ex) { notify(ex.response?.data?.error || 'Error al emparejar'); setPairFirst(null); }
  };

  const pairs = []; const solos = []; const used = new Set();
  participants.forEach(p => {
    if (used.has(p.id)) return;
    if (p.partnerId) {
      const partner = participants.find(q => q.playerId === p.partnerId && !used.has(q.id));
      if (partner) { pairs.push([p, partner]); used.add(p.id); used.add(partner.id); return; }
    }
    if (p.status !== 'absent') { solos.push(p); used.add(p.id); }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {locked && (
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', background: 'var(--bone-2)', borderRadius: 8, padding: '8px 12px' }}>
          Las parejas quedaron fijas al iniciar el torneo.
        </div>
      )}
      {msg && (
        <div style={{ fontSize: 12, color: msgIsError ? 'var(--crimson)' : 'var(--ok)', background: msgIsError ? 'var(--crimson-soft)' : 'var(--ok-soft)', borderRadius: 8, padding: '8px 12px' }}>{msg}</div>
      )}
      {pairFirst && <div style={{ fontSize: 12, color: 'var(--court-deep)', background: 'var(--court-soft)', borderRadius: 8, padding: '8px 12px' }}>Elegí con quién emparejar (o volvé a tocar para cancelar).</div>}

      {editable && (
        <button onClick={handleAutoPair} disabled={autoPairing} title="Emparejar automáticamente, tratando de equilibrar el nivel"
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: '1px solid var(--line)',
            background: 'white', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 12, cursor: autoPairing ? 'default' : 'pointer', opacity: autoPairing ? 0.6 : 1 }}>
          <ArrowPathIcon style={{ width: 14, height: 14 }} /> {autoPairing ? 'Emparejando…' : 'Emparejar automáticamente'}
        </button>
      )}

      {participants.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-soft)', fontSize: 13 }}>Sin participantes todavía.</div>
      ) : (
        <>
          {pairs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Parejas formadas</div>
              {pairs.map(([p, partner]) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'white', border: '1px solid var(--bone-3)', borderRadius: 10 }}>
                  <PlayerAvatar player={p.player} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.player?.name}</span>
                  <span style={{ color: 'var(--ink-soft)' }}>&</span>
                  <PlayerAvatar player={partner.player} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{partner.player?.name}</span>
                  {editable && (
                    <button onClick={() => handleUnpair(p.id)} title="Desemparejar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)', padding: 4, flexShrink: 0 }}>
                      <ArrowUturnLeftIcon style={{ width: 15, height: 15 }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {solos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: pairs.length > 0 ? 6 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sin pareja</div>
              {solos.map(p => (
                <div key={p.id} onClick={() => editable && handlePairClick(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                    background: pairFirst === p.id ? 'var(--court-soft)' : 'white',
                    border: `1px solid ${pairFirst === p.id ? 'var(--court)' : 'var(--bone-3)'}`, borderRadius: 10,
                    cursor: editable ? 'pointer' : 'default' }}>
                  <PlayerAvatar player={p.player} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{p.player?.name}</span>
                  {editable && <LinkIcon style={{ width: 15, height: 15, color: 'var(--court-deep)', flexShrink: 0 }} />}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Events tab ────────────────────────────────────────────────────────────────
// New — TournamentLog existed in the schema but nothing wrote to it
// before this pass. Read-only transparency log of every mutating action.
function InviteTab({ tournament, onRefresh }) {
  const [state, setState] = useState({
    allowInvitations: !!tournament.allowInvitations,
    inviteToken: tournament.inviteToken || null,
    inviteUrl: null,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const draft = tournament.status === 'draft';

  // The list/detail payload only carries the token; the full URL comes
  // from the invite endpoints, so rebuild it locally for the initial view.
  const url = state.inviteUrl || (state.inviteToken ? `${window.location.origin}/tournaments/join/${state.inviteToken}` : null);

  const run = async (fn) => {
    setBusy(true); setErr('');
    try { const r = await fn(); setState(s => ({ ...s, ...r.data })); onRefresh?.(); }
    catch (ex) { setErr(ex.response?.data?.error || 'No se pudo actualizar la invitación'); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  };

  const enc = encodeURIComponent(`Súmate a "${tournament.name}": ${url}`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!draft && (
        <div style={{ fontSize: 12, color: 'var(--amber)', background: 'var(--bone-3)', borderRadius: 10, padding: '10px 12px' }}>
          La inscripción por enlace solo está abierta mientras el torneo es un borrador: al iniciarlo, la lista y las parejas quedan fijas.
        </div>
      )}
      <div style={{ background: 'white', border: '1px solid var(--bone-3)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Inscripción por enlace</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Quien tenga el enlace puede anotarse (con su cuenta) sin que lo agregues a mano.</div>
          </div>
          <button disabled={busy || !state.inviteToken} onClick={() => run(() => tournamentEngineService.updateInvite(tournament.id, { allowInvitations: !state.allowInvitations }))}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: state.allowInvitations ? 'var(--ok-soft)' : 'var(--bone-3)',
              color: state.allowInvitations ? 'var(--ok)' : 'var(--ink-soft)', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: state.inviteToken ? 1 : 0.5 }}>
            {state.allowInvitations ? 'Abierta' : 'Cerrada'}
          </button>
        </div>

        {url && state.allowInvitations && (
          <>
            <div style={{ fontSize: 12, wordBreak: 'break-all', background: 'var(--bone-3)', borderRadius: 8, padding: '8px 10px', color: 'var(--ink-mid)' }}>{url}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={copy} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--court-deep)', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {copied ? '¡Copiado!' : 'Copiar enlace'}
              </button>
              <a href={`https://wa.me/?text=${enc}`} target="_blank" rel="noreferrer" style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', textDecoration: 'none' }}>WhatsApp</a>
              <a href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(tournament.name)}`} target="_blank" rel="noreferrer" style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', textDecoration: 'none' }}>Telegram</a>
            </div>
          </>
        )}

        <button disabled={busy || !draft} onClick={() => run(() => tournamentEngineService.generateInvite(tournament.id, { allowInvitations: true }))}
          style={{ alignSelf: 'flex-start', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'white', color: 'var(--ink-2)', fontSize: 12, fontWeight: 700, cursor: draft ? 'pointer' : 'not-allowed', opacity: draft ? 1 : 0.5 }}>
          {state.inviteToken ? 'Generar enlace nuevo (invalida el anterior)' : 'Generar enlace'}
        </button>
        {err && <div style={{ fontSize: 12, color: 'var(--crimson)' }}>{err}</div>}
      </div>
    </div>
  );
}

function EventsTab({ tournamentId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tournamentEngineService.getLogs(tournamentId).then(r => setLogs(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, [tournamentId]);

  const fmt = (iso) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  if (loading) return <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-soft)' }}>Cargando…</div>;
  if (logs.length === 0) {
    return <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-soft)', fontSize: 13 }}>Todavía no hay actividad registrada.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {logs.map(log => (
        <div key={log.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'white', border: '1px solid var(--bone-3)', borderRadius: 10 }}>
          <ClipboardDocumentListIcon style={{ width: 15, height: 15, color: 'var(--court-deep)', flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{LOG_ACTION_LABELS[log.action] || log.action}</span>
              <span style={{ fontSize: 10, color: 'var(--ink-soft)', flexShrink: 0 }}>{fmt(log.createdAt)}</span>
            </div>
            {log.detail && <div style={{ fontSize: 12, color: 'var(--ink-mid)', marginTop: 2 }}>{log.detail}</div>}
            {log.playerName && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{log.playerName}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Matches tab ──────────────────────────────────────────────────────────────
// "No alcanza con gana/empata/pierde" — real games per set (validated
// against the tournament's best-of on the backend) or an explicit
// retirement with a reason, mutually exclusive.
function ScoreEntry({ matchId, bestOf, onSave }) {
  const [sets, setSets] = useState([{ t1: '', t2: '' }, { t1: '', t2: '' }]);
  const [retiring, setRetiring] = useState(false);
  const [retiredTeam, setRetiredTeam] = useState('team1');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const updateSet = (i, side, val) => setSets(prev => prev.map((s, idx) => (idx === i ? { ...s, [side]: val } : s)));
  const addSet = () => setSets(prev => [...prev, { t1: '', t2: '' }]);
  const removeSet = (i) => setSets(prev => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const validSets = sets.filter(s => s.t1 !== '' && s.t2 !== '');
  const t1Wins = validSets.filter(s => parseInt(s.t1, 10) > parseInt(s.t2, 10)).length;
  const t2Wins = validSets.filter(s => parseInt(s.t2, 10) > parseInt(s.t1, 10)).length;

  const handleSubmit = async () => {
    setSaving(true); setErr('');
    try {
      if (retiring) {
        if (!reason.trim()) { setErr('Indicá el motivo del abandono'); setSaving(false); return; }
        await onSave(matchId, { retired: { team: retiredTeam, reason: reason.trim() } });
      } else {
        await onSave(matchId, { sets: validSets.map(s => ({ t1: parseInt(s.t1, 10), t2: parseInt(s.t2, 10) })) });
      }
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Error al guardar el resultado');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--ink-soft)', fontWeight: 700 }}>MEJOR DE {bestOf}</span>
        <button type="button" onClick={() => setRetiring(r => !r)}
          style={{ fontSize: 10, fontWeight: 700, color: retiring ? 'var(--crimson)' : 'var(--ink-soft)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
          {retiring ? 'Cargar sets en cambio' : 'Abandono / no se jugó'}
        </button>
      </div>

      {retiring ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {[['team1', 'Abandona equipo 1'], ['team2', 'Abandona equipo 2']].map(([val, label]) => (
              <button key={val} type="button" onClick={() => setRetiredTeam(val)}
                style={{ fontSize: 10, fontWeight: 700, padding: '6px 4px', borderRadius: 6, border: '1px solid var(--line)',
                  background: retiredTeam === val ? 'var(--crimson)' : 'white', color: retiredTeam === val ? '#fff' : 'var(--ink-soft)', cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo (lesión, no se presentó…)"
            style={{ ...inp, fontSize: 12, padding: '7px 10px' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sets.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" min="0" max="7" value={s.t1} onChange={e => updateSet(i, 't1', e.target.value)}
                style={{ ...inp, width: 48, textAlign: 'center', padding: '6px 4px', fontSize: 12 }} />
              <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>–</span>
              <input type="number" min="0" max="7" value={s.t2} onChange={e => updateSet(i, 't2', e.target.value)}
                style={{ ...inp, width: 48, textAlign: 'center', padding: '6px 4px', fontSize: 12 }} />
              <span style={{ fontSize: 10, color: 'var(--ink-soft)', flex: 1 }}>Set {i + 1}</span>
              {sets.length > 1 && (
                <button type="button" onClick={() => removeSet(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: 2 }}>
                  <XMarkIcon style={{ width: 12, height: 12 }} />
                </button>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" onClick={addSet} style={{ fontSize: 10, fontWeight: 700, color: 'var(--court-deep)', background: 'none', border: 'none', cursor: 'pointer' }}>+ Set</button>
            <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Parcial: <b style={{ color: 'var(--court-deep)' }}>{t1Wins}</b>–<b>{t2Wins}</b></span>
          </div>
        </div>
      )}

      {err && <div style={{ fontSize: 11, color: 'var(--crimson)' }}>{err}</div>}
      <button type="button" onClick={handleSubmit} disabled={saving}
        style={{ padding: '7px 0', borderRadius: 8, border: 'none', background: saving ? 'var(--line)' : 'var(--court)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer' }}>
        {saving ? 'Guardando…' : 'Guardar resultado'}
      </button>
    </div>
  );
}

function MatchesTab({ tournament, canManage, onRefresh }) {
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState('');
  const [scoreModalMatch, setScoreModalMatch] = useState(null);
  const matches = tournament.matches || [];
  const partMap = {};
  (tournament.participants || []).forEach(p => { partMap[p.id] = p.player; });
  const playerLabels = buildPlayerLabels((tournament.participants || []).map(p => p.player).filter(Boolean));
  const bestOf = tournament.config?.bestOf ?? 3;
  const clubName = tournament.club?.name;

  const byRound = {};
  matches.forEach(m => { (byRound[m.round] ??= []).push(m); });

  const teamPlayers = (ids) => (ids || []).map(id => partMap[id]).filter(Boolean);

  const handleGenerate = async () => {
    setGenerating(true); setErr('');
    try { await tournamentEngineService.generateRound(tournament.id); onRefresh(); }
    catch (ex) { setErr(ex.response?.data?.error || 'Error al generar la fecha'); }
    finally { setGenerating(false); }
  };

  const handleSetResult = (matchId, data) =>
    tournamentEngineService.setMatchResult(tournament.id, matchId, data).then(() => { setScoreModalMatch(null); onRefresh(); });

  const toggleMatchSuspend = async (m) => {
    try {
      if (m.status === 'suspended') await tournamentEngineService.resumeMatch(tournament.id, m.id);
      else await tournamentEngineService.suspendMatch(tournament.id, m.id);
      onRefresh();
    } catch (ex) { alert(ex.response?.data?.error || 'Error'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {canManage && tournament.status === 'draft' && (
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', background: 'var(--bone-2)', borderRadius: 8, padding: '8px 12px' }}>
          Iniciá el torneo antes de generar partidos.
        </div>
      )}
      {canManage && tournament.status === 'suspended' && (
        <div style={{ fontSize: 12, color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 8, padding: '8px 12px' }}>
          El torneo está suspendido — reanudalo para generar partidos.
        </div>
      )}
      {canManage && tournament.status === 'completed' && (
        <div style={{ fontSize: 12, color: 'var(--court-deep)', background: 'var(--court-soft)', borderRadius: 8, padding: '8px 12px' }}>
          El torneo finalizó — no hay más fechas para generar.
        </div>
      )}
      {canManage && tournament.status === 'active' && (
        <div>
          <button onClick={handleGenerate} disabled={generating}
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: generating ? 'var(--line)' : 'var(--court)',
              color: '#fff', fontWeight: 700, fontSize: 13, cursor: generating ? 'not-allowed' : 'pointer' }}>
            {generating ? 'Generando…' : 'Generar próxima fecha'}
          </button>
          {err && <div style={{ fontSize: 12, color: 'var(--crimson)', marginTop: 6 }}>{err}</div>}
        </div>
      )}

      {Object.keys(byRound).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-soft)', fontSize: 13 }}>Todavía no se generó ninguna fecha.</div>
      ) : Object.entries(byRound).sort((a, b) => a[0] - b[0]).map(([round, rMatches]) => (
        <div key={round}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Fecha {round}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
            {rMatches.map(m => {
              const g = m.group ? JSON.parse(m.group) : { team1: [], team2: [] };
              const completed = m.status === 'completed';
              const suspendControl = canManage && !completed ? (
                <button onClick={() => toggleMatchSuspend(m)} title={m.status === 'suspended' ? 'Reanudar partido' : 'Suspender partido'}
                  aria-label={m.status === 'suspended' ? 'Reanudar partido' : 'Suspender partido'}
                  style={{ display: 'flex', alignItems: 'center', color: m.status === 'suspended' ? 'var(--ok)' : 'var(--amber)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                  {m.status === 'suspended' ? <PlayCircleIcon style={{ width: 15, height: 15 }} aria-hidden="true" /> : <PauseCircleIcon style={{ width: 15, height: 15 }} aria-hidden="true" />}
                </button>
              ) : null;
              return (
                <MatchCard key={m.id}
                  team1={teamPlayers(g.team1)} team2={teamPlayers(g.team2)}
                  labels={playerLabels} round={round} result={m.result} status={m.status}
                  scheduledAt={m.scheduledAt} courtNumber={m.courtNumber} clubName={clubName}
                  suspendControl={suspendControl}
                  footer={!completed && m.status !== 'suspended' && canManage ? (
                    <button onClick={() => setScoreModalMatch(m)}
                      style={{ padding: '7px 0', borderRadius: 8, border: 'none', background: 'var(--court)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      Cargar resultado
                    </button>
                  ) : null}
                />
              );
            })}
          </div>
        </div>
      ))}

      {scoreModalMatch && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--paper)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 380,
            border: '1px solid var(--line)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Cargar resultado</span>
              <button onClick={() => setScoreModalMatch(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>
                <XMarkIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <ScoreEntry matchId={scoreModalMatch.id} bestOf={bestOf} onSave={handleSetResult} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Standings tab ────────────────────────────────────────────────────────────
function StandingsTab({ tournamentId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tournamentEngineService.getStandings(tournamentId).then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [tournamentId]);

  if (loading) return <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-soft)' }}>Cargando…</div>;
  if (!data || (data.standings || []).length === 0) {
    return <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-soft)', fontSize: 13 }}>Aún no hay resultados.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{data.completedMatches} de {data.totalMatches} partidos completados</div>
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--bone-3)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 32px 32px 32px 32px 44px', gap: 4, padding: '9px 10px', background: 'var(--bone-2)', borderBottom: '1px solid var(--bone-3)' }}>
          {['#', 'Jugador/Pareja', 'PJ', 'G', 'P', 'E', 'Pts'].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textAlign: h === 'Jugador/Pareja' ? 'left' : 'center' }}>{h}</div>
          ))}
        </div>
        {data.standings.map((s, i) => {
          const label = s.type === 'pair'
            ? [s.player1?.name?.split(' ')[0], s.player2?.name?.split(' ')[0]].filter(Boolean).join(' & ')
            : (s.participant?.player?.name || '—');
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 32px 32px 32px 32px 44px', gap: 4, padding: '9px 10px', borderBottom: '1px solid var(--bone-2)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', textAlign: 'center' }}>{i + 1}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
              {[s.played, s.won, s.lost, s.draw].map((v, j) => <div key={j} style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)' }}>{v}</div>)}
              <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--ink-2)' }}>{s.points}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail view ──────────────────────────────────────────────────────────────
function TournamentDetailView({ id, onBack }) {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('participantes');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState('');

  const load = useCallback(() => {
    tournamentEngineService.getById(id).then(r => setData(r.data)).catch(() => setError('Torneo no encontrado')).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink-soft)' }}>Cargando…</div>;
  if (error || !data) return (
    <div style={{ padding: 16 }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 13, marginBottom: 12 }}>← Volver</button>
      <div style={{ color: 'var(--crimson)' }}>{error}</div>
    </div>
  );

  const canManage = isAdmin() || user?.id === data.responsableId;
  const st = STATUS_STYLE[data.status] || STATUS_STYLE.draft;

  const playedMatches = (data.matches || []).filter(m => m.status === 'completed').length;

  // The ConfirmModal already makes the admin type "eliminar", so that is the
  // explicit confirmation the API asks for when matches were played (409).
  const confirmDelete = async () => {
    await tournamentEngineService.delete(id, true);
    onBack();
  };

  const toggleSuspend = async () => {
    try {
      if (data.status === 'suspended') await tournamentEngineService.resume(id);
      else await tournamentEngineService.suspend(id);
      load();
    } catch (ex) { alert(ex.response?.data?.error || 'Error'); }
  };

  const handleStart = async () => {
    setStarting(true); setStartErr('');
    try {
      await tournamentEngineService.start(id);
      load();
    } catch (ex) { setStartErr(ex.response?.data?.error || 'Error al iniciar el torneo'); }
    finally { setStarting(false); }
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 13, alignSelf: 'flex-start', padding: 0 }}>← Volver</button>

      <div style={{ background: 'var(--paper)', borderRadius: 20, padding: 16, border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>{data.name}</div>
            {data.description && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{data.description}</div>}
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, background: st.bg, color: st.color, borderRadius: 8, padding: '3px 10px', flexShrink: 0 }}>{st.label}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, background: 'var(--bone-3)', color: 'var(--ink-soft)', borderRadius: 5, padding: '2px 8px' }}>{data.structure}</span>
          {data.club && <span style={{ fontSize: 10, background: 'var(--court-soft)', color: 'var(--court-deep)', borderRadius: 5, padding: '2px 8px', fontWeight: 600 }}>{data.club.name}</span>}
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {data.status === 'draft' && (
              <button onClick={handleStart} disabled={starting} title="Iniciar torneo"
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#fff',
                  background: starting ? 'var(--line)' : 'var(--court)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: starting ? 'not-allowed' : 'pointer' }}>
                <RocketLaunchIcon style={{ width: 13, height: 13 }} aria-hidden="true" /> {starting ? 'Iniciando…' : 'Iniciar torneo'}
              </button>
            )}
            {(data.status === 'active' || data.status === 'suspended') && (
              <button onClick={toggleSuspend} title={data.status === 'suspended' ? 'Reanudar torneo' : 'Suspender torneo'}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: data.status === 'suspended' ? 'var(--ok)' : 'var(--amber)', background: data.status === 'suspended' ? 'var(--ok-soft)' : 'var(--amber-soft)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
                {data.status === 'suspended' ? <PlayCircleIcon style={{ width: 13, height: 13 }} aria-hidden="true" /> : <PauseCircleIcon style={{ width: 13, height: 13 }} aria-hidden="true" />}
                {data.status === 'suspended' ? 'Reanudar' : 'Suspender'}
              </button>
            )}
            <button onClick={() => setDeleteConfirm(true)} title="Eliminar torneo"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--crimson)', background: 'var(--crimson-soft)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
              <TrashIcon style={{ width: 13, height: 13 }} aria-hidden="true" /> Eliminar
            </button>
          </div>
        )}
        {startErr && <div style={{ fontSize: 12, color: 'var(--crimson)', marginTop: 8 }}>{startErr}</div>}
      </div>

      <div style={{ display: 'flex', background: 'var(--bone-3)', borderRadius: 12, padding: 4, gap: 4, flexWrap: 'wrap' }}>
        {[
          ['participantes', 'Jugadores'],
          ...(data.pairingSystem === 'fixed_pairs' ? [['parejas', 'Parejas']] : []),
          ['partidos', 'Partidos'],
          ['tabla', 'Tabla'],
          ...(canManage ? [['invitar', 'Invitar']] : []),
          ['eventos', 'Eventos'],
          ...(canManage ? [['ajustes', 'Ajustes']] : []),
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ flex: 1, padding: '8px 4px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: tab === key ? 'white' : 'transparent', color: tab === key ? 'var(--ink-2)' : 'var(--ink-soft)' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'participantes' && (
        <ParticipantsTab tournament={data} canManage={canManage} onRefresh={load}
          onOpenSettings={() => setTab('ajustes')} />
      )}
      {tab === 'parejas' && <PairsTab tournament={data} canManage={canManage} onRefresh={load} />}
      {tab === 'partidos' && <MatchesTab tournament={data} canManage={canManage} onRefresh={load} />}
      {tab === 'tabla' && <StandingsTab tournamentId={id} />}
      {tab === 'invitar' && canManage && <InviteTab tournament={data} onRefresh={load} />}
      {tab === 'eventos' && <EventsTab tournamentId={id} />}
      {tab === 'ajustes' && canManage && <SettingsTab tournament={data} onRefresh={load} onGoToTab={setTab} />}

      {deleteConfirm && (
        <ConfirmModal
          title="Eliminar torneo"
          message={`¿Eliminar "${data.name}"? Se borran también sus participantes y partidos${playedMatches ? ` (incluidos ${playedMatches} con resultado)` : ''}. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar torneo"
          requireTypedConfirmation
          onConfirm={confirmDelete}
          onClose={() => setDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function TournamentEngineAdmin() {
  const [selectedId, setSelectedId] = useState(null);

  return selectedId
    ? <TournamentDetailView id={selectedId} onBack={() => setSelectedId(null)} />
    : <TournamentListView onSelect={setSelectedId} />;
}
