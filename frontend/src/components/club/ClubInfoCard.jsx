import { BuildingOffice2Icon, MapPinIcon, Squares2X2Icon, BanknotesIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { ServiceList } from './clubServices';
import { formatDistance, addressLine, formatPriceRange } from '../../utils/clubs';

// A club's summary card. Clicking it (or pressing Enter / Space) calls `onOpen(club, cardElement)` —
// the directory opens the full sheet (ClubDetailModal) with all the public info and the
// contact details. The card itself holds NO links or buttons: a clickable card that
// contained other interactive elements would nest them, which breaks keyboard and
// screen-reader use. Contact lives in the modal.

function Fact({ Icon: IconProp, children }) {
  const Icon = IconProp;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-mid)' }}>
      <Icon style={{ width: 14, height: 14, color: 'var(--ink-soft)', flexShrink: 0 }} aria-hidden="true" />{children}
    </span>
  );
}

function OpenPill({ club }) {
  if (club.openNow === null || club.openNow === undefined) return null;
  const open = club.openNow;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '3px 10px',
      background: open ? 'var(--ok-soft)' : 'var(--bone-3)', color: open ? 'var(--ok)' : 'var(--ink-soft)' }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: open ? 'var(--ok)' : 'var(--ink-soft)' }} />
      {open ? `Abierto${club.closesAt ? ` · cierra ${club.closesAt}` : ''}` : 'Cerrado ahora'}
    </span>
  );
}

export default function ClubInfoCard({ club, onOpen, servicesMax = 4, catalog }) {
  const address = addressLine(club);
  const distance = formatDistance(club.distanceKm);
  const price = formatPriceRange(club);
  const interactive = typeof onOpen === 'function';

  // The card element goes along so the dialog can hand focus back to it when it closes.
  const open = (e) => onOpen?.(club, e.currentTarget);
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); }
  };

  return (
    <article role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
      aria-haspopup={interactive ? 'dialog' : undefined}
      aria-label={interactive ? `${club.name}. Ver información y contacto` : club.name}
      onClick={interactive ? open : undefined} onKeyDown={interactive ? onKeyDown : undefined}
      className={interactive ? 'bp-club-card' : undefined}
      style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
        cursor: interactive ? 'pointer' : 'default', textAlign: 'left' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--court-soft)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {club.logoUrl
            ? <img src={club.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <BuildingOffice2Icon style={{ width: 26, height: 26, color: 'var(--court-deep)' }} aria-hidden="true" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>{club.name}</h3>
            <OpenPill club={club} />
          </div>
          {(address || distance) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {address && <Fact Icon={MapPinIcon}>{address}</Fact>}
              {distance && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--court-deep)', background: 'var(--court-soft)', borderRadius: 6, padding: '1px 7px' }}>a {distance}</span>}
            </div>
          )}
        </div>
      </div>

      {club.description && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-mid)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{club.description}</p>
      )}

      {(club.courtsCount > 0 || price) && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {club.courtsCount > 0 && <Fact Icon={Squares2X2Icon}>{club.courtsCount} {club.courtsCount === 1 ? 'pista' : 'pistas'}</Fact>}
          {price && <Fact Icon={BanknotesIcon}>Pista desde {price}/h</Fact>}
        </div>
      )}

      {club.services?.length > 0 && <ServiceList keys={club.services} max={servicesMax} catalog={catalog} />}

      {interactive && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2, fontSize: 12, fontWeight: 700, color: 'var(--court-deep)' }} aria-hidden="true">
          Ver información y contacto<ChevronRightIcon style={{ width: 14, height: 14 }} />
        </div>
      )}
    </article>
  );
}
