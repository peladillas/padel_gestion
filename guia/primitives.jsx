const { useState, useMemo, useEffect } = React;

// ───────── Cromo (player card) ─────────
function Cromo({ player, size='md', me=false }) {
  return (
    <div className={`cromo ${size==='sm'?'sm':''} ${me?'me':''}`}>
      <div className="cromo-strip">
        <span>NIV·{player.level}</span>
        <span className="ovr">{player.ovr}</span>
      </div>
      <div className="cromo-body">
        <div className="cromo-initials">{player.initials}</div>
      </div>
      <div className="cromo-foot">
        <div className="cromo-first">{player.first}</div>
        <div className="cromo-last">{player.last || '—'}</div>
      </div>
    </div>
  );
}

// ───────── Status pill ─────────
function StatusPill({ status }) {
  if (status === 'completed') return <span className="pill done"><span className="dot"/>Completado</span>;
  if (status === 'i-proposed') return <span className="pill propose"><span className="dot"/>Esperando rival</span>;
  if (status === 'they-propose') return <span className="pill confirm"><span className="dot"/>Confirma resultado</span>;
  if (status === 'rejected') return <span className="pill rejected"><span className="dot"/>Rechazado</span>;
  return <span className="pill neutral"><span className="dot"/>Por jugar</span>;
}

