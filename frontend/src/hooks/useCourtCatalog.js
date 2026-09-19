import { useState, useEffect } from 'react';
import { clubService } from '../services/api';

// One request per session: the vocabularies (floor, walls, material, orientation, setting,
// status, block reasons) never change while the app is open.
let catalogPromise = null;
export function useCourtCatalog() {
  const [catalog, setCatalog] = useState(null);
  useEffect(() => {
    let alive = true;
    catalogPromise ??= clubService.getCourtCatalog().then(r => r.data).catch(() => { catalogPromise = null; return null; });
    catalogPromise.then(c => { if (alive) setCatalog(c); });
    return () => { alive = false; };
  }, []);
  return catalog;
}
