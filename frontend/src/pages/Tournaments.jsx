import { useState, useEffect } from 'react';
import { tournamentService } from '../services/api';

const LABELS = {
  structures: {
    round_robin:'Todos contra todos', eliminacion_directa:'Eliminación directa',
    grupos_eliminatoria:'Grupos + Playoff', pozo:'Pozo (subida/bajada)',
    rey_pista:'Rey de pista', ladder:'Ladder (ranking)', consolacion:'Con consolación',
    maraton:'Maratón', express:'Express'
  },
  pairingSystems: {
    fixed_pairs:'Parejas fijas', americana_clasica:'Americana clásica',
    americana_perfecta:'Americana perfecta', americana_mixta:'Americana mixta',
    mexicano:'Mexicano', beat_the_box:'Beat the box'
  },
  matchFormats: {
    sets_completos:'Sets completos (BO3)', sets_cortos:'Sets cortos',
    super_tiebreak:'Super tie-break', tiebreak_directo:'Tie-break directo',
    por_tiempo:'Por tiempo'
  },
  byeRules: {
    none:'Sin ausencias', auto_win:'Victoria automática',
    ghost_player:'Jugador fantasma', rest_round:'Descanso sin puntos'
  }
};

const ICONS = {
  round_robin:'🔄', eliminacion_directa:'⚔️', grupos_eliminatoria:'🏆',
  pozo:'📊', rey_pista:'👑', ladder:'📈', consolacion:'🥈', maraton:'🏃', express:'⚡'
};

function TournamentForm({ initial, compatibility, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    name:'', description:'', structure:'round_robin',
    pairingSystem:'fixed_pairs', matchFormat:'sets_completos', byeRule:'none'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const rec = compatibility?.recommendations?.[form.structure];

  const S = {
    inp: {width:'100%',border:'1px solid var(--line)',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',boxSizing:'border-box'},
    sel: {width:'100%',border:'1px solid var(--line)',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',background:'white'},
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await onSave(form); }
    catch(err) { setError(err.response?.data?.error||'Error'); setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={{background:'white',borderRadius:16,border:'1px solid var(--bone-3)',padding:16,display:'flex',flexDirection:'column',gap:12}}>
      <div style={{fontWeight:700,fontSize:14,color:'var(--ink-2)'}}>{initial?'Editar preset':'Nuevo preset de torneo'}</div>

      <div>
        <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:4}}>Nombre del preset *</label>
        <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} required placeholder="Ej: Americana de club" style={S.inp}/>
      </div>

      <div>
        <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:4}}>Descripción</label>
        <input value={form.description||''} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="Descripción opcional" style={S.inp}/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <div>
          <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:4}}>Estructura *</label>
          <select value={form.structure} onChange={e=>setForm(p=>({...p,structure:e.target.value}))} style={S.sel}>
            {(compatibility?.structures||[]).map(s=>(
              <option key={s} value={s}>{ICONS[s]} {LABELS.structures[s]||s}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:4}}>Emparejamiento *</label>
          <select value={form.pairingSystem} onChange={e=>setForm(p=>({...p,pairingSystem:e.target.value}))} style={S.sel}>
            {(compatibility?.pairingSystems||[]).map(s=>(
              <option key={s} value={s}>{LABELS.pairingSystems[s]||s}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:4}}>Formato de partido *</label>
          <select value={form.matchFormat} onChange={e=>setForm(p=>({...p,matchFormat:e.target.value}))} style={S.sel}>
            {(compatibility?.matchFormats||[]).map(s=>(
              <option key={s} value={s}>{LABELS.matchFormats[s]||s}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:4}}>Regla de ausencias</label>
          <select value={form.byeRule} onChange={e=>setForm(p=>({...p,byeRule:e.target.value}))} style={S.sel}>
            {(compatibility?.byeRules||[]).map(s=>(
              <option key={s} value={s}>{LABELS.byeRules[s]||s}</option>
            ))}
          </select>
        </div>
      </div>

      {rec && (
        <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:8,padding:'8px 12px',fontSize:12,color:'var(--court-deep)'}}>
          💡 Recomendado para esta estructura: <strong>{LABELS.byeRules[rec.byeRule]}</strong>
          {form.byeRule !== rec.byeRule && (
            <button type="button" onClick={()=>setForm(p=>({...p,byeRule:rec.byeRule}))}
              style={{marginLeft:8,fontSize:11,background:'var(--court)',border:'none',borderRadius:4,padding:'2px 8px',color:'var(--ink)',cursor:'pointer'}}>
              Aplicar
            </button>
          )}
        </div>
      )}

      {error && <div style={{background:'#fef2f2',color:'var(--crimson)',borderRadius:8,padding:'8px 12px',fontSize:12}}>{error}</div>}

      <div style={{display:'flex',gap:8}}>
        <button type="button" onClick={onCancel} style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--line)',background:'white',fontSize:13,cursor:'pointer'}}>Cancelar</button>
        <button type="submit" disabled={loading} style={{flex:2,padding:'10px',borderRadius:10,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:'pointer',opacity:loading?0.6:1}}>
          {loading?'Guardando...':initial?'Guardar cambios':'Crear preset'}
        </button>
      </div>
    </form>
  );
}

