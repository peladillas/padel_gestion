/*
 * Pure display-formatting helpers shared by the tournament match card
 * (components/tournament/matchDisplay.jsx) — split into their own file
 * so that file only exports components (Vite fast-refresh requirement).
 */

/**
 * "Apellido + inicial" labels (e.g. "Cortizo D."), disambiguated when
 * two players share last name + initial — grows the first-name prefix
 * within just that colliding group ("Cortizo Da." vs "Cortizo Di.")
 * until unique, falling back to a numeric suffix for genuinely
 * identical names. Returns { [playerId]: label }.
 */
export function buildPlayerLabels(players) {
  const byLast = {};
  players.forEach(p => {
    const last = (p.lastName || (p.name || '').split(' ').slice(1).join(' ') || p.name || '?').trim();
    (byLast[last] ??= []).push(p);
  });

  const labels = {};

  Object.entries(byLast).forEach(([last, group]) => {
    const firstOf = (p) => (p.firstName || (p.name || '').split(' ')[0] || '').trim();

    if (group.length === 1) {
      const first = firstOf(group[0]);
      labels[group[0].id] = first ? `${last} ${first[0].toUpperCase()}.` : last;
      return;
    }

    let precision = 1;
    let buckets;
    do {
      buckets = {};
      group.forEach(p => {
        const first = firstOf(p);
        const lbl = first ? `${last} ${first.slice(0, precision)}.` : last;
        (buckets[lbl] ??= []).push(p);
      });
      precision++;
    } while (Object.values(buckets).some(g => g.length > 1) && precision <= 25);

    Object.entries(buckets).forEach(([lbl, g]) => {
      if (g.length === 1) { labels[g[0].id] = lbl; return; }
      g.forEach((p, i) => { labels[p.id] = `${last} ${firstOf(p)}${i > 0 ? ` (${i + 1})` : ''}`.trim(); });
    });
  });

  return labels;
}

/** Formats `result.sets` ("6-4, 6-2") or a retirement ("Abandono — motivo"). */
export function formatMatchResult(result) {
  if (!result) return null;
  if (result.retired) return { text: `Abandono — ${result.retired.reason}`, tone: 'crimson' };
  if (result.sets?.length) return { text: result.sets.map(s => `${s.t1}-${s.t2}`).join(', '), tone: 'ink' };
  return null;
}

/** "18 sep · 19:00" from an ISO string, or null if there's no date yet. */
export function formatMatchDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const date = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

/** Set-wins tally used to bold the winning team's name. */
export function setWinsFromResult(result) {
  if (!result?.sets?.length) {
    return { t1: 0, t2: 0, outcome: result?.outcome ?? null };
  }
  let t1 = 0, t2 = 0;
  result.sets.forEach(s => {
    if ((parseInt(s.t1, 10) || 0) > (parseInt(s.t2, 10) || 0)) t1++;
    else if ((parseInt(s.t2, 10) || 0) > (parseInt(s.t1, 10) || 0)) t2++;
  });
  return { t1, t2, outcome: result.outcome ?? (t1 > t2 ? 'team1' : t2 > t1 ? 'team2' : null) };
}
