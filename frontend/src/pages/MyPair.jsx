import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { availabilityService, tournamentInstanceService } from '../services/api';

const DAYS   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const PAIRING_LABELS = {
  fixed_pairs:         'Parejas fijas',
  americana_clasica:   'Americana clásica',
  americana_perfecta:  'Americana perfecta',
  americana_mixta:     'Americana mixta',
  mexicano:            'Mexicano',
  round_robin:         'Round Robin',
  eliminacion_directa: 'Eliminación directa',
};

// ── Helpers ───────────────────────────────────────────────────────────────

function commonSlots(playerIds, availMap) {
  if (!playerIds?.length || !availMap) return {};
  const allKeys = [...new Set(playerIds.flatMap(id => Object.keys(availMap[id] || {})))];
  const result = {};
  for (const key of allKeys) {
    if (playerIds.every(id => (availMap[id] || {})[key])) result[key] = true;
  }
  return result;
}

function AvatarMini({ player }) {
  const initials = (player?.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  if (player?.avatarUrl) {
    return (
      <img src={player.avatarUrl} alt={player.name}
        style={{ width:34, height:34, borderRadius:'50%', objectFit:'cover', border:'2px solid var(--court)', flexShrink:0 }} />
    );
  }
  return (
    <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--court-soft)', border:'2px solid var(--court)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:12, fontWeight:800, color:'var(--court-deep)', flexShrink:0 }}>
      {initials}
    </div>
  );
}

// ── Availability accordion ────────────────────────────────────────────────

const DAYS_PER_PAGE = 5;

