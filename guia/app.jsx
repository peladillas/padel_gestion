const { useState: useS, useMemo: useM, useEffect: useE } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "variant": "editorial",
  "showTweaks": false,
  "density": "comfy",
  "accent": "court"
}/*EDITMODE-END*/;

function App() {
  const [variant, setVariant] = useS(TWEAK_DEFAULTS.variant);
  const [tab, setTab] = useS('pending'); // pending | completed | action
  const [tournamentFilter, setTournamentFilter] = useS('all');
  const [search, setSearch] = useS('');
  const [expandedId, setExpandedId] = useS(null);
  const [matches, setMatches] = useS(MATCHES);
  const [toast, setToast] = useS('');
  const [tweaksOn, setTweaksOn] = useS(TWEAK_DEFAULTS.showTweaks);

  // --- Edit mode wiring
  useE(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOn(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOn(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  const persist = (key, value) => {
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: value } }, '*');
  };

  // --- Stats
  const pending = matches.filter(m => m.status !== 'completed' && m.status !== 'rejected');
  const completed = matches.filter(m => m.status === 'completed');
  const action = matches.filter(m => m.status === 'they-propose');

  // --- Filter
  const base = tab==='pending' ? matches.filter(m => m.status!=='completed')
             : tab==='completed' ? completed
             : action;
  const filtered = base
    .filter(m => tournamentFilter==='all' || m.tournament.id===tournamentFilter)
    .filter(m => {
      if (!search) return true;
      const q = search.toLowerCase();
      return [...m.myTeam, ...m.oppTeam].some(p => `${p.first} ${p.last}`.toLowerCase().includes(q));
    });

  // --- Actions
  const flash = (msg) => { setToast(msg); setTimeout(()=>setToast(''), 2600); };

  const onPropose = (id, data) => {
    setMatches(prev => prev.map(m => m.id===id ? {
      ...m, status:'i-proposed', sets:data.sets.map(s=>({me:+s.me,rival:+s.rival})),
      proposedBy:'me', expiresInH:24
    } : m));
    setExpandedId(null);
    flash('Propuesta enviada · auto-confirma en 24h si no hay respuesta');
  };
  const onAccept = (id) => {
    setMatches(prev => prev.map(m => m.id===id ? {
      ...m, status:'completed', outcome: (()=>{
        const [w1,w2] = calcWins(m.sets.map(s=>m.iAmTeam1?{me:s.me,rival:s.rival}:{me:s.rival,rival:s.me}));
        return w1>w2?'win':'loss';
      })()
    } : m));
    setExpandedId(null);
    flash('✓ Resultado confirmado');
  };
  const onReject = (id) => {
    setMatches(prev => prev.map(m => m.id===id ? { ...m, status:'rejected', sets:[] } : m));
    setExpandedId(null);
    flash('Propuesta rechazada');
  };
  const onToggle = (id) => setExpandedId(prev => prev===id ? null : id);

  // --- Tournament chips
  const tours = [{id:'all',label:'Todos', count:base.length}]
    .concat(Object.values(TOURNAMENTS).map(t => ({
      id:t.id, label:t.name, count: base.filter(m=>m.tournament.id===t.id).length
    })).filter(x=>x.count>0));

  const setVariantPersist = (v) => { setVariant(v); persist('variant', v); };

  const List = variant==='editorial' ? EditorialList
             : variant==='scoreboard' ? ScoreboardGrid
             : RailList;

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div className="brand-word">Bonapinta<small>Club · Pàdel</small></div>
        </div>

        <nav className="nav">
          <div className="nav-section">Principal</div>
          <div className="nav-item"><span className="dot"/>Inicio</div>
          <div className="nav-item"><span className="dot"/>Mi pareja</div>
          <div className="nav-item active"><span className="dot"/>Partidos<span className="count">{pending.length}</span></div>
          <div className="nav-item"><span className="dot"/>Torneos<span className="count">4</span></div>
          <div className="nav-section">Club</div>
          <div className="nav-item"><span className="dot"/>Jugadores<span className="count">11</span></div>
          <div className="nav-item"><span className="dot"/>Valorar</div>
          <div className="nav-item"><span className="dot"/>Perfil</div>
        </nav>

        <div className="sb-me">
          <div className="sb-me-avatar">YO</div>
          <div>
            <div className="sb-me-name">Tú</div>
            <div className="sb-me-sub">NIV. 7 · 82 OVR</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <header className="page-head">
          <div>
            <div className="eyebrow">
              <span className="live">Temporada abierta</span>
              <span className="sep">·</span>
              <span>Semana 16</span>
              <span className="sep">·</span>
              <span>{new Date().toLocaleDateString('es-ES',{day:'numeric',month:'long'})}</span>
            </div>
            <h1 className="page-title">
              Mis <em>partidos.</em>
            </h1>
          </div>

          <div className="page-stats">
            <div className="kpi">
              <div className="kpi-n accent">{pending.length}</div>
              <div className="kpi-l">Pendientes</div>
            </div>
            {action.length > 0 && (
              <div className="kpi">
                <div className="kpi-n amber">{action.length}</div>
                <div className="kpi-l">Por confirmar</div>
              </div>
            )}
            <div className="kpi">
              <div className="kpi-n">{completed.length}</div>
              <div className="kpi-l">Jugados</div>
            </div>
          </div>
        </header>

        <div className="controls">
          <div className="search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <input placeholder="Buscar por jugador..." value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          {tours.length > 1 && tours.map(t => (
            <button key={t.id} className={`chip ${tournamentFilter===t.id?'on':''}`}
              onClick={()=>setTournamentFilter(t.id)}>
              {t.label}<span className="count">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="controls" style={{marginBottom:22}}>
          <div className="tabbar">
            <button className={`tab ${tab==='pending'?'on':''}`} onClick={()=>setTab('pending')}>
              Pendientes · {matches.filter(m=>m.status!=='completed').length}
            </button>
            {action.length>0 && (
              <button className={`tab ${tab==='action'?'on':''}`} onClick={()=>setTab('action')}>
                Por confirmar · {action.length}
              </button>
            )}
            <button className={`tab ${tab==='completed'?'on':''}`} onClick={()=>setTab('completed')}>
              Jugados · {completed.length}
            </button>
          </div>
          <div className="layout-switcher">
            <button className={variant==='editorial'?'on':''} onClick={()=>setVariantPersist('editorial')}>Editorial</button>
            <button className={variant==='scoreboard'?'on':''} onClick={()=>setVariantPersist('scoreboard')}>Scoreboard</button>
            <button className={variant==='rail'?'on':''} onClick={()=>setVariantPersist('rail')}>Rail</button>
          </div>
        </div>

        <List
          matches={filtered}
          expandedId={expandedId}
          onToggle={onToggle}
          onPropose={onPropose}
          onAccept={onAccept}
          onReject={onReject}
        />

        <footer style={{marginTop:60,paddingTop:20,borderTop:'1px solid var(--line)',display:'flex',justifyContent:'space-between',fontFamily:'var(--mono)',fontSize:11,color:'var(--ink-soft)',letterSpacing:'0.08em'}}>
          <span>BONAPINTA · PADEL CLUB</span>
          <span>VARIANTE · {variant.toUpperCase()}</span>
          <span>{filtered.length} RESULTADOS</span>
        </footer>
      </main>

      {/* Toast */}
      {toast && (
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',
          background:'var(--ink)',color:'var(--bone)',padding:'12px 20px',borderRadius:10,
          fontSize:13,fontWeight:500,boxShadow:'0 10px 30px rgba(0,0,0,0.25)',zIndex:60,
          fontFamily:'var(--sans)'}}>
          {toast}
        </div>
      )}

      {/* Tweaks */}
      <div className={`tweaks ${tweaksOn?'on':''}`}>
        <h5>Tweaks <button className="close" onClick={()=>setTweaksOn(false)}>×</button></h5>
        <div className="grp">
          <div className="grp-label">Variante</div>
          <div className="opts">
            <button className={`opt ${variant==='editorial'?'on':''}`} onClick={()=>setVariantPersist('editorial')}>Editorial</button>
            <button className={`opt ${variant==='scoreboard'?'on':''}`} onClick={()=>setVariantPersist('scoreboard')}>Scoreboard</button>
            <button className={`opt ${variant==='rail'?'on':''}`} onClick={()=>setVariantPersist('rail')}>Rail</button>
          </div>
        </div>
        <div className="grp">
          <div className="grp-label">Probar estados</div>
          <div className="opts">
            <button className="opt" onClick={()=>setExpandedId('m1')}>Rival propone</button>
            <button className="opt" onClick={()=>setExpandedId('m2')}>Yo propuse</button>
            <button className="opt" onClick={()=>setExpandedId('m3')}>Proponer</button>
            <button className="opt" onClick={()=>{setTab('completed');setExpandedId('m5');}}>Completado</button>
          </div>
        </div>
        <div className="grp">
          <div className="grp-label">Acción</div>
          <div className="opts">
            <button className="opt" onClick={()=>{setMatches(MATCHES);setExpandedId(null);flash('Datos reiniciados');}}>Reset</button>
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
