import { useState, useEffect, useMemo } from 'react';
import { tournamentEngineService, clubService, playerService } from '../../services/api';
import ConfirmModal from '../ui/ConfirmModal';

// "Ajustes" tab of the tournament detail (TournamentEngineAdmin.jsx): the
// management actions that used to live in the retired TournamentInstances.jsx
// Config tab — who registers results (+ referee), the participant cap, the
// courts, and the risky ones (reset / archive). Everything here is gated to
// people who can manage the tournament by the backend as well.

const inp = { border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 13,
  background: 'var(--paper)', color: 'var(--ink)', outline: 'none', width: '100%', boxSizing: 'border-box' };
const label11 = { fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: '0.05em' };
const card = { background: 'white', border: '1px solid var(--bone-3)', borderRadius: 14, padding: 14,
  display: 'flex', flexDirection: 'column', gap: 10 };

const errText = (ex, fallback) => ex?.response?.data?.error || fallback;

function Section({ title, hint, children }) {
  return (
    <div style={card}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{title}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.4 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Feedback({ ok, err }) {
  if (err) return <div style={{ fontSize: 12, color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>;
  if (ok) return <div style={{ fontSize: 12, color: 'var(--ok)', background: 'var(--ok-soft)', borderRadius: 8, padding: '8px 12px' }}>{ok}</div>;
  return null;
}

function PrimaryButton({ disabled, busy, children, ...rest }) {
  const off = disabled || busy;
  return (
    <button disabled={off} {...rest}
      style={{ alignSelf: 'flex-start', padding: '8px 16px', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700,
        background: off ? 'var(--line)' : 'var(--court)', color: '#fff', cursor: off ? 'not-allowed' : 'pointer' }}>
      {busy ? 'Guardando…' : children}
    </button>
  );
}

// ── Basic data (name, description, best-of) ─────────────────────────────────
function DetailsSection({ tournament, onSaved }) {
  const initial = {
    name: tournament.name || '',
    description: tournament.description || '',
    bestOf: String(tournament.config?.bestOf ?? 3),
  };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const unchanged = form.name === initial.name && form.description === initial.description && form.bestOf === initial.bestOf;
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setOk(''); setErr(''); };

  const save = async () => {
    setBusy(true); setErr(''); setOk('');
    try {
      await tournamentEngineService.update(tournament.id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        bestOf: parseInt(form.bestOf, 10) || 3,
      });
      setOk('Datos guardados.');
      onSaved();
    } catch (ex) { setErr(errText(ex, 'No se pudieron guardar los datos')); }
    finally { setBusy(false); }
  };

  return (
    <Section title="Datos del torneo">
      <div>
        <label style={label11}>Nombre</label>
        <input style={inp} value={form.name} onChange={e => set('name', e.target.value)} />
      </div>
      <div>
        <label style={label11}>Descripción (opcional)</label>
        <textarea style={{ ...inp, resize: 'vertical', minHeight: 50 }} value={form.description}
          onChange={e => set('description', e.target.value)} placeholder="Descripción breve" />
      </div>
      <div>
        <label style={label11}>Mejor de (sets)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, background: 'var(--bone-3)', borderRadius: 10, padding: 3 }}>
          {['1', '3', '5'].map(n => (
            <button key={n} type="button" onClick={() => set('bestOf', n)}
              style={{ padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: form.bestOf === n ? 'white' : 'transparent', color: form.bestOf === n ? 'var(--ink-2)' : 'var(--ink-soft)' }}>
              {n}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>Se aplica a los resultados que se registren desde ahora; los ya cargados no cambian.</div>
      </div>
      <Feedback ok={ok} err={err} />
      <PrimaryButton busy={busy} disabled={unchanged || !form.name.trim()} onClick={save}>Guardar datos</PrimaryButton>
    </Section>
  );
}

// ── Result mode + referee ────────────────────────────────────────────────────
const RESULT_MODES = [
  ['creador', 'Organizador', 'Solo quien gestiona el torneo registra los resultados.'],
  ['jugador', 'Jugadores', 'Un jugador propone el resultado y el equipo rival lo confirma (o se confirma solo a las 24 h).'],
  ['arbitro', 'Árbitro', 'Una persona asignada registra los resultados.'],
];

function ResultModeSection({ tournament, onSaved }) {
  const [mode, setMode] = useState(tournament.resultMode || 'creador');
  const [arbitro, setArbitro] = useState(tournament.arbitro || null); // { id: User.id, name }
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  // Live search for the referee. `arbitroId` is a User.id, so only players
  // that have an account (userId) can be picked.
  useEffect(() => {
    if (mode !== 'arbitro' || q.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => {
      playerService.search(q.trim(), tournament.clubId || undefined)
        .then(r => setResults((r.data || []).filter(p => p.userId).slice(0, 6)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, mode, tournament.clubId]);

  const unchanged = mode === (tournament.resultMode || 'creador')
    && (mode !== 'arbitro' || arbitro?.id === tournament.arbitro?.id);
  const missingArbitro = mode === 'arbitro' && !arbitro;

  const save = async () => {
    setBusy(true); setErr(''); setOk('');
    try {
      await tournamentEngineService.updateResultMode(tournament.id, {
        resultMode: mode,
        ...(mode === 'arbitro' ? { arbitroId: arbitro.id } : {}),
      });
      setOk('Modo de resultados actualizado.');
      onSaved();
    } catch (ex) { setErr(errText(ex, 'No se pudo actualizar')); }
    finally { setBusy(false); }
  };

  return (
    <Section title="Quién carga los resultados"
      hint="Cambiar el modo descarta las propuestas de resultado que estén esperando confirmación.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, background: 'var(--bone-3)', borderRadius: 10, padding: 3 }}>
        {RESULT_MODES.map(([id, label]) => (
          <button key={id} type="button" onClick={() => { setMode(id); setOk(''); setErr(''); }}
            style={{ padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: mode === id ? 'white' : 'transparent', color: mode === id ? 'var(--ink-2)' : 'var(--ink-soft)' }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{RESULT_MODES.find(([id]) => id === mode)?.[2]}</div>

      {mode === 'arbitro' && (
        <div>
          <label style={label11}>Árbitro</label>
          {arbitro && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--court-soft)', borderRadius: 10, padding: '8px 12px', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--court-deep)' }}>{arbitro.name}</span>
              <button type="button" onClick={() => setArbitro(null)}
                style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 11, cursor: 'pointer' }}>Cambiar</button>
            </div>
          )}
          {!arbitro && (
            <>
              <input style={inp} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar jugador por nombre…" />
              {results.length > 0 && (
                <div style={{ border: '1px solid var(--line)', borderRadius: 10, marginTop: 6, overflow: 'hidden' }}>
                  {results.map(p => (
                    <button key={p.id} type="button" onClick={() => { setArbitro({ id: p.userId, name: p.name }); setQ(''); setResults([]); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'white', border: 'none',
                        borderBottom: '1px solid var(--bone-3)', fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              {q.trim().length >= 2 && results.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6 }}>Sin resultados (solo jugadores con cuenta pueden ser árbitro).</div>
              )}
            </>
          )}
        </div>
      )}

      <Feedback ok={ok} err={err} />
      <PrimaryButton onClick={save} busy={busy} disabled={unchanged || missingArbitro}>Guardar</PrimaryButton>
    </Section>
  );
}

// ── Participant cap ──────────────────────────────────────────────────────────
function CapacitySection({ tournament, onSaved, onGoToTab }) {
  const participants = useMemo(() => tournament.participants || [], [tournament.participants]);
  const hasMatches = (tournament.matches || []).length > 0;
  const [value, setValue] = useState(tournament.maxParticipants ?? '');
  const [toRemove, setToRemove] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [rebuildPairs, setRebuildPairs] = useState(false); // after a save that broke pairs

  const isPairs = tournament.pairingSystem === 'fixed_pairs';
  const started = tournament.status !== 'draft';

  const newMax = value === '' ? null : parseInt(value, 10);
  const invalid = newMax !== null && (Number.isNaN(newMax) || newMax < 2);
  const remaining = participants.length - toRemove.length;
  const needed = newMax !== null && !invalid ? Math.max(0, remaining - newMax) : 0;
  const unchanged = newMax === (tournament.maxParticipants ?? null) && toRemove.length === 0;
  // A change always wipes generated matches (and sends the tournament back to draft).
  const wipesMatches = hasMatches && !unchanged;
  // Removing someone from a started pairs tournament leaves their partner alone:
  // the backend reopens it as a draft so the pairs can be rebuilt.
  const breaksPairs = isPairs && toRemove.length > 0;
  const reopens = !unchanged && (hasMatches || (breaksPairs && started));

  const toggle = (id) => setToRemove(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]));
  const nameOf = (p) => p.player?.name || 'Jugador';

  const save = async () => {
    setBusy(true); setErr(''); setOk('');
    try {
      await tournamentEngineService.updateMaxParticipants(tournament.id, { maxParticipants: newMax, participantsToRemove: toRemove });
      setRebuildPairs(breaksPairs);
      setToRemove([]);
      setOk(wipesMatches ? 'Cupo actualizado. Se eliminaron los partidos y el torneo volvió a borrador.'
        : (reopens ? 'Cupo actualizado. El torneo volvió a borrador para poder rehacer las parejas.' : 'Cupo actualizado.'));
      onSaved();
    } catch (ex) { setErr(errText(ex, 'No se pudo actualizar el cupo')); }
    finally { setBusy(false); setConfirm(false); }
  };

  return (
    <Section title="Cupo máximo" hint={`${participants.length} inscriptos ahora${tournament.maxParticipants ? ` · cupo actual ${tournament.maxParticipants}` : ' · sin límite'}.`}>
      <div>
        <label style={label11}>Nuevo cupo (vacío = sin límite)</label>
        <input type="number" min="2" style={inp} value={value} placeholder="Sin límite"
          onChange={e => { setValue(e.target.value); setToRemove([]); setOk(''); setErr(''); }} />
        {invalid && <div style={{ fontSize: 11, color: 'var(--crimson)', marginTop: 4 }}>El cupo mínimo es 2.</div>}
      </div>

      {(needed > 0 || toRemove.length > 0) && (
        <div>
          <div style={{ fontSize: 12, color: needed > 0 ? 'var(--amber)' : 'var(--ink-soft)', fontWeight: 600, marginBottom: 6 }}>
            {needed > 0
              ? `Hay más inscriptos que el cupo: elige ${needed} jugador${needed !== 1 ? 'es' : ''} más para quitar.`
              : `Se quitarán ${toRemove.length} jugador${toRemove.length !== 1 ? 'es' : ''}.`}
          </div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, maxHeight: 220, overflowY: 'auto' }}>
            {participants.map(p => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--bone-3)', fontSize: 13, cursor: 'pointer',
                background: toRemove.includes(p.id) ? 'var(--crimson-soft)' : 'white' }}>
                <input type="checkbox" checked={toRemove.includes(p.id)} onChange={() => toggle(p.id)} />
                <span style={{ color: 'var(--ink)' }}>{nameOf(p)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {wipesMatches && (
        <div style={{ fontSize: 12, color: 'var(--amber)', background: 'var(--amber-soft)', borderRadius: 8, padding: '8px 12px' }}>
          Este torneo ya tiene partidos generados: al cambiar el cupo se <b>eliminan todos los partidos</b> y el torneo vuelve a borrador.
        </div>
      )}
      {breaksPairs && (
        <div style={{ fontSize: 12, color: 'var(--amber)', background: 'var(--amber-soft)', borderRadius: 8, padding: '8px 12px' }}>
          Quienes formaban pareja con los jugadores que quites <b>quedan sin pareja</b>.
          {started && !wipesMatches && ' El torneo volverá a borrador para que puedas rehacerlas.'}
          {' '}Podrás armarlas de nuevo en la pestaña Parejas.
        </div>
      )}

      <Feedback ok={ok} err={err} />
      {rebuildPairs && !err && (
        <button type="button" onClick={() => onGoToTab?.('parejas')}
          style={{ alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 9, border: '1px solid var(--court)', background: 'var(--court-soft)',
            color: 'var(--court-deep)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Rehacer parejas →
        </button>
      )}
      <PrimaryButton busy={busy} disabled={unchanged || invalid || needed > 0}
        onClick={() => (reopens ? setConfirm(true) : save())}>Guardar cupo</PrimaryButton>

      {confirm && (
        <ConfirmModal title="Cambiar el cupo" confirmLabel="Cambiar cupo"
          message={wipesMatches
            ? 'Se eliminarán todos los partidos ya generados (incluidos los resultados) y el torneo volverá a borrador. ¿Continuar?'
            : 'El torneo volverá a borrador para que puedas rehacer las parejas de quienes se queden sin compañero. ¿Continuar?'}
          onConfirm={save} onClose={() => setConfirm(false)} />
      )}
    </Section>
  );
}

// ── Courts ───────────────────────────────────────────────────────────────────
function CourtsSection({ tournament }) {
  const [state, setState] = useState({ loading: true, all: [], selected: [], denied: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    if (!tournament.clubId) return;
    Promise.all([clubService.getCourts(tournament.clubId), tournamentEngineService.getCourts(tournament.id)])
      .then(([all, sel]) => {
        const ids = (sel.data || []).map(c => c.id);
        setState({ loading: false, all: all.data || [], selected: ids, denied: false });
        setSaved(ids);
      })
      .catch(ex => setState(s => ({ ...s, loading: false, denied: ex?.response?.status === 403 })));
  }, [tournament.clubId, tournament.id]);

  if (!tournament.clubId) {
    return <Section title="Pistas" hint="Este torneo no pertenece a ningún club, así que no hay pistas que asignar." />;
  }
  if (state.loading) return <Section title="Pistas" hint="Cargando…" />;
  if (state.denied) return <Section title="Pistas" hint="Solo los administradores del club pueden elegir las pistas del torneo." />;

  const courtsById = Object.fromEntries(state.all.map(c => [c.id, c]));
  // Active courts, plus any already-selected one that has since been deactivated (so it can be removed).
  const visible = state.all.filter(c => c.isActive || state.selected.includes(c.id));
  const toggle = (id) => {
    setOk(''); setErr('');
    setState(s => ({ ...s, selected: s.selected.includes(id) ? s.selected.filter(x => x !== id) : [...s.selected, id] }));
  };
  const unchanged = JSON.stringify(state.selected) === JSON.stringify(saved);

  const save = async () => {
    setBusy(true); setErr(''); setOk('');
    try {
      const r = await tournamentEngineService.setCourts(tournament.id, state.selected);
      const ids = (r.data || []).map(c => c.id);
      setSaved(ids);
      setState(s => ({ ...s, selected: ids }));
      setOk('Pistas guardadas. Se asignan a los partidos de cada fecha que generes desde ahora.');
    } catch (ex) { setErr(errText(ex, 'No se pudieron guardar las pistas')); }
    finally { setBusy(false); }
  };

  return (
    <Section title="Pistas del torneo"
      hint="Los partidos de una fecha se juegan a la vez: se asigna una pista a cada partido, en el orden en que las marques. Si hay más partidos que pistas, los sobrantes quedan sin pista. Solo afecta a las fechas que generes después.">
      {visible.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>El club todavía no tiene pistas activas (se crean desde la ficha del club).</div>
      ) : (
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
          {visible.map(c => {
            const idx = state.selected.indexOf(c.id);
            return (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--bone-3)', fontSize: 13, cursor: 'pointer',
                background: idx >= 0 ? 'var(--court-soft)' : 'white' }}>
                <input type="checkbox" checked={idx >= 0} onChange={() => toggle(c.id)} />
                <span style={{ flex: 1, color: 'var(--ink)' }}>{c.name}{c.alias ? ` · ${c.alias}` : ''}{!c.isActive && ' (inactiva)'}</span>
                {idx >= 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--court-deep)' }}>#{idx + 1}</span>}
              </label>
            );
          })}
        </div>
      )}
      {state.selected.length > 1 && (
        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
          Orden: {state.selected.map(id => courtsById[id]?.name).filter(Boolean).join(' → ')}
        </div>
      )}
      <Feedback ok={ok} err={err} />
      <PrimaryButton busy={busy} disabled={unchanged} onClick={save}>Guardar pistas</PrimaryButton>
    </Section>
  );
}

// ── Reset / archive ──────────────────────────────────────────────────────────
function DangerSection({ tournament, onSaved }) {
  const [modal, setModal] = useState(null); // 'reset-keep' | 'reset-clear' | 'archive'
  const [err, setErr] = useState('');
  const played = (tournament.matches || []).filter(m => m.status === 'completed').length;
  const archived = tournament.status === 'archived';
  const canArchive = tournament.status !== 'draft';

  const run = async (fn) => { setErr(''); await fn(); setModal(null); onSaved(); };

  const btn = (color, bg) => ({ padding: '8px 12px', borderRadius: 9, border: `1px solid ${color}`, background: bg, color, fontSize: 12, fontWeight: 700, cursor: 'pointer' });

  return (
    <Section title="Zona de riesgo">
      <Feedback err={err} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={btn('var(--amber)', 'var(--amber-soft)')} onClick={() => setModal('reset-keep')}>Reiniciar (conservar jugadores)</button>
        <button style={btn('var(--crimson)', 'var(--crimson-soft)')} onClick={() => setModal('reset-clear')}>Reiniciar y quitar jugadores</button>
        {canArchive && (
          <button style={btn('var(--ink-soft)', 'var(--bone-2)')} onClick={() => setModal('archive')}>{archived ? 'Restaurar del archivo' : 'Archivar torneo'}</button>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
        Reiniciar borra todos los partidos{played ? ` (hay ${played} con resultado)` : ''} y devuelve el torneo a borrador. Archivar solo lo oculta del día a día; se puede restaurar.
      </div>

      {(modal === 'reset-keep' || modal === 'reset-clear') && (
        <ConfirmModal
          title="Reiniciar torneo"
          confirmLabel="Reiniciar"
          requireTypedConfirmation={played > 0 || modal === 'reset-clear'}
          confirmWord="reiniciar"
          message={`Se eliminarán todos los partidos${played ? ` y ${played} resultado${played !== 1 ? 's' : ''}` : ''}${modal === 'reset-clear' ? ' y también todos los jugadores inscriptos' : ' (los jugadores se conservan)'}. El torneo vuelve a borrador. No se puede deshacer.`}
          onConfirm={() => run(() => tournamentEngineService.reset(tournament.id, modal === 'reset-keep'))}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'archive' && (
        <ConfirmModal
          title={archived ? 'Restaurar torneo' : 'Archivar torneo'}
          confirmLabel={archived ? 'Restaurar' : 'Archivar'}
          danger={false}
          message={archived ? 'El torneo volverá al estado Finalizado.' : 'El torneo pasa a Archivado. Podrás restaurarlo cuando quieras.'}
          onConfirm={() => run(() => tournamentEngineService.archive(tournament.id))}
          onClose={() => setModal(null)}
        />
      )}
    </Section>
  );
}

export default function SettingsTab({ tournament, onRefresh, onGoToTab }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DetailsSection tournament={tournament} onSaved={onRefresh} />
      <ResultModeSection tournament={tournament} onSaved={onRefresh} />
      <CapacitySection tournament={tournament} onSaved={onRefresh} onGoToTab={onGoToTab} />
      <CourtsSection tournament={tournament} />
      <DangerSection tournament={tournament} onSaved={onRefresh} />
    </div>
  );
}
