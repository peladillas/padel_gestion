import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { valorationService, tournamentInstanceService, authService, playerService } from '../services/api';
import { computeRecord, timeLeftLabel } from '../utils/matchRecord';
import { SCALE_MAX, GREAT_AMBIENTE, overall, shotColor, scaleRatio, fmtScore } from '../utils/valoration';
import { PlayerAvatar } from '../components/tournament/matchDisplay';

const SHOTS = [
  { key:'smash',       label:'Smash'       },
  { key:'volea',       label:'Volea'        },
  { key:'globo',       label:'Globo'        },
  { key:'bandeja',     label:'Bandeja'      },
  { key:'bajadaPared', label:'B.Pared'      },
  { key:'resto',       label:'Resto'        },
  { key:'saque',       label:'Saque'        },
];

function RadarSVG({ data, size=200, dark=false }) {
  const n = SHOTS.length;
  const padding = 36;
  const cx = size/2, cy = size/2, r = size/2 - padding;

  const points = SHOTS.map((s,i) => {
    const angle = (i * 2 * Math.PI / n) - Math.PI/2;
    const v = scaleRatio(data[s.key]);
    return { x: cx + r*v*Math.cos(angle), y: cy + r*v*Math.sin(angle) };
  });
  const poly = points.map(p=>`${p.x},${p.y}`).join(' ');

  const rings = [0.25,0.5,0.75,1].map(v =>
    SHOTS.map((_,i) => {
      const a = (i * 2 * Math.PI / n) - Math.PI/2;
      return `${cx+r*v*Math.cos(a)},${cy+r*v*Math.sin(a)}`;
    }).join(' ')
  );

  const gridColor = dark ? 'rgba(255,255,255,0.1)' : 'var(--line)';
  const uid = dark ? 'radarGradDark' : 'radarGradLight';
  const clipId = dark ? 'radarClipDark' : 'radarClipLight';

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{display:'block'}}>
      <defs>
        <clipPath id={clipId}>
          <polygon points={poly}/>
        </clipPath>
        <radialGradient id={uid} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--crimson)" stopOpacity="0.5"/>
          <stop offset="45%" stopColor="var(--amber)" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="var(--court)" stopOpacity="0.45"/>
        </radialGradient>
      </defs>

      {rings.map((ring,i) => <polygon key={i} points={ring} fill="none" stroke={gridColor} strokeWidth="0.5"/>)}
      {SHOTS.map((_,i) => {
        const a = (i * 2 * Math.PI / n) - Math.PI/2;
        return <line key={i} x1={cx} y1={cy} x2={cx+r*Math.cos(a)} y2={cy+r*Math.sin(a)} stroke={gridColor} strokeWidth="0.5"/>;
      })}

      <circle cx={cx} cy={cy} r={r} fill={`url(#${uid})`} clipPath={`url(#${clipId})`}/>
      <polygon points={poly} fill="none" stroke={dark?'#c9a227':'var(--court)'} strokeWidth="1.5"/>

      {points.map((p,i) => {
        const v = data[SHOTS[i].key]||0;
        const col = shotColor(v);
        return <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={col} stroke="white" strokeWidth="1.5"/>;
      })}

      {SHOTS.map((s,i) => {
        const a = (i * 2 * Math.PI / n) - Math.PI/2;
        const lr = r + 26;
        const lx = cx+lr*Math.cos(a), ly = cy+lr*Math.sin(a);
        const v = data[s.key]||0;
        return (
          <g key={i}>
            <text x={lx} y={ly-4} textAnchor="middle" fontSize="8" fill={dark?'#7a6020':'var(--ink-soft)'} fontFamily="var(--body)" fontWeight="500">{s.label}</text>
            <text x={lx} y={ly+6} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink-2)" fontFamily="var(--body)">{v}</text>
          </g>
        );
      })}
    </svg>
  );
}

function getBestShot(stats) {
  if (!stats || stats.total === 0) return null;
  let best = null, bestVal = 0;
  SHOTS.forEach(s => { if ((stats[s.key]||0) > bestVal) { bestVal = stats[s.key]; best = s.label; } });
  return best;
}

