import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tournamentInstanceService, tournamentEngineService } from '../services/api';
import { PlayerAvatar, MatchCard } from '../components/tournament/matchDisplay';
import { buildPlayerLabels } from '../utils/matchDisplay';
// NOTE: pair-request self-service (sendPairRequest/accept/reject/cancel)
// and player result self-service (proposeResult/acceptResult/
// rejectResult) are served by the Laravel backend under the same paths
// the old Express API used (`tournamentInstanceService`). Pair requests
// are only offered while the tournament is a draft (pairs freeze on
// start); result proposals only exist in resultMode='jugador'.

const PAIRING_LABELS = {
  fixed_pairs:        'Parejas fijas',
  americana_clasica:  'Americana clásica',
  americana_perfecta: 'Americana perfecta',
  americana_mixta:    'Americana mixta',
  mexicano:           'Mexicano',
  round_robin:        'Round Robin',
  eliminacion_directa:'Eliminación directa',
};

const STATUS_STYLE = {
  draft:    { bg:'var(--bone-3)', color:'var(--ink-soft)', label:'Borrador' },
  active:   { bg:'var(--ok-soft)', color:'var(--ok)', label:'Activo'   },
  finished: { bg:'var(--court-soft)', color:'var(--court-deep)', label:'Finalizado'},
  completed:{ bg:'var(--court-soft)', color:'var(--court-deep)', label:'Finalizado'},
};

