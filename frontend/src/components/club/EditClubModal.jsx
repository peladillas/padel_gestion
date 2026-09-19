import { useState, useRef, useMemo } from 'react';
import { XMarkIcon, BuildingOffice2Icon, CameraIcon, PlusIcon, TrashIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { clubService } from '../../services/api';
import { ServicesPicker } from './clubServices';
import { DAYS, mapsUrl } from '../../utils/clubs';

// Edit a club's public profile — what shows on its card. The club's own admin (or a
// super admin) fills in photo, description, prices, contact, location, opening hours
// and services; name and slug are the club's identity and only a super admin changes
// them. The club's id never changes, so nothing linked to it can break.

const DESCRIPTION_MAX = 300;   // mirrors ClubProfileRules::DESCRIPTION_MAX
const MAX_PHONES = 4;          // mirrors ClubProfileRules::MAX_PHONES
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const CURRENCIES = ['EUR', 'USD', 'GBP', 'ARS', 'MXN', 'CLP', 'COP', 'PEN', 'UYU', 'BRL'];
const TABS = [['general', 'General'], ['contacto', 'Contacto'], ['ubicacion', 'Ubicación'], ['horario', 'Horario'], ['servicios', 'Servicios']];

const inp = { border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', width: '100%', boxSizing: 'border-box' };
const label11 = { fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' };
const hint = { fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, lineHeight: 1.4 };
const errText = (ex, fallback) => ex?.response?.data?.error || fallback;
const str = (v) => (v === null || v === undefined ? '' : String(v));

const browserTimezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };
const allTimezones = () => { try { return Intl.supportedValuesOf('timeZone'); } catch { return []; } };

function Field({ label, htmlFor, children, note }) {
  return (
    <div>
      <label style={label11} htmlFor={htmlFor}>{label}</label>
      {children}
      {note && <div style={hint}>{note}</div>}
    </div>
  );
}

/** The editable form state, from a club as returned by the API. */
function initialForm(club) {
  const hours = {};
  DAYS.forEach(d => { hours[d.key] = club.openingHours?.[d.key] ? { ...club.openingHours[d.key] } : null; });
  return {
    name: str(club.name), slug: str(club.slug), description: str(club.description),
    priceFrom: str(club.priceFrom), priceTo: str(club.priceTo), currency: str(club.currency),
    phones: (club.phones || []).map(p => ({ label: str(p.label), number: str(p.number) })),
    email: str(club.email), website: str(club.website), bookingUrl: str(club.bookingUrl), instagram: str(club.instagram), facebook: str(club.facebook),
    address: str(club.address), city: str(club.city), region: str(club.region), postalCode: str(club.postalCode), country: str(club.country),
    latitude: str(club.latitude), longitude: str(club.longitude),
    timezone: str(club.timezone) || browserTimezone(),
    openingHours: hours,
    services: club.services || [],
  };
}

/** What is sent to PUT /clubs/:id/profile. Blank text becomes null, so the admin can clear a field. */
function toPayload(f) {
  const text = (v) => { const t = v.trim(); return t === '' ? null : t; };
  const num = (v) => (v.trim() === '' ? null : Number(v));
  return {
    description: f.description.trim(),
    services: f.services,
    address: text(f.address), city: text(f.city), region: text(f.region), postalCode: text(f.postalCode), country: text(f.country),
    latitude: num(f.latitude), longitude: num(f.longitude),
    phones: f.phones.filter(p => p.number.trim()).map(p => ({ label: text(p.label), number: p.number.trim() })),
    email: text(f.email), website: text(f.website), bookingUrl: text(f.bookingUrl), instagram: text(f.instagram), facebook: text(f.facebook),
    openingHours: f.openingHours,
    timezone: text(f.timezone),
    priceFrom: num(f.priceFrom), priceTo: num(f.priceTo), currency: text(f.currency),
  };
}

export default function EditClubModal({ club, canEditIdentity, onClose, onChanged, initialTab = 'general' }) {
  const [form, setForm] = useState(() => initialForm(club));
  const [tab, setTab] = useState(initialTab);
  const [logoUrl, setLogoUrl] = useState(club.logoUrl || null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const timezones = useMemo(allTimezones, []);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErr(''); };
  const identityChanged = canEditIdentity && (form.name.trim() !== club.name || form.slug.trim() !== club.slug);

  // ── photo: saved as soon as it is chosen (its own endpoint) ──────
  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setErr('La foto debe ser JPG, PNG o WebP'); return; }
    if (file.size > MAX_PHOTO_BYTES) { setErr('La foto no puede pesar más de 5 MB'); return; }
    setPhotoBusy(true); setErr('');
    try { const r = await clubService.uploadLogo(club.id, file); setLogoUrl(r.data.logoUrl); onChanged?.(); }
    catch (ex) { setErr(errText(ex, 'No se pudo subir la foto')); }
    finally { setPhotoBusy(false); }
  };
  const removePhoto = async () => {
    setPhotoBusy(true); setErr('');
    try { await clubService.removeLogo(club.id); setLogoUrl(null); onChanged?.(); }
    catch (ex) { setErr(errText(ex, 'No se pudo quitar la foto')); }
    finally { setPhotoBusy(false); }
  };

  // ── phones ───────────────────────────────────────────────────────
  const setPhone = (i, patch) => set('phones', form.phones.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addPhone = () => form.phones.length < MAX_PHONES && set('phones', [...form.phones, { label: '', number: '' }]);
  const removePhone = (i) => set('phones', form.phones.filter((_, idx) => idx !== i));

  // ── opening hours ────────────────────────────────────────────────
  const setDay = (key, value) => set('openingHours', { ...form.openingHours, [key]: value });
  const copyFirstOpenDayToAll = () => {
    const source = DAYS.map(d => form.openingHours[d.key]).find(Boolean);
    if (!source) return;
    const next = {};
    DAYS.forEach(d => { next[d.key] = { ...source }; });
    set('openingHours', next);
  };

  // ── location ─────────────────────────────────────────────────────
  const useMyLocation = () => {
    if (!navigator.geolocation) { setErr('Tu navegador no permite obtener la ubicación.'); return; }
    setGeoBusy(true); setErr('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setGeoBusy(false);
      },
      (g) => { setErr(g.code === 1 ? 'Has denegado el permiso de ubicación.' : 'No pudimos obtener tu ubicación.'); setGeoBusy(false); },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };
  const coordsSet = form.latitude.trim() !== '' && form.longitude.trim() !== '';

  const save = async (e) => {
    e.preventDefault();
    if (canEditIdentity && !form.name.trim()) { setTab('general'); setErr('El nombre es obligatorio'); return; }
    setSaving(true); setErr('');
    try {
      if (identityChanged) await clubService.update(club.id, { name: form.name.trim(), slug: form.slug.trim() });
      await clubService.updateProfile(club.id, toPayload(form));
      onChanged?.();
      onClose();
    } catch (ex) { setErr(errText(ex, 'No se pudo guardar el club')); setSaving(false); }
  };

  const secondaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: '1px solid var(--line)', background: 'white', color: 'var(--ink-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-label="Editar club" style={{ background: 'var(--paper)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 580, border: '1px solid var(--line)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>Editar club</span>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>
            <XMarkIcon style={{ width: 20, height: 20 }} />
          </button>
        </div>

        <div role="tablist" style={{ display: 'flex', gap: 2, background: 'var(--bone-3)', borderRadius: 11, padding: 3, marginBottom: 16, overflowX: 'auto' }}>
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              style={{ flex: 1, whiteSpace: 'nowrap', padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: tab === key ? 'white' : 'transparent', color: tab === key ? 'var(--ink-2)' : 'var(--ink-soft)' }}>{label}</button>
          ))}
        </div>

        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── General ── */}
          {tab === 'general' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 72, height: 72, borderRadius: 16, background: 'var(--court-soft)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {logoUrl
                    ? <img src={logoUrl} alt="Foto del club" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <BuildingOffice2Icon style={{ width: 30, height: 30, color: 'var(--court-deep)' }} />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy} style={{ ...secondaryBtn, cursor: photoBusy ? 'wait' : 'pointer' }}>
                      <CameraIcon style={{ width: 14, height: 14 }} aria-hidden="true" />{photoBusy ? 'Subiendo…' : logoUrl ? 'Cambiar foto' : 'Subir foto'}
                    </button>
                    {logoUrl && <button type="button" onClick={removePhoto} disabled={photoBusy} style={{ padding: '7px 12px', border: 'none', background: 'none', color: 'var(--crimson)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Quitar</button>}
                  </div>
                  <div style={hint}>JPG, PNG o WebP, hasta 5 MB. Se guarda al elegirla.</div>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} style={{ display: 'none' }} />
                </div>
              </div>

              {canEditIdentity && (
                <>
                  <Field label="Nombre" htmlFor="club-name"><input id="club-name" style={inp} value={form.name} onChange={e => set('name', e.target.value)} /></Field>
                  <Field label="Slug (dirección corta)" htmlFor="club-slug" note="Cambiarlo no afecta a torneos, socios ni pistas: el club se identifica internamente por su id.">
                    <input id="club-slug" style={inp} value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="nombre-del-club" />
                  </Field>
                </>
              )}

              <Field label="Descripción breve" htmlFor="club-desc">
                <textarea id="club-desc" style={{ ...inp, resize: 'vertical', minHeight: 70 }} maxLength={DESCRIPTION_MAX} value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Ej.: 6 pistas panorámicas a 5 minutos del centro, con cafetería y tienda." />
                <div style={{ ...hint, textAlign: 'right' }}>{form.description.length}/{DESCRIPTION_MAX}</div>
              </Field>

              <div>
                <span style={label11}>Precio de la pista por hora (opcional)</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 8 }}>
                  <input aria-label="Precio desde" style={inp} inputMode="decimal" value={form.priceFrom} onChange={e => set('priceFrom', e.target.value)} placeholder="Desde" />
                  <input aria-label="Precio hasta" style={inp} inputMode="decimal" value={form.priceTo} onChange={e => set('priceTo', e.target.value)} placeholder="Hasta" />
                  <input aria-label="Moneda" style={{ ...inp, textTransform: 'uppercase' }} list="club-currencies" maxLength={3} value={form.currency} onChange={e => set('currency', e.target.value)} placeholder="EUR" />
                  <datalist id="club-currencies">{CURRENCIES.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div style={hint}>Sirve para que los jugadores filtren y ordenen por precio.</div>
              </div>
            </>
          )}

          {/* ── Contacto ── */}
          {tab === 'contacto' && (
            <>
              <div>
                <span style={label11}>Teléfonos (hasta {MAX_PHONES})</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {form.phones.map((p, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 32px', gap: 8 }}>
                      <input aria-label={`Etiqueta del teléfono ${i + 1}`} style={inp} value={p.label} maxLength={30} onChange={e => setPhone(i, { label: e.target.value })} placeholder="Recepción" />
                      <input aria-label={`Número del teléfono ${i + 1}`} style={inp} type="tel" value={p.number} onChange={e => setPhone(i, { number: e.target.value })} placeholder="+34 600 123 456" />
                      <button type="button" onClick={() => removePhone(i)} aria-label={`Quitar teléfono ${i + 1}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crimson)' }}>
                        <TrashIcon style={{ width: 16, height: 16 }} />
                      </button>
                    </div>
                  ))}
                  {form.phones.length < MAX_PHONES && (
                    <button type="button" onClick={addPhone} style={{ ...secondaryBtn, alignSelf: 'flex-start' }}><PlusIcon style={{ width: 14, height: 14 }} aria-hidden="true" />Añadir teléfono</button>
                  )}
                </div>
                <div style={hint}>Pon la etiqueta que quieras (Recepción, WhatsApp, Urgencias…).</div>
              </div>
              <Field label="Email de contacto" htmlFor="club-email"><input id="club-email" style={inp} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="info@miclub.com" /></Field>
              <Field label="Página web" htmlFor="club-web"><input id="club-web" style={inp} value={form.website} onChange={e => set('website', e.target.value)} placeholder="www.miclub.com" /></Field>
              <Field label="Enlace de reservas" htmlFor="club-booking" note="Si tienes una web o app para reservar pistas, los jugadores verán un botón “Reservar”.">
                <input id="club-booking" style={inp} value={form.bookingUrl} onChange={e => set('bookingUrl', e.target.value)} placeholder="https://reservas.miclub.com" />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <Field label="Instagram" htmlFor="club-ig"><input id="club-ig" style={inp} value={form.instagram} onChange={e => set('instagram', e.target.value)} placeholder="@miclub" /></Field>
                <Field label="Facebook" htmlFor="club-fb"><input id="club-fb" style={inp} value={form.facebook} onChange={e => set('facebook', e.target.value)} placeholder="miclub o enlace a la página" /></Field>
              </div>
            </>
          )}

          {/* ── Ubicación ── */}
          {tab === 'ubicacion' && (
            <>
              <Field label="Dirección" htmlFor="club-address"><input id="club-address" style={inp} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Calle y número" /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <Field label="Ciudad" htmlFor="club-city"><input id="club-city" style={inp} value={form.city} onChange={e => set('city', e.target.value)} /></Field>
                <Field label="Provincia / región" htmlFor="club-region"><input id="club-region" style={inp} value={form.region} onChange={e => set('region', e.target.value)} /></Field>
                <Field label="Código postal" htmlFor="club-zip"><input id="club-zip" style={inp} value={form.postalCode} onChange={e => set('postalCode', e.target.value)} /></Field>
                <Field label="País (2 letras)" htmlFor="club-country"><input id="club-country" style={{ ...inp, textTransform: 'uppercase' }} maxLength={2} value={form.country} onChange={e => set('country', e.target.value)} placeholder="ES" /></Field>
              </div>

              <div>
                <span style={label11}>Posición en el mapa</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input aria-label="Latitud" style={inp} inputMode="decimal" value={form.latitude} onChange={e => set('latitude', e.target.value)} placeholder="Latitud, ej. 40.416775" />
                  <input aria-label="Longitud" style={inp} inputMode="decimal" value={form.longitude} onChange={e => set('longitude', e.target.value)} placeholder="Longitud, ej. -3.703790" />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <button type="button" onClick={useMyLocation} disabled={geoBusy} style={secondaryBtn}>
                    <MapPinIcon style={{ width: 14, height: 14 }} aria-hidden="true" />{geoBusy ? 'Buscando…' : 'Usar mi ubicación actual'}
                  </button>
                  {coordsSet && (
                    <a href={mapsUrl({ latitude: form.latitude, longitude: form.longitude })} target="_blank" rel="noopener noreferrer" style={{ ...secondaryBtn, textDecoration: 'none' }}>Ver en el mapa</a>
                  )}
                </div>
                <div style={hint}>Los jugadores la usan para ordenar por cercanía. Pulsa el botón estando en el club, o cópiala de Google Maps (clic derecho sobre el club → primera línea).</div>
              </div>

              <Field label="Zona horaria" htmlFor="club-tz" note="Sirve para saber si el club está abierto ahora. Por defecto, la de tu dispositivo.">
                <input id="club-tz" style={inp} list="club-timezones" value={form.timezone} onChange={e => set('timezone', e.target.value)} placeholder="Europe/Madrid" />
                <datalist id="club-timezones">{timezones.map(t => <option key={t} value={t} />)}</datalist>
              </Field>
            </>
          )}

          {/* ── Horario ── */}
          {tab === 'horario' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {DAYS.map(d => {
                  const h = form.openingHours[d.key];
                  return (
                    <div key={d.key} style={{ display: 'grid', gridTemplateColumns: '92px 1fr', alignItems: 'center', gap: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: h ? 'var(--ink)' : 'var(--ink-soft)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!h} onChange={e => setDay(d.key, e.target.checked ? { open: '09:00', close: '22:00' } : null)} />{d.label}
                      </label>
                      {h ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input aria-label={`${d.label}: apertura`} type="time" style={{ ...inp, width: 120 }} value={h.open} onChange={e => setDay(d.key, { ...h, open: e.target.value })} />
                          <span style={{ color: 'var(--ink-soft)' }}>a</span>
                          <input aria-label={`${d.label}: cierre`} type="time" style={{ ...inp, width: 120 }} value={h.close === '24:00' ? '00:00' : h.close} onChange={e => setDay(d.key, { ...h, close: e.target.value })} />
                        </div>
                      ) : <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Cerrado</span>}
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={copyFirstOpenDayToAll} style={{ ...secondaryBtn, marginTop: 12 }}>Copiar el primer día abierto a toda la semana</button>
              <div style={hint}>Si cierra pasada la medianoche, pon la hora del día siguiente (p. ej. 18:00 a 02:00). Cerrar a las 00:00 significa a medianoche.</div>
            </div>
          )}

          {/* ── Servicios ── */}
          {tab === 'servicios' && (
            <div>
              <span style={label11}>Servicios del club</span>
              <ServicesPicker value={form.services} onChange={v => set('services', v)} />
            </div>
          )}

          {err && <div role="alert" style={{ fontSize: 12, color: 'var(--crimson)', background: 'var(--crimson-soft)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bone-2)', color: 'var(--ink-soft)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: saving ? 'var(--line)' : 'var(--court)', color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13 }}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