export default function Tournaments() {
  const [tournaments,    setTournaments]    = useState([]);
  const [compatibility,  setCompatibility]  = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [showForm,       setShowForm]       = useState(false);
  const [editItem,       setEditItem]       = useState(null);
  const [msg,            setMsg]            = useState('');

  useEffect(()=>{
    async function load() {
      try {
        const [tRes, cRes] = await Promise.all([
          tournamentService.getAll(),
          tournamentService.getCompatibility()
        ]);
        setTournaments(tRes.data||[]);
        setCompatibility(cRes.data);
      } catch(e){console.error(e);}
      finally{setLoading(false);}
    }
    load();
  },[]);

  const notify = (m) => { setMsg(m); setTimeout(()=>setMsg(''),3000); };

  const handleCreate = async (form) => {
    const res = await tournamentService.create(form);
    setTournaments(p=>[res.data,...p]);
    setShowForm(false);
    notify('✅ Preset creado');
  };

  const handleUpdate = async (form) => {
    const res = await tournamentService.update(editItem.id, form);
    setTournaments(p=>p.map(t=>t.id===editItem.id?res.data:t));
    setEditItem(null);
    notify('✅ Preset actualizado');
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este preset?')) return;
    await tournamentService.delete(id);
    setTournaments(p=>p.filter(t=>t.id!==id));
    notify('✅ Preset eliminado');
  };

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:'80px 0',color:'var(--ink-soft)'}}>Cargando...</div>;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{background:'var(--paper)',borderRadius:20,padding:16,border:'1px solid var(--line)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:11,color:'var(--ink-soft)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Admin</div>
          <div style={{fontWeight:700,fontSize:18,marginTop:4}}>🏆 Presets de torneos</div>
          <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:2}}>{tournaments.length} presets definidos</div>
        </div>
        <button onClick={()=>{setShowForm(true);setEditItem(null);}} style={{background:'var(--court)',border:'none',borderRadius:10,padding:'10px 16px',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:'pointer'}}>
          + Nuevo preset
        </button>
      </div>

      {msg && <div style={{background:'var(--ok-soft)',border:'1px solid #bbf7d0',color:'var(--ok)',borderRadius:10,padding:'10px 14px',fontSize:13}}>{msg}</div>}

      {(showForm && !editItem) && (
        <TournamentForm compatibility={compatibility} onSave={handleCreate} onCancel={()=>setShowForm(false)}/>
      )}

      {editItem && (
        <TournamentForm initial={editItem} compatibility={compatibility} onSave={handleUpdate} onCancel={()=>setEditItem(null)}/>
      )}

      {tournaments.length === 0 ? (
        <div style={{textAlign:'center',padding:'32px 0',color:'var(--ink-soft)',fontSize:13}}>
          No hay presets. Crea el primero.
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {tournaments.map(t=>(
            <div key={t.id} style={{background:'white',borderRadius:14,border:'1px solid var(--bone-3)',padding:'14px 16px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:'var(--ink-2)'}}>
                    {ICONS[t.structure]} {t.name}
                  </div>
                  {t.description && <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:2}}>{t.description}</div>}
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>setEditItem(t)} style={{fontSize:11,background:'var(--bone-3)',border:'none',borderRadius:6,padding:'4px 10px',cursor:'pointer',color:'var(--ink-mid)'}}>Editar</button>
                  <button onClick={()=>handleDelete(t.id)} style={{fontSize:11,background:'#fef2f2',border:'none',borderRadius:6,padding:'4px 10px',cursor:'pointer',color:'var(--crimson)'}}>Eliminar</button>
                </div>
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {[
                  ['Estructura', LABELS.structures[t.structure]||t.structure, '#e0f2fe','var(--court)'],
                  ['Emparej.', LABELS.pairingSystems[t.pairingSystem]||t.pairingSystem, 'var(--ok-soft)','var(--ok)'],
                  ['Formato', LABELS.matchFormats[t.matchFormat]||t.matchFormat, 'var(--amber-soft)','var(--amber)'],
                  ['Ausencias', LABELS.byeRules[t.byeRule]||t.byeRule, '#f5f3ff','var(--court-deep)'],
                ].map(([label,val,bg,color])=>(
                  <div key={label} style={{background:bg,borderRadius:6,padding:'4px 8px'}}>
                    <span style={{fontSize:9,color,fontWeight:700,textTransform:'uppercase'}}>{label}: </span>
                    <span style={{fontSize:11,color,fontWeight:500}}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
