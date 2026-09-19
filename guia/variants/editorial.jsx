// EDITORIAL VARIANT — giant dates, horizontal matchup, newspaper rhythm
const { useState: useStateEd } = React;

function EditorialCard({ match, expanded, onToggle, onPropose, onAccept, onReject, first }) {
  const f = fmtDate(match.scheduledAt);
  const [w1,w2] = calcWins(
    (match.sets||[]).map(s => match.iAmTeam1 ? {me:s.me,rival:s.rival} : {me:s.rival,rival:s.me})
  );
  const hasScore = match.sets && match.sets.length > 0;

  const cls = `ed-card ${first?'first':''} ${expanded?'expanded':''}`;

  return (
    <>
      <div className={cls} onClick={onToggle} style={{cursor:'pointer'}}>
        <div className="ed-date" style={{paddingLeft:24}}>
          <div className="ed-date-day">{f.day}</div>
          <div className="ed-date-n">{f.n}</div>
          <div className="ed-date-mo">{f.mo}</div>
          <div className="ed-date-time">{f.time}h</div>
        </div>

        <div className="ed-body">
          <div className="ed-meta">
            <span className="ed-tour">{match.tournament.short}</span>
            <span style={{color:'var(--line)'}}>·</span>
            <span className="ed-round">{match.round}</span>
          </div>

          <div className="ed-matchup">
            <div className="ed-team">
              <CromoStrip team={match.myTeam} size="sm" me={true} />
              <div className="ed-names-block">
                {match.myTeam.map(p => (
                  <span key={p.id} className={`ed-name ${p.id==='me'?'me':''}`}>{p.first} {p.last}</span>
                ))}
              </div>
            </div>
            <div className="ed-vs-row"><span className="ed-vs">— vs —</span></div>
            <div className="ed-team">
              <CromoStrip team={match.oppTeam} size="sm" />
              <div className="ed-names-block">
                {match.oppTeam.map(p => (
                  <span key={p.id} className="ed-name">{p.first} {p.last}</span>
                ))}
              </div>
            </div>
          </div>

          {hasScore && (
            <div className="ed-score">
              {match.sets.map((s,i) => {
                const my = match.iAmTeam1 ? s.me : s.rival;
                const rv = match.iAmTeam1 ? s.rival : s.me;
                const won = my > rv;
                return <span key={i} className={`ed-set ${won?'won':''}`}>{my}–{rv}</span>;
              })}
            </div>
          )}
        </div>

        <div className="ed-right">
          <StatusPill status={match.status} />
          {hasScore && (
            <div style={{fontFamily:'var(--display)',fontSize:36,fontWeight:500,letterSpacing:'-0.02em',lineHeight:1}}>
              <span style={{color:'var(--court-deep)'}}>{w1}</span>
              <span style={{color:'var(--ink-soft)',margin:'0 6px',fontWeight:300}}>–</span>
              <span>{w2}</span>
            </div>
          )}
          <div className="meta-line">
            {match.venue}
            <br/>
            <span style={{color:'var(--ink)'}}>{expanded?'Cerrar ↑':'Abrir ↓'}</span>
          </div>
        </div>
      </div>
      {expanded && <div className="ed-card" style={{gridTemplateColumns:'1fr',borderBottom:'1px solid var(--ink)',borderBottomWidth:2}}>
        <ExpandBody match={match} onPropose={onPropose} onAccept={onAccept} onReject={onReject} />
      </div>}
    </>
  );
}

function EditorialList({ matches, expandedId, onToggle, onPropose, onAccept, onReject }) {
  if (!matches.length) {
    return <div className="empty">
      <div className="empty-n">00</div>
      <div className="empty-m">No hay partidos en esta vista</div>
    </div>;
  }
  return (
    <div>
      {matches.map((m, i) => (
        <EditorialCard key={m.id} match={m}
          first={i===0}
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

Object.assign(window, { EditorialList });
