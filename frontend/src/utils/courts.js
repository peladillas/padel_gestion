// Pure helpers for the court screens: labels, the month calendar and how blocks are grouped.

const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;   // month is 0-based, like Date

/** Label of a catalogue key ("artificial_grass" → "Césped artificial"); unknown keys fall back to the key. */
export function labelOf(catalog, group, key) {
  if (key === null || key === undefined || key === '') return null;
  return catalog?.[group]?.find((i) => i.key === key)?.label ?? key;
}

/** The chips describing a court, in reading order: setting · floor · walls · orientation · lighting. */
export function courtTraits(court, catalog) {
  const walls = labelOf(catalog, 'walls', court.walls);
  const material = labelOf(catalog, 'material', court.material);
  const orientation = labelOf(catalog, 'orientation', court.orientation);
  return [
    labelOf(catalog, 'setting', court.setting),
    labelOf(catalog, 'floor', court.floor),
    walls && `Paredes: ${walls.toLowerCase()}`,
    material && `Estructura: ${material.toLowerCase()}`,
    orientation && `Orientación ${orientation}`,
    court.hasLighting ? 'Iluminación' : null,
  ].filter(Boolean);
}

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * The cells of a month view, Monday first, always whole weeks (35 or 42 cells):
 * [{ date: '2026-10-01', day: 1, inMonth: true }, …]. `month` is 0-based.
 */
export function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;                    // Mon=0 … Sun=6
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const cells = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(year, month, 1 - lead + i));
    cells.push({ date: dateKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month });
  }
  return cells;
}

/** { from, to } (inclusive) covering every visible cell, to ask the API for exactly that window. */
export function gridRange(year, month) {
  const cells = monthGrid(year, month);
  return { from: cells[0].date, to: cells[cells.length - 1].date };
}

/** Month `delta` steps away: { year, month }. */
export function shiftMonth(year, month, delta) {
  const d = new Date(Date.UTC(year, month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

const datePart = (local) => local.slice(0, 10);
const timePart = (local) => local.slice(11, 16);
const shiftDay = (key, delta) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10); };
const addDay = (key) => shiftDay(key, 1);

/** Every calendar date a block touches (club-local). A block ending exactly at 00:00 does not touch that day. */
export function daysOfBlock(block) {
  const start = datePart(block.startLocal);
  let end = datePart(block.endLocal);
  if (timePart(block.endLocal) === '00:00' && end > start) end = shiftDay(end, -1);
  const days = [];
  for (let d = start, guard = 0; d <= end && guard < 400; d = addDay(d), guard++) days.push(d);
  return days;
}

/**
 * One row per (group, start): the blocks a single "create" made for several courts at the
 * same time are shown together ("Pista 1, Pista 2"), because that is how the admin thinks of them.
 */
export function groupBlocks(blocks) {
  const rows = new Map();
  for (const b of blocks) {
    const key = b.groupId ? `${b.groupId}|${b.startLocal}` : b.id;
    if (!rows.has(key)) rows.set(key, { key, blocks: [], startLocal: b.startLocal, endLocal: b.endLocal, reason: b.reason, reasonLabel: b.reasonLabel, note: b.note, groupId: b.groupId, groupCount: b.groupCount });
    rows.get(key).blocks.push(b);
  }
  return [...rows.values()].map((r) => ({ ...r, courtNames: r.blocks.map((b) => b.courtName).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })) }));
}

/** { '2026-10-01': [row, …] } — the grouped rows that touch each day of the window. */
export function rowsByDay(blocks) {
  const byDay = {};
  for (const row of groupBlocks(blocks)) {
    for (const day of daysOfBlock(row)) (byDay[day] ||= []).push(row);
  }
  return byDay;
}

/** "09:00–11:00", or "1 oct 20:00 → 2 oct 02:00" when it crosses days. */
export function formatRange(row) {
  const [sd, ed] = [datePart(row.startLocal), datePart(row.endLocal)];
  if (sd === ed) return `${timePart(row.startLocal)}–${timePart(row.endLocal)}`;
  const short = (local) => { const [, m, d] = datePart(local).split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1].slice(0, 3)} ${timePart(local)}`; };
  return `${short(row.startLocal)} → ${short(row.endLocal)}`;
}

export const REASON_COLORS = {
  maintenance: '#f59e0b', cleaning: '#38bdf8', repair: '#ef4444', works: '#b45309', event: '#8b5cf6', tournament: '#16a34a', classes: '#0ea5e9', weather: '#64748b', other: '#94a3b8',
};
export const reasonColor = (reason) => REASON_COLORS[reason] || REASON_COLORS.other;

/** What deleting a row can mean, so the modal only offers choices that make sense. */
export function deleteChoices(row) {
  const multiCourt = row.blocks.length > 1;
  const inSeries = !!row.groupId && (row.groupCount || 1) > row.blocks.length;
  const choices = [];
  if (!row.groupId) return [{ scope: 'one', label: 'Eliminar este bloqueo' }];
  choices.push(multiCourt ? { scope: 'occurrence', label: 'Solo este horario (todas las pistas)' } : { scope: 'one', label: 'Solo este bloqueo' });
  if (inSeries) {
    choices.push({ scope: 'following', label: multiCourt ? 'Este horario y los siguientes' : 'Este y los siguientes' });
    choices.push({ scope: 'all', label: 'Toda la serie' });
  } else if (multiCourt) {
    choices.push({ scope: 'all', label: 'Todos los bloqueos de este grupo' });
  }
  return choices;
}