function AvailAccordion({ label, playerIds, availMap, accentColor = 'var(--court)', defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [page, setPage] = useState(0);

  const common = commonSlots(playerIds, availMap);
  const byDate = {};
  Object.keys(common).forEach(k => {
    const [dk, slot] = k.split('_');
    if (!byDate[dk]) byDate[dk] = [];
    byDate[dk].push(slot);
  });

  const sortedDays  = Object.entries(byDate).sort();
  const totalDays   = sortedDays.length;
  const totalPages  = Math.ceil(totalDays / DAYS_PER_PAGE);
  const pagedDays   = sortedDays.slice(page * DAYS_PER_PAGE, (page + 1) * DAYS_PER_PAGE);
  const totalSlots  = Object.keys(common).length;
  const c = accentColor;

  const toggle = () => { setOpen(v => !v); setPage(0); };

  return (
    <div style={{ marginTop:8 }}>
      <button onClick={toggle}
        style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center',
          padding:'8px 12px', borderRadius:10, border:`1px solid ${c}30`,
          background:`${c}0d`, cursor:'pointer', textAlign:'left' }}>
        <span style={{ fontSize:12, fontWeight:600, color:'var(--ink)' }}>{label}</span>
        <span style={{ fontSize:11, color:totalSlots>0?c:'var(--ink-soft)', fontWeight:600 }}>
          {totalSlots>0 ? `${totalDays} día${totalDays!==1?'s':''} · ${totalSlots} slots` : 'Sin coincidencias'} {open?'▲':'▼'}
        </span>
      </button>
      {open && (
        <div style={{ background:'var(--bp-surface)', border:`1px solid ${c}20`, borderTop:'none',
          borderRadius:'0 0 10px 10px', padding:'10px 12px' }}>
          {totalSlots === 0 ? (
            <div style={{ fontSize:12, color:'var(--ink-soft)', textAlign:'center', padding:'6px 0' }}>
              Sin horas en común. Completad más disponibilidad.
            </div>
          ) : (
            <>
              {pagedDays.map(([dk, slots]) => {
                const date = new Date(dk + 'T12:00:00');
                return (
                  <div key={dk} style={{ marginBottom:8 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--ink)', marginBottom:4 }}>
                      {DAYS[date.getDay()]} {date.getDate()} {MONTHS[date.getMonth()]}
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                      {slots.sort().map(s => (
                        <span key={s} style={{ fontSize:11, background:`${c}15`, color:c,
                          border:`1px solid ${c}40`, borderRadius:5, padding:'3px 8px', fontWeight:600 }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {totalPages > 1 && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  marginTop:10, paddingTop:8, borderTop:`1px solid ${c}20` }}>
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                    style={{ fontSize:11, padding:'4px 12px', borderRadius:7, border:`1px solid ${c}30`,
                      background:page===0?'var(--bone-2)':'white', color:page===0?'var(--line)':c,
                      cursor:page===0?'default':'pointer', fontWeight:600 }}>
                    ‹ Anterior
                  </button>
                  <span style={{ fontSize:10, color:'var(--ink-soft)' }}>
                    {page*DAYS_PER_PAGE+1}–{Math.min((page+1)*DAYS_PER_PAGE,totalDays)} de {totalDays} días
                  </span>
                  <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages - 1}
                    style={{ fontSize:11, padding:'4px 12px', borderRadius:7, border:`1px solid ${c}30`,
                      background:page===totalPages-1?'var(--bone-2)':'white', color:page===totalPages-1?'var(--line)':c,
                      cursor:page===totalPages-1?'default':'pointer', fontWeight:600 }}>
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

// ── Pending match availability card ───────────────────────────────────────

function MatchAvailCard({ match, myPairIds, availMap }) {
  const allIds = [...new Set([...myPairIds, ...(match.opponentPlayerIds||[])])];
  const oppLabel = (match.opponentNames||[]).join(' & ') || 'Rival';
  const hasOpponents = (match.opponentPlayerIds||[]).length > 0;

  return (
    <div style={{ borderRadius:10, border:'1px solid var(--line)', overflow:'hidden', marginBottom:6 }}>
      <div style={{ padding:'8px 12px', background:'var(--bone-2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <span style={{ fontSize:12, fontWeight:700, color:'var(--ink)' }}>R{match.round}</span>
          <span style={{ fontSize:12, color:'var(--ink-soft)', margin:'0 6px' }}>vs</span>
          <span style={{ fontSize:12, fontWeight:600, color:'var(--ink)' }}>{oppLabel}</span>
        </div>
      </div>
      <div style={{ padding:'6px 12px 10px' }}>
        {hasOpponents && allIds.length >= 2 && availMap && (
          <AvailAccordion
            label={allIds.length >= 4 ? `Los 4 juntos` : `Coincidencias`}
            playerIds={allIds}
            availMap={availMap}
            accentColor="var(--court-deep)"
          />
        )}
        {myPairIds.length >= 2 && availMap && (
          <AvailAccordion
            label="Solo mi pareja"
            playerIds={myPairIds}
            availMap={availMap}
            accentColor="var(--ok)"
          />
        )}
        {!availMap && (
          <div style={{ fontSize:11, color:'var(--ink-soft)', padding:'6px 0' }}>Cargando disponibilidad…</div>
        )}
      </div>
    </div>
  );
}

// ── Active tournament card ────────────────────────────────────────────────

function TournamentPairCard({ tournament, myPlayerId, availMap }) {
  const { name, pairingSystem, status, fixedPartner, pendingMatches, partnersByRound } = tournament;
  const isFixed = pairingSystem === 'fixed_pairs';
  const myPairIds = isFixed && fixedPartner
    ? [myPlayerId, fixedPartner.id].filter(Boolean)
    : [myPlayerId];

  return (
    <div style={{ background:'var(--paper)', borderRadius:16, border:'1px solid var(--line)', overflow:'hidden', marginBottom:12 }}>

      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--line)', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:14, color:'var(--ink)', marginBottom:2 }}>{name}</div>
          <div style={{ fontSize:11, color:'var(--ink-soft)' }}>{PAIRING_LABELS[pairingSystem]||pairingSystem}</div>
        </div>
        <span style={{ fontSize:10, fontWeight:700, flexShrink:0, marginLeft:10,
          color: status==='active'?'var(--ok)':'var(--amber)',
          background: status==='active'?'var(--ok-soft)':'var(--amber-soft)',
          borderRadius:8, padding:'3px 8px' }}>
          {status==='active'?'Activo':'Borrador'}
        </span>
      </div>

      <div style={{ padding:'12px 16px' }}>

        {/* Fixed pair */}
        {isFixed && fixedPartner && (
          <>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--ink-soft)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>
              Tu pareja fija
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:fixedPartner._entry?.status==='absent'?4:2 }}>
              <AvatarMini player={fixedPartner} />
              <div>
                <div style={{ fontWeight:700, fontSize:15, color: fixedPartner._entry?.status==='absent'?'var(--crimson)':'var(--ink)' }}>
                  {fixedPartner.name}
                  {fixedPartner._entry?.status==='absent' && (
                    <span style={{fontSize:9,marginLeft:6,background:'var(--crimson-soft)',color:'var(--crimson)',borderRadius:4,padding:'1px 5px',fontWeight:700,verticalAlign:'middle'}}>BAJA</span>
                  )}
                </div>
                {fixedPartner._entry?.substituteId && fixedPartner._entry?.substitute && (
                  <div style={{fontSize:11,color:'var(--crimson)',fontWeight:600,marginTop:2}}>
                    Sust: {fixedPartner._entry.substitute.name}
                    {fixedPartner._entry.absenceNote && <span style={{fontWeight:400,color:'var(--ink-soft)',marginLeft:4}}>· {fixedPartner._entry.absenceNote}</span>}
                  </div>
                )}
              </div>
            </div>
            {availMap && (
              <AvailAccordion
                label="Disponibilidad conjunta"
                playerIds={myPairIds}
                availMap={availMap}
                accentColor="var(--court)"
              />
            )}
          </>
        )}

        {isFixed && !fixedPartner && (
          <div style={{ fontSize:13, color:'var(--ink-soft)', textAlign:'center', padding:'10px 0' }}>
            Sin pareja asignada aún
          </div>
        )}

        {/* Non-fixed: round history */}
        {!isFixed && (
          <>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--ink-soft)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>
              Parejas por ronda
            </div>
            {(partnersByRound||[]).length === 0 ? (
              <div style={{ fontSize:13, color:'var(--ink-soft)' }}>Los partidos aún no se han generado</div>
            ) : (
              partnersByRound.map(({ round, partners, status: ms }) => (
                <div key={round} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:'1px solid var(--line)' }}>
                  <div style={{ minWidth:36, fontSize:11, fontWeight:700, color:'var(--ink-soft)' }}>R{round}</div>
                  {partners.length > 0
                    ? partners.map(p => (
                        <div key={p.id} style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <AvatarMini player={p} />
                          <span style={{ fontSize:12, fontWeight:600, color:'var(--ink)' }}>{p.name?.split(' ')[0]}</span>
                        </div>
                      ))
                    : <span style={{ fontSize:12, color:'var(--ink-soft)' }}>Solo / Sin pareja</span>
                  }
                  {ms === 'completed' && (
                    <span style={{ fontSize:11, color:'var(--ok)', fontWeight:700, marginLeft:'auto' }}>✓</span>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {/* Upcoming matches with availability */}
        {isFixed && fixedPartner && (pendingMatches||[]).length > 0 && (
          <>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--ink-soft)', textTransform:'uppercase', letterSpacing:'0.07em', marginTop:16, marginBottom:8 }}>
              Próximos partidos — coordinar
            </div>
            {pendingMatches.map(m => (
              <MatchAvailCard
                key={m.id}
                match={m}
                myPairIds={myPairIds}
                availMap={availMap}
              />
            ))}
          </>
        )}

        {isFixed && fixedPartner && (pendingMatches||[]).length === 0 && (
          <div style={{ fontSize:12, color:'var(--ink-soft)', marginTop:10 }}>
            No hay partidos pendientes en este torneo.
          </div>
        )}
      </div>
    </div>
  );
}

// ── History card (compact) ────────────────────────────────────────────────

function HistoryCard({ tournament }) {
  const { name, pairingSystem, status, fixedPartner, partnersByRound } = tournament;
  const isFixed = pairingSystem === 'fixed_pairs';
  const statusLabel = { completed:'Finalizado', cancelled:'Cancelado', archived:'Archivado' }[status] || status;

  return (
    <div style={{ background:'var(--paper)', borderRadius:12, border:'1px solid var(--line)', padding:'10px 14px', marginBottom:6 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:13, color:'var(--ink-mid)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
          <div style={{ fontSize:11, color:'var(--ink-soft)', marginTop:2 }}>{PAIRING_LABELS[pairingSystem]||pairingSystem}</div>
          {isFixed && fixedPartner && (
            <div style={{ fontSize:11, color:'var(--ink-soft)', marginTop:3 }}>Pareja: {fixedPartner.name}</div>
          )}
          {!isFixed && (partnersByRound||[]).length > 0 && (
            <div style={{ fontSize:11, color:'var(--ink-soft)', marginTop:3 }}>{partnersByRound.length} rondas jugadas</div>
          )}
        </div>
        <span style={{ fontSize:10, fontWeight:600, color:'var(--ink-soft)', background:'var(--bone-2)', borderRadius:6, padding:'2px 7px', flexShrink:0, marginLeft:8 }}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function MyPair() {
  const { user }   = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [availMap, setAvailMap]       = useState(null);
  const [loading,  setLoading]        = useState(true);
  const [error,    setError]          = useState('');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const myPlayerId = user?.player?.id;
        if (!myPlayerId) { setError('No se encontró tu perfil de jugador'); return; }

        const tRes = await tournamentInstanceService.getAll();
        const mine = (tRes.data || []).filter(t =>
          (t.participants || []).some(p => p.playerId === myPlayerId)
        );

        const enriched = await Promise.all(mine.map(async (t) => {
          const myPart = t.participants.find(p => p.playerId === myPlayerId);

          if (t.pairingSystem === 'fixed_pairs') {
            const partnerEntry = t.participants.find(p =>
              p.playerId !== myPlayerId &&
              (p.playerId === myPart?.partnerId || p.partnerId === myPlayerId)
            );
            const fixedPartner = partnerEntry?.player
              ? { ...partnerEntry.player, _entry: partnerEntry }
              : null;
            let pendingMatches = [];

            if (t.status === 'active' || t.status === 'draft') {
              try {
                const detail   = await tournamentInstanceService.getById(t.id);
                const partMap  = {};
                (detail.data?.participants || []).forEach(p => { partMap[p.id] = p; });
                const myPId    = myPart?.id;

                pendingMatches = (detail.data?.matches || [])
                  .filter(m => m.status !== 'completed')
                  .filter(m => {
                    if (m.group) {
                      try { const g = JSON.parse(m.group); return g.team1?.includes(myPId) || g.team2?.includes(myPId); }
                      catch { return false; }
                    }
                    return m.participant1Id === myPId || m.participant2Id === myPId;
                  })
                  .map(m => {
                    let myPIds = [], oppPIds = [];
                    if (m.group) {
                      try {
                        const g = JSON.parse(m.group);
                        [myPIds, oppPIds] = g.team1?.includes(myPId)
                          ? [g.team1 || [], g.team2 || []]
                          : [g.team2 || [], g.team1 || []];
                      } catch { myPIds = [myPId]; }
                    } else {
                      myPIds  = [myPId];
                      oppPIds = [m.participant1Id === myPId ? m.participant2Id : m.participant1Id].filter(Boolean);
                    }

                    // expand each participant ID to include their fixed partner
                    const expand = ids => {
                      const ex = [...ids];
                      ids.forEach(pid => {
                        const pPId = partMap[pid]?.partnerId;
                        if (pPId && !ex.includes(pPId)) ex.push(pPId);
                      });
                      return ex;
                    };

                    const myAll  = expand(myPIds);
                    const oppAll = expand(oppPIds);

                    const toPlayers = pids => pids.map(pid => partMap[pid]?.player?.id).filter(Boolean);
                    const toNames   = pids => pids.map(pid => partMap[pid]?.player?.name?.split(' ')[0]).filter(Boolean);

                    return {
                      id:               m.id,
                      round:            m.round,
                      myPlayerIds:      toPlayers(myAll),
                      opponentPlayerIds: toPlayers(oppAll),
                      opponentNames:    toNames(oppAll),
                    };
                  });
              } catch { /* non-critical */ }
            }

            return { ...t, myPart, fixedPartner, pendingMatches, isFixed: true };
          }

          // Non-fixed: build partner-by-round history
          try {
            const detail  = await tournamentInstanceService.getById(t.id);
            const partMap = {};
            (detail.data?.participants || []).forEach(p => { partMap[p.id] = p.player; });
            const myPId = myPart?.id;

            const myMatches = (detail.data?.matches || []).filter(m => {
              if (m.group) {
                try { const g = JSON.parse(m.group); return g.team1?.includes(myPId) || g.team2?.includes(myPId); }
                catch { return false; }
              }
              return m.participant1Id === myPId || m.participant2Id === myPId;
            });

            const partnersByRound = myMatches.map(m => {
              let partnerIds = [];
              if (m.group) {
                try {
                  const g = JSON.parse(m.group);
                  const myTeam = g.team1?.includes(myPId) ? g.team1 : g.team2;
                  partnerIds = (myTeam || []).filter(id => id !== myPId);
                } catch {}
              }
              return { round: m.round, partners: partnerIds.map(id => partMap[id]).filter(Boolean), status: m.status };
            });

            return { ...t, myPart, partnersByRound, isFixed: false };
          } catch {
            return { ...t, myPart, partnersByRound: [], isFixed: false };
          }
        }));

        setTournaments(enriched);

        // Collect all player IDs that need availability loaded
        const playerIds = [...new Set([
          myPlayerId,
          ...enriched.flatMap(t => [
            t.isFixed ? t.fixedPartner?.id : null,
            ...(t.pendingMatches || []).flatMap(m => [
              ...(m.myPlayerIds || []),
              ...(m.opponentPlayerIds || []),
            ]),
          ].filter(Boolean))
        ])];

        const results = await Promise.all(
          playerIds.map(id => availabilityService.getByPlayer(id).catch(() => ({ data: { slots: {} } })))
        );
        const map = {};
        playerIds.forEach((id, i) => { map[id] = results[i].data?.slots || {}; });
        setAvailMap(map);

      } catch (e) {
        console.error(e);
        setError('Error al cargar datos: ' + e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:'80px 0', color:'var(--ink-soft)' }}>
      Cargando…
    </div>
  );
  if (error) return (
    <div style={{ padding:16, textAlign:'center', color:'var(--crimson)', background:'var(--crimson-soft)', margin:12, borderRadius:12 }}>
      {error}
    </div>
  );

  const myPlayerId = user?.player?.id;
  const active  = tournaments.filter(t => t.status === 'active' || t.status === 'draft');
  const history = tournaments.filter(t => t.status !== 'active' && t.status !== 'draft');

  return (
    <div style={{ paddingBottom:16 }}>

      {/* Header */}
      <div style={{ padding:'20px 16px 14px' }}>
        <h1 style={{ fontFamily:'var(--display)', fontSize:26, fontWeight:700, color:'var(--ink)', letterSpacing:'-0.02em', lineHeight:1.1, marginBottom:4 }}>
          Mis <em style={{ color:'var(--court-deep)', fontStyle:'normal' }}>parejas.</em>
        </h1>
        <div style={{ fontSize:12, color:'var(--ink-soft)' }}>
          Disponibilidad y coordinación de partidos
        </div>
      </div>

      <div style={{ padding:'0 16px' }}>

        {/* Active tournaments */}
        {active.length === 0 && (
          <div style={{ background:'var(--bone-2)', borderRadius:12, padding:'20px', textAlign:'center', fontSize:13, color:'var(--ink-soft)' }}>
            No estás inscrito en ningún torneo activo.
          </div>
        )}

        {active.map(t => (
          <TournamentPairCard key={t.id} tournament={t} myPlayerId={myPlayerId} availMap={availMap} />
        ))}

        {/* History toggle */}
        {history.length > 0 && (
          <div style={{ marginTop:8 }}>
            <button
              onClick={() => setShowHistory(v => !v)}
              style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'10px 14px', borderRadius:12, border:'1px solid var(--line)',
                background:'var(--bone-2)', cursor:'pointer', textAlign:'left', marginBottom: showHistory ? 6 : 0 }}>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--ink-mid)' }}>
                Historial ({history.length} torneo{history.length !== 1 ? 's' : ''})
              </span>
              <span style={{ fontSize:12, color:'var(--ink-soft)' }}>{showHistory ? '▲' : '▼'}</span>
            </button>
            {showHistory && history.map(t => (
              <HistoryCard key={t.id} tournament={t} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
