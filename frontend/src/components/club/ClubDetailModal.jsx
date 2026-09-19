import { useRef } from 'react';
import {
  BuildingOffice2Icon, MapPinIcon, PhoneIcon, EnvelopeIcon, GlobeAltIcon, ClockIcon, CalendarDaysIcon,
  ArrowTopRightOnSquareIcon, Squares2X2Icon, BanknotesIcon, AtSymbolIcon, LinkIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { ServiceList } from './clubServices';
import { useModalA11y } from '../../hooks/useModalA11y';
import { useCourtCatalog } from '../../hooks/useCourtCatalog';
import { courtTraits } from '../../utils/courts';
import {
  DAYS, formatDistance, addressLine, mapsUrl, telHref, instagramUrl, facebookUrl, formatPriceRange, hasHours, todayKey, dayHoursText,
} from '../../utils/clubs';

// A club's full public sheet, opened when its card is clicked: everything the club
// published (about, services, hours, price) and every way to contact it. Built from the
// same payload as the card (ClubDirectoryService::toCard).

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' };

function Section({ title, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h3>
      {children}
    </section>
  );
}

function ContactRow({ href, Icon: IconProp, label, value, external = true, primary = false }) {
  if (!href) return null;
  const Icon = IconProp;
  return (
    <a href={href} {...(external ? EXTERNAL : {})}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, textDecoration: 'none',
        border: primary ? 'none' : '1px solid var(--line)', background: primary ? 'var(--court)' : 'white', color: primary ? '#fff' : 'var(--ink)' }}>
      <Icon style={{ width: 18, height: 18, flexShrink: 0, color: primary ? '#fff' : 'var(--court-deep)' }} aria-hidden="true" />
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, opacity: primary ? 0.9 : 0.65 }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</span>
      </span>
    </a>
  );
}

function OpenPill({ club }) {
  if (club.openNow === null || club.openNow === undefined) return null;
  const open = club.openNow;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, borderRadius: 20, padding: '3px 10px',
      background: open ? 'var(--ok-soft)' : 'var(--bone-3)', color: open ? 'var(--ok)' : 'var(--ink-soft)' }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: open ? 'var(--ok)' : 'var(--ink-soft)' }} />
      {open ? `Abierto ahora${club.closesAt ? ` · cierra ${club.closesAt}` : ''}` : 'Cerrado ahora'}
    </span>
  );
}