function PlayerCromo({ player, stats, matches, cardRef }) {
  const { total, wins, losses, winRate, setsWon } = computeRecord(matches);
  const initials = player.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
  const firstName = player.name.split(' ')[0].toUpperCase();
  const lastName = player.name.split(' ').slice(1).join(' ').toUpperCase();
  const ovr = overall(stats) ?? '--';
  const bestShot = getBestShot(stats);
  const hasStats = stats?.total >= 1;

  const statRows = [
    { key:'smash', label:'Smash', val: hasStats ? stats.smash : '--' },
    { key:'volea', label:'Volea', val: hasStats ? stats.volea : '--' },
    { key:'bandeja', label:'Bandeja', val: hasStats ? stats.bandeja : '--' },
    { key:'globo', label:'Globo', val: hasStats ? stats.globo : '--' },
    { key:'resto', label:'Resto', val: hasStats ? stats.resto : '--' },
    { key:'saque', label:'Saque', val: hasStats ? stats.saque : '--' },
  ];

  return (
    <div ref={cardRef} style={{
      width:280, background:'#1a1200', borderRadius:20, overflow:'hidden',
      fontFamily:'var(--body)', border:'2px solid #c9a227', position:'relative'
    }}>
      {/* BG pattern */}
      <div style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none'}}>
        <div style={{position:'absolute',top:-20,right:-20,width:200,height:600,background:'#c9a227',opacity:0.06,transform:'rotate(-15deg)'}}/>
        <div style={{position:'absolute',top:-20,right:30,width:60,height:600,background:'#c9a227',opacity:0.04,transform:'rotate(-15deg)'}}/>
      </div>

      {/* HEADER */}
      <div style={{background:'#c9a227',padding:'8px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',position:'relative',zIndex:1}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:22,height:22,background:'#1a1200',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:900,color:'#c9a227',flexShrink:0}}>B</div>
          <span style={{fontSize:9,fontWeight:900,color:'#1a1200',letterSpacing:'0.15em'}}>BONAPINTA</span>
        </div>
        <span style={{fontSize:9,fontWeight:900,color:'#1a1200',background:'rgba(0,0,0,0.15)',padding:'2px 8px',borderRadius:4,letterSpacing:'0.1em'}}>
          DRIVE · NIV.{player.level}
        </span>
      </div>

      {/* FOTO AREA */}
      <div style={{height:210,background:'#0f1a2e',position:'relative',overflow:'hidden'}}>
        {/* Hexagon BG */}
        <svg width="100%" height="100%" style={{position:'absolute',inset:0,opacity:0.08}}>
          <pattern id="hexp" x="0" y="0" width="30" height="26" patternUnits="userSpaceOnUse">
            <polygon points="15,1 28,8 28,20 15,27 2,20 2,8" fill="none" stroke="#c9a227" strokeWidth="0.5"/>
          </pattern>
          <rect width="100%" height="100%" fill="url(#hexp)"/>
        </svg>

        {/* FOTO full bleed */}
        {player.avatarUrl ? (
          <img src={player.avatarUrl} alt={player.name}
            style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',objectPosition:'center top'}}
            crossOrigin="anonymous"/>
        ) : (
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:72,fontWeight:900,color:'#c9a227',opacity:0.3}}>{initials}</div>
        )}

        {/* Fade bottom */}
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:80,background:'linear-gradient(to top, #0f1520, transparent)'}}/>
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:30,background:'#0f1520'}}/>

        {/* OVR Badge */}
        <div style={{position:'absolute',left:10,top:10,zIndex:10,background:'#c9a227',borderRadius:8,padding:'6px 8px',textAlign:'center',minWidth:44}}>
          <div style={{fontSize:26,fontWeight:900,color:'#1a1200',lineHeight:1}}>{ovr}</div>
          <div style={{fontSize:8,fontWeight:900,color:'#1a1200',letterSpacing:'0.05em'}}>OVR</div>
        </div>
      </div>

      {/* STATS */}
      <div style={{background:'#0f1520',padding:'8px 10px',position:'relative',zIndex:1}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4,marginBottom:6}}>
          {statRows.map((s,i) => (
            <div key={s.key} style={{background:'rgba(201,162,39,0.08)',border:'1px solid rgba(201,162,39,0.18)',borderRadius:6,padding:'5px 4px',textAlign:'center'}}>
              <div style={{fontSize:16,fontWeight:900,color: i<3 ? '#c9a227' : '#7dd3fc'}}>{s.val}</div>
              <div style={{fontSize:7,color: i<3 ? '#7a6020' : '#4a6a80',fontWeight:700,textTransform:'uppercase'}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Win rate bar */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
          <span style={{fontSize:8,color:'#7a6020',fontWeight:700,whiteSpace:'nowrap'}}>WIN RATE</span>
          <div style={{flex:1,height:5,background:'#0a0f1a',borderRadius:3,overflow:'hidden'}}>
            <div style={{width:`${winRate}%`,height:'100%',background:'#c9a227',borderRadius:3}}/>
          </div>
          <span style={{fontSize:10,fontWeight:900,color:'#c9a227'}}>{winRate}%</span>
        </div>

        {/* Match stats */}
        <div style={{display:'flex',gap:4}}>
          {[[total,'PJ','white'],[wins,'PG','var(--court)'],[losses,'PP','var(--crimson)'],[setsWon,'SETS','var(--amber)']].map(([val,label,color])=>(
            <div key={label} style={{flex:1,background:'rgba(255,255,255,0.03)',borderRadius:5,padding:'4px 3px',textAlign:'center'}}>
              <div style={{fontSize:13,fontWeight:900,color}}>{val}</div>
              <div style={{fontSize:7,color:'#3a4560',textTransform:'uppercase'}}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* NOMBRE */}
      <div style={{background:'#c9a227',padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',position:'relative',zIndex:1}}>
        <div>
          <div style={{fontSize:20,fontWeight:900,color:'#1a1200',letterSpacing:'-0.5px',lineHeight:1}}>{firstName}</div>
          <div style={{fontSize:11,fontWeight:700,color:'#7a4a00',letterSpacing:'0.1em'}}>{lastName}</div>
        </div>
        {bestShot && (
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:8,fontWeight:900,color:'#7a4a00',textTransform:'uppercase'}}>Mejor golpe</div>
            <div style={{fontSize:12,fontWeight:900,color:'#1a1200'}}>{bestShot.toUpperCase()}</div>
          </div>
        )}
      </div>

      {/* LOGROS */}
      <div style={{background:'#0a0f1a',padding:'8px 10px',position:'relative',zIndex:1}}>
        <div style={{fontSize:8,fontWeight:700,color:'#3a4560',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6}}>Logros</div>
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
          {stats?.ambiente >= GREAT_AMBIENTE && (
            <div style={{background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.3)',borderRadius:5,padding:'3px 8px',display:'flex',alignItems:'center',gap:4}}>
              <div style={{width:8,height:8,background:'var(--court)',borderRadius:2}}/>
              <span style={{fontSize:9,fontWeight:700,color:'var(--court)'}}>TOP AMB.</span>
            </div>
          )}
          {winRate >= 60 && (
            <div style={{background:'rgba(201,162,39,0.15)',border:'1px solid rgba(201,162,39,0.4)',borderRadius:5,padding:'3px 8px',display:'flex',alignItems:'center',gap:4}}>
              <div style={{width:8,height:8,background:'#c9a227',borderRadius:'50%'}}/>
              <span style={{fontSize:9,fontWeight:700,color:'#c9a227'}}>60%+ WIN</span>
            </div>
          )}
          {total >= 10 && (
            <div style={{background:'rgba(148,163,184,0.1)',border:'1px solid rgba(148,163,184,0.2)',borderRadius:5,padding:'3px 8px',display:'flex',alignItems:'center',gap:4}}>
              <div style={{width:8,height:8,background:'var(--ink-soft)',borderRadius:'50%'}}/>
              <span style={{fontSize:9,fontWeight:700,color:'var(--bp-text-3)'}}>10+ PJ</span>
            </div>
          )}
          {(!stats?.ambiente || stats.ambiente < GREAT_AMBIENTE) && winRate < 60 && total < 10 && (
            <span style={{fontSize:9,color:'#2a3040',fontStyle:'italic'}}>Juega más para desbloquear logros</span>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{background:'#0a0a0a',padding:'5px 12px',display:'flex',justifyContent:'space-between',position:'relative',zIndex:1}}>
        <span style={{fontSize:8,color:'#1a1a1a',fontWeight:700}}>bonapinta.com</span>
        <span style={{fontSize:8,color:'#1a1a1a',fontWeight:700}}>TEMPORADA 1 · 2026</span>
      </div>
    </div>
  );
}

function MiniCromo({ player, stats, rank, onClick }) {
  const medals = ['🥇','🥈','🥉'];
  const initials = player.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
  const ovr = overall(stats) ?? '--';
  return (
    <div onClick={onClick} style={{background:'#1a1200',borderRadius:10,border:'1px solid #c9a227',overflow:'hidden',flex:1,minWidth:0,cursor:'pointer'}}>
      <div style={{background:'#c9a227',padding:'4px 8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:9,fontWeight:900,color:'#1a1200'}}>{medals[rank]}</span>
        <span style={{fontSize:9,fontWeight:900,color:'#1a1200'}}>{ovr} OVR</span>
      </div>
      <div style={{padding:8}}>
        <div style={{width:36,height:36,borderRadius:8,overflow:'hidden',background:'#0a1828',margin:'0 auto 6px',border:'1px solid rgba(201,162,39,0.3)'}}>
          {player.avatarUrl
            ? <img src={player.avatarUrl} style={{width:'100%',height:'100%',objectFit:'cover'}} crossOrigin="anonymous"/>
            : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:900,color:'#c9a227'}}>{initials}</div>
          }
        </div>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:10,fontWeight:700,color:'#c9a227',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{player.name.split(' ')[0]}</div>
          <div style={{fontSize:8,color:'#7a6020'}}>{stats.total} val.</div>
        </div>

      </div>
    </div>
  );
}

function ReceivedCard({ val }) {
  const ovr  = overall(val);
  const date = val.matchDate
    ? new Date(val.matchDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  const initials     = val.fromPlayerName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const ratedShots   = SHOTS.filter(s => val[s.key] !== null && val[s.key] !== undefined);
  const hasAmbiente  = val.ambiente !== null && val.ambiente !== undefined;

  return (
    <div style={{ background: 'var(--paper)', borderRadius: 14, border: '1px solid var(--line)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, overflow: 'hidden', background: 'var(--bone-3)',
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: 'var(--ink-soft)'
        }}>
          {val.fromPlayerAvatar
            ? <img src={val.fromPlayerAvatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
            : initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {val.fromPlayerName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{date}</div>
        </div>
        {ovr !== null && (
          <div style={{ background: 'var(--amber)', borderRadius: 8, padding: '4px 10px', textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink-2)', lineHeight: 1 }}>{ovr}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>OVR</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {ratedShots.map(s => (
          <span key={s.key} style={{
            fontSize: 11, borderRadius: 6, padding: '3px 8px', background: 'var(--bone-2)',
            border: '1px solid var(--line)', display: 'inline-flex', gap: 5, alignItems: 'center'
          }}>
            <span style={{ color: 'var(--ink-soft)' }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: shotColor(val[s.key]) }}>{val[s.key]}</span>
          </span>
        ))}
        {hasAmbiente && (
          <span style={{
            fontSize: 11, borderRadius: 6, padding: '3px 8px', background: 'var(--bone-2)',
            border: '1px solid var(--line)', display: 'inline-flex', gap: 5, alignItems: 'center'
          }}>
            <span style={{ color: 'var(--ink-soft)' }}>Amb.</span>
            <span style={{ fontWeight: 700, color: shotColor(val.ambiente) }}>{val.ambiente}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function Paginator({ page, total, onChange }) {
  if (total <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '8px 0' }}>
      <button onClick={() => onChange(page - 1)} disabled={page === 1}
        style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, fontSize: 12 }}>
        ‹ Anterior
      </button>
      <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{page} de {total}</span>
      <button onClick={() => onChange(page + 1)} disabled={page === total}
        style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)', cursor: page === total ? 'default' : 'pointer', opacity: page === total ? 0.4 : 1, fontSize: 12 }}>
        Siguiente ›
      </button>
    </div>
  );
}

// One line per shot:  Smash ────●──── 4/5  ✕   (nothing rated until the
// slider is touched; ✕ puts it back to "sin valorar").
function ScoreSlider({ label, value, onChange }) {
  const rated = value !== null;
  const mid = Math.ceil(SCALE_MAX / 2);
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,minHeight:34}}>
      <span style={{width:88,flexShrink:0,fontSize:12,fontWeight:600,color:rated?'var(--bp-text)':'var(--ink-soft)'}}>{label}</span>
      <input type="range" min={1} max={SCALE_MAX} step={1} value={rated ? value : mid}
        aria-label={`${label}: ${rated ? `${value} de ${SCALE_MAX}` : 'sin valorar'}`}
        onPointerDown={() => { if (!rated) onChange(mid); }}
        onChange={e => onChange(Number(e.target.value))}
        style={{flex:1,minWidth:0,margin:0,cursor:'pointer',accentColor:rated?shotColor(value):'var(--line)',opacity:rated?1:0.45}} />
      <span style={{width:32,textAlign:'right',flexShrink:0,fontSize:12,fontWeight:700,color:rated?shotColor(value):'var(--ink-soft)'}}>
        {rated ? `${value}/${SCALE_MAX}` : '—'}
      </span>
      <button type="button" onClick={() => onChange(null)} aria-label={`Quitar valoración de ${label}`} disabled={!rated}
        style={{width:20,height:20,flexShrink:0,padding:0,border:'none',background:'none',fontSize:13,lineHeight:1,
          color:'var(--ink-soft)',cursor:rated?'pointer':'default',visibility:rated?'visible':'hidden'}}>✕</button>
    </div>
  );
}

const RELATION_LABEL = { partner: 'Tu pareja', rival: 'Rival' };

/** Photo + full name (+ pareja/rival): so the rater knows exactly who is who. */
function RateeCard({ player, selected, onClick }) {
  const tag = RELATION_LABEL[player.relation];
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper type={onClick ? 'button' : undefined} onClick={onClick}
      style={{display:'flex',alignItems:'center',gap:10,padding:'10px',borderRadius:12,textAlign:'left',width:'100%',boxSizing:'border-box',
        border:`2px solid ${selected?'var(--court)':'var(--line)'}`,background:selected?'var(--court-soft)':'white',cursor:onClick?'pointer':'default'}}>
      <PlayerAvatar player={player} size={44} />
      <span style={{minWidth:0,display:'flex',flexDirection:'column',gap:2}}>
        <span style={{fontSize:13,fontWeight:700,color:'var(--bp-text)',lineHeight:1.2,overflowWrap:'anywhere'}}>{player.name}</span>
        {tag && (
          <span style={{alignSelf:'flex-start',fontSize:10,fontWeight:700,borderRadius:5,padding:'1px 7px',
            background:player.relation==='partner'?'var(--ok-soft)':'var(--bone-3)',color:player.relation==='partner'?'var(--ok)':'var(--ink-soft)'}}>{tag}</span>
        )}
      </span>
    </Wrapper>
  );
}

const EMPTY_SCORES = {smash:null,volea:null,globo:null,bandeja:null,bajadaPared:null,resto:null,saque:null,ambiente:null};

export function ValorationForm({ match, myPlayerId, onSubmit, onClose }) {
  const playersToRate = (match.playersToRate||[]).filter(p=>!p.alreadyRated);
  const [toPlayerId, setToPlayerId] = useState(playersToRate[0]?.id||'');
  const [scores, setScores] = useState(EMPTY_SCORES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setScore = (k, v) => setScores(prev=>({...prev,[k]:v}));
  const hasAny = Object.values(scores).some(v=>v!==null);

  const handleSubmit = async () => {
    if (!hasAny) { setError('Debes valorar al menos un aspecto'); return; }
    setLoading(true); setError('');
    try { await onSubmit({ tournamentMatchId: match.tournamentMatchId, toPlayerId, ...scores }); onClose(); }
    catch(e) { setError(e.response?.data?.error||'Error'); setLoading(false); }
  };

  if (!playersToRate.length) return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'var(--bp-surface)',borderRadius:16,padding:24,textAlign:'center'}}>
        <div style={{fontSize:40,marginBottom:12}}>✅</div>
        <div style={{fontWeight:700,marginBottom:12}}>Ya valoraste a todos</div>
        <button onClick={onClose} style={{background:'var(--court)',border:'none',borderRadius:10,padding:'10px 24px',color:'var(--ink)',fontWeight:700,cursor:'pointer'}}>Cerrar</button>
      </div>
    </div>
  );

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div style={{background:'var(--bp-surface)',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:520,padding:20,maxHeight:'92vh',overflowY:'auto'}}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:2}}>Valorar jugador</div>
        <div style={{fontSize:12,color:'var(--bp-text-3)',marginBottom:14}}>Te quedan {timeLeftLabel(match)} para valorar · Mueve el deslizador de lo que quieras valorar; lo que no toques queda sin valorar</div>

        {/* Who you are rating: photo + full name + pareja/rival */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:11,fontWeight:600,color:'var(--bp-text-2)',display:'block',marginBottom:6}}>
            {playersToRate.length > 1 ? '¿A quién valoras?' : 'Valoras a'}
          </label>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8}}>
            {playersToRate.map(p=>(
              <RateeCard key={p.id} player={p} selected={toPlayerId===p.id}
                onClick={playersToRate.length > 1 ? ()=>{setToPlayerId(p.id);setScores(EMPTY_SCORES);} : undefined} />
            ))}
          </div>
        </div>

        {/* Shot scores: one slider per line */}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--bp-text-2)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>
            Golpes (1 a {SCALE_MAX})
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            {SHOTS.map(s=>(
              <ScoreSlider key={s.key} label={s.label} value={scores[s.key]} onChange={v=>setScore(s.key,v)} />
            ))}
          </div>
        </div>

        {/* Ambiente */}
        <div style={{marginBottom:18,paddingTop:8,borderTop:'1px solid var(--bone-3)'}}>
          <ScoreSlider label="Ambiente" value={scores.ambiente} onChange={v=>setScore('ambiente',v)} />
        </div>

        {error && <div style={{background:'var(--crimson-soft)',color:'var(--crimson)',borderRadius:8,padding:'8px 12px',fontSize:12,marginBottom:10}}>{error}</div>}
        <div style={{display:'flex',gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:'11px',borderRadius:10,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',fontSize:13,cursor:'pointer'}}>Cancelar</button>
          <button onClick={handleSubmit} disabled={loading||!hasAny}
            style={{flex:2,padding:'11px',borderRadius:10,border:'none',background:hasAny?'var(--court)':'var(--line)',
              color:hasAny?'var(--ink)':'var(--ink-soft)',fontWeight:700,fontSize:13,cursor:hasAny&&!loading?'pointer':'default',opacity:loading?0.6:1}}>
            {loading?'Guardando...':'Enviar valoración'}
          </button>
        </div>
      </div>
    </div>
  );
}


