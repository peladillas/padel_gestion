import { NavLink, useMatch } from 'react-router-dom';

function TabItem({ to, Icon, label, badge }) {
  const match = useMatch({ path: to, end: to === '/' });
  const isActive = !!match;
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={`bp-tab${isActive ? ' active' : ''}`}
      aria-label={badge ? `${label} — tenés notificaciones sin leer` : label}
      aria-current={isActive ? 'page' : undefined}
    >
      {isActive && <span className="bp-tab-dot" aria-hidden="true" />}
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <Icon className="bp-tab-icon" aria-hidden="true" />
        {badge && (
          <span aria-hidden="true" style={{
            position: 'absolute', top: -1, right: -2, width: 7, height: 7, borderRadius: '50%',
            background: 'var(--crimson)', border: '1.5px solid var(--paper)',
          }} />
        )}
      </span>
      <span>{label}</span>
    </NavLink>
  );
}

export default function MobileTabBar({ tabs = [], badges = {} }) {
  return (
    <nav className="bp-tabbar" aria-label="Navegación principal">
      {tabs.map(t => <TabItem key={t.to} to={t.to} Icon={t.Icon} label={t.label} badge={!!badges[t.to]} />)}
    </nav>
  );
}
