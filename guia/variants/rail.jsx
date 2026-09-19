// RAIL VARIANT — vertical timeline with numbered entries
function RailItem({ match, expanded, onToggle, onPropose, onAccept, onReject }) {
  const f = fmtDate(match.scheduledAt);
  const [w1, w2] = calcWins(
    (match.sets||[]).map(s => match.iAmTeam1 ? {me:s.me,rival:s.rival} : {me:s.rival,rival:s.me})
  );
  const hasScore = match.sets && match.sets.length > 0;

  const cls = `rail-item ${expanded?'expanded':''} ${
    match.status==='they-propose'?'alert':
    match.status==='i-proposed'?'waiting':
    match.status==='completed'?'done':''
  }`;

  return (
    <div className={cls}>
      <div className="rail-num">
        <span className="n">{String(f.n).padStart(2,'0')}</span>
        <span className="mo">{f.mo} · {f.day}</span>
      </div>
      <div className="rail-node" />

      <div className="rail-card">
        <div className="rail-head" onClick={onToggle}>
          <div style={{minWidth:0}}>
            <div className="rail-top">
              <span className="rail-tour">{match.tournament.short}</span>
              <span className="rail-time">{f.time}h · {match.round}</span>
            </div>
            <div className="rail-matchup">
              <span className="rail-team-inline">
                {match.myTeam.map((p,i) => (
                  <React.Fragment key={p.id}>
                    {i>0 && <span className="rail-and">&nbsp;&amp;&nbsp;</span>}
                    <span className={`rail-teamname ${p.id==='me'?'me':''}`}>{p.first}</span>
                  </React.Fragment>
                ))}
              </span>
              <span className="rail-vs">vs</span>
              <span className="rail-team-inline">
                {match.oppTeam.map((p,i) => (
                  <React.Fragment key={p.id}>
                    {i>0 && <span className="rail-and">&nbsp;&amp;&nbsp;</span>}
                    <span className="rail-teamname">{p.first}</span>
                  </React.Fragment>
                ))}
              </span>
            </div>
          </div>
          <div className="rail-right">
            <StatusPill status={match.status} />
            {hasScore
              ? <div className="rail-score-mini"><span className="me">{w1}</span>–{w2}</div>
              : <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink-soft)',letterSpacing:'0.1em'}}>{match.venue.split(' · ')[0]}</div>
            }
          </div>
        </div>

        {!expanded && match.status==='they-propose' && (
          <div className="nudge">▸ {match.oppTeam.map(p=>p.first).join(' & ')} propone un resultado · toca para revisar</div>
        )}

        {expanded && (
          <div style={{padding:'0 18px 18px'}}>
            <ExpandBody match={match}
              onPropose={onPropose}
              onAccept={onAccept}
              onReject={onReject} />
          </div>
        )}
      </div>
    </div>
  );
}

function RailList({ matches, expandedId, onToggle, onPropose, onAccept, onReject }) {
  if (!matches.length) {
    return <div className="empty">
      <div className="empty-n">00</div>
      <div className="empty-m">No hay partidos en esta vista</div>
    </div>;
  }
  return (
    <div className="rail-wrap">
      {matches.map(m => (
        <RailItem key={m.id} match={m}
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

Object.assign(window, { RailList });
