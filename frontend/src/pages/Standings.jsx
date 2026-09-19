import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { tournamentEngineService } from '../services/api';
import { TrophyIcon, CalendarIcon, UsersIcon } from '@heroicons/react/24/outline';

const PAIRING_LABELS = {
  fixed_pairs:        'Parejas fijas',
  americana_clasica:  'Americana clásica',
  americana_perfecta: 'Americana perfecta',
  americana_mixta:    'Americana mixta',
  mexicano:           'Mexicano',
  round_robin:        'Round Robin',
  eliminacion_directa:'Eliminación directa',
};

const T_STATUS = {
  active:    { label:'Activo',     bg:'var(--ok-soft)', color:'var(--ok)', border:'var(--ok-soft)' },
  completed: { label:'Finalizado', bg:'var(--court-soft)', color:'var(--court-deep)', border:'var(--court-soft)' },
  archived:  { label:'Archivado',  bg:'var(--bone-3)', color:'var(--bp-text-2)', border:'var(--line)' },
  cancelled: { label:'Cancelado',  bg:'var(--crimson-soft)', color:'var(--crimson)', border:'var(--crimson-soft)' },
  draft:     { label:'Borrador',   bg:'var(--bone-2)', color:'var(--ink-soft)', border:'var(--line)' },
};

// Structure icons removed — TrophyIcon used as fallback below

const T_PAGE_SIZE = 6;

