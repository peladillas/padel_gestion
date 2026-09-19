// SCOREBOARD VARIANT — stadium panel with cromos flanking a central vs
function ScoreboardCard({ match, expanded, onToggle, onPropose, onAccept, onReject }) {
  const f = fmtDate(match.scheduledAt);
  const [w1, w2] = calcWins(
    (match.sets||[]).map(s => match.iAmTeam1 ? {me:s.me,rival:s.rival} : {me:s.rival,rival:s.me})
  );
  const hasScore = match.sets && match.sets.length > 0;

  const myNames = match.myTeam.map(p => `${p.first}${p.last?` ${p.last}`:''}`).join(' · ');
  const oppNames = match.oppTeam.map(p => `${p.first}${p.last?` ${p.last}`:''}`).join(' · ');

  const cls = `sb-card ${expanded?'expanded':''} ${match.status==='they-propose'?'alert':''}`;

  return (
    <div className={cls}>
      <div className="sb-top">
        <div>
          <div className="sb-top-tour">{match.tournament.short}</div>
          <div className="sb-top-round">{match.round} · {match.venue}</div>
        </div>
        <div className="sb-when">
          {f.day} {f.n} {f.mo} · {f.time}h
        </div>
      </div>

      <div className="sb-stadium">
        <div className="sb-side">
          <div className="label">Mi equipo</div>
          <div className="crew">
            {match.myTeam.map(p => <Cromo key={p.id} player={p} me={p.id==='me'} />)}
          </div>
          <div style={{fontFamily:'var(--display)',fontSize:13,color:'var(--ink)',fontWeight:500,maxWidth:240}}>{myNames}</div>
        </div>
        <div className="sb-mid">
          <div className="vs">vs</div>
          {hasScore ? (
            <div style={{fontFamily:'var(--display)',fontSize:48,fontWeight:500,letterSpacing:'-0.03em',lineHeight:1}}>
              <span style={{color:'var(--court-deep)'}}>{w1}</span>
              <span style={{color:'var(--ink-soft)',margin:'0 8px',fontWeight:300}}>–</span>
              <span>{w2}</span>
            </div>
          ) : (
            <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink-soft)',letterSpacing:'0.14em'}}>
              SIN JUGAR
            </div>
          )}
          <div className="status-row"><StatusPill status={match.status} /></div>
        </div>
        <div className="sb-side right">
          <div className="label">Rival</div>
          <div className="crew">
            {match.oppTeam.map(p => <Cromo key={p.id} player={p} />)}
          </div>
          <div style={{fontFamily:'var(--display)',fontSize:13,color:'var(--ink)',fontWeight:500,textAlign:'right',maxWidth:240}}>{oppNames}</div>
        </div>
      </div>

      {hasScore && (
        <div className="sb-score">
          {match.sets.map((s,i) => {
            const my = match.iAmTeam1 ? s.me : s.rival;
            const rv = match.iAmTeam1 ? s.rival : s.me;
            const won = my > rv;
            return (
              <div key={i} className={`sb-set ${won?'won':''}`}>
                <span className="sb-set-label">SET {i+1}</span>
                <span className="sb-set-nums"><span className="me">{my}</span> <span style={{color:'var(--ink-soft)'}}>–</span> {rv}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="sb-footer">
        <div className="meta">
          {match.status === 'i-proposed' && <>⏱ Auto-confirma en {match.expiresInH}h</>}
          {match.status === 'they-propose' && <span style={{color:'var(--crimson)',fontWeight:600}}>▸ Acción requerida</span>}
          {match.status === 'completed' && <>Resultado oficial</>}
          {match.status === 'pending' && <>{match.commonAvail?`${match.commonAvail.length} días con disponibilidad común`:'Sin disponibilidad común'}</>}
          {match.status === 'rejected' && <span style={{color:'var(--crimson)'}}>Propuesta rechazada — vuelve a intentarlo</span>}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onToggle}>
          {expanded ? 'Cerrar' : (match.status==='they-propose'?'Revisar →':'Detalles')}
        </button>
      </div>

      {expanded && <ExpandBody match={match} onPropose={onPropose} onAccept={onAccept} onReject={onReject} />}
    </div>
  );
}

function ScoreboardGrid({ matches, expandedId, onToggle, onPropose, onAccept, onReject }) {
  if (!matches.length) {
    return <div className="empty">
      <div className="empty-n">00</div>
      <div className="empty-m">No hay partidos en esta vista</div>
    </div>;
  }
  return (
    <div className="sb-grid">
      {matches.map(m => (
        <ScoreboardCard key={m.id} match={m}
          expanded={expandedId===m.id}
          onToggle={() => onToggle(m.id)}
          onPropose={(data)=>onPropose(m.id, data)}
          onAccept={()=>onAccept(m.id)}
          onReject={()=>onReject(m.id)}
        />
      ))}
    </div>
  );
}

Object.assign(window, { ScoreboardGrid });
