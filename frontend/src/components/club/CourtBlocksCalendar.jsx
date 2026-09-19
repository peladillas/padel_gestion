import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { clubService } from '../../services/api';
import { useModalA11y } from '../../hooks/useModalA11y';
import { MONTHS, WEEKDAYS, monthGrid, gridRange, shiftMonth, rowsByDay, formatRange, reasonColor, deleteChoices, labelOf } from '../../utils/courts';

// The calendar of court blocks: periods when a court can't be used (maintenance, cleaning,
// works, a private event…). They are the restrictions that reservations must respect.
// All times are the club's own local time (the API returns them already converted).

const NOTE_MAX = 200;   // mirrors CourtBlockService::NOTE_MAX

const inp = { border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', width: '100%', boxSizing: 'border-box' };
const label11 = { fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' };
const errText = (ex, fallback) => ex?.response?.data?.error || fallback;

/** Today's date (YYYY-MM-DD) in the club's timezone, so "today" is right even when the admin travels. */
function todayIn(timezone) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || undefined }).format(new Date()); }
  catch { return new Intl.DateTimeFormat('en-CA').format(new Date()); }
}

const longDate = (key) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`));

function Dialog({ title, onClose, children, width = 460 }) {
  const ref = useRef(null);
  useModalA11y(ref, onClose);
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        style={{ background: 'var(--paper)', borderRadius: 16, padding: 20, width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--line)', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', outline: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{title}</span>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}><XMarkIcon style={{ width: 20, height: 20 }} aria-hidden="true" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── new block ───────────────────────────────────────────────────────
function NewBlockModal({ clubId, courts, catalog, timezone, date, onClose, onCreated }) {
  const [form, setForm] = useState({
    allCourts: true, courtIds: [], startsAt: `${date}T09:00`, endsAt: `${date}T10:00`, reason: 'maintenance', note: '', repeat: false, until: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErr(''); };
  const toggleCourt = (id) => set('courtIds', form.courtIds.includes(id) ? form.courtIds.filter(x => x !== id) : [...form.courtIds, id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.allCourts && form.courtIds.length === 0) { setErr('Elige al menos una pista'); return; }
    if (form.repeat && !form.until) { setErr('Indica hasta cuándo se repite'); return; }
    setSaving(true); setErr('');
    try {
      await clubService.createCourtBlock(clubId, {
        ...(form.allCourts ? { allCourts: true } : { courtIds: form.courtIds }),
        startsAt: form.startsAt, endsAt: form.endsAt, reason: form.reason, note: form.note.trim() || null,
        ...(form.repeat ? { repeat: { type: 'weekly', until: form.until } } : {}),
      });
      await onCreated();
    } catch (ex) { setErr(errText(ex, 'No se pudo crear el bloqueo')); setSaving(false); }
  };

  return (
    <Dialog title="Bloquear pistas" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={label11}>Pistas</legend>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 6 }}>
            <input type="checkbox" checked={form.allCourts} onChange={e => set('allCourts', e.target.checked)} />Todas las pistas ({courts.length})
          </label>
          {!form.allCourts && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {courts.map(c => (
                <label key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
                  border: `1px solid ${form.courtIds.includes(c.id) ? 'var(--court)' : 'var(--line)'}`, background: form.courtIds.includes(c.id) ? 'var(--court-soft)' : 'white' }}>
                  <input type="checkbox" checked={form.courtIds.includes(c.id)} onChange={() => toggleCourt(c.id)} />{c.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><label style={label11} htmlFor="blk-start">Desde</label><input id="blk-start" type="datetime-local" style={inp} value={form.startsAt} onChange={e => set('startsAt', e.target.value)} required /></div>
          <div><label style={label11} htmlFor="blk-end">Hasta</label><input id="blk-end" type="datetime-local" style={inp} value={form.endsAt} onChange={e => set('endsAt', e.target.value)} required /></div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: -6 }}>Hora del club{timezone ? ` (${timezone.replace(/_/g, ' ')})` : ''}.</div>

        <div>
          <label style={label11} htmlFor="blk-reason">Motivo</label>
          <select id="blk-reason" style={inp} value={form.reason} onChange={e => set('reason', e.target.value)}>
            {catalog.reason.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label style={label11} htmlFor="blk-note">Nota (opcional)</label>
          <input id="blk-note" style={inp} maxLength={NOTE_MAX} value={form.note} onChange={e => set('note', e.target.value)} placeholder="Ej.: cambio de césped" />
        </div>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.repeat} onChange={e => set('repeat', e.target.checked)} />Repetir cada semana
          </label>
          {form.repeat && (
            <div style={{ marginTop: 8 }}>
              <label style={label11} htmlFor="blk-until">Hasta el día (inclusive)</label>
              <input id="blk-until" type="date" style={inp} min={form.startsAt.slice(0, 10)} value={form.until} onChange={e => set('until', e.target.value)} />
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>Se mantiene la misma hora local aunque cambie el horario de verano. Máximo 104 semanas.</div>
            </div>
          )}
        </div>

        {err && <div role="alert" style={{ fontSize: 12, color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bone-2)', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button type="submit" disabled={saving} style={{ flex: 2, padding: '9px 0', borderRadius: 10, border: 'none', background: saving ? 'var(--line)' : 'var(--court)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Guardando…' : 'Crear bloqueo'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ── delete ──────────────────────────────────────────────────────────
function DeleteBlockModal({ clubId, row, onClose, onDeleted }) {
  const choices = deleteChoices(row);
  const [scope, setScope] = useState(choices[0].scope);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const confirm = async () => {
    setBusy(true); setErr('');
    try { await clubService.deleteCourtBlock(clubId, row.blocks[0].id, scope); await onDeleted(); }
    catch (ex) { setErr(errText(ex, 'No se pudo eliminar')); setBusy(false); }
  };

  return (
    <Dialog title="Eliminar bloqueo" onClose={onClose} width={400}>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink)' }}>
        {row.reasonLabel} · {row.courtNames.join(', ')} · {formatRange(row)}
      </p>
      {choices.length > 1 && (
        <fieldset style={{ border: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <legend style={label11}>¿Qué eliminar?</legend>
          {choices.map(c => (
            <label key={c.scope} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="radio" name="del-scope" value={c.scope} checked={scope === c.scope} onChange={() => setScope(c.scope)} />{c.label}
            </label>
          ))}
        </fieldset>
      )}
      {err && <div role="alert" style={{ fontSize: 12, color: 'var(--crimson)', marginBottom: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bone-2)', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
        <button type="button" onClick={confirm} disabled={busy} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: busy ? 'var(--line)' : 'var(--crimson)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Eliminando…' : 'Eliminar'}
        </button>
      </div>
    </Dialog>
  );
}

// ── the calendar ────────────────────────────────────────────────────
export default function CourtBlocksCalendar({ clubId, courts, catalog }) {
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState(null);           // 'YYYY-MM-DD'
  const [showNew, setShowNew] = useState(false);
  const [deleteRow, setDeleteRow] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: '' });

  const queryKey = `${clubId}|${view.year}|${view.month}|${reloadKey}`;
  const loading = result.key !== queryKey;

  useEffect(() => {
    let alive = true;
    clubService.getCourtBlocks(clubId, gridRange(view.year, view.month))
      .then(r => alive && setResult({ key: queryKey, data: r.data, error: '' }))
      .catch(ex => alive && setResult({ key: queryKey, data: null, error: errText(ex, 'No se pudo cargar el calendario') }));
    return () => { alive = false; };
  }, [clubId, view.year, view.month, queryKey]);

  const data = result.data;
  const byDay = useMemo(() => rowsByDay(data?.blocks || []), [data]);
  const cells = useMemo(() => monthGrid(view.year, view.month), [view]);
  const today = todayIn(data?.timezone);
  const reload = async () => { setShowNew(false); setDeleteRow(null); setReloadKey(k => k + 1); };
  const go = (delta) => { setView(v => shiftMonth(v.year, v.month, delta)); setSelected(null); };
  const dayRows = selected ? (byDay[selected] || []) : [];

  if (courts.length === 0) {
    return <section aria-label="Calendario de bloqueos" style={{ marginTop: 18, fontSize: 12, color: 'var(--ink-soft)' }}>Crea las pistas del club para poder bloquearlas por mantenimiento u otros motivos.</section>;
  }

  return (
    <section aria-label="Calendario de bloqueos" style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Calendario de bloqueos</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>Cuando una pista está bloqueada no se puede reservar.</div>
        </div>
        <button type="button" onClick={() => setShowNew(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: 'none', background: 'var(--court)', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
          <PlusIcon style={{ width: 12, height: 12 }} aria-hidden="true" />Nuevo bloqueo
        </button>
      </div>

      <div style={{ background: 'white', border: '1px solid var(--bone-3)', borderRadius: 14, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button type="button" onClick={() => go(-1)} aria-label="Mes anterior" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink-2)' }}><ChevronLeftIcon style={{ width: 18, height: 18 }} aria-hidden="true" /></button>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', textTransform: 'capitalize' }} aria-live="polite">{MONTHS[view.month]} {view.year}</div>
          <button type="button" onClick={() => go(1)} aria-label="Mes siguiente" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink-2)' }}><ChevronRightIcon style={{ width: 18, height: 18 }} aria-hidden="true" /></button>
        </div>

        {result.error && !loading ? (
          <div role="alert" style={{ fontSize: 12, color: 'var(--crimson)', padding: '10px 0' }}>{result.error} <button type="button" onClick={() => setReloadKey(k => k + 1)} style={{ background: 'none', border: 'none', color: 'var(--court-deep)', fontWeight: 700, cursor: 'pointer' }}>Reintentar</button></div>
        ) : (
          <div role="grid" aria-label={`${MONTHS[view.month]} ${view.year}`} aria-busy={loading} style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
            <div role="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
              {WEEKDAYS.map(d => <div key={d} role="columnheader" style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', padding: '2px 0' }}>{d}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {cells.map(cell => {
                const rows = byDay[cell.date] || [];
                const reasons = [...new Set(rows.map(r => r.reason))];
                const isSel = selected === cell.date;
                const isToday = cell.date === today;
                return (
                  <button key={cell.date} type="button" role="gridcell" onClick={() => setSelected(cell.date)} aria-pressed={isSel} aria-current={isToday ? 'date' : undefined}
                    aria-label={`${longDate(cell.date)}: ${rows.length === 0 ? 'sin bloqueos' : `${rows.length} bloqueo${rows.length === 1 ? '' : 's'}`}`}
                    style={{ minHeight: 44, padding: '4px 2px', borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      border: `1px solid ${isSel ? 'var(--court)' : isToday ? 'var(--court-soft)' : 'transparent'}`, background: isSel ? 'var(--court-soft)' : rows.length ? 'var(--bone-2)' : 'transparent',
                      opacity: cell.inMonth ? 1 : 0.4 }}>
                    <span style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--court-deep)' : 'var(--ink)' }}>{cell.day}</span>
                    <span style={{ display: 'flex', gap: 2, minHeight: 6 }} aria-hidden="true">
                      {reasons.slice(0, 3).map(r => <span key={r} style={{ width: 6, height: 6, borderRadius: '50%', background: reasonColor(r) }} />)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Day panel */}
        {selected && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--bone-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', textTransform: 'capitalize' }}>{longDate(selected)}</div>
              <button type="button" onClick={() => setShowNew(true)} style={{ background: 'none', border: 'none', color: 'var(--court-deep)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>+ Bloquear este día</button>
            </div>
            {dayRows.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Sin bloqueos este día.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dayRows.map(row => (
                  <li key={row.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'var(--bone-2)', borderLeft: `4px solid ${reasonColor(row.reason)}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{formatRange(row)} · {row.reasonLabel || labelOf(catalog, 'reason', row.reason)}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-mid)' }}>{row.courtNames.join(', ')}</div>
                      {row.note && <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontStyle: 'italic' }}>{row.note}</div>}
                      {row.groupCount > row.blocks.length && <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>Forma parte de una serie</div>}
                    </div>
                    <button type="button" onClick={() => setDeleteRow(row)} aria-label={`Eliminar bloqueo de ${row.courtNames.join(', ')} a las ${formatRange(row)}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crimson)', padding: 3 }}><TrashIcon style={{ width: 15, height: 15 }} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {showNew && <NewBlockModal clubId={clubId} courts={courts} catalog={catalog} timezone={data?.timezone} date={selected || today} onClose={() => setShowNew(false)} onCreated={reload} />}
      {deleteRow && <DeleteBlockModal clubId={clubId} row={deleteRow} onClose={() => setDeleteRow(null)} onDeleted={reload} />}
    </section>
  );
}
