import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { tournamentInstanceService, playerService } from '../services/api';
import {
  UsersIcon, TrophyIcon, ClockIcon, CheckCircleIcon,
  ExclamationTriangleIcon, FireIcon, StarIcon, ChartBarIcon, MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

function KpiCard({ icon: Icon, value, label, color='var(--court)', bg='var(--court-soft)' }) {
  return (
    <div style={{background:bg,borderRadius:14,padding:'14px 16px',flex:1,minWidth:0}}>
      <Icon style={{width:22,height:22,color}} />
      <div style={{fontSize:28,fontWeight:900,color,lineHeight:1,marginTop:4}}>{value}</div>
      <div style={{fontSize:11,color:'var(--bp-text-2)',marginTop:2,fontWeight:600}}>{label}</div>
    </div>
  );
}

function AdminDashboard({ data }) {
  const navigate = useNavigate();
  const { kpis, recentMatches, alerts, mostActive } = data;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {/* Header */}
      <div style={{background:'var(--paper)',borderRadius:20,padding:16,border:'1px solid var(--line)'}}>
        <div style={{fontSize:11,color:'var(--ink-soft)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Panel de control</div>
        <div style={{fontWeight:700,fontSize:20,marginTop:4,display:'flex',alignItems:'center',gap:8}}><ChartBarIcon style={{width:22,height:22}} /> Dashboard Admin</div>
      </div>

      {/* KPIs */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <KpiCard icon={UsersIcon} value={kpis.playerCount} label="Jugadores" color='var(--court)' bg='var(--court-soft)'/>
        <KpiCard icon={CheckCircleIcon} value={kpis.completedCount} label="Partidos jugados" color='var(--ok)' bg='var(--ok-soft)'/>
        <KpiCard icon={ClockIcon} value={kpis.pendingCount} label="Pendientes" color='var(--amber)' bg='var(--amber-soft)'/>
        <KpiCard icon={TrophyIcon} value={kpis.activeTournaments} label="Torneos activos" color='var(--court-deep)' bg='#f5f3ff'/>
      </div>

      {/* Alerts */}
      {((alerts.pendingResults||[]).length > 0 || (alerts.pendingTournamentCount||0) > 0) && (
        <div style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--amber-soft)',padding:14}}>
          <div style={{fontWeight:700,fontSize:13,color:'var(--amber)',marginBottom:10,display:'flex',alignItems:'center',gap:6}}>
            <ExclamationTriangleIcon style={{width:16,height:16}} /> Pendientes de registrar
          </div>
          {(alerts.pendingTournamentCount||0) > 0 && (
            <div style={{fontSize:12,color:'var(--bp-text)',padding:'6px 10px',background:'var(--amber-soft)',borderRadius:6,marginBottom:6,display:'flex',alignItems:'center',gap:6}}>
              <ExclamationTriangleIcon style={{width:12,height:12,color:'var(--amber)',flexShrink:0}} />
              <span><strong>{alerts.pendingTournamentCount}</strong> partido{alerts.pendingTournamentCount!==1?'s':''} de torneo sin resultado (modo Admin)</span>
              <button onClick={()=>navigate('/tournament-instances')} style={{marginLeft:'auto',fontSize:11,background:'var(--amber)',border:'none',borderRadius:5,padding:'3px 8px',color:'var(--ink)',fontWeight:700,cursor:'pointer',flexShrink:0}}>
                Ver torneos
              </button>
            </div>
          )}
          {(alerts.pendingResults||[]).length > 0 && (
            <>
              <div style={{fontSize:11,color:'var(--bp-text-2)',fontWeight:600,marginBottom:6}}>Partidos pendientes de confirmar (+2 días)</div>
              {alerts.pendingResults.map(m=>{
                const t1 = m.team1?.players?.map(p=>p.player.name.split(' ')[0]).join(' & ');
                const t2 = m.team2?.players?.map(p=>p.player.name.split(' ')[0]).join(' & ');
                return (
                  <div key={m.id} style={{fontSize:12,color:'var(--bp-text)',padding:'4px 8px',background:'var(--amber-soft)',borderRadius:6,marginBottom:4,display:'flex',alignItems:'center',gap:4}}>
                    <ExclamationTriangleIcon style={{width:12,height:12,color:'var(--amber)',flexShrink:0}} /> {t1} vs {t2}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Most active players */}
      {mostActive.length > 0 && (
        <div style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--bp-border-2)',overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--bp-border-2)',fontWeight:700,fontSize:13,color:'var(--bp-text)',display:'flex',alignItems:'center',gap:6}}>
            <FireIcon style={{width:16,height:16,color:'#f97316'}} /> Jugadores más activos
          </div>
          {mostActive.map((p,i)=>(
            <div key={p.id} onClick={()=>navigate(`/players/${p.id}`)}
              style={{padding:'10px 16px',borderBottom:'1px solid var(--bp-border-2)',display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
              <span style={{fontSize:12,fontWeight:900,width:24,textAlign:'center',color:['#c9a227','var(--ink-soft)','#cd7c3e','var(--ink-soft)','var(--ink-soft)'][i]}}>{i+1}</span>
              <div style={{width:32,height:32,borderRadius:8,overflow:'hidden',background:'#0a1828',flexShrink:0}}>
                {p.avatarUrl
                  ? <img src={p.avatarUrl} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                  : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#c9a227'}}>{p.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
                }
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--bp-text)'}}>{p.name}</div>
              </div>
              <span style={{fontSize:12,fontWeight:700,color:'var(--court-deep)'}}>{p.matches} PJ</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent matches */}
      {recentMatches.length > 0 && (
        <div style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--bp-border-2)',overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--bp-border-2)',fontWeight:700,fontSize:13,color:'var(--bp-text)',display:'flex',alignItems:'center',gap:6}}>
            <CheckCircleIcon style={{width:16,height:16,color:'var(--ok)'}} /> Últimos resultados
          </div>
          {recentMatches.map(m=>{
            const t1 = m.team1?.players?.map(p=>p.player.name.split(' ')[0]).join(' & ');
            const t2 = m.team2?.players?.map(p=>p.player.name.split(' ')[0]).join(' & ');
            return (
              <div key={m.id} style={{padding:'10px 16px',borderBottom:'1px solid var(--bp-border-2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontSize:12,color:'var(--bp-text)'}}>
                  <span style={{fontWeight:600,color:'var(--court-deep)'}}>{t1}</span>
                  <span style={{color:'var(--line)',margin:'0 5px'}}>vs</span>
                  <span style={{fontWeight:600}}>{t2}</span>
                </div>
                {m.result?.sets && (
                  <div style={{display:'flex',gap:3}}>
                    {m.result.sets.map((s,i)=>(
                      <span key={i} style={{fontSize:10,background:'var(--bone-2)',border:'1px solid var(--line)',borderRadius:4,padding:'1px 5px',fontWeight:700}}>{s.t1}-{s.t2}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const STRUCTURE_LABEL = {
  round_robin: 'Round Robin', eliminacion_directa: 'Eliminación', americana_clasica: 'Americana', americana_perfecta: 'Am. Perfecta', mexicano: 'Mexicano', mexicano_americano: 'Mex. Americano'
};
const STATUS_LABEL = { active: 'Activo', pending: 'Pendiente', completed: 'Finalizado' };
const STATUS_COLOR = { active: 'var(--ok)', pending: 'var(--amber)', completed: 'var(--ink-mid)' };
const STATUS_BG    = { active: 'var(--ok-soft)', pending: 'var(--amber-soft)', completed: 'var(--bone-3)' };

const DAYS_ES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function heroDate() {
  const d = new Date();
  return `${DAYS_ES[d.getDay()].toUpperCase()} · ${d.getDate()} ${MONTHS_ES[d.getMonth()].toUpperCase()}`;
}

function PlayerDashboard({ data }) {
  const navigate = useNavigate();
  const { player, kpis, myTournaments = [], arbitroTournaments = [] } = data;
  const [pendingMatches, setPendingMatches] = useState([]);

  useEffect(() => {
    tournamentInstanceService.getMyMatches()
      .then(r => setPendingMatches((r.data||[]).filter(m => m.status !== 'completed')))
      .catch(() => {});
  }, []);

  const firstName = player.name.split(' ')[0];

  const toConfirm = pendingMatches.filter(m =>
    m.result?.status === 'pending' && m.proposedByParticipant &&
    !(m.myParticipantIds||[]).includes(m.proposedByParticipant)
  );

  const nextMatch = toConfirm[0] || pendingMatches[0] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 16px 0' }}>

      {/* Hero */}
      <div className="p1-hero" role="region" aria-label="Resumen">
        <div className="p1-hero-eyebrow" aria-hidden="true">{heroDate()}</div>
        <div className="p1-hero-title">
          Buen día,<br /><em>{firstName}.</em>
        </div>
        <div className="p1-hero-stats" aria-label="Estadísticas">
          <div>
            <div className="p1-stat-n ok" aria-label={`${kpis.activeTournaments} torneos activos`}>{kpis.activeTournaments}</div>
            <div className="p1-stat-l">Torneos</div>
          </div>
          <div>
            <div className={`p1-stat-n${toConfirm.length ? ' amber' : ''}`} aria-label={`${pendingMatches.length} partidos pendientes`}>{pendingMatches.length}</div>
            <div className="p1-stat-l">Pendientes</div>
          </div>
          <div>
            <div className="p1-stat-n" aria-label={`${kpis.valorations} valoraciones`}>{kpis.valorations}</div>
            <div className="p1-stat-l">Valoraciones</div>
          </div>
        </div>
      </div>

      {/* Próximo partido */}
      {nextMatch && (
        <div>
          <div className="p1-section-head">
            <span className="p1-section-title">Próximo partido</span>
            <button className="p1-section-link" onClick={() => navigate('/matches')}>Ver todos →</button>
          </div>
          <div
            className={`p1-mini-card${toConfirm.length ? ' alert' : ''}`}
            onClick={() => navigate('/matches')}
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && navigate('/matches')}
            aria-label={`Partido: ${(nextMatch.myTeam||[]).join(' & ')} vs ${(nextMatch.opponentTeam||[]).join(' & ')}`}
          >
            <div className="p1-mc-tag" style={{display:'flex',alignItems:'center',gap:6}}>
              {nextMatch.isReferee && <span style={{fontSize:9,fontWeight:700,background:'var(--amber-soft)',color:'var(--amber)',borderRadius:4,padding:'1px 6px',flexShrink:0}}>🟡 ÁRBITRO</span>}
              {nextMatch.tournamentName}
            </div>
            <div className="p1-mc-main">
              <span style={{ color: 'var(--court-deep)' }}>{(nextMatch.myTeam||[]).map(n=>n.split(' ')[0]).join(' & ')}</span>
              <span style={{ color: 'var(--ink-soft)', margin: '0 6px', fontStyle: 'italic' }}>vs</span>
              {(nextMatch.opponentTeam||[]).map(n=>n.split(' ')[0]).join(' & ')}
            </div>
            <div className="p1-mc-sub">
              Ronda {nextMatch.round}
              {nextMatch.isReferee && ' · Toca registrar el resultado'}
            </div>
            {toConfirm.length > 0 && (
              <>
                <div className="p1-mc-sep" />
                <div className="p1-mc-row">
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} aria-hidden="true" />
                    Confirmar resultado
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)' }}>
                    {nextMatch.expiresAt
                      ? `~${Math.max(0, Math.round((new Date(nextMatch.expiresAt) - Date.now()) / 3600000))}h`
                      : ''}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Torneos activos */}
      {myTournaments.length > 0 && (
        <div>
          <div className="p1-section-head">
            <span className="p1-section-title">Mis torneos</span>
            <button className="p1-section-link" onClick={() => navigate('/standings')}>Ver todos →</button>
          </div>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
            {myTournaments.slice(0, 5).map(t => (
              <div
                key={t.id}
                className="p1-tour-row"
                onClick={() => navigate(`/standings?tournament=${t.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && navigate(`/standings?tournament=${t.id}`)}
                aria-label={`Torneo ${t.name}, estado ${STATUS_LABEL[t.status]||t.status}`}
              >
                <div>
                  <div className="p1-tour-name">{t.name}</div>
                  <div className="p1-tour-meta">
                    {STRUCTURE_LABEL[t.structure]||t.structure} · {t._count?.participants} jugadores
                  </div>
                </div>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  background: STATUS_BG[t.status], color: STATUS_COLOR[t.status],
                  borderRadius: 5, padding: '3px 8px', flexShrink: 0,
                }}>
                  {STATUS_LABEL[t.status]||t.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Torneos donde el jugador es árbitro */}
      {arbitroTournaments.length > 0 && (
        <div>
          <div className="p1-section-head">
            <span className="p1-section-title" style={{display:'flex',alignItems:'center',gap:5}}>
              <span aria-hidden="true">🟡</span> Árbitro en
            </span>
            <button className="p1-section-link" onClick={() => navigate('/matches')}>Ver partidos →</button>
          </div>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--amber-soft)', borderRadius: 14, overflow: 'hidden' }}>
            {arbitroTournaments.map(t => (
              <div key={t.id} className="p1-tour-row" style={{borderLeft:'3px solid var(--amber)'}}>
                <div>
                  <div className="p1-tour-name">{t.name}</div>
                  <div className="p1-tour-meta">
                    {t._count?.matches > 0
                      ? <span style={{color:'var(--amber)',fontWeight:600}}>{t._count.matches} partido{t._count.matches!==1?'s':''} sin resultado</span>
                      : 'Sin partidos pendientes'
                    }
                  </div>
                </div>
                <span style={{
                  fontFamily:'var(--mono)',fontSize:9.5,fontWeight:700,
                  letterSpacing:'0.08em',textTransform:'uppercase',
                  background:'var(--amber-soft)',color:'var(--amber)',
                  borderRadius:5,padding:'3px 8px',flexShrink:0,
                }}>Árbitro</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

const CM_PAGE = 8;

function ClubMembersPanel() {
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('active');

  useEffect(() => {
    playerService.getClubMembers()
      .then(r => { setClub(r.data.club); setPlayers(r.data.players || []); })
      .catch(() => setLoadError('No se pudieron cargar los socios del club'))
      .finally(() => setLoading(false));
  }, []);

  const activePlayers  = players.filter(p => p.active !== false);
  const deletedPlayers = players.filter(p => p.active === false);
  const source = activeTab === 'active' ? activePlayers : deletedPlayers;

  const q = search.toLowerCase();
  const filtered = source.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.user?.email||'').toLowerCase().includes(q) ||
    (p.user?.username||'').toLowerCase().includes(q)
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / CM_PAGE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * CM_PAGE, safePage * CM_PAGE);

  const switchTab = tab => { setActiveTab(tab); setPage(1); setSearch(''); };

  if (loading) return null;
  if (loadError) return (
    <div style={{background:'var(--crimson-soft)',borderRadius:16,padding:'14px 16px',marginTop:12,fontSize:12,color:'var(--crimson)'}}>
      {loadError}
    </div>
  );
  if (!club) return null;

  return (
    <div style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--bp-border-2)',overflow:'hidden',marginTop:12}}>
      {/* Header */}
      <div style={{padding:'12px 16px',borderBottom:'1px solid var(--bp-border-2)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <UsersIcon style={{width:16,height:16,color:'var(--court)'}}/>
          <span style={{fontWeight:700,fontSize:13,color:'var(--bp-text)'}}>Socios — {club.name}</span>
          <span style={{fontSize:11,background:'var(--court-soft)',color:'var(--court-deep)',borderRadius:10,padding:'1px 8px',fontWeight:700}}>{filtered.length}</span>
        </div>
        <div style={{position:'relative',flex:'1 1 160px',maxWidth:260}}>
          <MagnifyingGlassIcon style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',width:13,height:13,color:'var(--ink-soft)',pointerEvents:'none'}}/>
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
            placeholder="Buscar socio..."
            style={{width:'100%',paddingLeft:28,paddingRight:8,paddingTop:7,paddingBottom:7,border:'1px solid var(--line)',borderRadius:8,fontSize:12,outline:'none',boxSizing:'border-box',background:'var(--bone-2)'}}/>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid var(--bp-border-2)',padding:'0 16px',gap:4}}>
        {[['active','Activos',activePlayers.length],['deleted','Eliminados',deletedPlayers.length]].map(([tab,label,count]) => {
          if (tab === 'deleted' && count === 0) return null;
          const isActive = activeTab === tab;
          return (
            <button key={tab} onClick={()=>switchTab(tab)}
              style={{padding:'8px 12px',border:'none',borderBottom:`2px solid ${isActive?'var(--court)':'transparent'}`,background:'transparent',cursor:'pointer',fontSize:12,fontWeight:isActive?700:400,color:isActive?'var(--court)':'var(--bp-text-3)',display:'flex',alignItems:'center',gap:5}}>
              {label}
              <span style={{fontSize:10,background:isActive?'var(--court-soft)':'var(--bp-border-2)',color:isActive?'var(--court-deep)':'var(--bp-text-3)',borderRadius:8,padding:'1px 6px',fontWeight:700}}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Rows */}
      {visible.length === 0
        ? <div style={{padding:'28px 16px',textAlign:'center',fontSize:13,color:'var(--bp-text-3)'}}>
            {search ? `Sin resultados para "${search}"` : activeTab === 'deleted' ? 'No hay socios eliminados' : 'No hay socios en este club'}
          </div>
        : visible.map(p => (
            <div key={p.id} onClick={()=>navigate(`/players/${p.id}`)}
              style={{padding:'10px 16px',borderBottom:'1px solid var(--bp-border-2)',display:'flex',alignItems:'center',gap:12,cursor:'pointer',opacity:activeTab==='deleted'?0.6:1}}>
              <div style={{width:34,height:34,borderRadius:8,overflow:'hidden',background:'#0a1828',flexShrink:0}}>
                {p.avatarUrl
                  ? <img src={p.avatarUrl} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                  : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#c9a227'}}>
                      {p.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                    </div>
                }
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--bp-text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:6}}>
                  {p.name}
                  {activeTab === 'deleted' && <span style={{fontSize:10,background:'#fee2e2',color:'#b91c1c',borderRadius:6,padding:'1px 6px',fontWeight:700,flexShrink:0}}>BAJA</span>}
                </div>
                <div style={{fontSize:11,color:'var(--bp-text-3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.user?.email}</div>
              </div>
              {p.user?.username && (
                <span style={{fontSize:11,color:'var(--ink-soft)',fontFamily:'var(--mono)',flexShrink:0}}>@{p.user.username}</span>
              )}
            </div>
          ))
      }

      {/* Paginator */}
      {totalPages > 1 && (
        <div style={{padding:'10px 16px',borderTop:'1px solid var(--bp-border-2)',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={safePage===1}
            style={{width:28,height:28,borderRadius:6,border:'1px solid var(--line)',background:safePage===1?'transparent':'white',color:safePage===1?'var(--line)':'var(--ink)',cursor:safePage===1?'default':'pointer',fontSize:13,fontWeight:700}}>‹</button>
          {Array.from({length:totalPages},(_,i)=>i+1).map(n=>(
            <button key={n} onClick={()=>setPage(n)}
              style={{width:28,height:28,borderRadius:6,border:'1px solid '+(n===safePage?'var(--court)':'var(--line)'),background:n===safePage?'var(--court)':'white',color:n===safePage?'var(--ink)':'var(--ink-soft)',cursor:'pointer',fontSize:12,fontWeight:n===safePage?700:400}}>
              {n}
            </button>
          ))}
          <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={safePage===totalPages}
            style={{width:28,height:28,borderRadius:6,border:'1px solid var(--line)',background:safePage===totalPages?'transparent':'white',color:safePage===totalPages?'var(--line)':'var(--ink)',cursor:safePage===totalPages?'default':'pointer',fontSize:13,fontWeight:700}}>›</button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    const endpoint = isAdmin() ? '/dashboard/admin' : '/dashboard/player';
    api.get(endpoint)
      .then(r => setData(r.data))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  },[]);

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:'80px 0',color:'var(--bp-text-3)'}}>Cargando...</div>;
  if (!data) return <div style={{textAlign:'center',padding:'40px',color:'var(--crimson)'}}>Error cargando dashboard</div>;

  if (isAdmin()) return (
    <div style={{display:'flex',flexDirection:'column',gap:0}}>
      <AdminDashboard data={data}/>
      {!isSuperAdmin() && <ClubMembersPanel/>}
    </div>
  );
  return <PlayerDashboard data={data}/>;
}