export default function ClubDetailModal({ club, onClose, catalog, courtCatalog: givenCourtCatalog, now, returnFocusTo }) {
  const dialogRef = useRef(null);
  const fetchedCourtCatalog = useCourtCatalog();
  const courtCatalog = givenCourtCatalog ?? fetchedCourtCatalog;
  useModalA11y(dialogRef, onClose, returnFocusTo);

  const address = addressLine(club);
  const distance = formatDistance(club.distanceKm);
  const price = formatPriceRange(club);
  const phones = club.phones || [];
  const today = todayKey(club.timezone, now);
  const directions = mapsUrl(club);
  const hasContact = phones.length > 0 || club.email || club.website || club.bookingUrl || club.instagram || club.facebook;
  const titleId = `club-modal-title-${club.id}`;

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        style={{ background: 'var(--paper)', borderRadius: 18, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--line)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', outline: 'none' }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 0', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--court-soft)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {club.logoUrl
              ? <img src={club.logoUrl} alt={`Logo de ${club.name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <BuildingOffice2Icon style={{ width: 32, height: 32, color: 'var(--court-deep)' }} aria-hidden="true" />}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 id={titleId} style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>{club.name}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <OpenPill club={club} />
              {distance && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--court-deep)', background: 'var(--court-soft)', borderRadius: 6, padding: '2px 8px' }}>a {distance}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: 4, flexShrink: 0 }}>
            <XMarkIcon style={{ width: 22, height: 22 }} aria-hidden="true" />
          </button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {club.description && <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-mid)', lineHeight: 1.5 }}>{club.description}</p>}

          {(club.courtsCount > 0 || price) && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {club.courtsCount > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', background: 'var(--bone-3)', borderRadius: 10, padding: '7px 12px' }}>
                  <Squares2X2Icon style={{ width: 16, height: 16 }} aria-hidden="true" />{club.courtsCount} {club.courtsCount === 1 ? 'pista' : 'pistas'}
                </span>
              )}
              {price && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', background: 'var(--bone-3)', borderRadius: 10, padding: '7px 12px' }}>
                  <BanknotesIcon style={{ width: 16, height: 16 }} aria-hidden="true" />Pista desde {price}/h
                </span>
              )}
            </div>
          )}

          {club.services?.length > 0 && <Section title="Servicios"><ServiceList keys={club.services} catalog={catalog} /></Section>}

          {club.courts?.length > 0 && (
            <Section title="Las pistas">
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {club.courts.map(court => (
                  <li key={court.name} style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '9px 12px', borderRadius: 12, background: 'var(--bone-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{court.name}{court.alias ? ` · ${court.alias}` : ''}</span>
                      {court.status === 'maintenance' && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 5, padding: '2px 7px', background: 'var(--amber-soft)', color: 'var(--amber)' }}>En mantenimiento</span>}
                    </div>
                    {courtCatalog && courtTraits(court, courtCatalog).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {courtTraits(court, courtCatalog).map(t => <span key={t} style={{ fontSize: 11, color: 'var(--ink-mid)', background: 'white', border: '1px solid var(--line)', borderRadius: 20, padding: '2px 9px' }}>{t}</span>)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(address || directions) && (
            <Section title="Dónde estamos">
              {address && (
                <div style={{ display: 'flex', gap: 8, fontSize: 14, color: 'var(--ink)', alignItems: 'flex-start' }}>
                  <MapPinIcon style={{ width: 18, height: 18, flexShrink: 0, color: 'var(--court-deep)' }} aria-hidden="true" />
                  <span>{address}{club.country ? ` (${club.country})` : ''}</span>
                </div>
              )}
              <ContactRow href={directions} Icon={ArrowTopRightOnSquareIcon} label="Abrir en el mapa" value="Cómo llegar" />
            </Section>
          )}

          {hasHours(club.openingHours) && (
            <Section title="Horario">
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 18px', fontSize: 14 }}>
                {DAYS.map(d => {
                  const isToday = d.key === today;
                  const text = dayHoursText(club.openingHours, d.key);
                  return (
                    <div key={d.key} style={{ display: 'contents' }}>
                      <dt style={{ fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--court-deep)' : 'var(--ink-soft)' }}>{d.label}{isToday ? ' · hoy' : ''}</dt>
                      <dd style={{ margin: 0, fontWeight: isToday ? 800 : 500, color: text === 'Cerrado' ? 'var(--ink-soft)' : 'var(--ink)' }}>{text}</dd>
                    </div>
                  );
                })}
              </dl>
              {club.timezone && <div style={{ fontSize: 11, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: 5 }}><ClockIcon style={{ width: 13, height: 13 }} aria-hidden="true" />Horario en {club.timezone.replace(/_/g, ' ')}</div>}
            </Section>
          )}

          {hasContact && (
            <Section title="Contacto">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ContactRow href={club.bookingUrl} Icon={CalendarDaysIcon} label="Reserva tu pista" value="Reservar online" primary />
                {phones.map((p, i) => (
                  <ContactRow key={`${p.number}-${i}`} href={telHref(p.number)} Icon={PhoneIcon} label={p.label || 'Teléfono'} value={p.number} external={false} />
                ))}
                <ContactRow href={club.email ? `mailto:${club.email}` : null} Icon={EnvelopeIcon} label="Email" value={club.email} external={false} />
                <ContactRow href={club.website} Icon={GlobeAltIcon} label="Web" value={(club.website || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} />
                <ContactRow href={instagramUrl(club.instagram)} Icon={AtSymbolIcon} label="Instagram" value={`@${club.instagram}`} />
                <ContactRow href={facebookUrl(club.facebook)} Icon={LinkIcon} label="Facebook" value={club.facebook} />
              </div>
            </Section>
          )}

          {!club.description && !address && !hasContact && !hasHours(club.openingHours) && !(club.services?.length) && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>Este club todavía no ha completado su información.</p>
          )}
        </div>
      </div>
    </div>
  );
}
