import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tournamentInstanceService, availabilityService } from '../services/api';
import { TrophyIcon, XCircleIcon, MinusCircleIcon, StarIcon } from '@heroicons/react/24/outline';
import { Pill } from '../components/ui/Pill';
import { Cromo } from '../components/ui/Cromo';

// 7 days, matching the new backend's ValorationService (was 24h under
// the old Express valorations.routes.js).
const VALORATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const PAGE_SIZE = 8;

const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function calcWinner(sets, myIsTeam1) {
  if (!sets || !sets.length) return null;
  let myWins = 0, rivalWins = 0;
  sets.forEach(s => {
    const my    = parseInt(myIsTeam1 ? s.t1 : s.t2) || 0;
    const rival = parseInt(myIsTeam1 ? s.t2 : s.t1) || 0;
    if (my > rival) myWins++;
    else if (rival > my) rivalWins++;
  });
  if (myWins === rivalWins) return 'draw';
  return myWins > rivalWins ? 'win' : 'loss';
}

function WinnerBadge({ outcome }) {
  const base = { fontFamily:'var(--body)', fontSize:12, fontWeight:700, borderRadius:8, padding:'4px 12px', display:'inline-flex', alignItems:'center', gap:4 };
  if (outcome === 'win')  return <span style={{...base,color:'var(--ok)',background:'var(--ok-soft)',border:'1px solid oklch(80% 0.12 148)'}}><TrophyIcon style={{width:13,height:13}} aria-hidden="true" /> Ganaste</span>;
  if (outcome === 'loss') return <span style={{...base,color:'var(--crimson)',background:'var(--crimson-soft)',border:'1px solid oklch(80% 0.1 18)'}}><XCircleIcon style={{width:13,height:13}} aria-hidden="true" /> Perdiste</span>;
  return <span style={{...base,color:'var(--ink-soft)',background:'var(--bp-surface-3)',border:'1px solid var(--line)'}}><MinusCircleIcon style={{width:13,height:13}} aria-hidden="true" /> Empate</span>;
}

function Paginator({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <div style={{display:'flex',gap:4,alignItems:'center',justifyContent:'center',marginTop:4}}>
      <button onClick={() => onPage(page - 1)} disabled={page === 1}
        style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:page===1?'var(--line)':'var(--ink-mid)',cursor:page===1?'default':'pointer',fontSize:12}}>‹</button>
      {pages.map(p => (
        <button key={p} onClick={() => onPage(p)}
          style={{width:30,height:30,borderRadius:8,border:`1px solid ${p===page?'var(--court)':'var(--line)'}`,
            background:p===page?'var(--court)':'var(--paper)',color:p===page?'var(--ink)':'var(--ink-mid)',cursor:'pointer',fontSize:12,fontWeight:p===page?700:400}}>
          {p}
        </button>
      ))}
      <button onClick={() => onPage(page + 1)} disabled={page === totalPages}
        style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:page===totalPages?'var(--line)':'var(--ink-mid)',cursor:page===totalPages?'default':'pointer',fontSize:12}}>›</button>
    </div>
  );
}

function fmtMatchDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const day = DAYS[d.getDay()];
  const month = MONTHS[d.getMonth()];
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const hasTime = h !== '00' || m !== '00';
  return `${day} ${d.getDate()} ${month}${hasTime ? ` · ${h}:${m}` : ''}`;
}

const RESULT_MODE_NOTE = {
  jugador:  null, // los jugadores pueden proponer → no mostramos nota
  arbitro:  'El árbitro registrará el resultado',
  creador:  'El admin registrará el resultado',
};

// ── Availability helpers ──────────────────────────────────────────────────

const AVAIL_DAYS_PER_PAGE = 5;

function computeCommon(playerIds, availMap) {
  if (!playerIds || !playerIds.length || !availMap) return {};
  const allKeys = [...new Set(playerIds.flatMap(id => Object.keys(availMap[id] || {})))];
  const result = {};
  for (const key of allKeys) {
    if (playerIds.every(id => (availMap[id] || {})[key])) result[key] = true;
  }
  return result;
}

