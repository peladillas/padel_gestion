import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ChartBarIcon, UsersIcon, TrophyIcon, UserCircleIcon,
  ArrowRightOnRectangleIcon, UserGroupIcon, BuildingOffice2Icon,
  CalendarDaysIcon, StarIcon,
} from '@heroicons/react/24/outline';
import MobileTabBar from './layout/MobileTabBar';
import NotificationBell from './NotificationBell';
import MessageBell from './MessageBell';
import useUnreadNotifications from '../hooks/useUnreadNotifications';
import useUnreadMessages from '../hooks/useUnreadMessages';


export default function Layout() {
  const { user, logout, isAdmin, isSuperAdmin } = useAuth();
  const navigate                                = useNavigate();
  const admin = isAdmin();
  const sa    = isSuperAdmin();

  const handleLogout = () => {
    if (confirm('¿Cerrar sesión?')) { logout(); navigate('/login'); }
  };

  const adminNavItems = [
    { to: '/',                     Icon: ChartBarIcon,        label: 'Dashboard' },
    { to: '/players',              Icon: UsersIcon,           label: 'Jugadores' },
    { to: '/tournament-instances', Icon: TrophyIcon,          label: 'Torneos'   },
    { to: '/clubs',                Icon: BuildingOffice2Icon, label: 'Clubs'     },
    { to: '/profile',              Icon: UserCircleIcon,      label: 'Perfil'    },
  ];

  const playerNavItems = [
    { to: '/',              Icon: ChartBarIcon,      label: 'Inicio'       },
    { to: '/availability',  Icon: CalendarDaysIcon,  label: 'Disponibilidad' },
    { to: '/mypair',        Icon: UserGroupIcon,     label: 'Mis parejas'  },
    { to: '/matches',     Icon: ChartBarIcon, label: 'Partidos'     },
    { to: '/valorations', Icon: StarIcon,     label: 'Valoraciones' },
    { to: '/standings',   Icon: TrophyIcon,   label: 'Torneos'      },
    { to: '/players',   Icon: UsersIcon,      label: 'Jugadores' },
    { to: '/profile',   Icon: UserCircleIcon, label: 'Perfil'    },
  ];

  const navItems = admin ? adminNavItems : playerNavItems;
  const { count: unreadCount } = useUnreadNotifications();
  const { total: unreadMessages } = useUnreadMessages();

  const initials = user?.player?.name
    ? user.player.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <>
      <a href="#bp-main-content" className="bp-skip-link">Saltar al contenido</a>

      <div className="bp-layout bp-layout-player">

        {/* ── DESKTOP SIDEBAR (all roles) ── */}
        <aside className="bp-sidebar" aria-label="Navegación lateral">
          <div className="bp-sidebar-logo">
            <div className="bp-sidebar-logo-mark">
              <div className="bp-logo-dot" aria-hidden="true" />
              Bonapinta
            </div>
            <div className="bp-sidebar-subtitle">Club · Pádel</div>
          </div>

          <nav className="bp-sidebar-nav" aria-label="Menú principal">
            {navItems.map(({ to, Icon, label }) => (
              <NavLink key={to} to={to} end={to === '/'}
                className={({ isActive }) => 'bp-sidebar-item' + (isActive ? ' active' : '')}>
                <Icon className="bp-sidebar-icon" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="bp-sidebar-footer">
            <div className="bp-sidebar-user" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="bp-sidebar-avatar">
                {user?.player?.avatarUrl
                  ? <img src={user.player.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="bp-sidebar-username">{user?.player?.name || user?.email}</div>
                <div className="bp-sidebar-email">{user?.email}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <MessageBell />
                <NotificationBell />
              </div>
            </div>
            <button onClick={handleLogout} className="bp-logout-btn" aria-label="Cerrar sesión">
              <ArrowRightOnRectangleIcon style={{ width: 16, height: 16, flexShrink: 0 }} aria-hidden="true" />
              Cerrar sesión
            </button>
          </div>
        </aside>

        {/* ── MOBILE HEADER (admin only) ── */}
        {admin && (
          <header className="bp-header">
            <div className="bp-logo">
              <div className="bp-logo-dot" aria-hidden="true" />
              Bonapinta
            </div>
            <div className="bp-header-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ textAlign: 'right' }}>
                <div className="bp-user-name">{user?.player?.name?.split(' ')[0] || 'Admin'}</div>
                <div className="bp-user-info">{user?.email}</div>
              </div>
              <MessageBell style={{ width: 32, height: 32 }} />
              <NotificationBell style={{ width: 32, height: 32 }} />
            </div>
          </header>
        )}

        {/* ── CONTENT ── */}
        <div className="bp-body">
          <main className="bp-main" id="bp-main-content" tabIndex={-1}>
            <div className="bp-main-inner">
              <Outlet />
            </div>
          </main>
        </div>

        {/* ── MOBILE TAB BAR (all roles) — badges the Perfil tab since
            players have no mobile header to put the bell in ── */}
        <MobileTabBar tabs={navItems} badges={(unreadCount > 0 || unreadMessages > 0) ? { '/profile': true } : {}} />

      </div>
    </>
  );
}
