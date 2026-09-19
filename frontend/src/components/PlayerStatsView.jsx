import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { valorationService, playerService } from '../services/api';
import { computeRecord, didWin, setsForMe } from '../utils/matchRecord';
import { SCALE_MAX, GREAT_AMBIENTE, overall, shotColor, scaleRatio, fmtScore } from '../utils/valoration';

import { useAuth } from '../context/AuthContext';


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

  const gridColor = dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0';
  const uid = dark ? 'radarGradDark' : 'radarGradLight';
  const clipId = dark ? 'radarClipDark' : 'radarClipLight';

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{display:'block'}}>
      <defs>
        <clipPath id={clipId}>
          <polygon points={poly}/>
        </clipPath>
        <radialGradient id={uid} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.5"/>
          <stop offset="45%" stopColor="#f59e0b" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.45"/>
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
        const col = shotColor(v, { bad:'#ef4444', warn:'#f59e0b', ok:'#84cc16', good:'#22c55e' });
        return <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={col} stroke="white" strokeWidth="1.5"/>;
      })}

      {SHOTS.map((s,i) => {
        const a = (i * 2 * Math.PI / n) - Math.PI/2;
        const lr = r + 26;
        const lx = cx+lr*Math.cos(a), ly = cy+lr*Math.sin(a);
        const v = data[s.key]||0;
        return (
          <g key={i}>
            <text x={lx} y={ly-4} textAnchor="middle" fontSize="8" fill={dark?'#7a6020':'#64748b'} fontFamily="system-ui" fontWeight="500">{s.label}</text>
            <text x={lx} y={ly+6} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink-2)" fontFamily="system-ui">{v}</text>
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

const getOverall = (stats) => overall(stats) ?? '--';

function PlayerCromo({ player, stats, matches, cardRef }) {
  const { total, wins, losses, winRate, setsWon } = computeRecord(matches);
  const initials = player.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
  const firstName = player.name.split(' ')[0].toUpperCase();
  const lastName = player.name.split(' ').slice(1).join(' ').toUpperCase();
  const ovr = getOverall(stats);
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
      fontFamily:'system-ui,sans-serif', border:'2px solid #c9a227', position:'relative'
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
          {[[total,'PJ','white'],[wins,'PG','#34d399'],[losses,'PP','#f87171'],[setsWon,'SETS','#f59e0b']].map(([val,label,color])=>(
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
              <div style={{width:8,height:8,background:'#22c55e',borderRadius:2}}/>
              <span style={{fontSize:9,fontWeight:700,color:'#22c55e'}}>TOP AMB.</span>
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
              <div style={{width:8,height:8,background:'#94a3b8',borderRadius:'50%'}}/>
              <span style={{fontSize:9,fontWeight:700,color:'#94a3b8'}}>10+ PJ</span>
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
  const ovr = getOverall(stats);
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

function ValorationForm({ match, myPlayerId, onSubmit, onClose }) {
  const SHOT_EMOJIS = {smash:'💥',volea:'🎯',globo:'🌙',bandeja:'🏓',bajadaPared:'🧱',resto:'↩️',saque:'🎾'};
  const playersToRate = (match.playersToRate||[]).filter(p=>!p.alreadyRated);
  const [toPlayerId, setToPlayerId] = useState(playersToRate[0]?.id||'');
  const [scores, setScores] = useState({smash:5,volea:5,globo:5,bandeja:5,bajadaPared:5,resto:5,saque:5,ambiente:5});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try { await onSubmit({ matchId:match.id, toPlayerId, ...scores }); onClose(); }
    catch(e) { setError(e.response?.data?.error||'Error'); setLoading(false); }
  };

  if (!playersToRate.length) return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'white',borderRadius:16,padding:24,textAlign:'center'}}>
        <div style={{fontSize:40,marginBottom:12}}>✅</div>
        <div style={{fontWeight:700,marginBottom:12}}>Ya valoraste a todos</div>
        <button onClick={onClose} style={{background:'var(--court)',border:'none',borderRadius:10,padding:'10px 24px',color:'var(--ink)',fontWeight:700,cursor:'pointer'}}>Cerrar</button>
      </div>
    </div>
  );

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div style={{background:'white',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:520,padding:20,maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>⭐ Valorar jugador</div>
        <div style={{fontSize:12,color:'#94a3b8',marginBottom:14}}>⏳ Quedan {match.hoursLeft}h</div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,color:'#64748b',display:'block',marginBottom:6}}>¿A quién valoras?</label>
          <div style={{display:'flex',gap:8}}>
            {playersToRate.map(p=>(
              <button key={p.id} onClick={()=>setToPlayerId(p.id)} style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${toPlayerId===p.id?'var(--court)':'#e2e8f0'}`,background:toPlayerId===p.id?'#f0f9ff':'white',fontSize:13,fontWeight:600,color:toPlayerId===p.id?'var(--court)':'#374151',cursor:'pointer'}}>
                {p.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:12,color:'#64748b',marginBottom:8,fontWeight:600}}>Golpes (0-10)</div>
          {SHOTS.map(s=>(
            <div key={s.key} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <span style={{fontSize:14,width:20}}>{SHOT_EMOJIS[s.key]}</span>
              <span style={{fontSize:11,color:'#374151',width:90,flexShrink:0}}>{s.label}</span>
              <input type="range" min={0} max={10} step={1} value={scores[s.key]} onChange={e=>setScores(prev=>({...prev,[s.key]:Number(e.target.value)}))} style={{flex:1}}/>
              <span style={{fontSize:13,fontWeight:700,color:'var(--court-deep)',width:20,textAlign:'right'}}>{scores[s.key]}</span>
            </div>
          ))}
        </div>
        <div style={{marginBottom:18}}>
          <div style={{fontSize:12,color:'#64748b',marginBottom:6,fontWeight:600}}>Ambiente</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:14}}>😤</span>
            <input type="range" min={0} max={10} step={1} value={scores.ambiente} onChange={e=>setScores(prev=>({...prev,ambiente:Number(e.target.value)}))} style={{flex:1}}/>
            <span style={{fontSize:14}}>😄</span>
            <span style={{fontSize:13,fontWeight:700,color:'var(--court-deep)',width:20}}>{scores.ambiente}</span>
          </div>
        </div>
        {error && <div style={{background:'#fef2f2',color:'#dc2626',borderRadius:8,padding:'8px 12px',fontSize:12,marginBottom:10}}>{error}</div>}
        <div style={{display:'flex',gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:'11px',borderRadius:10,border:'1px solid #e2e8f0',background:'white',fontSize:13,cursor:'pointer'}}>Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} style={{flex:2,padding:'11px',borderRadius:10,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:'pointer',opacity:loading?0.6:1}}>
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
      smash:       '#ef4444',
      volea:       '#f59e0b',
      globo:       '#22c55e',
      bandeja:     'var(--court)',
      bajadaPared: '#8b5cf6',
      resto:       '#ec4899',
      saque:       '#14b8a6',
      ambiente:    '#64748b',
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
            grid: { color: '#f1f5f9' }
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

  if (loading) return <div style={{textAlign:'center',padding:'20px',color:'#94a3b8',fontSize:12}}>Cargando evolución...</div>;
  if (!evolution.length) return <div style={{textAlign:'center',padding:'20px',color:'#94a3b8',fontSize:12}}>Sin datos de evolución aún</div>;

  const SHOT_COLORS = {
    smash:'#ef4444', volea:'#f59e0b', globo:'#22c55e', bandeja:'var(--court)',
    bajadaPared:'#8b5cf6', resto:'#ec4899', saque:'#14b8a6', ambiente:'#64748b'
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
          <span key={key} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,color:'#374151'}}>
            <span style={{width:12,height:3,background:color,display:'inline-block',borderRadius:2}}/>
            {SHOT_LABELS[key]}
          </span>
        ))}
        <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,color:'#94a3b8'}}>
          <span style={{width:12,height:0,borderTop:'2px dashed #94a3b8',display:'inline-block'}}/>
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

function MiniCromoCard({ player, stats, rank, onClick }) {
  return <MiniCromo player={player} stats={stats} rank={rank} onClick={onClick}/>;
}

export default function PlayerStatsView({ player, stats, matches, showDownload=false, onNavigatePlayer }) {
  const cardRef = useRef(null);
  const [topPlayers, setTopPlayers] = useState([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(()=>{
    playerService.getAll().then(plRes=>{
      const allPlayers = (plRes.data||[]).filter(p => p.id !== player.id);
      if (!allPlayers.length) return;
      Promise.all(allPlayers.slice(0,6).map(async p => {
        const r = await valorationService.getByPlayer(p.id);
        return { player:p, stats:r.data };
      })).then(ps => {
        setTopPlayers(ps.filter(x=>x.stats?.total>0).sort((a,b)=>(b.stats.total||0)-(a.stats.total||0)).slice(0,3));
      });
    }).catch(()=>{});
  },[player.id]);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, { scale:3, backgroundColor:null, useCORS:true, logging:false });
      const link = document.createElement('a');
      link.download = `cromo-${player?.name?.replace(/ /g,'-').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch(e){console.error(e);}
    finally{setDownloading(false);}
  };

  const handleShare = () => {
    const url = `https://bonapinta.com/players/${player?.id}`;
    const text = `Mira mi cromo en Bonapinta! 🏓\nSoy ${player?.name}, jugador nivel ${player?.level}.\nÚnete a la liga: ${url}`;
    if(navigator.share) {
      navigator.share({title:`${player?.name} — Bonapinta`,text,url});
    } else {
      navigator.clipboard?.writeText(text);
      alert('Link copiado!');
    }
  };

  return (
    <>
      <div className="stats-grid">
        {/* LEFT: Cromo */}
        <div className="stats-left">
          <div style={{flex:1}}>
            <PlayerCromo cardRef={cardRef} player={player} stats={stats} matches={matches}/>
          </div>
          <div style={{display:'flex',gap:6,marginTop:8}}>
            {showDownload && (
              <button onClick={handleDownload} disabled={downloading} style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'#c9a227',color:'#1a1200',fontWeight:700,fontSize:11,cursor:'pointer',opacity:downloading?0.7:1}}>
                {downloading?'...':'⬇️ PNG'}
              </button>
            )}
            <button onClick={handleShare} style={{flex:1,padding:'9px',borderRadius:8,border:'1px solid #c9a227',background:'transparent',color:'#c9a227',fontWeight:600,fontSize:11,cursor:'pointer'}}>
              📤 Compartir
            </button>
          </div>
        </div>

        {/* RIGHT: Radar + Evolución */}
        <div className="stats-right">
          {!stats || stats.total < 3 ? (
            <div style={{background:'#fef9c3',border:'1px solid #fde68a',borderRadius:12,padding:14,fontSize:13,color:'#92400e',textAlign:'center'}}>
              Necesitas 3+ valoraciones.<br/>Tienes {stats?.total||0}.
            </div>
          ) : (
            <div style={{background:'white',borderRadius:14,border:'1px solid #f1f5f9',padding:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
                <div style={{fontWeight:700,fontSize:13,color:'var(--ink-2)'}}>Radar de golpes</div>
                <div style={{fontSize:11,color:'#94a3b8'}}>{stats.total} valoraciones</div>
              </div>
              <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'stretch'}}>
                <div style={{flex:'1 1 45%',minWidth:140,aspectRatio:'1/1',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <RadarSVG data={stats} size={200}/>
                </div>
                <div style={{flex:'1 1 45%',minWidth:140,display:'flex',flexDirection:'column',justifyContent:'space-between',gap:5}}>
                  {SHOTS.map(s=>(
                    <div key={s.key} style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:10,color:'#374151',width:70,flexShrink:0}}>{s.label}</span>
                      <div style={{flex:1,height:5,borderRadius:3,background:'#f1f5f9',overflow:'hidden'}}>
                        <div style={{width:`${scaleRatio(stats[s.key])*100}%`,height:'100%',background:'#c9a227',borderRadius:3}}/>
                      </div>
                      <span style={{fontSize:11,fontWeight:700,color:'#c9a227',width:26,textAlign:'right'}}>{fmtScore(stats[s.key]||0)}</span>
                    </div>
                  ))}
                  <div style={{marginTop:6,paddingTop:6,borderTop:'1px solid #f1f5f9'}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:10,color:'#64748b',fontWeight:600}}>Ambiente Padelero</span>
                      <span style={{fontSize:11,fontWeight:700,color:shotColor(stats.ambiente, { bad:'#ef4444', warn:'#f59e0b', ok:'#84cc16', good:'#22c55e' })}}>{fmtScore(stats.ambiente)}/{SCALE_MAX}</span>
                    </div>
                    <div style={{height:7,borderRadius:4,background:'linear-gradient(to right,#ef4444,#f59e0b,#22c55e)',position:'relative'}}>
                      <div style={{position:'absolute',top:-3,left:`calc(${scaleRatio(stats.ambiente)*100}% - 7px)`,width:13,height:13,borderRadius:'50%',background:shotColor(stats.ambiente, { bad:'#ef4444', warn:'#f59e0b', ok:'#84cc16', good:'#22c55e' }),border:'2px solid white'}}/>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Evolution */}
          <div style={{background:'white',borderRadius:14,border:'1px solid #f1f5f9',padding:14,flex:1,display:'flex',flexDirection:'column'}}>
            <div style={{fontWeight:700,fontSize:13,color:'var(--ink-2)',marginBottom:12}}>Evolución de golpes</div>
            <div style={{flex:1}}>
              <EvolutionChart playerId={player.id}/>
            </div>
          </div>
        </div>
      </div>

      {/* Last 10 matches */}
      {matches.length > 0 && (
        <div style={{background:'white',borderRadius:16,border:'1px solid #f1f5f9',overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid #f1f5f9',fontWeight:700,fontSize:14,color:'var(--ink-2)'}}>
            Últimos partidos
          </div>
          {matches.slice(0,10).map((match)=>{
            const won = didWin(match);
            const mySets = setsForMe(match);
            const retired = match.result?.retired;
            return (
              <div key={match.id} style={{padding:'10px 16px',borderBottom:'1px solid #f8fafc',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:'var(--ink-2)'}}>
                    <span style={{color:'var(--court-deep)'}}>{(match.myTeam||[]).map(n=>n.split(' ')[0]).join(' & ')}</span>
                    <span style={{color:'#cbd5e1',margin:'0 5px'}}>vs</span>
                    <span>{(match.opponentTeam||[]).map(n=>n.split(' ')[0]).join(' & ')}</span>
                  </div>
                  {match.tournamentName && (
                    <div style={{fontSize:10,color:'var(--ink-soft)',marginTop:2}}>{match.tournamentName}{match.round ? ` · Fecha ${match.round}` : ''}</div>
                  )}
                  {mySets.length > 0 && (
                    <div style={{display:'flex',gap:4,marginTop:3}}>
                      {mySets.map((st,j)=>(
                        <span key={j} style={{fontSize:10,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:4,padding:'1px 6px',fontWeight:700,color:'#374151'}}>{st.my}-{st.rival}</span>
                      ))}
                    </div>
                  )}
                  {retired && (
                    <div style={{fontSize:10,color:'var(--ink-soft)',marginTop:3}}>Abandono{retired.reason ? ` — ${retired.reason}` : ''}</div>
                  )}
                </div>
                {won !== null && (
                  <span style={{fontSize:11,fontWeight:700,background:won?'#f0fdf4':'#fef2f2',color:won?'#15803d':'#dc2626',border:`1px solid ${won?'#bbf7d0':'#fecaca'}`,borderRadius:6,padding:'2px 8px',flexShrink:0}}>
                    {won?'Victoria':'Derrota'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Top players */}
      {topPlayers.length > 0 && (
        <div style={{background:'white',borderRadius:16,border:'1px solid #f1f5f9',padding:14}}>
          <div style={{fontWeight:700,fontSize:13,color:'var(--ink-2)',marginBottom:10}}>Top jugadores de la liga</div>
          <div style={{display:'flex',gap:8}}>
            {topPlayers.map((ps,i)=>(
              <MiniCromo key={ps.player.id} player={ps.player} stats={ps.stats} rank={i} onClick={()=>onNavigatePlayer?.(ps.player.id)}/>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