function EvolutionChart({ playerId }) {
  const [evolution, setEvolution] = useState([]);
  const [loading, setLoading] = useState(true);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(()=>{
    valorationService.getEvolution(playerId)
      .then(r => setEvolution(r.data||[]))
      .catch(e => console.error(e))
      .finally(()=>setLoading(false));
  },[playerId]);

  useEffect(()=>{
    if (!evolution.length || !chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();

    // Load Chart.js from CDN if not already loaded
    if (!window.Chart) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
      script.onload = () => buildChart();
      document.head.appendChild(script);
      return;
    }
    buildChart();

    function buildChart() {
      if (chartInstance.current) chartInstance.current.destroy();

    const SHOT_COLORS = {
      smash:       'var(--crimson)',
      volea:       'var(--amber)',
      globo:       'var(--court)',
      bandeja:     'var(--court)',
      bajadaPared: '#8b5cf6',
      resto:       '#ec4899',
      saque:       '#14b8a6',
      ambiente:    'var(--ink-soft)',
    };
    const SHOT_LABELS = {
      smash:'Smash', volea:'Volea', globo:'Globo', bandeja:'Bandeja',
      bajadaPared:'B.Pared', resto:'Resto', saque:'Saque', ambiente:'Ambiente Padelero'
    };

    // Group by month if >10 data points
    let dataPoints = evolution;
    if (evolution.length > 10) {
      const byMonth = {};
      evolution.forEach(row => {
        const d = new Date(row.matchDate);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        if (!byMonth[key]) byMonth[key] = { matchDate: new Date(d.getFullYear(), d.getMonth(), 15).toISOString(), rows: [] };
        byMonth[key].rows.push(row);
      });
      dataPoints = Object.values(byMonth).map(({matchDate, rows}) => {
        const avg = {};
        Object.keys(SHOT_COLORS).forEach(k => {
          avg[k] = Math.round(rows.reduce((s,r)=>s+(r[k]||0),0)/rows.length*10)/10;
        });
        return { matchDate, ...avg };
      });
    }

    // Add 1-month projection based on last 3 points trend
    const labels = dataPoints.map(d => {
      const date = new Date(d.matchDate);
      return date.toLocaleDateString('es-ES', {day:'numeric', month:'short'});
    });

    // Projection point
    if (dataPoints.length >= 2) {
      const last = new Date(dataPoints[dataPoints.length-1].matchDate);
      const projDate = new Date(last);
      projDate.setMonth(projDate.getMonth()+1);
      labels.push(projDate.toLocaleDateString('es-ES', {day:'numeric', month:'short'}) + ' (proj.)');
    }

    const datasets = Object.keys(SHOT_COLORS).map(key => {
      const vals = dataPoints.map(d => d[key]||0);

      // Simple linear projection
      let projVal = null;
      if (vals.length >= 2) {
        const last2 = vals.slice(-2);
        const trend = last2[1] - last2[0];
        projVal = Math.min(SCALE_MAX, Math.max(0, Math.round((last2[1] + trend) * 10) / 10));
      }

      const data = [...vals];
      if (projVal !== null) data.push(null);

      const projData = new Array(vals.length).fill(null);
      if (projVal !== null && vals.length > 0) {
        projData[vals.length-1] = vals[vals.length-1];
        projData.push(projVal);
      }

      return [
        {
          label: SHOT_LABELS[key],
          data,
          borderColor: SHOT_COLORS[key],
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: SHOT_COLORS[key],
          tension: 0.3,
        },
        {
          label: SHOT_LABELS[key] + ' (proj.)',
          data: projData,
          borderColor: SHOT_COLORS[key],
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [5,5],
          pointRadius: 3,
          pointStyle: 'triangle',
          pointBackgroundColor: SHOT_COLORS[key],
          tension: 0.3,
          legendHidden: true,
        }
      ];
    }).flat();

    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new window.Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: {
            min: 0, max: SCALE_MAX,
            ticks: { stepSize: 1, font: { size: 10 } },
            grid: { color: 'var(--bone-3)' }
          },
          x: {
            ticks: { font: { size: 9 }, maxRotation: 45 },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: item => !item.dataset.label.includes('(proj.)') || item.dataIndex === labels.length-1
          }
        }
      }
    });

    } // end buildChart

    return () => { if(chartInstance.current) chartInstance.current.destroy(); };
  }, [evolution]);

  if (loading) return <div style={{textAlign:'center',padding:'20px',color:'var(--bp-text-3)',fontSize:12}}>Cargando evolución...</div>;
  if (!evolution.length) return <div style={{textAlign:'center',padding:'20px',color:'var(--bp-text-3)',fontSize:12}}>Sin datos de evolución aún</div>;

  const SHOT_COLORS = {
    smash:'var(--crimson)', volea:'var(--amber)', globo:'var(--court)', bandeja:'var(--court)',
    bajadaPared:'#8b5cf6', resto:'#ec4899', saque:'#14b8a6', ambiente:'var(--ink-soft)'
  };
  const SHOT_LABELS = {
    smash:'Smash', volea:'Volea', globo:'Globo', bandeja:'Bandeja',
    bajadaPared:'B.Pared', resto:'Resto', saque:'Saque', ambiente:'Ambiente'
  };

  return (
    <div>
      {/* Legend */}
      <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:12}}>
        {Object.entries(SHOT_COLORS).map(([key,color])=>(
          <span key={key} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,color:'var(--bp-text)'}}>
            <span style={{width:12,height:3,background:color,display:'inline-block',borderRadius:2}}/>
            {SHOT_LABELS[key]}
          </span>
        ))}
        <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,color:'var(--bp-text-3)'}}>
          <span style={{width:12,height:0,borderTop:'2px dashed var(--ink-soft)',display:'inline-block'}}/>
          Proyección
        </span>
      </div>
      {/* Chart */}
      <div style={{position:'relative',height:240}}>
        <canvas ref={chartRef} role="img" aria-label="Evolución de golpes por partido"/>
      </div>
    </div>
  );
}

