import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import ActivateAccount from './pages/ActivateAccount';
import Profile from './pages/Profile';
import Dashboard from './pages/Dashboard';
import MyPair from './pages/MyPair';
import Matches from './pages/Matches';
import Standings from './pages/Standings';
import Valorations from './pages/Valorations';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Players from './pages/Players';
import TournamentEngineAdmin from './pages/TournamentEngineAdmin';
import TournamentView from './pages/TournamentView';
import Clubs from './pages/Clubs';
import PublicProfile from './pages/PublicProfile';
import JoinPage from './pages/JoinPage';
import VerifyEmail from './pages/VerifyEmail';
import ConfirmEmailChange from './pages/ConfirmEmailChange';
import TournamentJoin from './pages/TournamentJoin';
import Availability from './pages/Availability';
import Notifications from './pages/Notifications';
import Messages from './pages/Messages';
import Layout from './components/Layout';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'var(--bone)',color:'var(--ink)'}}>Cargando…</div>;
  return user ? children : <Navigate to="/login" />;
}

function PlayerRoute({ children }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (isAdmin()) return <Navigate to="/" />;
  return children;
}

function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (!isAdmin()) return <Navigate to="/" />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/activate" element={<ActivateAccount />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/confirm-email-change" element={<ConfirmEmailChange />} />
      <Route path="/tournaments/join/:token" element={<TournamentJoin />} />
      {/* Public profile — accessible without login */}
      <Route path="/players/:id" element={<PublicProfile />} />

      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        {/* Player-only routes */}
        <Route path="availability" element={<PlayerRoute><Availability /></PlayerRoute>} />
        <Route path="mypair"       element={<PlayerRoute><MyPair /></PlayerRoute>} />
        <Route path="matches"      element={<PlayerRoute><Matches /></PlayerRoute>} />
        <Route path="standings"    element={<PlayerRoute><Standings /></PlayerRoute>} />
        <Route path="valorations"  element={<PlayerRoute><Valorations /></PlayerRoute>} />
        {/* Shared routes */}
        <Route path="profile"      element={<Profile />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="messages"      element={<Messages />} />
        <Route path="players"      element={<Players />} />
        <Route path="tournaments/:id/view" element={<TournamentView />} />
        {/* Admin-only routes */}
        <Route path="tournament-instances" element={<AdminRoute><TournamentEngineAdmin /></AdminRoute>} />
        <Route path="clubs"                element={<AdminRoute><Clubs /></AdminRoute>} />
      </Route>
    </Routes>
  );
}