function AvailDropdown({ label, playerIds, availMap, accentColor }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  const common = computeCommon(playerIds, availMap);
  const byDate = {};
  Object.keys(common).forEach(k => {
    const [dk, slot] = k.split('_');
    if (!byDate[dk]) byDate[dk] = [];
    byDate[dk].push(slot);
  });

  const sortedDays = Object.entries(byDate).sort();
  const totalDays  = sortedDays.length;
  const totalPages = Math.ceil(totalDays / AVAIL_DAYS_PER_PAGE);
  const pagedDays  = sortedDays.slice(page * AVAIL_DAYS_PER_PAGE, (page + 1) * AVAIL_DAYS_PER_PAGE);
  const totalSlots = Object.keys(common).length;
  const color = accentColor || 'var(--court)';

  const toggle = () => { setOpen(v => !v); setPage(0); };

  return (
    <div style={{marginTop:6}}>
      <button onClick={toggle}
        style={{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',
          padding:'7px 10px',borderRadius:8,border:`1px solid ${color}30`,
          background:`${color}08`,cursor:'pointer',textAlign:'left'}}>
        <span style={{fontSize:11,fontWeight:600,color:'var(--bp-text)'}}>{label}</span>
        <span style={{fontSize:10,color:totalSlots>0?color:'var(--bp-text-3)',fontWeight:600}}>
          {totalSlots>0 ? `${totalDays} día${totalDays!==1?'s':''} · ${totalSlots} slots` : 'Sin coincidencias'} {open?'▲':'▼'}
        </span>
      </button>
      {open && (
        <div style={{background:'var(--bp-surface)',border:`1px solid ${color}20`,borderTop:'none',
          borderRadius:'0 0 8px 8px',padding:'8px 10px'}}>
          {totalSlots === 0 ? (
            <div style={{fontSize:11,color:'var(--bp-text-3)',textAlign:'center',padding:'4px 0'}}>
              Sin horas en común aún
            </div>
          ) : (
            <>
              {pagedDays.map(([dk, slots]) => {
                const date = new Date(dk + 'T12:00:00');
                return (
                  <div key={dk} style={{marginBottom:6}}>
                    <div style={{fontSize:10,fontWeight:700,color:'var(--bp-text)',marginBottom:3}}>
                      {DAYS[date.getDay()]} {date.getDate()} {MONTHS[date.getMonth()]}
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                      {slots.sort().map(s => (
                        <span key={s} style={{fontSize:10,background:`${color}12`,color,
                          border:`1px solid ${color}30`,borderRadius:4,padding:'2px 6px',fontWeight:600}}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {totalPages > 1 && (
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                  marginTop:8,paddingTop:6,borderTop:`1px solid ${color}15`}}>
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                    style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:`1px solid ${color}30`,
                      background:page===0?'var(--bone-2)':'white',color:page===0?'var(--line)':color,
                      cursor:page===0?'default':'pointer',fontWeight:600}}>
                    ‹ Anterior
                  </button>
                  <span style={{fontSize:10,color:'var(--bp-text-3)'}}>
                    {page*AVAIL_DAYS_PER_PAGE+1}–{Math.min((page+1)*AVAIL_DAYS_PER_PAGE,totalDays)} de {totalDays} días
                  </span>
                  <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages - 1}
                    style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:`1px solid ${color}30`,
                      background:page===totalPages-1?'var(--bone-2)':'white',color:page===totalPages-1?'var(--line)':color,
                      cursor:page===totalPages-1?'default':'pointer',fontWeight:600}}>
                    Siguiente ›
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Referee direct result form ────────────────────────────────────────────

function RefereeResultForm({ match, onSubmit, onCancel }) {
  const [sets, setSets] = useState([{t1:'',t2:''},{t1:'',t2:''}]);
  const [saving, setSaving] = useState(false);

  const updateSet = (i, field, val) => {
    if (i === 'add') { setSets(p => [...p, {t1:'',t2:''}]); return; }
    setSets(p => p.map((s, idx) => idx === i ? {...s, [field]: val} : s));
  };

  const validSets = sets.filter(s => s.t1 !== '' && s.t2 !== '');
  const t1Wins = validSets.filter(s => parseInt(s.t1) > parseInt(s.t2)).length;
  const t2Wins = validSets.filter(s => parseInt(s.t2) > parseInt(s.t1)).length;

  const team1 = (match.myTeam||[]).map(n => n.split(' ')[0]).join(' & ') || 'Equipo 1';
  const team2 = (match.opponentTeam||[]).map(n => n.split(' ')[0]).join(' & ') || 'Equipo 2';

  const handleSubmit = async () => {
    if (!validSets.length) return;
    setSaving(true);
    try { await onSubmit({ sets: validSets }); }
    finally { setSaving(false); }
  };

  return (
    <div style={{padding:'0 14px 14px',borderTop:'1px solid var(--bp-border-2)'}}>
      <div style={{fontSize:13,fontWeight:700,color:'var(--bp-text)',margin:'12px 0 10px'}}>Registrar resultado como árbitro</div>
      <div style={{display:'flex',alignItems:'center',gap:8,background:'var(--bp-surface-2)',borderRadius:10,padding:'8px 12px',marginBottom:12}}>
        <span style={{flex:1,fontSize:12,fontWeight:700,color:'var(--court-deep)',textAlign:'center'}}>{team1}</span>
        <span style={{fontSize:13,color:'var(--bp-text-3)',fontWeight:700}}>vs</span>
        <span style={{flex:1,fontSize:12,fontWeight:700,color:'var(--bp-text)',textAlign:'center'}}>{team2}</span>
      </div>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:11,color:'var(--bp-text-2)',marginBottom:6,fontWeight:600}}>Sets:</div>
        {sets.map((set, i) => (
          <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
            <span style={{fontSize:11,color:'var(--bp-text-2)',width:40}}>Set {i+1}</span>
            <input type="number" min="0" max="7" value={set.t1} onChange={e => updateSet(i,'t1',e.target.value)}
              placeholder={team1.split(' ')[0]} style={{width:56,border:'2px solid var(--court)',borderRadius:8,padding:'8px',fontSize:15,textAlign:'center',outline:'none',fontWeight:700,color:'var(--court-deep)'}}/>
            <span style={{color:'var(--bp-text-3)',fontWeight:700}}>-</span>
            <input type="number" min="0" max="7" value={set.t2} onChange={e => updateSet(i,'t2',e.target.value)}
              placeholder={team2.split(' ')[0]} style={{width:56,border:'1px solid var(--bp-border)',borderRadius:8,padding:'8px',fontSize:15,textAlign:'center',outline:'none',fontWeight:700,color:'var(--bp-text)'}}/>
          </div>
        ))}
        <button type="button" onClick={() => updateSet('add')}
          style={{fontSize:11,color:'var(--court-deep)',background:'none',border:'none',cursor:'pointer',padding:0,marginTop:2}}>
          + Añadir set
        </button>
      </div>
      {validSets.length > 0 && (
        <div style={{background:'var(--bp-surface-2)',borderRadius:10,padding:'8px 12px',marginBottom:12,fontSize:12,color:'var(--bp-text)'}}>
          Parcial: <span style={{fontWeight:700,color:'var(--court-deep)'}}>{t1Wins}</span> – <span style={{fontWeight:700}}>{t2Wins}</span> sets
        </div>
      )}
      <div style={{display:'flex',gap:8}}>
        <button onClick={onCancel} style={{flex:1,background:'var(--bp-surface-3)',border:'none',borderRadius:10,padding:'10px',color:'var(--bp-text-2)',fontWeight:600,fontSize:13,cursor:'pointer'}}>Cancelar</button>
        <button onClick={handleSubmit} disabled={saving || !validSets.length}
          style={{flex:2,background:validSets.length?'var(--amber)':'var(--line)',border:'none',borderRadius:10,padding:'10px',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:validSets.length?'pointer':'default'}}>
          {saving ? 'Guardando…' : 'Confirmar resultado'}
        </button>
      </div>
    </div>
  );
}

// ── Tournament propose form ───────────────────────────────────────────────

function TournamentProposeForm({ match, myParticipantId, myNames, oppNames, onSubmit, onCancel }) {
  const [date,   setDate]   = useState('');
  const [time,   setTime]   = useState('');
  const [sets,   setSets]   = useState([{my:'',rival:''},{my:'',rival:''}]);

  const updateSet = (i, field, val) => {
    if (i === 'add') { setSets(prev => [...prev, {my:'',rival:''}]); return; }
    setSets(prev => prev.map((s, idx) => idx === i ? {...s, [field]:val} : s));
  };

  const validSets = sets.filter(s => s.my !== '' && s.rival !== '');
  const myIsTeam1 = match.isTeam1;
  const outcome = calcWinner(validSets.map(s => myIsTeam1 ? {t1:s.my,t2:s.rival} : {t1:s.rival,t2:s.my}), myIsTeam1);
  const myWins = validSets.filter(s => parseInt(s.my) > parseInt(s.rival)).length;
  const rivalWins = validSets.filter(s => parseInt(s.rival) > parseInt(s.my)).length;

  const handleSubmit = () => {
    if (!validSets.length) return;
    const normalizedSets = validSets.map(s => myIsTeam1 ? {t1:s.my, t2:s.rival} : {t1:s.rival, t2:s.my});
    onSubmit({ sets: normalizedSets, date, time, participantId: myParticipantId });
  };

  return (
    <div style={{padding:'0 14px 14px',borderTop:'1px solid var(--bp-border-2)'}}>
      <div style={{fontSize:13,fontWeight:700,color:'var(--bp-text)',margin:'12px 0 10px'}}>Registrar resultado</div>
      <div style={{display:'flex',alignItems:'center',gap:8,background:'var(--bp-surface-2)',borderRadius:10,padding:'8px 12px',marginBottom:12}}>
        <span style={{flex:1,fontSize:12,fontWeight:700,color:'var(--court-deep)',textAlign:'center'}}>{myNames}<br/><span style={{fontSize:10,fontWeight:400,color:'var(--bp-text-2)'}}>Mi equipo</span></span>
        <span style={{fontSize:13,color:'var(--bp-text-3)',fontWeight:700}}>vs</span>
        <span style={{flex:1,fontSize:12,fontWeight:700,color:'var(--bp-text)',textAlign:'center'}}>{oppNames}<br/><span style={{fontSize:10,fontWeight:400,color:'var(--bp-text-2)'}}>Rival</span></span>
      </div>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:11,color:'var(--bp-text-2)',marginBottom:6,fontWeight:600}}>Sets jugados:</div>
        {sets.map((set, i) => (
          <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
            <span style={{fontSize:11,color:'var(--bp-text-2)',width:40}}>Set {i+1}</span>
            <input type="number" min="0" max="7" value={set.my} onChange={e => updateSet(i,'my',e.target.value)}
              placeholder="Yo" style={{width:56,border:'2px solid var(--court)',borderRadius:8,padding:'8px',fontSize:15,textAlign:'center',outline:'none',fontWeight:700,color:'var(--court-deep)'}}/>
            <span style={{color:'var(--bp-text-3)',fontWeight:700}}>-</span>
            <input type="number" min="0" max="7" value={set.rival} onChange={e => updateSet(i,'rival',e.target.value)}
              placeholder="Rival" style={{width:56,border:'1px solid var(--bp-border)',borderRadius:8,padding:'8px',fontSize:15,textAlign:'center',outline:'none',fontWeight:700,color:'var(--bp-text)'}}/>
          </div>
        ))}
        <button type="button" onClick={() => updateSet('add')}
          style={{fontSize:11,color:'var(--court-deep)',background:'none',border:'none',cursor:'pointer',padding:0,marginTop:2}}>
          + Añadir set
        </button>
      </div>
      {validSets.length > 0 && (
        <div style={{background:'var(--bp-surface-2)',borderRadius:10,padding:'10px 12px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontSize:13,color:'var(--bp-text)'}}>Parcial: <span style={{fontWeight:700,color:'var(--court-deep)'}}>{myWins}</span> - <span style={{fontWeight:700}}>{rivalWins}</span> sets</div>
          {outcome && <WinnerBadge outcome={outcome} />}
        </div>
      )}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
        <div>
          <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:3}}>Fecha jugado</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{width:'100%',border:'1px solid var(--bp-border)',borderRadius:8,padding:'7px 10px',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:3}}>Hora</label>
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            style={{width:'100%',border:'1px solid var(--bp-border)',borderRadius:8,padding:'7px 10px',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
        </div>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={onCancel} style={{flex:1,background:'var(--bp-surface-3)',border:'none',borderRadius:10,padding:'10px',color:'var(--bp-text-2)',fontWeight:600,fontSize:13,cursor:'pointer'}}>Cancelar</button>
        <button onClick={handleSubmit} disabled={!validSets.length}
          style={{flex:2,background:validSets.length?'var(--court)':'var(--line)',border:'none',borderRadius:10,padding:'10px',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:validSets.length?'pointer':'default'}}>
          Enviar resultado
        </button>
      </div>
    </div>
  );
}

// ── Tournament match card ─────────────────────────────────────────────────

function TournamentMatchCard({ match, onPropose, onAccept, onReject, onRefereeResult, availMap }) {
  const navigate  = useNavigate();
  const [showForm, setShowForm] = useState(false);

  // Referee shortcut: render simpler card with direct result entry
  if (match.isReferee) {
    const team1 = (match.myTeam||[]).map(n=>n.split(' ')[0]).join(' & ') || '—';
    const team2 = (match.opponentTeam||[]).map(n=>n.split(' ')[0]).join(' & ') || '—';
    return (
      <div className="match-m" style={{borderLeft:'3px solid var(--amber)'}}>
        <div className="match-m-head">
          <span className="match-m-tour">
            {match.tournamentName}
            <span style={{fontWeight:400}}> · R{match.round}</span>
          </span>
          <span style={{fontSize:10,fontWeight:700,background:'var(--amber-soft)',color:'var(--amber)',borderRadius:6,padding:'2px 8px',flexShrink:0}}>
            🟡 Árbitro
          </span>
        </div>
        {(match.scheduledAt || match.court || match.clubName) && (
          <div style={{display:'flex',flexWrap:'wrap',gap:'6px 12px',padding:'4px 0 2px',borderBottom:'1px solid var(--bone-2)',marginBottom:4}}>
            {match.scheduledAt && <span style={{fontSize:11,color:'var(--ink-soft)'}}>📅 {fmtMatchDate(match.scheduledAt)}</span>}
            {match.court     && <span style={{fontSize:11,color:'var(--ink-soft)'}}>📍 {match.court.alias||match.court.name}</span>}
            {match.clubName  && <span style={{fontSize:11,color:'var(--ink-soft)'}}>🏢 {match.clubName}</span>}
          </div>
        )}
        <div className="match-m-row">
          <div className="match-m-team"><span style={{fontWeight:600,fontSize:12,color:'var(--court-deep)'}}>{team1}</span></div>
          <div className="match-m-vs"><span className="match-m-vs-lbl">vs</span></div>
          <div className="match-m-team"><span style={{fontWeight:600,fontSize:12}}>{team2}</span></div>
        </div>
        <div className="match-m-foot">
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="match-m-btn" style={{background:'var(--amber)',color:'var(--ink)'}}>
              Registrar resultado
            </button>
          )}
        </div>
        {showForm && (
          <RefereeResultForm
            match={match}
            onSubmit={async (data) => { await onRefereeResult(match.id, match.tournamentId, data); setShowForm(false); }}
            onCancel={() => setShowForm(false)}
          />
        )}
      </div>
    );
  }
  const sets      = match.result?.sets || [];
  const completed = match.status === 'completed';
  const outcome   = completed ? calcWinner(sets, match.isTeam1) : null;
  const myNames   = (match.myTeam||[]).map(n => n.split(' ')[0]).join(' & ') || 'Mi equipo';
  const oppNames  = (match.opponentTeam||[]).map(n => n.split(' ')[0]).join(' & ') || 'Rival';

  const completedAt = match.result?.completedAt ? new Date(match.result.completedAt) : null;
  const withinWindow = completedAt && (Date.now() - completedAt.getTime()) < VALORATION_WINDOW_MS;
  const valoredPlayerIds = match.valoredPlayerIds || [];
  const pendingOpponents = (match.opponentPlayerIds || []).filter(id => !valoredPlayerIds.includes(id));
  // A no-show/injury/abandono match (`played: false`) never offers
  // valorations, no matter how recently it was completed — see the
  // new backend's ValorationService.
  const canValorate = completed && match.played !== false && withinWindow && pendingOpponents.length > 0;

  const canPlayerSubmit = match.resultMode === 'jugador' && match.tournamentStatus === 'active';
  const myParticipantId = (match.myParticipantIds||[])[0];

  const resultStatus = match.result?.status;
  const iProposed    = canPlayerSubmit && resultStatus === 'pending' && (match.myParticipantIds||[]).includes(match.proposedByParticipant);
  const rivalProposed = canPlayerSubmit && resultStatus === 'pending' && match.proposedByParticipant && !(match.myParticipantIds||[]).includes(match.proposedByParticipant);
  const isRejected   = resultStatus === 'rejected';

  const expiresAt = match.expiresAt ? new Date(match.expiresAt) : null;
  const hoursLeft = expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 3600000)) : null;

  const myPlayerIds  = match.myPlayerIds || [];
  const allPlayerIds = [...myPlayerIds, ...(match.opponentPlayerIds || [])];
  const showAvail    = !completed && availMap && myPlayerIds.length >= 2;

  let pillVariant = 'neutral', pillLabel = 'Pendiente';
  if (completed)          { pillVariant = 'done';    pillLabel = 'Completado'; }
  else if (iProposed)     { pillVariant = 'propose'; pillLabel = 'Esperando'; }
  else if (rivalProposed) { pillVariant = 'confirm'; pillLabel = 'Confirmar'; }
  else if (isRejected)    { pillLabel = 'Rechazado'; }

  const cardCls = ['match-m', completed ? 'm-completed' : '', rivalProposed ? 'm-rival' : ''].filter(Boolean).join(' ');

  return (
    <div className={cardCls}>

      {/* ── Head: tournament label + status pill ── */}
      <div className="match-m-head">
        <span className="match-m-tour">
          {match.tournamentName}
          <span style={{fontWeight:400,letterSpacing:0}}> · R{match.round}</span>
        </span>
        <Pill variant={pillVariant}>{pillLabel}</Pill>
      </div>

      {/* ── Meta: date · court · club ── */}
      {(match.scheduledAt || match.court || match.clubName) && (
        <div style={{
          display:'flex', flexWrap:'wrap', gap:'6px 12px',
          padding:'4px 0 2px', borderBottom:'1px solid var(--bone-2)',
          marginBottom:4,
        }}>
          {match.scheduledAt && (
            <span style={{fontSize:11, color:'var(--ink-soft)', display:'flex', alignItems:'center', gap:3}}>
              <span aria-hidden="true">📅</span>
              {fmtMatchDate(match.scheduledAt)}
            </span>
          )}
          {match.court && (
            <span style={{fontSize:11, color:'var(--ink-soft)', display:'flex', alignItems:'center', gap:3}}>
              <span aria-hidden="true">📍</span>
              {match.court.alias || match.court.name}
            </span>
          )}
          {match.clubName && (
            <span style={{fontSize:11, color:'var(--ink-soft)', display:'flex', alignItems:'center', gap:3}}>
              <span aria-hidden="true">🏢</span>
              {match.clubName}
            </span>
          )}
        </div>
      )}

      {/* ── Matchup row ── */}
      <div className="match-m-row">
        {/* My team */}
        <div className="match-m-team">
          {(match.myTeam||[]).length > 0
            ? (match.myTeam||[]).map((name, i) => <Cromo key={i} name={name} size="xs" me />)
            : <Cromo name="Mi equipo" size="xs" me />}
        </div>

        {/* Center: vs + score */}
        <div className="match-m-vs">
          <span className="match-m-vs-lbl">vs</span>
          {completed && sets.length > 0 && (
            <div className="match-m-sets">
              {sets.map((s, i) => {
                const my    = match.isTeam1 ? s.t1 : s.t2;
                const rival = match.isTeam1 ? s.t2 : s.t1;
                const myWon = parseInt(my) > parseInt(rival);
                return (
                  <div key={i} className="match-m-set">
                    <span className="match-m-set-lbl">S{i+1}</span>
                    <span className="match-m-set-score">
                      <span style={{color: myWon ? 'var(--ok)' : 'var(--crimson)'}}>{my}</span>
                      <span style={{color:'var(--ink-soft)',margin:'0 2px'}}>-</span>
                      <span style={{color: !myWon ? 'var(--ok)' : 'var(--crimson)'}}>{rival}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {completed && outcome && <WinnerBadge outcome={outcome} />}
        </div>

        {/* Opponent team */}
        <div className="match-m-team">
          {(match.opponentTeam||[]).length > 0
            ? (match.opponentTeam||[]).map((name, i) => <Cromo key={i} name={name} size="xs" />)
            : <Cromo name="Rival" size="xs" />}
        </div>
      </div>

      {/* ── Footer actions ── */}
      <div className="match-m-foot">
        {iProposed && hoursLeft !== null && (
          <span className="match-m-timer" aria-live="polite">Auto en ~{hoursLeft}h</span>
        )}
        {!canPlayerSubmit && !completed && (() => {
          const mode = match.resultMode;
          if (mode === 'jugador') {
            // jugador pero torneo no activo aún
            return <span className="match-m-admin-note">Los jugadores propondrán el resultado al activarse</span>;
          }
          const note = RESULT_MODE_NOTE[mode] || 'El admin registrará el resultado';
          return <span className="match-m-admin-note">{note}</span>;
        })()}
        {canValorate && (
          <button onClick={() => navigate('/valorations')}
            className="match-m-btn match-m-btn-valorate" aria-label="Valorar rivales">
            <StarIcon style={{width:14,height:14}} aria-hidden="true" />
            Valorar
          </button>
        )}
        {canPlayerSubmit && !completed && !rivalProposed && (
          <button onClick={() => setShowForm(!showForm)}
            className="match-m-btn match-m-btn-propose">
            {showForm ? 'Cancelar' : isRejected ? '↺ Proponer de nuevo' : '+ Resultado'}
          </button>
        )}
      </div>

      {/* ── Confirm panel when rival proposed ── */}
      {rivalProposed && sets.length > 0 && (
        <div className="match-m-confirm" role="region" aria-label="Resultado propuesto por rival">
          <div className="match-m-confirm-title">{oppNames} propone este resultado:</div>
          <div className="match-m-confirm-sets">
            {sets.map((s, i) => {
              const my    = match.isTeam1 ? s.t1 : s.t2;
              const rival = match.isTeam1 ? s.t2 : s.t1;
              return (
                <div key={i} className="match-m-confirm-set">
                  <div className="match-m-confirm-set-lbl">Set {i+1}</div>
                  <div className="match-m-confirm-set-score">
                    <span style={{color:'var(--court-deep)'}}>{my}</span>
                    <span style={{color:'var(--ink-soft)',margin:'0 3px'}}>-</span>
                    <span style={{color:'var(--ink)'}}>{rival}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {hoursLeft !== null && (
            <div className="match-m-confirm-timer" aria-live="polite">⏱ Auto-confirma en ~{hoursLeft}h</div>
          )}
          <div className="match-m-confirm-actions">
            <button onClick={() => onAccept(match.id, match.tournamentId, myParticipantId)}
              className="match-m-btn match-m-btn-accept" aria-label="Confirmar resultado">
              ✓ Confirmar
            </button>
            <button onClick={() => onReject(match.id, match.tournamentId, myParticipantId)}
              className="match-m-btn match-m-btn-reject" aria-label="Rechazar resultado">
              ✗ Rechazar
            </button>
          </div>
        </div>
      )}

      {/* ── Availability accordion ── */}
      {showAvail && (
        <div className="match-m-avail">
          <div className="match-m-avail-lbl">Disponibilidad</div>
          <AvailDropdown
            label={`Mi pareja (${myPlayerIds.length === 1 ? 'solo yo' : myNames})`}
            playerIds={myPlayerIds}
            availMap={availMap}
            accentColor="var(--court-deep)"
          />
          {allPlayerIds.length >= 4 && (
            <AvailDropdown
              label={`Los 4 (${myNames} vs ${oppNames})`}
              playerIds={allPlayerIds}
              availMap={availMap}
              accentColor="var(--ok)"
            />
          )}
        </div>
      )}

      {/* ── Propose form ── */}
      {showForm && canPlayerSubmit && (
        <TournamentProposeForm
          match={match} myParticipantId={myParticipantId} myNames={myNames} oppNames={oppNames}
          onSubmit={(data) => { onPropose(match.id, match.tournamentId, data); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function Matches() {
  const { user } = useAuth();
  const [tournamentMatches, setTournamentMatches] = useState([]);
  const [availMap, setAvailMap] = useState({});
  const [loading,  setLoading]  = useState(true);
  const [tab,          setTab]          = useState('pending');
  const [search,       setSearch]       = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page,         setPage]         = useState(1);

  useEffect(() => {
    async function load() {
      try {
        const tRes = await tournamentInstanceService.getMyMatches();
        const tMatches = tRes.data || [];
        setTournamentMatches(tMatches);

        const pendingMatches = tMatches.filter(m => m.status !== 'completed');
        const playerIds = [...new Set(pendingMatches.flatMap(m => [
          ...(m.myPlayerIds || []), ...(m.opponentPlayerIds || [])
        ]))];
        if (playerIds.length > 0) {
          const results = await Promise.all(
            playerIds.map(id => availabilityService.getByPlayer(id).catch(() => ({ data: { slots: {} } })))
          );
          const map = {};
          playerIds.forEach((id, i) => { map[id] = results[i].data?.slots || {}; });
          setAvailMap(map);
        }
      } catch(e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const handleTournamentPropose = async (matchId, tournamentId, data) => {
    try {
      const res = await tournamentInstanceService.proposeResult(tournamentId, matchId, data);
      setTournamentMatches(prev => prev.map(m => {
        if (m.id !== matchId) return m;
        return { ...m, status: res.data.status, result: res.data.result,
          proposedByParticipant: res.data.proposedByParticipant,
          confirmedByParticipants: res.data.confirmedByParticipants,
          expiresAt: res.data.expiresAt };
      }));
    } catch(e) { alert(e.response?.data?.error || 'Error al enviar resultado'); }
  };
  const handleTournamentAccept = async (matchId, tournamentId, participantId) => {
    try {
      const res = await tournamentInstanceService.acceptResult(tournamentId, matchId, { participantId });
      setTournamentMatches(prev => prev.map(m => m.id !== matchId ? m : { ...m, status: res.data.status, result: res.data.result, proposedByParticipant: null, expiresAt: null }));
    } catch(e) { alert(e.response?.data?.error || 'Error al confirmar'); }
  };
  const handleTournamentReject = async (matchId, tournamentId, participantId) => {
    try {
      const res = await tournamentInstanceService.rejectResult(tournamentId, matchId, { participantId });
      setTournamentMatches(prev => prev.map(m => m.id !== matchId ? m : { ...m, status: res.data.status, result: res.data.result, proposedByParticipant: null, expiresAt: null }));
    } catch(e) { alert(e.response?.data?.error || 'Error al rechazar'); }
  };
  const handleRefereeResult = async (matchId, tournamentId, data) => {
    try {
      await tournamentInstanceService.setResult(tournamentId, matchId, data);
      setTournamentMatches(prev => prev.map(m => m.id !== matchId ? m : { ...m, status: 'completed', result: { sets: data.sets, completedAt: new Date().toISOString() } }));
    } catch(e) { alert(e.response?.data?.error || 'Error al registrar resultado'); }
  };

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:'80px 0',color:'var(--bp-text-3)'}}>Cargando...</div>;

  const pending   = tournamentMatches.filter(m => m.status !== 'completed');
  const completed = tournamentMatches.filter(m => m.status === 'completed');
  const toConfirm = tournamentMatches.filter(m => m.result?.status === 'pending' && m.proposedByParticipant && !(m.myParticipantIds||[]).includes(m.proposedByParticipant));

  // Filter chips by tournament
  const sources = [
    { id: '', label: 'Todos' },
    ...tournamentMatches.reduce((acc, m) => {
      if (!acc.find(x => x.id === m.tournamentId)) acc.push({ id: m.tournamentId, label: m.tournamentName });
      return acc;
    }, [])
  ];

  const matchNames = m => [...(m.myTeam||[]), ...(m.opponentTeam||[])].join(' ').toLowerCase();
  const matchSource = m => m.tournamentId;

  const applyFilters = list => list
    .filter(m => !sourceFilter || matchSource(m) === sourceFilter)
    .filter(m => !search || matchNames(m).includes(search.toLowerCase()));

  const filteredPending   = applyFilters(pending);
  const filteredCompleted = applyFilters(completed);
  const currentList = tab === 'pending' ? filteredPending : filteredCompleted;
  const totalPages  = Math.ceil(currentList.length / PAGE_SIZE);
  const paginated   = currentList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="matches-pg">

      {/* ── Header ── */}
      <div className="matches-pg-head">
        <h1 className="matches-pg-title">Mis <em>partidos.</em></h1>
        <div className="matches-pg-stats" role="status" aria-live="polite">
          <div>
            <div className="matches-stat-n" style={{color:'var(--court-deep)'}}>{pending.length}</div>
            <div className="matches-stat-l">pendientes</div>
          </div>
          <div>
            <div className="matches-stat-n" style={{color:'var(--ink-soft)'}}>{completed.length}</div>
            <div className="matches-stat-l">completados</div>
          </div>
          {toConfirm.length > 0 && (
            <div>
              <div className="matches-stat-n" style={{color:'var(--amber)'}}>{toConfirm.length}</div>
              <div className="matches-stat-l">por confirmar</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="matches-pg-ctrl">
        <div style={{position:'relative'}}>
          <input className="matches-search" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre de jugador…"
            aria-label="Buscar partido por nombre de jugador" />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1); }} aria-label="Limpiar búsqueda"
              style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',
                background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--ink-soft)',lineHeight:1,padding:4}}>
              ×
            </button>
          )}
        </div>

        {sources.length > 1 && (
          <div className="matches-chips" role="group" aria-label="Filtrar por torneo">
            {sources.map(s => (
              <button key={s.id}
                className={`matches-chip${sourceFilter === s.id ? ' active' : ''}`}
                onClick={() => { setSourceFilter(s.id); setPage(1); }}
                aria-pressed={sourceFilter === s.id}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="matches-tabs" role="tablist" aria-label="Estado de los partidos">
          {[['pending','Pendientes',filteredPending.length],['completed','Completados',filteredCompleted.length]].map(([id,label,count]) => (
            <button key={id} role="tab" aria-selected={tab === id}
              className={`matches-tab${tab === id ? ' active' : ''}`}
              onClick={() => { setTab(id); setPage(1); }}>
              {label} <span style={{opacity:.6}}>({count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── List ── */}
      <div className="matches-pg-list" role="tabpanel">
        {paginated.length === 0
          ? <div className="matches-empty">
              No hay partidos{search ? ` para "${search}"` : ''}
            </div>
          : paginated.map(m => (
              <TournamentMatchCard key={m.id} match={m}
                onPropose={handleTournamentPropose}
                onAccept={handleTournamentAccept}
                onReject={handleTournamentReject}
                onRefereeResult={handleRefereeResult}
                availMap={availMap}
              />
            ))
        }
        {currentList.length > PAGE_SIZE && (
          <div style={{textAlign:'center',fontSize:11,color:'var(--ink-soft)',marginTop:4}}>
            {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, currentList.length)} de {currentList.length}
          </div>
        )}
        <Paginator page={page} totalPages={totalPages} onPage={p => { setPage(p); window.scrollTo(0, 0); }} />
      </div>

    </div>
  );
}