// ───────── Propose form ─────────
function ProposeForm({ match, onSubmit, onCancel }) {
  const [sets, setSets] = useState([{me:'',rival:''},{me:'',rival:''}]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const update = (i, f, v) => setSets(s => s.map((x,idx)=>idx===i?{...x,[f]:v}:x));
  const addSet = () => setSets(s => [...s, {me:'',rival:''}]);
  const removeSet = (i) => setSets(s => s.filter((_,idx)=>idx!==i));

  const valid = sets.filter(s => s.me !== '' && s.rival !== '');
  const [w1, w2] = calcWins(valid.map(s => ({me:+s.me, rival:+s.rival})));
  const canSubmit = valid.length >= 2;

  const myNames = match.myTeam.map(p => p.first).join(' & ');
  const oppNames = match.oppTeam.map(p => p.first).join(' & ');

  return (
    <div className="propose">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
        <h4>Proponer resultado</h4>
        <span className="mono subtle" style={{fontSize:11,letterSpacing:'0.1em'}}>SETS · {valid.length}</span>
      </div>

      <div className="scoreboard">
        <div className="sb-team">
          <div className="sb-team-label">Mi equipo</div>
          <div className="sb-team-names">{myNames}</div>
          <div style={{fontFamily:'var(--display)',fontSize:32,fontWeight:600,color:'var(--court-deep)',lineHeight:1}}>{w1}</div>
        </div>
        <div className="sb-vs">vs</div>
        <div className="sb-team right">
          <div className="sb-team-label">Rival</div>
          <div className="sb-team-names">{oppNames}</div>
          <div style={{fontFamily:'var(--display)',fontSize:32,fontWeight:600,color:'var(--ink)',lineHeight:1}}>{w2}</div>
        </div>
      </div>

      <div style={{display:'grid',gap:8}}>
        {sets.map((s,i) => (
          <div key={i} className="set-row">
            <label>Set {i+1}</label>
            <input className="set-input mine" type="number" min="0" max="7" value={s.me}
              onChange={e=>update(i,'me',e.target.value)} placeholder="—" />
            <span className="dash">—</span>
            <input className="set-input" type="number" min="0" max="7" value={s.rival}
              onChange={e=>update(i,'rival',e.target.value)} placeholder="—" />
          </div>
        ))}
        <div style={{display:'flex',gap:8}}>
          <button className="add-set-btn" style={{flex:1}} onClick={addSet}>+ Añadir set</button>
          {sets.length > 2 && <button className="add-set-btn" onClick={()=>removeSet(sets.length-1)}>−</button>}
        </div>
      </div>

      <div className="datetime-row">
        <div>
          <label>Fecha jugado</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
        </div>
        <div>
          <label>Hora</label>
          <input type="time" value={time} onChange={e=>setTime(e.target.value)} />
        </div>
      </div>

      <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary" disabled={!canSubmit} onClick={()=>onSubmit({sets:valid, date, time})}
          style={{opacity:canSubmit?1:0.5, cursor:canSubmit?'pointer':'default'}}>
          Enviar propuesta →
        </button>
      </div>
    </div>
  );
}

// ───────── Confirm panel (rival proposed) ─────────
function ConfirmPanel({ match, onAccept, onReject }) {
  const [w1,w2] = calcWins(match.sets.map(s=>match.iAmTeam1?{me:s.me,rival:s.rival}:{me:s.rival,rival:s.me}));
  const iWin = w1 > w2;
  const oppNames = match.oppTeam.map(p => p.first).join(' & ');

  return (
    <div className="confirm-panel">
      <div className="confirm-head">
        <h4>{oppNames} propone este resultado</h4>
        <span className="timer">⏱ Auto-confirma en ~{match.expiresInH}h</span>
      </div>
      <div className="confirm-score">
        {match.sets.map((s,i) => {
          const my = match.iAmTeam1 ? s.me : s.rival;
          const rival = match.iAmTeam1 ? s.rival : s.me;
          return (
            <div key={i} className="confirm-set">
              <span className="tiny">Set {i+1}</span>
              <span className="me">{my}</span> <span style={{color:'var(--ink-soft)'}}>—</span> <span>{rival}</span>
            </div>
          );
        })}
        <div style={{marginLeft:'auto',fontFamily:'var(--display)',fontSize:14,color:'var(--amber)',fontWeight:500}}>
          Si aceptas: <strong style={{color:iWin?'var(--ok)':'var(--crimson)'}}>{iWin?'Victoria':'Derrota'}</strong>
        </div>
      </div>
      <div className="confirm-actions">
        <button className="btn btn-primary" onClick={onAccept} style={{flex:1}}>✓ Confirmar resultado</button>
        <button className="btn btn-ghost" onClick={onReject}>Rechazar</button>
      </div>
    </div>
  );
}

// ───────── Availability block ─────────
function AvailabilityBlock({ match }) {
  if (!match.commonAvail || !match.commonAvail.length) return null;
  const totalSlots = match.commonAvail.reduce((a,d)=>a+d.slots.length,0);
  return (
    <div className="avail">
      <div className="avail-head">
        <span className="avail-title">Disponibilidad conjunta · los 4</span>
        <span className="avail-count">{match.commonAvail.length} días · {totalSlots} huecos</span>
      </div>
      <div className="avail-grid">
        {match.commonAvail.map((d,i) => (
          <div key={i} className="avail-row">
            <div className="avail-day">
              {d.day} {d.date}<small>{d.month}</small>
            </div>
            <div className="avail-slots">
              {d.slots.map(s => <span key={s} className="avail-slot">{s}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────── Expand body (shared by all variants) ─────────
function ExpandBody({ match, onPropose, onAccept, onReject, onReopenForm }) {
  const [form, setForm] = useState(false);

  if (match.status === 'they-propose') {
    return (
      <div className="expand">
        <ConfirmPanel match={match} onAccept={onAccept} onReject={onReject} />
      </div>
    );
  }
  if (match.status === 'i-proposed') {
    const oppNames = match.oppTeam.map(p=>p.first).join(' & ');
    const [w1,w2] = calcWins(match.sets.map(s=>match.iAmTeam1?{me:s.me,rival:s.rival}:{me:s.rival,rival:s.me}));
    return (
      <div className="expand">
        <div className="propose">
          <h4>Tu propuesta · en espera</h4>
          <div className="scoreboard">
            <div className="sb-team">
              <div className="sb-team-label">Mi equipo</div>
              <div className="sb-team-names">{match.myTeam.map(p=>p.first).join(' & ')}</div>
              <div style={{fontFamily:'var(--display)',fontSize:44,fontWeight:600,color:'var(--court-deep)',lineHeight:1,letterSpacing:'-0.02em'}}>{w1}</div>
            </div>
            <div className="sb-vs">vs</div>
            <div className="sb-team right">
              <div className="sb-team-label">Rival</div>
              <div className="sb-team-names">{oppNames}</div>
              <div style={{fontFamily:'var(--display)',fontSize:44,fontWeight:600,lineHeight:1,letterSpacing:'-0.02em'}}>{w2}</div>
            </div>
          </div>
          <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--amber)',letterSpacing:'0.06em',textAlign:'center'}}>
            ⏱ Auto-confirma en ~{match.expiresInH}h si {oppNames} no responde
          </div>
        </div>
      </div>
    );
  }
  if (match.status === 'completed') {
    return (
      <div className="expand">
        <AvailabilityBlock match={match} />
      </div>
    );
  }
  // pending / rejected
  return (
    <div className="expand">
      {match.commonAvail && <AvailabilityBlock match={match} />}
      {form
        ? <ProposeForm match={match}
            onSubmit={(data) => { onPropose(data); setForm(false); }}
            onCancel={()=>setForm(false)} />
        : <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div className="mono subtle" style={{fontSize:11,letterSpacing:'0.08em'}}>
              📍 {match.venue}
            </div>
            <div className="spacer" />
            <button className="btn btn-ghost btn-sm">Ver disponibilidad completa</button>
            <button className="btn btn-primary" onClick={()=>setForm(true)}>
              {match.status==='rejected' ? '↺ Proponer de nuevo' : '+ Registrar resultado'}
            </button>
          </div>
      }
    </div>
  );
}

// ───────── Cromo strip (for card heads) ─────────
function CromoStrip({ team, size='md', me=false, align='left' }) {
  return (
    <div style={{display:'flex',gap:6,flexDirection: align==='right'?'row-reverse':'row'}}>
      {team.map(p => <Cromo key={p.id} player={p} size={size} me={me && p.id==='me'} />)}
    </div>
  );
}

Object.assign(window, { Cromo, CromoStrip, StatusPill, ProposeForm, ConfirmPanel, AvailabilityBlock, ExpandBody });