function TournamentStandings({ myPlayerId }) {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage]               = useState(1);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    tournamentEngineService.getAll()
      .then(r => setTournaments((r.data||[]).filter(t => t.status !== 'draft')))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{textAlign:'center',padding:'40px 0',color:'var(--ink-soft)'}}>Cargando...</div>;

  if (tournaments.length === 0) {
    return (
      <div style={{background:'var(--bone-2)',border:'1px solid var(--bp-border)',borderRadius:12,padding:20,fontSize:13,color:'var(--bp-text-2)',textAlign:'center'}}>
        No hay torneos activos o finalizados aún.
      </div>
    );
  }

  const filtered  = tournaments.filter(t => !statusFilter || t.status === statusFilter);
  const totalPages = Math.ceil(filtered.length / T_PAGE_SIZE);
  const paginated  = filtered.slice((page-1)*T_PAGE_SIZE, page*T_PAGE_SIZE);

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-ES', {day:'numeric',month:'short',year:'numeric'}) : '—';

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>

      {/* Status filter chips */}
      <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:2}}>
        {[['','Todos'], ['active','Activos'], ['completed','Finalizados'], ['archived','Archivados']].map(([val, label]) => (
          <button key={val} onClick={() => { setStatusFilter(val); setPage(1); }}
            style={{flexShrink:0, padding:'6px 14px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
              background: statusFilter===val ? 'var(--court-deep)' : 'white',
              color: statusFilter===val ? 'white' : 'var(--ink-soft)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)'}}>
            {label}
          </button>
        ))}
        <span style={{marginLeft:'auto',fontSize:11,color:'var(--ink-soft)',display:'flex',alignItems:'center',flexShrink:0}}>
          {filtered.length} torneo{filtered.length!==1?'s':''}
        </span>
      </div>

      {/* Tournament cards */}
      {filtered.length === 0 ? (
        <div style={{textAlign:'center',padding:'24px 0',color:'var(--ink-soft)',fontSize:13}}>Sin torneos para este filtro.</div>
      ) : (
        <>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {paginated.map(t => {
              const st = T_STATUS[t.status] || T_STATUS.draft;
              const nParticipants = t.participants?.length || t._count?.participants || 0;
              const amParticipant = (t.participants||[]).some(p => p.playerId === myPlayerId);
              return (
                <div key={t.id}
                  onClick={() => navigate(`/tournaments/${t.id}/view`)}
                  style={{background:'var(--bp-surface)', borderRadius:14, border:'1px solid var(--bp-border-2)', padding:'14px 16px', cursor:'pointer',
                    transition:'box-shadow 0.15s', boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'}>

                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8,gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14,color:'var(--bp-text)',display:'flex',alignItems:'center',gap:6}}>
                        <TrophyIcon style={{width:14,height:14,color:'var(--court-deep)',flexShrink:0}} />
                        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</span>
                        {amParticipant && <span style={{fontSize:9,background:'var(--court-deep)',color:'var(--ink)',borderRadius:4,padding:'1px 5px',flexShrink:0}}>Participo</span>}
                      </div>
                      {t.description && <div style={{fontSize:11,color:'var(--ink-soft)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.description}</div>}
                    </div>
                    <span style={{fontSize:10,fontWeight:700,background:st.bg,color:st.color,border:`1px solid ${st.border}`,borderRadius:20,padding:'3px 10px',flexShrink:0}}>
                      {st.label}
                    </span>
                  </div>

                  <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:4}}>
                      <CalendarIcon style={{width:12,height:12,color:'var(--bp-text-3)',flexShrink:0}} />
                      <span style={{fontSize:11,color:'var(--bp-text-2)'}}>{fmtDate(t.startDate)}{t.endDate ? ` → ${fmtDate(t.endDate)}` : ''}</span>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:4}}>
                      <UsersIcon style={{width:12,height:12,color:'var(--bp-text-3)',flexShrink:0}} />
                      <span style={{fontSize:11,color:'var(--bp-text-2)'}}>{nParticipants} jugadores</span>
                    </div>
                  </div>

                  <div style={{display:'flex',gap:5,flexWrap:'wrap',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                      <span style={{fontSize:10,background:'var(--court-soft)',color:'var(--court-deep)',borderRadius:6,padding:'2px 8px',fontWeight:600}}>
                        {PAIRING_LABELS[t.pairingSystem]||t.pairingSystem}
                      </span>
                      <span style={{fontSize:10,background:'var(--bone-3)',color:'var(--bp-text)',borderRadius:6,padding:'2px 8px'}}>
                        {t.matchFormat?.replace(/_/g,' ')||'—'}
                      </span>
                    </div>
                    <span style={{fontSize:11,color:'var(--court-deep)',fontWeight:700}}>Ver detalles →</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:11,color:'var(--ink-soft)'}}>
                {(page-1)*T_PAGE_SIZE+1}–{Math.min(page*T_PAGE_SIZE,filtered.length)} de {filtered.length}
              </span>
              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                <button onClick={()=>{setPage(p=>p-1);window.scrollTo(0,0);}} disabled={page===1}
                  style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:page===1?'var(--line)':'var(--ink-mid)',cursor:page===1?'default':'pointer',fontSize:12,fontWeight:600}}>
                  ‹
                </button>
                {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
                  <button key={p} onClick={()=>{setPage(p);window.scrollTo(0,0);}}
                    style={{width:30,height:30,borderRadius:8,border:`1px solid ${p===page?'var(--court-deep)':'var(--line)'}`,background:p===page?'var(--court-deep)':'white',color:p===page?'white':'var(--ink-mid)',cursor:'pointer',fontSize:12,fontWeight:p===page?700:400}}>
                    {p}
                  </button>
                ))}
                <button onClick={()=>{setPage(p=>p+1);window.scrollTo(0,0);}} disabled={page===totalPages}
                  style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:page===totalPages?'var(--line)':'var(--ink-mid)',cursor:page===totalPages?'default':'pointer',fontSize:12,fontWeight:600}}>
                  ›
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Standings() {
  const { user } = useAuth();
  const myPlayerId = user?.player?.id;

  return (
    <div style={{padding:12,display:'flex',flexDirection:'column',gap:12}}>
      <div style={{background:'var(--paper)',borderRadius:20,padding:16,border:'1px solid var(--line)'}}>
        <div style={{fontSize:11,color:'var(--ink-soft)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Competición</div>
        <div style={{fontWeight:700,fontSize:18,marginTop:4,display:'flex',alignItems:'center',gap:8}}><TrophyIcon style={{width:20,height:20}} /> Torneos</div>
      </div>
      <TournamentStandings myPlayerId={myPlayerId} />
    </div>
  );
}