const RATE_PS = 6;
const REC_PS  = 8;

export default function Valorations() {
  const navigate = useNavigate();
  const cardRef  = useRef(null);

  const [myPlayer,    setMyPlayer]    = useState(null);
  const [myStats,     setMyStats]     = useState(null);
  const [myMatches,   setMyMatches]   = useState([]);
  const [pending,     setPending]     = useState([]);
  const [received,    setReceived]    = useState([]);
  const [topPlayers,  setTopPlayers]  = useState([]);
  const [showForm,    setShowForm]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [downloading, setDownloading] = useState(false);

  // tabs: 'rate' | 'received' | 'stats'
  const [tab, setTab] = useState('rate');

  // Valorar tab
  const [rateFilter, setRateFilter] = useState('all'); // 'all' | 'pending' | 'done' | 'expired'
  const [rateSort,   setRateSort]   = useState('newest');
  const [ratePage,   setRatePage]   = useState(1);

  // Recibidas tab
  const [recSort, setRecSort] = useState('newest');
  const [recPage, setRecPage] = useState(1);

  useEffect(() => {
    async function load() {
      try {
        const meRes = await authService.me();
        const me    = meRes.data;
        setMyPlayer(me.player);
        const [sRes, mRes, pRes, recRes, plRes] = await Promise.all([
          valorationService.getByPlayer(me.player.id),
          tournamentInstanceService.getMyMatches(),
          valorationService.getPending(),
          valorationService.getReceived(),
          playerService.getAll(),
        ]);
        setMyStats(sRes.data);
        setMyMatches(mRes.data || []);
        setPending(pRes.data || []);
        setReceived(recRes.data || []);
        const others = (plRes.data || []).filter(p => p.id !== me.player.id);
        if (others.length > 0) {
          const ps = await Promise.all(
            others.slice(0, 6).map(async p => ({ player: p, stats: (await valorationService.getByPlayer(p.id)).data }))
          );
          setTopPlayers(ps.filter(x => x.stats?.total > 0).sort((a, b) => (b.stats.total || 0) - (a.stats.total || 0)).slice(0, 3));
        }
      } catch(e) { console.error(e); } finally { setLoading(false); }
    }
    load();
  }, []);

  const handleSubmit = async (data) => {
    await valorationService.create(data);
    const [pRes, sRes] = await Promise.all([
      valorationService.getPending(),
      valorationService.getByPlayer(myPlayer.id),
    ]);
    setPending(pRes.data || []);
    setMyStats(sRes.data);
    if (showForm) {
      const refreshed = (pRes.data || []).find(m => m.id === showForm.id);
      setShowForm(refreshed?.playersToRate?.some(p => !p.alreadyRated) ? refreshed : null);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, { scale: 3, backgroundColor: null, useCORS: true, logging: false });
      const link = document.createElement('a');
      link.download = `cromo-${myPlayer?.name?.replace(/ /g, '-').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch(e) { console.error(e); } finally { setDownloading(false); }
  };

  const handleShare = async () => {
    if (!cardRef.current) return;
    const profileUrl = `https://bonapinta.com/players/${myPlayer?.id}`;
    const shareText  = `${myPlayer?.name} en Bonapinta Pádel — Nivel ${myPlayer?.level}`;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: null, useCORS: true, logging: false });
      canvas.toBlob(async (blob) => {
        setDownloading(false);
        if (!blob) { navigator.share?.({ title: shareText, url: profileUrl }); return; }
        const file = new File([blob], `cromo-${myPlayer?.name?.replace(/ /g, '-').toLowerCase()}.png`, { type: 'image/png' });
        // Share with image file if supported
        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: shareText, text: shareText, url: profileUrl });
            return;
          } catch(e) { if (e.name === 'AbortError') return; }
        }
        // Fallback: share URL only
        if (navigator.share) {
          navigator.share({ title: shareText, text: shareText, url: profileUrl });
        } else {
          navigator.clipboard?.writeText(profileUrl);
          alert('Link copiado al portapapeles');
        }
      }, 'image/png');
    } catch(e) {
      setDownloading(false);
      if (navigator.share) { navigator.share({ title: shareText, url: profileUrl }); }
      else { navigator.clipboard?.writeText(profileUrl); alert('Link copiado al portapapeles'); }
    }
  };

  // ── Valorar: filtrado + orden + paginación ──
  const filteredPending = useMemo(() => {
    let arr = [...pending];
    if (rateFilter === 'pending') arr = arr.filter(m => !m.allRated && !m.expired);
    else if (rateFilter === 'done')    arr = arr.filter(m => m.allRated);
    else if (rateFilter === 'expired') arr = arr.filter(m => m.expired && !m.allRated);
    if (rateSort === 'oldest') arr = arr.reverse();
    return arr;
  }, [pending, rateFilter, rateSort]);

  const rateTotalPages = Math.ceil(filteredPending.length / RATE_PS) || 1;
  const ratePaged      = filteredPending.slice((ratePage - 1) * RATE_PS, ratePage * RATE_PS);

  // ── Recibidas: orden + paginación ──
  const sortedReceived = useMemo(() => {
    let arr = [...received];
    if (recSort === 'oldest') arr = arr.reverse();
    else if (recSort === 'best') arr = arr.sort((a, b) => (overall(b) || 0) - (overall(a) || 0));
    return arr;
  }, [received, recSort]);

  const recTotalPages = Math.ceil(sortedReceived.length / REC_PS) || 1;
  const recPaged      = sortedReceived.slice((recPage - 1) * REC_PS, recPage * REC_PS);

  const pendingCount = pending.filter(m => !m.expired && !m.allRated).length;

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0', color: 'var(--bp-text-3)' }}>Cargando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Header ── */}
      <div style={{ background: 'var(--paper)', borderRadius: 20, padding: 16, border: '1px solid var(--line)' }}>
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Valoraciones</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginTop: 4 }}>Rendimiento</div>
        <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--amber)' }}>{pendingCount}</div>
            <div style={{ fontSize: 11, color: 'var(--bp-text-2)' }}>por valorar</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--court)' }}>{myStats?.total || 0}</div>
            <div style={{ fontSize: 11, color: 'var(--bp-text-2)' }}>recibidas</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ink-2)' }}>{received.length}</div>
            <div style={{ fontSize: 11, color: 'var(--bp-text-2)' }}>de compañeros</div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--bone-3)', borderRadius: 12, padding: 4 }}>
        {[
          ['rate',     `Valorar${pendingCount > 0 ? ` (${pendingCount})` : ''}`],
          ['received', `Recibidas${received.length > 0 ? ` (${received.length})` : ''}`],
          ['stats',    'Mis stats'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600,
            background: tab === id ? 'white' : 'transparent',
            color:      tab === id ? 'var(--ink-2)' : 'var(--ink-soft)',
          }}>{label}</button>
        ))}
      </div>

      {/* ══════════ TAB: VALORAR ══════════ */}
      {tab === 'rate' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Filtros + orden */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[
                ['all',     'Todos'],
                ['pending', `Pendientes${pendingCount > 0 ? ` (${pendingCount})` : ''}`],
                ['done',    'Valorados'],
                ['expired', 'Expirados'],
              ].map(([id, label]) => (
                <button key={id} onClick={() => { setRateFilter(id); setRatePage(1); }} style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', fontWeight: 600,
                  border:      `1px solid ${rateFilter === id ? 'var(--court)' : 'var(--line)'}`,
                  background:  rateFilter === id ? 'var(--court-soft)' : 'transparent',
                  color:       rateFilter === id ? 'var(--court-deep)' : 'var(--ink-soft)',
                }}>{label}</button>
              ))}
            </div>
            <select value={rateSort} onChange={e => { setRateSort(e.target.value); setRatePage(1); }} style={{
              fontSize: 11, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--line)',
              background: 'var(--paper)', color: 'var(--ink-2)', cursor: 'pointer',
            }}>
              <option value="newest">Más reciente</option>
              <option value="oldest">Más antiguo</option>
            </select>
          </div>

          {filteredPending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--bp-text-3)', fontSize: 13 }}>
              {rateFilter === 'all' ? 'No hay partidos completados' : 'Sin resultados para este filtro'}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ratePaged.map(match => {
                  const title    = match.tournamentName || 'Torneo';
                  const subtitle = `Fecha ${match.round || '—'}`;
                  const canRate = !match.expired && !match.allRated;
                  return (
                    <div key={match.id} style={{
                      background: 'var(--bp-surface)', borderRadius: 14, padding: '12px 14px',
                      border: `1px solid ${canRate ? 'var(--court-soft)' : 'var(--bone-3)'}`,
                      opacity: match.expired && !match.allRated ? 0.6 : 1,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--bp-text)' }}>{title}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{subtitle}</div>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          {canRate              && <span style={{ fontSize: 10, background: 'var(--amber-soft)', color: 'var(--amber)',    border: '1px solid var(--amber-soft)', borderRadius: 6, padding: '2px 7px', fontWeight: 700 }}>⏳ {timeLeftLabel(match)}</span>}
                          {match.allRated       && <span style={{ fontSize: 10, background: 'var(--ok-soft)',    color: 'var(--ok)',       border: '1px solid var(--ok-soft)',    borderRadius: 6, padding: '2px 7px', fontWeight: 700 }}>✅ Valorado</span>}
                          {match.expired && !match.allRated && <span style={{ fontSize: 10, background: 'var(--bone-3)', color: 'var(--bp-text-3)', border: '1px solid var(--bp-border)', borderRadius: 6, padding: '2px 7px' }}>Expirado</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                        {(match.playersToRate || []).map(p => (
                          <span key={p.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, borderRadius: 20, padding: '2px 9px 2px 3px',
                            background: p.alreadyRated ? 'var(--ok-soft)'  : 'var(--bone-3)',
                            color:      p.alreadyRated ? 'var(--ok)'       : 'var(--ink-mid)',
                            border:     `1px solid ${p.alreadyRated ? 'var(--ok-soft)' : 'var(--line)'}`,
                          }}>
                            <PlayerAvatar player={p} size={20} />
                            {p.alreadyRated ? '✓ ' : ''}{p.name}
                            {p.relation === 'partner' && <em style={{ fontStyle: 'normal', fontSize: 9, fontWeight: 700, opacity: 0.8 }}>· pareja</em>}
                          </span>
                        ))}
                      </div>
                      {canRate && (
                        <button onClick={() => setShowForm(match)} style={{
                          fontSize: 12, background: 'var(--court)', border: 'none',
                          color: 'var(--ink)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 600,
                        }}>Valorar</button>
                      )}
                    </div>
                  );
                })}
              </div>
              <Paginator page={ratePage} total={rateTotalPages} onChange={p => setRatePage(p)} />
            </>
          )}
        </div>
      )}

      {/* ══════════ TAB: RECIBIDAS ══════════ */}
      {tab === 'received' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <select value={recSort} onChange={e => { setRecSort(e.target.value); setRecPage(1); }} style={{
              fontSize: 11, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--line)',
              background: 'var(--paper)', color: 'var(--ink-2)', cursor: 'pointer',
            }}>
              <option value="newest">Más reciente</option>
              <option value="oldest">Más antiguo</option>
              <option value="best">Mejor OVR</option>
            </select>
          </div>

          {received.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--bp-text-3)', fontSize: 13 }}>
              Sin valoraciones recibidas aún
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recPaged.map(val => <ReceivedCard key={val.id} val={val} />)}
              </div>
              <Paginator page={recPage} total={recTotalPages} onChange={p => setRecPage(p)} />
            </>
          )}
        </div>
      )}

      {/* ══════════ TAB: MIS STATS ══════════ */}
      {tab === 'stats' && myPlayer && (
        <>
          <div className="stats-grid">
            <div className="stats-left">
              <div style={{ flex: 1 }}>
                <PlayerCromo cardRef={cardRef} player={myPlayer} stats={myStats} matches={myMatches} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={handleDownload} disabled={downloading} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bone-2)', color: 'var(--ink)', fontWeight: 700, fontSize: 11, cursor: 'pointer', opacity: downloading ? 0.7 : 1 }}>
                  {downloading ? '...' : '⬇️ Descargar PNG'}
                </button>
                <button onClick={handleShare} disabled={downloading} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 11, cursor: 'pointer', opacity: downloading ? 0.7 : 1 }}>
                  📤 Compartir
                </button>
              </div>
            </div>

            <div className="stats-right">
              {!myStats || myStats.total < 3 ? (
                <div style={{ background: 'var(--amber-soft)', border: '1px solid var(--amber-soft)', borderRadius: 12, padding: 14, fontSize: 13, color: 'var(--amber)', textAlign: 'center' }}>
                  Necesitas 3+ valoraciones.<br />Tienes {myStats?.total || 0}.
                </div>
              ) : (
                <div style={{ background: 'var(--bp-surface)', borderRadius: 14, border: '1px solid var(--bp-border-2)', padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--bp-text)' }}>Radar de golpes</div>
                    <div style={{ fontSize: 11, color: 'var(--bp-text-3)' }}>{myStats.total} valoraciones</div>
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'stretch' }}>
                    <div style={{ flex: '1 1 45%', minWidth: 140, aspectRatio: '1/1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <RadarSVG data={myStats} size={200} />
                    </div>
                    <div style={{ flex: '1 1 45%', minWidth: 140, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 5 }}>
                      {SHOTS.map(s => (
                        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: 'var(--bp-text)', width: 70, flexShrink: 0 }}>{s.label}</span>
                          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--bone-3)', overflow: 'hidden' }}>
                            <div style={{ width: `${scaleRatio(myStats[s.key]) * 100}%`, height: '100%', background: '#c9a227', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#c9a227', width: 26, textAlign: 'right' }}>{fmtScore(myStats[s.key] || 0)}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--bone-3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: 'var(--bp-text-2)', fontWeight: 600 }}>Ambiente Padelero</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: shotColor(myStats.ambiente) }}>{fmtScore(myStats.ambiente)}/{SCALE_MAX}</span>
                        </div>
                        <div style={{ height: 7, borderRadius: 4, background: 'linear-gradient(to right,var(--crimson),var(--amber),var(--court))', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: -3, left: `calc(${scaleRatio(myStats.ambiente) * 100}% - 7px)`, width: 13, height: 13, borderRadius: '50%', background: shotColor(myStats.ambiente), border: '2px solid white' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ background: 'var(--bp-surface)', borderRadius: 14, border: '1px solid var(--bp-border-2)', padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--bp-text)', marginBottom: 12 }}>Evolución de golpes</div>
                <div style={{ padding: '4px 0' }}>
                  <EvolutionChart playerId={myPlayer.id} />
                </div>
              </div>
            </div>
          </div>

          {topPlayers.length > 0 && (
            <div style={{ background: 'var(--bp-surface)', borderRadius: 16, border: '1px solid var(--bp-border-2)', padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--bp-text)', marginBottom: 10 }}>Top jugadores de la liga</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {topPlayers.map((ps, i) => (
                  <MiniCromo key={ps.player.id} player={ps.player} stats={ps.stats} rank={i} onClick={() => navigate(`/players/${ps.player.id}`)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showForm && (
        <ValorationForm match={showForm} myPlayerId={myPlayer?.id} onSubmit={handleSubmit} onClose={() => setShowForm(null)} />
      )}
    </div>
  );
}
