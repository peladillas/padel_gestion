import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MagnifyingGlassIcon, AdjustmentsHorizontalIcon, MapPinIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { clubService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDebounced } from '../hooks/useDebounced';
import ClubInfoCard from '../components/club/ClubInfoCard';
import ClubDetailModal from '../components/club/ClubDetailModal';
import { ServicesPicker } from '../components/club/clubServices';
import { DAYS } from '../utils/clubs';

// Club directory for every role: search, filter (services, city, open days, open
// now, courts, distance) and sort. All the work happens in the backend
// (GET /api/clubs/directory); this page only builds the query and shows cards.

const EMPTY = { q: '', services: [], servicesMode: 'all', city: '', openDays: [], openNow: false, minCourts: '', sort: 'name' };
const RADII = [5, 10, 25, 50, 100];
const SORTS = [['name', 'Nombre'], ['distance', 'Cercanía'], ['courts', 'Más pistas'], ['price', 'Precio (menor primero)'], ['services', 'Más servicios']];

const inp = { border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' };
const label11 = { fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' };

function Toggle({ on, onClick, children, Icon: IconProp }) {
  const Icon = IconProp;
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, borderRadius: 20, padding: '7px 13px', cursor: 'pointer',
        border: `1px solid ${on ? 'var(--court)' : 'var(--line)'}`, background: on ? 'var(--court-soft)' : 'white', color: on ? 'var(--court-deep)' : 'var(--ink-mid)' }}>
      {Icon && <Icon style={{ width: 14, height: 14 }} aria-hidden="true" />}{children}
    </button>
  );
}

