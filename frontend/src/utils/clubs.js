// Small pure helpers for rendering a club's card (address, hours, prices, links).

/** ISO weekday order, matching the backend (App\Support\ClubProfileRules::DAYS). */
export const DAYS = [
  { key: 'mon', short: 'Lun', label: 'Lunes' },
  { key: 'tue', short: 'Mar', label: 'Martes' },
  { key: 'wed', short: 'Mié', label: 'Miércoles' },
  { key: 'thu', short: 'Jue', label: 'Jueves' },
  { key: 'fri', short: 'Vie', label: 'Viernes' },
  { key: 'sat', short: 'Sáb', label: 'Sábado' },
  { key: 'sun', short: 'Dom', label: 'Domingo' },
];

/** 0.4 → "400 m", 3.24 → "3,2 km", 27.6 → "28 km". */
export function formatDistance(km) {
  if (km === null || km === undefined) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return km < 10 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km)} km`;
}

/** "Calle Mayor 1, 28013 Madrid" from whatever parts the club filled in. */
export function addressLine(club) {
  const cityPart = [club.postalCode, club.city].filter(Boolean).join(' ');
  return [club.address, cityPart, club.region].filter(Boolean).join(', ');
}

/** Directions link: exact coordinates when known, otherwise a text search of the address. */
export function mapsUrl(club) {
  if (club.latitude !== null && club.latitude !== undefined && club.longitude !== null && club.longitude !== undefined) {
    return `https://www.google.com/maps/dir/?api=1&destination=${club.latitude},${club.longitude}`;
  }
  const q = addressLine(club) || club.name;
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** tel: link keeping only digits and a leading "+". */
export function telHref(number) {
  const cleaned = String(number || '').replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
}

export const instagramUrl = (handle) => (handle ? `https://www.instagram.com/${encodeURIComponent(handle)}` : null);
export const facebookUrl = (handle) => (handle ? `https://www.facebook.com/${encodeURIComponent(handle)}` : null);

/** "12 €" / "12 € – 18,50 €" / null. Whole amounts without decimals, the rest with two; club's own currency. */
export function formatPriceRange(club) {
  const { priceFrom: from, priceTo: to, currency } = club;
  if (from === null || from === undefined) return null;
  const money = (n) => {
    const digits = Number.isInteger(n) ? 0 : 2;
    try {
      return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'EUR', minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(n);
    } catch {
      return `${n} ${currency || ''}`.trim();   // unknown currency code
    }
  };
  if (to === null || to === undefined || to === from) return money(from);
  return `${money(from)} – ${money(to)}`;
}

const HHMM = (t) => (t === '24:00' ? '00:00' : t);

/**
 * Opening hours as compact lines, merging consecutive days that share the same hours:
 * [{ days: 'Lun–Vie', hours: '08:00–23:00' }, { days: 'Sáb', hours: '09:00–00:00' }, { days: 'Dom', hours: 'Cerrado' }].
 */
export function hoursLines(openingHours) {
  if (!openingHours) return [];
  const rows = DAYS.map((d) => {
    const h = openingHours[d.key];
    return { short: d.short, hours: h ? `${h.open}–${HHMM(h.close)}` : 'Cerrado' };
  });
  const lines = [];
  for (const row of rows) {
    const last = lines[lines.length - 1];
    if (last && last.hours === row.hours) last.end = row.short;
    else lines.push({ start: row.short, end: row.short, hours: row.hours });
  }
  return lines.map((l) => ({ days: l.start === l.end ? l.start : `${l.start}–${l.end}`, hours: l.hours }));
}

/** Days with published hours, e.g. for a one-line "Abre: Lun–Sáb". */
export const hasHours = (openingHours) => !!openingHours && DAYS.some((d) => openingHours[d.key]);

/** Weekday key (mon…sun) for "today" in the club's own timezone, so its hours highlight the right row. */
export function todayKey(timezone, now = new Date()) {
  const map = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };
  const options = { weekday: 'short' };
  try {
    return map[new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone || undefined }).format(now)] || null;
  } catch {
    return map[new Intl.DateTimeFormat('en-US', options).format(now)] || null;   // unknown timezone id
  }
}

/** A club's hours for one day as text: "08:00–23:00" / "Cerrado". */
export function dayHoursText(openingHours, dayKey) {
  const h = openingHours?.[dayKey];
  return h ? `${h.open}–${h.close === '24:00' ? '00:00' : h.close}` : 'Cerrado';
}
