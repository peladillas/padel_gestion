import { useState } from 'react';
import { PlusIcon, PencilSquareIcon, TrashIcon, Squares2X2Icon, SunIcon } from '@heroicons/react/24/outline';
import { clubService } from '../../services/api';
import ConfirmModal from '../ui/ConfirmModal';
import { courtTraits } from '../../utils/courts';

// A club's courts: how many, and how each one is built (structure material, floor, walls,
// orientation, indoor/outdoor, lighting) plus its operational status. These describe the
// court to players AND — with the block calendar — are the restrictions bookings must respect.

const BULK_MAX = 30;    // mirrors CourtService::BULK_MAX
const NOTES_MAX = 200;  // mirrors CourtRules::NOTES_MAX

const inp = { border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', width: '100%', boxSizing: 'border-box' };
const label11 = { fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' };
const STATUS_STYLE = {
  operational: { bg: 'var(--ok-soft)', color: 'var(--ok)' },
  maintenance: { bg: 'var(--amber-soft)', color: 'var(--amber)' },
  closed: { bg: 'var(--crimson-soft)', color: 'var(--crimson)' },
};

const EMPTY_FORM = { name: '', alias: '', status: 'operational', setting: '', floor: '', walls: '', material: '', orientation: '', hasLighting: false, notes: '' };
const EMPTY_BULK = { count: '4', namePrefix: 'Pista', startNumber: '', setting: '', floor: '', walls: '', material: '', orientation: '', hasLighting: false };
const errText = (ex, fallback) => ex?.response?.data?.error || fallback;

function Select({ id, label, value, onChange, options, blank = 'Sin indicar' }) {
  return (
    <div>
      <label style={label11} htmlFor={id}>{label}</label>
      <select id={id} style={inp} value={value} onChange={e => onChange(e.target.value)}>
        {blank !== null && <option value="">{blank}</option>}
        {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </div>
  );
}

/** The characteristics shared by the single-court form and the bulk form. */
function Characteristics({ idPrefix, form, set, catalog }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <Select id={`${idPrefix}-setting`} label="Tipo" value={form.setting} onChange={v => set('setting', v)} options={catalog.setting} />
        <Select id={`${idPrefix}-floor`} label="Piso" value={form.floor} onChange={v => set('floor', v)} options={catalog.floor} />
        <Select id={`${idPrefix}-walls`} label="Paredes" value={form.walls} onChange={v => set('walls', v)} options={catalog.walls} />
        <Select id={`${idPrefix}-material`} label="Material de la estructura" value={form.material} onChange={v => set('material', v)} options={catalog.material} />
        <Select id={`${idPrefix}-orientation`} label="Orientación" value={form.orientation} onChange={v => set('orientation', v)} options={catalog.orientation} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.hasLighting} onChange={e => set('hasLighting', e.target.checked)} />Con iluminación para jugar de noche
      </label>
    </>
  );
}

function StatusBadge({ status, catalog }) {
  const style = STATUS_STYLE[status] || STATUS_STYLE.operational;
  const label = catalog.status.find(s => s.key === status)?.label || status;
  return <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 5, padding: '2px 7px', background: style.bg, color: style.color, flexShrink: 0 }}>{label}</span>;
}