export default function ClubDirectory() {
  const { isAdmin } = useAuth();
  const [filters, setFilters] = useState(EMPTY);
  const [origin, setOrigin] = useState(null);          // { lat, lng } once the user shares their position
  const [radius, setRadius] = useState('');            // '' = no limit
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState(null);      // { club, opener }: the open sheet and the card that opened it
  const [geoError, setGeoError] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);
  const [result, setResult] = useState({ key: null, error: '', data: [], meta: null });
  const [reloadKey, setReloadKey] = useState(0);

  const q = useDebounced(filters.q, 300);

  const update = (patch) => { setFilters(f => ({ ...f, ...patch })); setPage(1); };
  const toggleDay = (d) => update({ openDays: filters.openDays.includes(d) ? filters.openDays.filter(x => x !== d) : [...filters.openDays, d] });

  // The query sent to the backend (unset filters are simply left out).
  const params = useMemo(() => {
    const p = { sort: filters.sort, page, perPage: 12 };
    if (q.trim()) p.q = q.trim();
    if (filters.services.length) { p.services = filters.services.join(','); p.servicesMode = filters.servicesMode; }
    if (filters.city) p.city = filters.city;
    if (filters.openDays.length) p.openDays = filters.openDays.join(',');
    if (filters.openNow) p.openNow = 1;
    if (filters.minCourts) p.minCourts = filters.minCourts;
    if (origin) { p.lat = origin.lat; p.lng = origin.lng; if (radius) p.radiusKm = radius; }
    return p;
  }, [q, filters.services, filters.servicesMode, filters.city, filters.openDays, filters.openNow, filters.minCourts, filters.sort, origin, radius, page]);

  // "Loading" = the last answer we hold is for a different query than the current one.
  const queryKey = useMemo(() => JSON.stringify([params, reloadKey]), [params, reloadKey]);
  const loading = result.key !== queryKey;
  const state = { loading, error: loading ? '' : result.error, data: result.data, meta: result.meta };

  useEffect(() => {
    const ctrl = new AbortController();
    clubService.directory(params, ctrl.signal)
      .then(r => setResult({ key: queryKey, error: '', data: r.data.data, meta: r.data.meta }))
      .catch(ex => {
        if (ctrl.signal.aborted || ex?.code === 'ERR_CANCELED') return;
        setResult(s => ({ ...s, key: queryKey, error: ex?.response?.data?.error || 'No se pudo cargar el directorio.' }));
      });
    return () => ctrl.abort();
  }, [params, queryKey]);

  const share = useCallback(() => {
    if (origin) {   // toggle off
      setOrigin(null); setRadius(''); setGeoError('');
      setFilters(f => ({ ...f, sort: f.sort === 'distance' ? 'name' : f.sort })); setPage(1);
      return;
    }
    if (!navigator.geolocation) { setGeoError('Tu navegador no permite obtener la ubicación.'); return; }
    setGeoBusy(true); setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5) });
        setFilters(f => ({ ...f, sort: 'distance' })); setPage(1); setGeoBusy(false);
      },
      (err) => { setGeoError(err.code === 1 ? 'Has denegado el permiso de ubicación.' : 'No pudimos obtener tu ubicación.'); setGeoBusy(false); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }, [origin]);

  const activeCount = filters.services.length + filters.openDays.length + (filters.city ? 1 : 0) + (filters.openNow ? 1 : 0) + (filters.minCourts ? 1 : 0) + (radius ? 1 : 0);
  const clear = () => { setFilters(f => ({ ...EMPTY, q: f.q, sort: origin ? 'distance' : 'name' })); setRadius(''); setPage(1); };
  const { meta } = state;

  return (
    <div style={{ padding: '20px 16px 32px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 26, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>
            <em style={{ color: 'var(--court-deep)', fontStyle: 'normal' }}>Clubs.</em>
          </h1>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
            {meta ? `${meta.total} club${meta.total !== 1 ? 's' : ''}${activeCount || q.trim() ? ' con estos filtros' : ''}` : 'Buscando…'}
          </div>
        </div>
        {isAdmin() && <Link to="/clubs" style={{ fontSize: 12, fontWeight: 700, color: 'var(--court-deep)', textDecoration: 'none' }}>Gestionar clubs →</Link>}
      </div>

      {/* Search + quick toggles */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <MagnifyingGlassIcon style={{ position: 'absolute', left: 11, top: 10, width: 16, height: 16, color: 'var(--ink-soft)' }} aria-hidden="true" />
          <input type="search" aria-label="Buscar clubs" style={{ ...inp, width: '100%', paddingLeft: 34 }} value={filters.q} onChange={e => update({ q: e.target.value })}
            placeholder="Nombre, ciudad, dirección…" />
        </div>
        <Toggle on={!!origin} onClick={share} Icon={MapPinIcon}>{geoBusy ? 'Buscando…' : origin ? 'Cerca de mí' : 'Cerca de mí'}</Toggle>
        <Toggle on={filters.openNow} onClick={() => update({ openNow: !filters.openNow })}>Abierto ahora</Toggle>
        <Toggle on={showFilters || activeCount > 0} onClick={() => setShowFilters(v => !v)} Icon={AdjustmentsHorizontalIcon}>
          Filtros{activeCount > 0 ? ` (${activeCount})` : ''}
        </Toggle>
      </div>
      {geoError && <div role="alert" style={{ fontSize: 12, color: 'var(--crimson)', marginBottom: 8 }}>{geoError}</div>}

      {/* Filters panel */}
      {showFilters && (
        <div style={{ background: 'white', border: '1px solid var(--bone-3)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div>
              <label style={label11} htmlFor="dir-city">Ciudad</label>
              <select id="dir-city" style={{ ...inp, width: '100%' }} value={filters.city} onChange={e => update({ city: e.target.value })}>
                <option value="">Todas</option>
                {(meta?.availableCities || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={label11} htmlFor="dir-courts">Pistas (mínimo)</label>
              <select id="dir-courts" style={{ ...inp, width: '100%' }} value={filters.minCourts} onChange={e => update({ minCourts: e.target.value })}>
                <option value="">Cualquiera</option>
                {[2, 4, 6, 8].map(n => <option key={n} value={n}>{n} o más</option>)}
              </select>
            </div>
            <div>
              <label style={label11} htmlFor="dir-radius">Distancia máxima</label>
              <select id="dir-radius" style={{ ...inp, width: '100%' }} value={radius} disabled={!origin} onChange={e => { setRadius(e.target.value); setPage(1); }}>
                <option value="">{origin ? 'Sin límite' : 'Activa “Cerca de mí”'}</option>
                {RADII.map(r => <option key={r} value={r}>{r} km</option>)}
              </select>
            </div>
          </div>

          <div>
            <span style={label11}>Abre estos días</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DAYS.map(d => <Toggle key={d.key} on={filters.openDays.includes(d.key)} onClick={() => toggleDay(d.key)}>{d.short}</Toggle>)}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ ...label11, marginBottom: 0 }}>Servicios</span>
              {filters.services.length > 1 && (
                <div style={{ display: 'inline-flex', gap: 2, background: 'var(--bone-3)', borderRadius: 9, padding: 2 }}>
                  {[['all', 'Todos'], ['any', 'Alguno']].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => update({ servicesMode: v })}
                      style={{ padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                        background: filters.servicesMode === v ? 'white' : 'transparent', color: filters.servicesMode === v ? 'var(--ink-2)' : 'var(--ink-soft)' }}>{l}</button>
                  ))}
                </div>
              )}
            </div>
            <ServicesPicker value={filters.services} onChange={v => update({ services: v })} />
          </div>

          {activeCount > 0 && (
            <button type="button" onClick={clear}
              style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--crimson)' }}>
              <XMarkIcon style={{ width: 14, height: 14 }} aria-hidden="true" />Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Sort */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <label htmlFor="dir-sort" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Ordenar por</label>
        <select id="dir-sort" style={{ ...inp, padding: '6px 10px', fontSize: 12 }} value={filters.sort} onChange={e => update({ sort: e.target.value })}>
          {SORTS.map(([v, l]) => <option key={v} value={v} disabled={v === 'distance' && !origin}>{l}{v === 'distance' && !origin ? ' (activa “Cerca de mí”)' : ''}</option>)}
        </select>
      </div>

      {/* Results */}
      {state.error ? (
        <div role="alert" style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ color: 'var(--crimson)', fontSize: 13, marginBottom: 10 }}>{state.error}</div>
          <button type="button" onClick={() => setReloadKey(k => k + 1)}
            style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--line)', background: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Reintentar</button>
        </div>
      ) : state.loading && !state.data.length ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-soft)', fontSize: 13 }}>Cargando…</div>
      ) : state.data.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-soft)', fontSize: 13 }}>
          No hay clubs que coincidan.{(activeCount > 0 || q.trim()) && <> <button type="button" onClick={() => { clear(); update({ q: '' }); }} style={{ background: 'none', border: 'none', color: 'var(--court-deep)', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Quitar filtros</button></>}
        </div>
      ) : (
        <div style={{ opacity: state.loading ? 0.6 : 1, transition: 'opacity .15s', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: 12 }}>
          {state.data.map(c => <ClubInfoCard key={c.id} club={c} onOpen={(club, opener) => setSelected({ club, opener })} />)}
        </div>
      )}

      {selected && <ClubDetailModal club={selected.club} returnFocusTo={selected.opener} onClose={() => setSelected(null)} />}

      {meta && meta.lastPage > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 18 }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            style={{ padding: '6px 14px', borderRadius: 9, border: '1px solid var(--line)', background: 'white', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1, fontSize: 12 }}>‹ Anterior</button>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Página {meta.page} de {meta.lastPage}</span>
          <button type="button" disabled={page >= meta.lastPage} onClick={() => setPage(p => p + 1)}
            style={{ padding: '6px 14px', borderRadius: 9, border: '1px solid var(--line)', background: 'white', cursor: page >= meta.lastPage ? 'default' : 'pointer', opacity: page >= meta.lastPage ? 0.4 : 1, fontSize: 12 }}>Siguiente ›</button>
        </div>
      )}
    </div>
  );
}
