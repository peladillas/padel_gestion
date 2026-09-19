import { useState, useEffect } from 'react';
import { clubService } from '../services/api';

// One request for the whole session: the catalogue never changes while the app is open.
let catalogPromise = null;
export function useServiceCatalog() {
  const [catalog, setCatalog] = useState(null);
  useEffect(() => {
    let alive = true;
    catalogPromise ??= clubService.getServiceCatalog().then(r => r.data).catch(() => { catalogPromise = null; return null; });
    catalogPromise.then(c => { if (alive) setCatalog(c); });
    return () => { alive = false; };
  }, []);
  return catalog;
}
