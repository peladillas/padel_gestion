import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { playerService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import PlayerStatsView from '../components/PlayerStatsView';

function PublicHeader({ playerName }) {
  return (
    <div style={{
      background: 'var(--paper)', borderBottom: '1px solid var(--line)',
      padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} />
        <span style={{ fontWeight: 900, fontSize: 16, color: 'var(--ink)', fontFamily: 'var(--display)', letterSpacing: '-0.5px' }}>
          Bonapinta
        </span>
        <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 500 }}>· Pádel</span>
      </Link>
      {playerName && (
        <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
          {playerName}
        </span>
      )}
    </div>
  );
}

function JoinCTA({ playerName }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      borderRadius: 20, padding: '24px 20px', textAlign: 'center', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(201,162,39,0.08)' }} />
      <div style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(201,162,39,0.05)' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#c9a227', fontFamily: 'var(--display)', marginBottom: 6, letterSpacing: '-1px' }}>
          Crea el tuyo
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
          {playerName ? `¿Juegas pádel como ${playerName.split(' ')[0]}?` : '¿Juegas al pádel?'}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
          Consigue tu cromo, valoraciones de tus compañeros y mucho más.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/login" style={{
            background: '#c9a227', color: '#1a1200', padding: '10px 20px', borderRadius: 10,
            textDecoration: 'none', fontWeight: 700, fontSize: 13,
          }}>
            Iniciar sesión
          </Link>
          <a href="https://bonapinta.com" style={{
            background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)',
            padding: '10px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 600, fontSize: 13,
            border: '1px solid rgba(255,255,255,0.15)',
          }}>
            Saber más
          </a>
        </div>
      </div>
    </div>
  );
}

export default function PublicProfile() {
  const { id }         = useParams();
  const navigate       = useNavigate();
  const { user }       = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');  // 'private' | 'notfound' | ''

  useEffect(() => {
    setLoading(true);
    setError('');
    playerService.getPublic(id)
      .then(r  => setData(r.data))
      .catch(e => setError(e?.response?.status === 403 ? 'private' : 'notfound'))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Loading ──
  if (loading) return (
    <>
      <PublicHeader />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0', color: 'var(--ink-soft)' }}>
        Cargando…
      </div>
    </>
  );

  // ── Error states ──
  if (error) return (
    <>
      <PublicHeader />
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {user && (
          <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 13, cursor: 'pointer', padding: 0, alignSelf: 'flex-start' }}>
            ← Volver
          </button>
        )}
        <div style={{ background: 'var(--bone-2)', border: '1px solid var(--line)', borderRadius: 20, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>{error === 'private' ? '🔒' : '❌'}</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink-2)', marginBottom: 6 }}>
            {error === 'private' ? 'Perfil privado' : 'Jugador no encontrado'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            {error === 'private'
              ? 'Este jugador ha configurado su perfil como privado.'
              : 'No se encontró este perfil.'}
          </div>
        </div>
        {!user && <JoinCTA />}
      </div>
    </>
  );

  const { player, stats, matches } = data;

  return (
    <>
      <PublicHeader playerName={player.name} />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Back button (only when logged in) */}
          {user && (
            <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 13, cursor: 'pointer', padding: 0, alignSelf: 'flex-start' }}>
              ← Volver
            </button>
          )}

          {/* Header card */}
          <div style={{ background: 'var(--paper)', borderRadius: 20, padding: 16, border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Bonapinta · Perfil
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--ink)', fontFamily: 'var(--display)', marginTop: 4 }}>
              {player.name}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, background: 'var(--court-soft)', color: 'var(--court-deep)', border: '1px solid var(--court)', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>
                NIV. {player.level}
              </span>
              {player.dominantHand && (
                <span style={{ fontSize: 9, background: 'var(--court-soft)', color: 'var(--court-deep)', border: '1px solid var(--court)', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>
                  {player.dominantHand === 'right' ? 'DIESTRO' : player.dominantHand === 'left' ? 'ZURDO' : 'AMBIDIESTRO'}
                </span>
              )}
              {player.position && (
                <span style={{ fontSize: 9, background: 'var(--court-soft)', color: 'var(--court-deep)', border: '1px solid var(--court)', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>
                  {player.position === 'drive' ? 'DRIVE' : player.position === 'reves' ? 'REVÉS' : 'DRIVE/REVÉS'}
                </span>
              )}
              {player.birthDate && (
                <span style={{ fontSize: 9, background: 'rgba(148,163,184,0.1)', color: 'var(--ink-soft)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 4, padding: '2px 7px' }}>
                  {new Date().getFullYear() - new Date(player.birthDate).getFullYear()} años
                </span>
              )}
              {player.club && (
                <span style={{ fontSize: 9, background: 'var(--amber-soft)', color: 'var(--amber)', border: '1px solid var(--amber-soft)', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>
                  {player.club.name}
                </span>
              )}
            </div>
          </div>

          {/* Stats — same component as in-app */}
          <PlayerStatsView
            player={player}
            stats={stats}
            matches={matches}
            showDownload={false}
            onNavigatePlayer={(pid) => navigate(`/players/${pid}`)}
          />

          {/* CTA — only for non-logged-in visitors */}
          {!user && <JoinCTA playerName={player.name} />}

        </div>
      </div>
    </>
  );
}