export default function CourtsManager({ clubId, courts, catalog, onReload }) {
  const [mode, setMode] = useState(null);            // null | 'new' | 'bulk' | court.id (editing)
  const [form, setForm] = useState(EMPTY_FORM);
  const [bulk, setBulk] = useState(EMPTY_BULK);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const setF = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErr(''); };
  const setB = (k, v) => { setBulk(f => ({ ...f, [k]: v })); setErr(''); };
  const close = () => { setMode(null); setErr(''); };

  const openNew = () => { setForm(EMPTY_FORM); setErr(''); setMode('new'); };
  const openBulk = () => { setBulk(EMPTY_BULK); setErr(''); setMode('bulk'); };
  const openEdit = (c) => {
    setForm({ name: c.name, alias: c.alias || '', status: c.status || 'operational', setting: c.setting || '', floor: c.floor || '', walls: c.walls || '', material: c.material || '',
      orientation: c.orientation || '', hasLighting: !!c.hasLighting, notes: c.notes || '' });
    setErr(''); setMode(c.id);
  };

  // Blank selects go as null so the admin can clear a characteristic.
  const orNull = (v) => (v === '' ? null : v);
  const traitsPayload = (f) => ({ setting: orNull(f.setting), floor: orNull(f.floor), walls: orNull(f.walls), material: orNull(f.material), orientation: orNull(f.orientation), hasLighting: f.hasLighting });

  const run = async (fn, fallback) => {
    setSaving(true); setErr('');
    try { await fn(); await onReload(); close(); }
    catch (ex) { setErr(errText(ex, fallback)); }
    finally { setSaving(false); }
  };

  const saveOne = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr('El nombre es obligatorio'); return; }
    const payload = { name: form.name.trim(), alias: form.alias.trim() || null, status: form.status, notes: form.notes.trim() || null, ...traitsPayload(form) };
    run(() => (mode === 'new' ? clubService.createCourt(clubId, payload) : clubService.updateCourt(clubId, mode, payload)), 'No se pudo guardar la pista');
  };

  const saveBulk = (e) => {
    e.preventDefault();
    const payload = { count: Number(bulk.count), namePrefix: bulk.namePrefix.trim() || 'Pista', ...traitsPayload(bulk) };
    if (bulk.startNumber.trim() !== '') payload.startNumber = Number(bulk.startNumber);
    run(() => clubService.createCourts(clubId, payload), 'No se pudieron crear las pistas');
  };

  const changeStatus = async (court, status) => {
    try { await clubService.updateCourt(clubId, court.id, { status }); await onReload(); }
    catch (ex) { setErr(errText(ex, 'No se pudo cambiar el estado')); }
  };

  const confirmDelete = async () => {
    await clubService.deleteCourt(clubId, deleteTarget.id);
    setDeleteTarget(null);
    await onReload();
  };

  const counts = courts.reduce((acc, c) => ({ ...acc, [c.status || 'operational']: (acc[c.status || 'operational'] || 0) + 1 }), {});
  const summary = [
    `${courts.length} ${courts.length === 1 ? 'pista' : 'pistas'}`,
    counts.operational && `${counts.operational} operativa${counts.operational === 1 ? '' : 's'}`,
    counts.maintenance && `${counts.maintenance} en mantenimiento`,
    counts.closed && `${counts.closed} fuera de servicio`,
  ].filter(Boolean).join(' · ');

  const primary = { padding: '8px 0', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 12, color: '#fff', background: saving ? 'var(--line)' : 'var(--court)', cursor: saving ? 'not-allowed' : 'pointer' };
  const cancel = { padding: '8px 0', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--bone-2)', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
  const formBox = { background: 'var(--bone-2)', borderRadius: 12, border: '1px solid var(--court-soft)', padding: 14, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 10 };
  const outline = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: '1px dashed var(--court)', background: 'var(--court-soft)', color: 'var(--court-deep)', fontWeight: 700, fontSize: 11, cursor: 'pointer' };

  return (
    <section aria-label="Pistas del club" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pistas</div>
          {courts.length > 0 && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{summary}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={openBulk} style={outline}><Squares2X2Icon style={{ width: 12, height: 12 }} aria-hidden="true" />Crear varias</button>
          <button type="button" onClick={openNew} style={outline}><PlusIcon style={{ width: 12, height: 12 }} aria-hidden="true" />Nueva pista</button>
        </div>
      </div>

      {mode === 'bulk' && (
        <form onSubmit={saveBulk} style={formBox} aria-label="Crear varias pistas">
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink)' }}>Crear varias pistas iguales</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            <div>
              <label style={label11} htmlFor="bulk-count">¿Cuántas? (1–{BULK_MAX})</label>
              <input id="bulk-count" type="number" min="1" max={BULK_MAX} style={inp} value={bulk.count} onChange={e => setB('count', e.target.value)} autoFocus />
            </div>
            <div>
              <label style={label11} htmlFor="bulk-prefix">Nombre base</label>
              <input id="bulk-prefix" style={inp} value={bulk.namePrefix} maxLength={50} onChange={e => setB('namePrefix', e.target.value)} placeholder="Pista" />
            </div>
            <div>
              <label style={label11} htmlFor="bulk-start">Empezar en el nº</label>
              <input id="bulk-start" type="number" min="1" style={inp} value={bulk.startNumber} onChange={e => setB('startNumber', e.target.value)} placeholder="1" />
            </div>
          </div>
          <Characteristics idPrefix="bulk" form={bulk} set={setB} catalog={catalog} />
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Se crean como “{(bulk.namePrefix.trim() || 'Pista')} 1”, “… 2”, etc. con estas características; los nombres que ya existan se saltan. Luego puedes ajustar cada una.</div>
          {err && <div role="alert" style={{ fontSize: 11, color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 6, padding: '6px 10px' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={close} style={{ ...cancel, flex: 1 }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ ...primary, flex: 2 }}>{saving ? 'Creando…' : `Crear ${Number(bulk.count) || ''} pistas`.trim()}</button>
          </div>
        </form>
      )}

      {(mode === 'new' || (mode && mode !== 'bulk')) && (
        <form onSubmit={saveOne} style={formBox} aria-label={mode === 'new' ? 'Nueva pista' : 'Editar pista'}>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink)' }}>{mode === 'new' ? 'Nueva pista' : 'Editar pista'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <div>
              <label style={label11} htmlFor="court-name">Nombre *</label>
              <input id="court-name" style={inp} value={form.name} maxLength={60} onChange={e => setF('name', e.target.value)} placeholder="Pista 1" autoFocus />
            </div>
            <div>
              <label style={label11} htmlFor="court-alias">Alias (opcional)</label>
              <input id="court-alias" style={inp} value={form.alias} maxLength={60} onChange={e => setF('alias', e.target.value)} placeholder="La Central" />
            </div>
            <Select id="court-status" label="Estado" value={form.status} onChange={v => setF('status', v)} options={catalog.status} blank={null} />
          </div>
          <Characteristics idPrefix="court" form={form} set={setF} catalog={catalog} />
          <div>
            <label style={label11} htmlFor="court-notes">Notas internas (no las ven los jugadores)</label>
            <textarea id="court-notes" style={{ ...inp, resize: 'vertical', minHeight: 48 }} maxLength={NOTES_MAX} value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Ej.: revisar la red en marzo" />
            <div style={{ fontSize: 10, color: 'var(--ink-soft)', textAlign: 'right' }}>{form.notes.length}/{NOTES_MAX}</div>
          </div>
          {err && <div role="alert" style={{ fontSize: 11, color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 6, padding: '6px 10px' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={close} style={{ ...cancel, flex: 1 }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ ...primary, flex: 2 }}>{saving ? 'Guardando…' : mode === 'new' ? 'Crear pista' : 'Guardar'}</button>
          </div>
        </form>
      )}

      {err && !mode && <div role="alert" style={{ fontSize: 11, color: 'var(--crimson)', marginBottom: 8 }}>{err}</div>}

      {courts.length === 0 && !mode ? (
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', padding: '8px 0' }}>Este club aún no tiene pistas. Usa “Crear varias” para dar de alta todas de una vez.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {courts.map(court => {
            const traits = courtTraits(court, catalog);
            const off = court.status && court.status !== 'operational';
            return (
              <li key={court.id} style={{ padding: '9px 11px', background: off ? 'var(--bone-3)' : 'var(--bone-2)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{court.name}</span>
                    {court.alias && <span style={{ fontSize: 11, color: 'var(--ink-soft)', marginLeft: 6 }}>· {court.alias}</span>}
                  </div>
                  <StatusBadge status={court.status || 'operational'} catalog={catalog} />
                  <select aria-label={`Estado de ${court.name}`} value={court.status || 'operational'} onChange={e => changeStatus(court, e.target.value)}
                    style={{ ...inp, width: 'auto', padding: '4px 6px', fontSize: 11 }}>
                    {catalog.status.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <button type="button" onClick={() => openEdit(court)} aria-label={`Editar ${court.name}`} title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: 3 }}>
                    <PencilSquareIcon style={{ width: 14, height: 14 }} />
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(court)} aria-label={`Eliminar ${court.name}`} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crimson)', padding: 3 }}>
                    <TrashIcon style={{ width: 14, height: 14 }} />
                  </button>
                </div>
                {traits.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {traits.map(t => (
                      <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink-mid)', background: 'white', border: '1px solid var(--line)', borderRadius: 20, padding: '2px 9px' }}>
                        {t === 'Iluminación' && <SunIcon style={{ width: 11, height: 11 }} aria-hidden="true" />}{t}
                      </span>
                    ))}
                  </div>
                )}
                {court.notes && <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontStyle: 'italic' }}>Nota: {court.notes}</div>}
              </li>
            );
          })}
        </ul>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Eliminar pista"
          message={`¿Eliminar la pista "${deleteTarget.name}"? Se borran también sus bloqueos del calendario y se desvincula de los partidos de torneo. No se puede deshacer.`}
          confirmLabel="Eliminar pista"
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
