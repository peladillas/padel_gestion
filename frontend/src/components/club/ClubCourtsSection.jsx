import { useState, useEffect, useCallback } from 'react';
import { clubService } from '../../services/api';
import { useCourtCatalog } from '../../hooks/useCourtCatalog';
import CourtsManager from './CourtsManager';
import CourtBlocksCalendar from './CourtBlocksCalendar';

// Everything about a club's courts in one place: the courts themselves and the block
// calendar. Loads the courts once and shares them, so creating a court makes it
// immediately available to block.
export default function ClubCourtsSection({ clubId }) {
  const catalog = useCourtCatalog();
  const [courts, setCourts] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // Initial load (and "Reintentar"): state is only set from the request's callbacks.
  useEffect(() => {
    let alive = true;
    clubService.getCourts(clubId)
      .then(r => { if (alive) { setCourts(r.data || []); setLoadError(''); } })
      .catch(() => { if (alive) setLoadError('No se pudieron cargar las pistas'); });
    return () => { alive = false; };
  }, [clubId, attempt]);

  // After a change: children await this so the list is fresh when their form closes.
  const reload = useCallback(async () => {
    setCourts((await clubService.getCourts(clubId)).data || []);
  }, [clubId]);

  if (loadError) {
    return (
      <div role="alert" style={{ padding: '12px 0', fontSize: 12, color: 'var(--crimson)' }}>
        {loadError} <button type="button" onClick={() => setAttempt(a => a + 1)} style={{ background: 'none', border: 'none', color: 'var(--court-deep)', fontWeight: 700, cursor: 'pointer' }}>Reintentar</button>
      </div>
    );
  }
  if (!courts || !catalog) return <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--ink-soft)' }}>Cargando pistas…</div>;

  return (
    <>
      <CourtsManager clubId={clubId} courts={courts} catalog={catalog} onReload={reload} />
      <CourtBlocksCalendar clubId={clubId} courts={courts} catalog={catalog} />
    </>
  );
}
