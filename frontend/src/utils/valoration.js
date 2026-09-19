// Single source of truth for the 1–5 rating scale. Before this, three files
// (Valorations, PlayerStatsView, Players) each carried their own copy of the
// "out of 10" maths, thresholds and colours.

export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

/** The seven shots that make up the overall rating (ambiente is rated apart). */
export const SHOT_KEYS = ['smash', 'volea', 'globo', 'bandeja', 'bajadaPared', 'resto', 'saque'];

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** 0..1 position on the scale, for radar radius / bar width / marker. */
export const scaleRatio = (v) => Math.max(0, Math.min(SCALE_MAX, num(v) || 0)) / SCALE_MAX;

/** "4" or "4.5" — averages carry one decimal, single ratings are whole numbers. */
export const fmtScore = (v) => {
  const n = num(v);
  if (n === null || Number.isNaN(n)) return '–';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

/**
 * Overall (OVR) on a 0–100 card scale = mean of the rated shots, as a share of
 * the maximum. Returns null when nothing has been rated. `stats` may be an
 * aggregate ({total, smash…}) or a single rating row.
 */
export function overall(stats) {
  if (!stats || stats.total === 0) return null;
  const vals = SHOT_KEYS.map((k) => num(stats[k])).filter((v) => v !== null && !Number.isNaN(v));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length / SCALE_MAX) * 100);
}

/** Traffic-light colour for a score, in the same tokens the app already uses. */
export function shotColor(v, palette = {}) {
  const { bad = 'var(--crimson)', warn = 'var(--amber)', ok = '#84cc16', good = 'var(--court)' } = palette;
  const n = num(v) || 0;
  return n < 2 ? bad : n < 3 ? warn : n < 4 ? ok : good;
}

/** "Ambiente ≥ 8/10" used to mean "excellent": now 4 out of 5. */
export const GREAT_AMBIENTE = 4;