// ── Participants tab ──────────────────────────────────────────────────────
function ParticipantsTab({ participants, pairingSystem, myPlayerId, tournamentId, tournamentStatus, onRefresh }) {
  const isPairs = pairingSystem === 'fixed_pairs';
  const [pairMsg, setPairMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const notify = (m) => { setPairMsg(m); setTimeout(() => setPairMsg(''), 5000); };

  const myPart = myPlayerId ? participants.find(p => p.playerId === myPlayerId) : null;
  const isUnpaired = myPart && isPairs && !myPart.partnerId && myPart.status === 'active';
  const hasSentRequest = myPart && isPairs && myPart.status === 'pair_requested';
  const pendingTarget = hasSentRequest ? participants.find(p => p.playerId === myPart.partnerId) : null;

  // Incoming request: someone with status='pair_requested' pointing to me
  const incomingRequest = myPart && isPairs
    ? participants.find(p => p.status === 'pair_requested' && p.partnerId === myPlayerId)
    : null;

  // Players can ask/answer pair requests only while the roster is still
  // being formed; the backend enforces the same rule.
  const canDoPairActions = isPairs && tournamentStatus === 'draft';

  const handleSendRequest = async (toPlayerId) => {
    setLoading(true);
    try {
      await tournamentInstanceService.sendPairRequest(tournamentId, { toPlayerId });
      notify('Solicitud enviada');
      onRefresh();
    } catch(e) { notify(e.response?.data?.error || 'Error'); }
    finally { setLoading(false); }
  };

  const handleAccept = async (fromPlayerId) => {
    setLoading(true);
    try {
      await tournamentInstanceService.acceptPairRequest(tournamentId, { fromPlayerId });
      notify('Pareja confirmada');
      onRefresh();
    } catch(e) { notify(e.response?.data?.error || 'Error'); }
    finally { setLoading(false); }
  };

  const handleReject = async (fromPlayerId) => {
    setLoading(true);
    try {
      await tournamentInstanceService.rejectPairRequest(tournamentId, { fromPlayerId });
      notify('Solicitud rechazada');
      onRefresh();
    } catch(e) { notify(e.response?.data?.error || 'Error'); }
    finally { setLoading(false); }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      await tournamentInstanceService.cancelPairRequest(tournamentId);
      notify('Solicitud cancelada');
      onRefresh();
    } catch(e) { notify(e.response?.data?.error || 'Error'); }
    finally { setLoading(false); }
  };

  if (isPairs) {
    const pairs = [];
    const solos = [];
    const used = new Set();
    participants.forEach(p => {
      if (used.has(p.id)) return;
      if (p.partnerId && p.status === 'active') {
        const partner = participants.find(q => q.playerId === p.partnerId && !used.has(q.id));
        if (partner) { pairs.push({ p1: p, p2: partner }); used.add(p.id); used.add(partner.id); return; }
      }
      solos.push(p); used.add(p.id);
    });
    const unpairedOthers = solos.filter(p => p.playerId !== myPlayerId && p.status === 'active' && !p.partnerId);
    return (
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {pairMsg && (
          <div style={{background:'var(--ok-soft)',border:'1px solid var(--ok-soft)',borderRadius:8,padding:'8px 12px',fontSize:12,color:'var(--ok)'}}>{pairMsg}</div>
        )}

        {/* Incoming request banner */}
        {incomingRequest && canDoPairActions && (
          <div style={{background:'var(--amber-soft)',border:'1px solid var(--amber-soft)',borderRadius:12,padding:'12px 14px'}}>
            <div style={{fontWeight:700,fontSize:13,color:'var(--amber)',marginBottom:6}}>
              {incomingRequest.player?.name} te invita a ser su pareja
            </div>
            <div style={{display:'flex',gap:8}}>
              <button disabled={loading} onClick={()=>handleAccept(incomingRequest.playerId)}
                style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:700,fontSize:12,cursor:'pointer'}}>
                Aceptar
              </button>
              <button disabled={loading} onClick={()=>handleReject(incomingRequest.playerId)}
                style={{flex:1,padding:'9px',borderRadius:8,border:'1px solid var(--crimson-soft)',background:'var(--crimson-soft)',color:'var(--crimson)',fontWeight:700,fontSize:12,cursor:'pointer'}}>
                Rechazar
              </button>
            </div>
          </div>
        )}

        {/* Outgoing pending request */}
        {hasSentRequest && canDoPairActions && (
          <div style={{background:'var(--court-soft)',border:'1px solid var(--court-soft)',borderRadius:12,padding:'12px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontWeight:700,fontSize:12,color:'var(--court-deep)'}}>Solicitud pendiente</div>
              <div style={{fontSize:11,color:'#3b82f6',marginTop:2}}>
                Esperando respuesta de {pendingTarget?.player?.name || '...'}
              </div>
            </div>
            <button disabled={loading} onClick={handleCancel}
              style={{fontSize:11,background:'var(--crimson-soft)',border:'1px solid var(--crimson-soft)',borderRadius:6,padding:'5px 10px',color:'var(--crimson)',cursor:'pointer',fontWeight:600}}>
              Cancelar
            </button>
          </div>
        )}

        {/* Unpaired player — send request */}
        {isUnpaired && !incomingRequest && canDoPairActions && unpairedOthers.length > 0 && (
          <div style={{background:'var(--amber-soft)',border:'1px solid var(--amber-soft)',borderRadius:12,padding:'12px 14px'}}>
            <div style={{fontWeight:700,fontSize:12,color:'#9a3412',marginBottom:8}}>Sin pareja — elige un compañero</div>
            <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:200,overflowY:'auto'}}>
              {unpairedOthers.map(p => (
                <button key={p.id} disabled={loading} onClick={()=>handleSendRequest(p.playerId)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:8,border:'1px solid var(--amber-soft)',background:'white',cursor:'pointer',textAlign:'left'}}>
                  <PlayerAvatar player={p.player} size={28}/>
                  <span style={{fontSize:13,fontWeight:600,color:'var(--ink-2)'}}>{p.player?.name}</span>
                  <span style={{marginLeft:'auto',fontSize:11,color:'var(--court-deep)',fontWeight:700}}>Solicitar</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confirmed pairs */}
        {pairs.map(({ p1, p2 }, i) => {
          const isMe = p1.playerId === myPlayerId || p2?.playerId === myPlayerId;
          return (
            <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:isMe?'var(--amber-soft)':'white',borderRadius:12,border:`1px solid ${isMe?'var(--amber-soft)':'var(--bone-3)'}`}}>
              <PlayerAvatar player={p1.player} />
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:13,color:'var(--ink-2)',display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                  {p1.player?.name?.split(' ')[0]}
                  <span style={{color:'var(--ink-soft)'}}>&</span>
                  {p2.player?.name?.split(' ')[0]}
                  {isMe && <span style={{fontSize:9,background:'var(--amber)',color:'var(--ink)',borderRadius:4,padding:'1px 5px'}}>Tú</span>}
                </div>
                {p1.teamName && <div style={{fontSize:11,color:'var(--ink-soft)',marginTop:1}}>{p1.teamName}</div>}
              </div>
              {p1.seed && <span style={{fontSize:11,color:'var(--ink-soft)'}}>#{p1.seed}</span>}
            </div>
          );
        })}

        {/* Unpaired solo players (pending requests or no partner yet) */}
        {solos.map(p => {
          const isMe = p.playerId === myPlayerId;
          const isPendingReq = p.status === 'pair_requested';
          const target = isPendingReq ? participants.find(x => x.playerId === p.partnerId) : null;
          return (
            <div key={p.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:isMe?'var(--amber-soft)':'#fafafa',borderRadius:12,border:`1px solid ${isMe?'var(--amber-soft)':'var(--bone-3)'}`}}>
              <PlayerAvatar player={p.player} />
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:13,color:'var(--ink-2)'}}>{p.player?.name}</div>
                <div style={{fontSize:10,color: isPendingReq?'var(--amber)':'var(--crimson)',marginTop:1,fontWeight:600}}>
                  {isPendingReq ? `Solicitud → ${target?.player?.name||'...'}` : 'Sin pareja'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {participants.map((p, i) => {
        const isMe = p.playerId === myPlayerId;
        return (
          <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:isMe?'var(--amber-soft)':'white',borderRadius:12,border:`1px solid ${isMe?'var(--amber-soft)':'var(--bone-3)'}`}}>
            <span style={{fontSize:12,fontWeight:700,color:'var(--ink-soft)',minWidth:20}}>{i+1}</span>
            <PlayerAvatar player={p.player} />
            <div style={{flex:1,fontWeight:isMe?700:500,fontSize:13,color:'var(--ink-2)'}}>
              {p.player?.name}
              {isMe && <span style={{fontSize:9,background:'var(--amber)',color:'var(--ink)',borderRadius:4,padding:'1px 5px',marginLeft:6}}>Tú</span>}
            </div>
            {p.seed && <span style={{fontSize:11,color:'var(--ink-soft)'}}>#{p.seed}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Result modal ──────────────────────────────────────────────────────────
function MatchResultModal({ match, myParticipantId, isTeam1, myNames, oppNames, onClose, onUpdated }) {
  const [sets, setSets] = useState([{my:'',rival:''},{my:'',rival:''}]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const resultMode       = match._resultMode;
  const tournamentStatus = match._tournamentStatus;
  const canPlayer        = resultMode === 'jugador' && tournamentStatus === 'active';
  const completed        = match.status === 'completed';
  const resultStatus     = match.result?.status;
  const iProposed        = canPlayer && resultStatus === 'pending' && (match.myParticipantIds||[myParticipantId]).includes(match.proposedByParticipant);
  const rivalProposed    = canPlayer && resultStatus === 'pending' && match.proposedByParticipant && !(match.myParticipantIds||[myParticipantId]).includes(match.proposedByParticipant);

  const existingSets  = match.result?.sets || [];
  const validSets     = sets.filter(s => s.my !== '' && s.rival !== '');
  const myWins        = validSets.filter(s => parseInt(s.my) > parseInt(s.rival)).length;
  const rivalWins     = validSets.filter(s => parseInt(s.rival) > parseInt(s.my)).length;

  const updateSet = (i, field, val) => {
    if (i === 'add') { setSets(p => [...p, {my:'',rival:''}]); return; }
    setSets(p => p.map((s,idx) => idx===i ? {...s,[field]:val} : s));
  };

  const handlePropose = async () => {
    if (!validSets.length) return;
    setSaving(true); setMsg('');
    const normalizedSets = validSets.map(s => isTeam1 ? {t1:s.my,t2:s.rival} : {t1:s.rival,t2:s.my});
    try {
      const r = await tournamentInstanceService.proposeResult(match.tournamentId, match.id, { sets: normalizedSets, participantId: myParticipantId });
      onUpdated(r.data);
    } catch(e) { setMsg(e.response?.data?.error || 'Error al enviar'); }
    finally { setSaving(false); }
  };

  const handleAccept = async () => {
    setSaving(true); setMsg('');
    try {
      const r = await tournamentInstanceService.acceptResult(match.tournamentId, match.id, { participantId: myParticipantId });
      onUpdated(r.data);
    } catch(e) { setMsg(e.response?.data?.error || 'Error'); }
    finally { setSaving(false); }
  };

  const handleReject = async () => {
    setSaving(true); setMsg('');
    try {
      const r = await tournamentInstanceService.rejectResult(match.tournamentId, match.id, { participantId: myParticipantId });
      onUpdated(r.data);
    } catch(e) { setMsg(e.response?.data?.error || 'Error'); }
    finally { setSaving(false); }
  };

  // Sets display for completed / rival proposed
  const displaySets = completed ? existingSets : (rivalProposed ? existingSets : []);
  const setsDisplay = displaySets.map((s,i) => {
    const my    = isTeam1 ? s.t1 : s.t2;
    const rival = isTeam1 ? s.t2 : s.t1;
    return (
      <div key={i} style={{background:'var(--bone-2)',border:'1px solid var(--line)',borderRadius:8,padding:'6px 12px',textAlign:'center',display:'inline-block',marginRight:6}}>
        <div style={{fontSize:10,color:'var(--ink-soft)',marginBottom:1}}>Set {i+1}</div>
        <div style={{fontSize:14,fontWeight:700}}>
          <span style={{color:parseInt(my)>parseInt(rival)?'var(--ok)':'var(--crimson)'}}>{my}</span>
          <span style={{color:'var(--ink-soft)',margin:'0 4px'}}>-</span>
          <span style={{color:parseInt(rival)>parseInt(my)?'var(--ok)':'var(--crimson)'}}>{rival}</span>
        </div>
      </div>
    );
  });

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:0}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'white',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:480,padding:20,maxHeight:'90vh',overflowY:'auto'}}>
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:'var(--ink-2)'}}>{myNames} <span style={{color:'var(--ink-soft)'}}>vs</span> {oppNames}</div>
            <div style={{fontSize:11,color:'var(--ink-soft)',marginTop:2}}>Ronda {match.round}</div>
          </div>
          <button onClick={onClose} style={{background:'var(--bone-3)',border:'none',borderRadius:10,padding:'6px 10px',cursor:'pointer',color:'var(--ink-soft)',fontSize:13}}>✕</button>
        </div>

        {/* Completed */}
        {completed && (
          <div style={{background:'var(--ok-soft)',border:'1px solid var(--ok-soft)',borderRadius:12,padding:'12px 14px',marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--ok)',marginBottom:8}}>✅ Partido completado</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>{setsDisplay}</div>
          </div>
        )}

        {/* I proposed — waiting */}
        {!completed && iProposed && (
          <div style={{background:'var(--amber-soft)',border:'1px solid var(--amber-soft)',borderRadius:12,padding:'12px 14px'}}>
            <div style={{fontSize:13,fontWeight:700,color:'var(--amber)',marginBottom:4}}>⏳ Resultado enviado</div>
            <div style={{fontSize:12,color:'var(--amber)'}}>Esperando que {oppNames} confirme el resultado.</div>
            {existingSets.length > 0 && <div style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:4}}>{setsDisplay}</div>}
          </div>
        )}

        {/* Rival proposed — accept/reject */}
        {!completed && rivalProposed && (
          <div style={{background:'var(--amber-soft)',border:'1px solid var(--amber-soft)',borderRadius:12,padding:'14px',marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:'var(--amber)',marginBottom:8}}>📩 {oppNames} propone:</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:12}}>{setsDisplay}</div>
            {saving ? <div style={{textAlign:'center',fontSize:12,color:'var(--amber)'}}>Guardando…</div> : (
              <div style={{display:'flex',gap:8}}>
                <button onClick={handleAccept} style={{flex:1,background:'var(--court)',border:'none',borderRadius:10,padding:'10px',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:'pointer'}}>✓ Confirmar</button>
                <button onClick={handleReject} style={{flex:1,background:'var(--crimson)',border:'none',borderRadius:10,padding:'10px',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:'pointer'}}>✗ Rechazar</button>
              </div>
            )}
          </div>
        )}

        {/* Propose form */}
        {canPlayer && !completed && !iProposed && !rivalProposed && (
          <div>
            <div style={{fontSize:13,fontWeight:700,color:'var(--ink-2)',marginBottom:10}}>Registrar resultado</div>
            <div style={{background:'var(--bone-2)',borderRadius:10,padding:'10px 12px',marginBottom:12,display:'flex',gap:8,alignItems:'center'}}>
              <span style={{flex:1,fontSize:12,fontWeight:700,color:'var(--court-deep)',textAlign:'center'}}>{myNames}<br/><span style={{fontSize:10,fontWeight:400,color:'var(--ink-soft)'}}>Mi equipo</span></span>
              <span style={{color:'var(--ink-soft)',fontWeight:700}}>vs</span>
              <span style={{flex:1,fontSize:12,fontWeight:700,color:'var(--ink-mid)',textAlign:'center'}}>{oppNames}<br/><span style={{fontSize:10,fontWeight:400,color:'var(--ink-soft)'}}>Rival</span></span>
            </div>
            {sets.map((set,i) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <span style={{fontSize:11,color:'var(--ink-soft)',width:44}}>Set {i+1}</span>
                <input type="number" min="0" max="7" value={set.my} onChange={e=>updateSet(i,'my',e.target.value)}
                  placeholder="Yo" style={{width:56,border:'2px solid var(--court)',borderRadius:8,padding:'8px',fontSize:15,textAlign:'center',outline:'none',fontWeight:700,color:'var(--court-deep)'}}/>
                <span style={{color:'var(--ink-soft)',fontWeight:700}}>-</span>
                <input type="number" min="0" max="7" value={set.rival} onChange={e=>updateSet(i,'rival',e.target.value)}
                  placeholder="Rival" style={{width:56,border:'1px solid var(--line)',borderRadius:8,padding:'8px',fontSize:15,textAlign:'center',outline:'none',fontWeight:700}}/>
              </div>
            ))}
            <button onClick={()=>updateSet('add')} style={{fontSize:11,color:'var(--court-deep)',background:'none',border:'none',cursor:'pointer',padding:0,marginBottom:10}}>+ Añadir set</button>
            {validSets.length > 0 && (
              <div style={{background:'var(--court-soft)',border:'1px solid var(--court-soft)',borderRadius:8,padding:'8px 12px',marginBottom:10,fontSize:12,color:'#1e40af',fontWeight:600}}>
                Parcial: {myWins} - {rivalWins} sets
              </div>
            )}
            {msg && <div style={{color:'var(--crimson)',fontSize:12,marginBottom:8}}>{msg}</div>}
            <button onClick={handlePropose} disabled={!validSets.length||saving}
              style={{width:'100%',background:validSets.length&&!saving?'var(--court)':'var(--court-soft)',border:'none',borderRadius:10,padding:'12px',color:'var(--ink)',fontWeight:700,fontSize:14,cursor:validSets.length&&!saving?'pointer':'default'}}>
              {saving ? 'Enviando…' : 'Enviar resultado'}
            </button>
          </div>
        )}

        {!canPlayer && !completed && (
          <div style={{background:'var(--bone-2)',border:'1px solid var(--line)',borderRadius:12,padding:'12px 14px',fontSize:12,color:'var(--ink-soft)',textAlign:'center'}}>
            {resultMode === 'jugador'   ? 'Los jugadores podrán proponer el resultado cuando el torneo esté activo.' :
             resultMode === 'arbitro'   ? 'El árbitro registrará el resultado de este partido.' :
                                          'El admin registrará el resultado de este partido.'}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Matches tab ───────────────────────────────────────────────────────────
function MatchesTab({ matches, participants, myPlayerId, clubName, onMyMatchClick }) {
  const partMap = {};
  participants.forEach(p => { partMap[p.id] = p.player; });
  const playerLabels = buildPlayerLabels(participants.map(p => p.player).filter(Boolean));

  const byRound = {};
  matches.forEach(m => {
    if (!byRound[m.round]) byRound[m.round] = [];
    byRound[m.round].push(m);
  });

  if (Object.keys(byRound).length === 0) {
    return <div style={{background:'var(--bone-2)',borderRadius:12,padding:20,textAlign:'center',fontSize:13,color:'var(--ink-soft)'}}>Los partidos aún no se han generado.</div>;
  }

  const getTeams = (match) => {
    if (match.group) {
      const g = JSON.parse(match.group);
      return {
        team1: (g.team1||[]).map(id => partMap[id]).filter(Boolean),
        team2: (g.team2||[]).map(id => partMap[id]).filter(Boolean),
      };
    }
    return {
      team1: match.participant1Id ? [partMap[match.participant1Id]].filter(Boolean) : [],
      team2: match.participant2Id ? [partMap[match.participant2Id]].filter(Boolean) : [],
    };
  };

  const isMyMatch = (match) => {
    const myPId = participants.find(p => p.playerId === myPlayerId)?.id;
    if (!myPId) return false;
    if (match.group) {
      const g = JSON.parse(match.group);
      return (g.team1||[]).includes(myPId) || (g.team2||[]).includes(myPId);
    }
    return match.participant1Id === myPId || match.participant2Id === myPId;
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {Object.entries(byRound).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).map(([round, rMatches]) => (
        <div key={round}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--ink-soft)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>
            Ronda {round}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',gap:6}}>
            {rMatches.map(match => {
              const { team1, team2 } = getTeams(match);
              const mine = isMyMatch(match);
              const completed = match.status === 'completed';
              return (
                <MatchCard key={match.id}
                  team1={team1} team2={team2} labels={playerLabels}
                  round={round} result={match.result} status={match.status}
                  scheduledAt={match.scheduledAt} courtNumber={match.courtNumber} clubName={clubName}
                  mine={mine}
                  onClick={mine && onMyMatchClick ? () => onMyMatchClick(match, team1, team2) : undefined}
                  footer={!completed && mine && onMyMatchClick ? (
                    <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--court-deep)', background: 'var(--court-soft)', borderRadius: 8, padding: '6px 0' }}>
                      Tocá para registrar resultado
                    </div>
                  ) : null}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Standings tab ─────────────────────────────────────────────────────────
function StandingsTab({ tournamentId, myPlayerId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tournamentEngineService.getStandings(tournamentId)
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tournamentId]);

  if (loading) return <div style={{textAlign:'center',padding:'32px 0',color:'var(--ink-soft)'}}>Cargando...</div>;
  if (!data || data.standings.length === 0) {
    return <div style={{background:'var(--amber-soft)',border:'1px solid var(--amber-soft)',borderRadius:12,padding:16,fontSize:13,color:'var(--amber)',textAlign:'center'}}>Aún no hay resultados para mostrar.</div>;
  }

  const isPairs = data.tournament?.pairingSystem === 'fixed_pairs';
  const medals = ['🥇','🥈','🥉'];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <div style={{fontSize:12,color:'var(--ink-soft)'}}>{data.completedMatches} de {data.totalMatches} partidos completados</div>
      <div style={{background:'white',borderRadius:16,border:'1px solid var(--bone-3)',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'32px 1fr 36px 36px 36px 36px 48px',gap:4,padding:'10px 12px',background:'var(--bone-2)',borderBottom:'1px solid var(--bone-3)'}}>
          {['#', isPairs?'Pareja':'Jugador','PJ','G','P','E','Pts'].map(h => (
            <div key={h} style={{fontSize:10,fontWeight:700,color:'var(--ink-soft)',textAlign:h==='Pareja'||h==='Jugador'?'left':'center'}}>{h}</div>
          ))}
        </div>
        {data.standings.map((s, i) => {
          const isTop = i === 0 && s.points > 0;
          let isMe = false, label = '';
          if (isPairs) {
            label = [s.player1?.name?.split(' ')[0], s.player2?.name?.split(' ')[0]].filter(Boolean).join(' & ');
            isMe = s.player1?.id === myPlayerId || s.player2?.id === myPlayerId;
          } else {
            label = s.participant?.player?.name || '—';
            isMe = s.participant?.playerId === myPlayerId;
          }
          return (
            <div key={i} style={{display:'grid',gridTemplateColumns:'32px 1fr 36px 36px 36px 36px 48px',gap:4,padding:'10px 12px',borderBottom:'1px solid var(--bone-2)',background:isMe?'#fefce8':'white'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
                {i<3&&s.points>0?<span style={{fontSize:16}}>{medals[i]}</span>:<span style={{fontSize:12,fontWeight:700,color:'var(--ink-soft)'}}>{i+1}</span>}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:4,overflow:'hidden'}}>
                <span style={{fontSize:13,fontWeight:isMe?700:500,color:isMe?'var(--amber)':'var(--ink-mid)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label}</span>
                {isMe&&<span style={{fontSize:9,background:'var(--amber)',color:'var(--ink)',borderRadius:4,padding:'1px 4px',flexShrink:0}}>Tú</span>}
              </div>
              {[s.played,s.won,s.lost,s.draw].map((v,j)=>(
                <div key={j} style={{textAlign:'center',fontSize:13,color:'var(--ink-soft)',display:'flex',alignItems:'center',justifyContent:'center'}}>{v}</div>
              ))}
              <div style={{textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span style={{fontSize:13,fontWeight:800,color:isTop?'var(--amber)':isMe?'var(--amber)':'var(--ink-2)',background:isTop?'var(--amber-soft)':isMe?'var(--amber-soft)':'transparent',borderRadius:6,padding:isTop||isMe?'2px 8px':'0'}}>{s.points}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Activity log tab ──────────────────────────────────────────────────────
const RESULT_ACTIONS_VIEW = new Set(['resultado_propuesto','resultado_aceptado','resultado_admin']);

function OutcomeBadgeView({ detail }) {
  if (!detail) return null;
  const parts   = detail.split('·').map(s => s.trim());
  const outcome = parts[parts.length - 1];
  const sets    = parts.slice(0, -1).join(' · ');
  const isGana  = outcome.toLowerCase().startsWith('gana');
  const isEmpate = outcome.toLowerCase() === 'empate';
  const isInv   = outcome.toLowerCase() === 'inválido';
  if (!isGana && !isEmpate && !isInv)
    return <span style={{fontSize:12,color:'var(--ink-soft)'}}>{detail}</span>;
  const badgeStyle = {
    fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 7px', flexShrink: 0, whiteSpace: 'nowrap',
    ...(isGana   ? { color:'var(--ok)', background:'var(--ok-soft)', border:'1px solid var(--ok-soft)' } :
        isEmpate ? { color:'var(--ink-mid)', background:'var(--bone-3)', border:'1px solid var(--line)' } :
        isInv    ? { color:'var(--crimson)', background:'var(--crimson-soft)', border:'1px solid var(--crimson-soft)' } :
                   { color:'var(--ink-mid)', background:'var(--bone-3)', border:'1px solid var(--line)' })
  };
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
      {sets && <span style={{fontSize:12,color:'var(--ink-soft)'}}>{sets}</span>}
      <span style={badgeStyle}>{outcome}</span>
    </span>
  );
}

const ACTION_LABELS_VIEW = {
  participante_añadido:     { label: 'Jugador añadido',          color: 'var(--ok)', bg: 'var(--ok-soft)', border: 'var(--ok-soft)' },
  participante_eliminado:   { label: 'Jugador eliminado',        color: 'var(--crimson)', bg: 'var(--crimson-soft)', border: 'var(--crimson-soft)' },
  partidos_generados:       { label: 'Partidos generados',       color: 'var(--court-deep)', bg: '#f5f3ff', border: 'var(--court-soft)' },
  resultado_propuesto:      { label: 'Resultado propuesto',      color: 'var(--court-deep)', bg: 'var(--court-soft)', border: 'var(--court-soft)' },
  resultado_aceptado:       { label: 'Resultado confirmado',     color: 'var(--ok)', bg: 'var(--ok-soft)', border: 'var(--ok-soft)' },
  resultado_rechazado:      { label: 'Resultado rechazado',      color: 'var(--crimson)', bg: 'var(--crimson-soft)', border: 'var(--crimson-soft)' },
  resultado_admin:          { label: 'Resultado (admin)',        color: 'var(--amber)', bg: '#fffbeb', border: 'var(--amber-soft)' },
  modo_resultados_cambiado: { label: 'Modo resultados cambiado', color: '#0e7490', bg: '#ecfeff', border: '#a5f3fc' },
};

function ActivityTab({ tournamentId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tournamentEngineService.getLogs(tournamentId)
      .then(r => setLogs(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tournamentId]);

  if (loading) return <div style={{textAlign:'center',padding:'32px 0',color:'var(--ink-soft)',fontSize:13}}>Cargando…</div>;
  if (!logs.length) return <div style={{textAlign:'center',padding:'32px 0',color:'var(--ink-soft)',fontSize:13}}>Sin actividad registrada aún.</div>;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {logs.map(log => {
        const meta = ACTION_LABELS_VIEW[log.action] || { label: log.action, color:'var(--ink-mid)', bg:'var(--bone-2)', border:'var(--line)' };
        const date = new Date(log.createdAt);
        const dateStr = date.toLocaleDateString('es-ES', { day:'numeric', month:'short' });
        const timeStr = date.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
        return (
          <div key={log.id} style={{background:'white',border:'1px solid var(--bone-3)',borderRadius:10,padding:'10px 12px',display:'flex',gap:10,alignItems:'flex-start'}}>
            <span style={{fontSize:10,fontWeight:700,color:meta.color,background:meta.bg,border:`1px solid ${meta.border}`,borderRadius:6,padding:'2px 7px',flexShrink:0,marginTop:1,whiteSpace:'nowrap'}}>
              {meta.label}
            </span>
            <div style={{flex:1,minWidth:0}}>
              {log.playerName && <span style={{fontSize:12,fontWeight:700,color:'var(--ink-2)'}}>{log.playerName} · </span>}
              {log.detail && (RESULT_ACTIONS_VIEW.has(log.action)
                ? <OutcomeBadgeView detail={log.detail} />
                : <span style={{fontSize:12,color:'var(--ink-soft)'}}>{log.detail}</span>
              )}
            </div>
            <div style={{flexShrink:0,textAlign:'right'}}>
              <div style={{fontSize:11,color:'var(--ink-soft)'}}>{dateStr}</div>
              <div style={{fontSize:10,color:'var(--ink-soft)'}}>{timeStr}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function TournamentView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('partidos');
  const [matchModal, setMatchModal] = useState(null); // { match, myParticipantId, isTeam1, myNames, oppNames }

  const myPlayerId = user?.player?.id;

  useEffect(() => {
    tournamentEngineService.getById(id)
      .then(r => setData(r.data))
      .catch(() => setError('Torneo no encontrado'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleRefresh = useCallback(() => {
    tournamentEngineService.getById(id).then(r => setData(r.data)).catch(()=>{});
  }, [id]);

  const handleMyMatchClick = (match, team1, team2) => {
    const myPart = (data.participants||[]).find(p => p.playerId === myPlayerId);
    if (!myPart) return;
    let isTeam1 = false;
    if (match.group) {
      try { const g = JSON.parse(match.group); isTeam1 = (g.team1||[]).includes(myPart.id); } catch {}
    } else {
      isTeam1 = match.participant1Id === myPart.id;
    }
    const myNames  = team1.map(p => p?.name?.split(' ')[0]).join(' & ') || 'Mi equipo';
    const oppNames = team2.map(p => p?.name?.split(' ')[0]).join(' & ') || 'Rival';
    // Embed tournament context into match for modal
    const enriched = {
      ...match,
      tournamentId: id,
      _resultMode: data.resultMode,
      _tournamentStatus: data.status,
      myParticipantIds: [myPart.id],
    };
    if (!isTeam1) {
      setMatchModal({ match: enriched, myParticipantId: myPart.id, isTeam1: false, myNames: oppNames, oppNames: myNames });
    } else {
      setMatchModal({ match: enriched, myParticipantId: myPart.id, isTeam1: true, myNames, oppNames });
    }
  };

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:'80px 0',color:'var(--ink-soft)'}}>Cargando...</div>;
  if (error) return (
    <div style={{padding:20,textAlign:'center'}}>
      <button onClick={()=>navigate(-1)} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',color:'var(--ink-soft)',fontSize:13,cursor:'pointer',padding:0,marginBottom:16}}>← Volver</button>
      <div style={{color:'var(--crimson)'}}>{error}</div>
    </div>
  );

  const { status } = data;
  const st = STATUS_STYLE[status] || STATUS_STYLE.draft;
  const amParticipant = (data.participants||[]).some(p => p.playerId === myPlayerId);
  const totalParticipants = data.participants?.length || 0;
  const completedMatches = (data.matches||[]).filter(m=>m.status==='completed').length;
  const totalMatches = data.matches?.length || 0;

  return (
    <div style={{padding:12,display:'flex',flexDirection:'column',gap:12}}>
      {/* Back */}
      <button onClick={()=>navigate(-1)} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',color:'var(--ink-soft)',fontSize:13,cursor:'pointer',padding:0,alignSelf:'flex-start'}}>
        ← Volver
      </button>

      {/* Header */}
      <div style={{background:'var(--paper)',borderRadius:20,padding:16,border:'1px solid var(--line)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
          <div style={{fontSize:11,color:'var(--ink-soft)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Torneo</div>
          <span style={{fontSize:10,fontWeight:700,color:st.color,background:st.bg,borderRadius:8,padding:'3px 10px'}}>{st.label}</span>
        </div>
        <div style={{fontWeight:700,fontSize:20,color:'var(--ink)',fontFamily:'var(--display)'}}>{data.name}</div>
        {data.description && <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:4}}>{data.description}</div>}
        <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
          <span style={{fontSize:10,background:'var(--court-soft)',color:'var(--court-deep)',border:'1px solid var(--court)',borderRadius:5,padding:'2px 8px',fontWeight:600}}>
            {PAIRING_LABELS[data.pairingSystem]||data.pairingSystem}
          </span>
          {amParticipant && (
            <span style={{fontSize:10,background:'rgba(34,197,94,0.15)',color:'var(--ok)',border:'1px solid rgba(34,197,94,0.3)',borderRadius:5,padding:'2px 8px',fontWeight:700}}>
              ✓ Participas
            </span>
          )}
        </div>
        <div style={{display:'flex',gap:20,marginTop:12}}>
          <div><div style={{fontSize:22,fontWeight:900,color:'var(--court-deep)',fontFamily:'var(--display)'}}>{totalParticipants}</div><div style={{fontSize:10,color:'var(--ink-soft)'}}>participantes</div></div>
          <div><div style={{fontSize:22,fontWeight:900,color:'var(--court-deep)',fontFamily:'var(--display)'}}>{completedMatches}</div><div style={{fontSize:10,color:'var(--ink-soft)'}}>partidos jugados</div></div>
          <div><div style={{fontSize:22,fontWeight:900,color:'var(--court-deep)',fontFamily:'var(--display)'}}>{totalMatches}</div><div style={{fontSize:10,color:'var(--ink-soft)'}}>total partidos</div></div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',background:'var(--bone-3)',borderRadius:12,padding:4,gap:4}}>
        {[['partidos','Partidos'],['clasificacion','Tabla'],['participantes','Jugadores'],['actividad','Actividad']].map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)}
            style={{flex:1,padding:'8px 4px',borderRadius:9,border:'none',cursor:'pointer',fontSize:11,fontWeight:700,
              background:tab===key?'white':'transparent',
              color:tab===key?'var(--ink-2)':'var(--ink-soft)',
              boxShadow:tab===key?'0 1px 4px rgba(0,0,0,0.08)':'none',
              transition:'all 0.15s'}}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'partidos'       && <MatchesTab matches={data.matches||[]} participants={data.participants||[]} myPlayerId={myPlayerId} clubName={data.club?.name} onMyMatchClick={handleMyMatchClick} />}
      {tab === 'clasificacion'  && <StandingsTab tournamentId={id} myPlayerId={myPlayerId} />}
      {tab === 'participantes'  && <ParticipantsTab participants={data.participants||[]} pairingSystem={data.pairingSystem} myPlayerId={myPlayerId} tournamentId={id} tournamentStatus={data.status} onRefresh={handleRefresh} />}
      {tab === 'actividad'      && <ActivityTab tournamentId={id} />}

      {matchModal && (
        <MatchResultModal
          match={matchModal.match}
          myParticipantId={matchModal.myParticipantId}
          isTeam1={matchModal.isTeam1}
          myNames={matchModal.myNames}
          oppNames={matchModal.oppNames}
          onClose={() => setMatchModal(null)}
          onUpdated={(updatedMatch) => {
            setData(prev => ({
              ...prev,
              matches: prev.matches.map(m => m.id === updatedMatch.id ? { ...m, ...updatedMatch } : m)
            }));
            setMatchModal(prev => ({ ...prev, match: { ...prev.match, ...updatedMatch } }));
          }}
        />
      )}
    </div>
  );
}
