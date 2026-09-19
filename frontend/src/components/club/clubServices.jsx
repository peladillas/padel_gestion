import {
  HomeModernIcon, EyeIcon, LightBulbIcon, AdjustmentsHorizontalIcon, UserGroupIcon, LockClosedIcon,
  TruckIcon, CheckBadgeIcon, WifiIcon, DevicePhoneMobileIcon, ArrowsRightLeftIcon, ShoppingBagIcon,
  AcademicCapIcon, FaceSmileIcon, TrophyIcon, UsersIcon, CakeIcon, BuildingStorefrontIcon, SunIcon,
  CalendarDaysIcon, BoltIcon, LifebuoyIcon, SparklesIcon, HeartIcon, FlagIcon,
} from '@heroicons/react/24/outline';
import { useServiceCatalog } from '../../hooks/useServiceCatalog';

// The services a club can declare live in the backend (App\Support\ClubServiceCatalog)
// — keys, Spanish labels and groups. Only the icons are a frontend concern.
const ICONS = {
  pistas_cubiertas: HomeModernIcon, pistas_panoramicas: EyeIcon, iluminacion: LightBulbIcon,
  climatizacion: AdjustmentsHorizontalIcon, vestuarios: UserGroupIcon, taquillas: LockClosedIcon,
  parking: TruckIcon, accesibilidad: CheckBadgeIcon, wifi: WifiIcon,
  reserva_online: DevicePhoneMobileIcon, alquiler_palas: ArrowsRightLeftIcon, tienda: ShoppingBagIcon,
  clases: AcademicCapIcon, escuela_ninos: FaceSmileIcon, torneos: TrophyIcon, partidos_abiertos: UsersIcon,
  bar_cafeteria: CakeIcon, restaurante: BuildingStorefrontIcon, terraza: SunIcon, eventos: CalendarDaysIcon,
  gimnasio: BoltIcon, piscina: LifebuoyIcon, spa: SparklesIcon, fisioterapia: HeartIcon, otros_deportes: FlagIcon,
};

export function ServiceChip({ serviceKey, label, active = true }) {
  const Icon = ICONS[serviceKey] || FlagIcon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '3px 10px 3px 7px',
      background: active ? 'var(--court-soft)' : 'var(--bone-3)', color: active ? 'var(--court-deep)' : 'var(--ink-soft)' }}>
      <Icon style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true" />{label}
    </span>
  );
}

/** Read-only list of a club's services; `max` collapses the rest into "+N". */
export function ServiceList({ keys, max, catalog: given }) {
  const fetched = useServiceCatalog();
  const catalog = given ?? fetched;
  const labels = Object.fromEntries((catalog?.services || []).map(s => [s.key, s.label]));
  const shown = (keys || []).filter(k => labels[k]);
  if (!shown.length) return null;
  const visible = max ? shown.slice(0, max) : shown;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {visible.map(k => <ServiceChip key={k} serviceKey={k} label={labels[k]} />)}
      {max && shown.length > max && (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', padding: '3px 4px' }}>+{shown.length - max}</span>
      )}
    </div>
  );
}

/** Grouped toggle chips to choose a club's services. */
export function ServicesPicker({ value, onChange, catalog: given }) {
  const fetched = useServiceCatalog();
  const catalog = given ?? fetched;
  if (!catalog) return <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Cargando servicios…</div>;
  const toggle = (k) => onChange(value.includes(k) ? value.filter(x => x !== k) : [...value, k]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {catalog.groups.map(g => (
        <div key={g.key}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{g.label}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {catalog.services.filter(s => s.group === g.key).map(s => {
              const on = value.includes(s.key);
              const Icon = ICONS[s.key] || FlagIcon;
              return (
                <button key={s.key} type="button" onClick={() => toggle(s.key)} aria-pressed={on}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, borderRadius: 20, padding: '6px 12px 6px 9px', cursor: 'pointer',
                    border: `1px solid ${on ? 'var(--court)' : 'var(--line)'}`, background: on ? 'var(--court-soft)' : 'white', color: on ? 'var(--court-deep)' : 'var(--ink-mid)' }}>
                  <Icon style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true" />{s.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
