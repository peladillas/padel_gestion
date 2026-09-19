import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { tournamentInstanceService, tournamentService, playerService, clubService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  BoltIcon, UsersIcon, TrophyIcon,
  LinkIcon, Cog6ToothIcon, QueueListIcon, ShieldCheckIcon,
  CheckCircleIcon, XCircleIcon, DocumentTextIcon, MapPinIcon,
} from '@heroicons/react/24/outline';

const MsgBanner = ({ msg, style }) => {
  if (!msg) return null;
  const ok = msg.startsWith('✅');
  const text = msg.replace(/^[✅❌]\s?/, '');
  const Icon = ok ? CheckCircleIcon : XCircleIcon;
  return (
    <div style={{
      background: ok ? 'var(--ok-soft)' : 'var(--crimson-soft)',
      border: `1px solid ${ok ? 'var(--ok-soft)' : 'var(--crimson-soft)'}`,
      color: ok ? 'var(--ok)' : 'var(--crimson)',
      borderRadius: 10, padding: '10px 14px', fontSize: 13,
      display: 'flex', alignItems: 'center', gap: 6,
      ...style,
    }}>
      <Icon style={{width:14,height:14,flexShrink:0}} />{text}
    </div>
  );
};

const RESULT_MODE_LABELS = {
  creador: '🛡️ Creador',
  jugador: '🎾 Jugadores',
  arbitro: '🟡 Árbitro',
};

const LABELS = {
  structures: {
    round_robin:'Todos contra todos', eliminacion_directa:'Eliminación directa',
    grupos_eliminatoria:'Grupos + Playoff', pozo:'Pozo', rey_pista:'Rey de pista',
    ladder:'Ladder', consolacion:'Con consolación', maraton:'Maratón', express:'Express',
    cima_padel:'CimaPadel'
  },
  pairingSystems: {
    fixed_pairs:'Parejas fijas', americana_clasica:'Americana clásica',
    americana_perfecta:'Americana perfecta', americana_mixta:'Americana mixta',
    mexicano:'Mexicano', beat_the_box:'Beat the box'
  },
  matchFormats: {
    sets_completos:'Sets completos', sets_cortos:'Sets cortos',
    super_tiebreak:'Super tie-break', tiebreak_directo:'Tie-break directo',
    por_tiempo:'Por tiempo'
  },
  byeRules: {
    none:'Sin byes', auto_win:'Victoria automática',
    ghost_player:'Jugador fantasma', rest_round:'Descanso'
  },
  status: { draft:'Borrador', active:'Activo', completed:'Finalizado', cancelled:'Cancelado', archived:'Archivado' },
  statusColor: { draft:'var(--ink-soft)', active:'var(--court)', completed:'var(--court)', cancelled:'var(--crimson)', archived:'var(--ink-soft)' }
};

const ICONS = {
  round_robin:'🔄', eliminacion_directa:'⚔️', grupos_eliminatoria:'🏆',
  pozo:'📊', rey_pista:'👑', ladder:'📈', consolacion:'🥈', maraton:'🏃', express:'⚡',
  cima_padel:'🍖'
};


const STRUCTURES_LIST = ['round_robin','eliminacion_directa','grupos_eliminatoria','pozo','rey_pista','ladder','consolacion','maraton','express','cima_padel'];
const PAIRING_LIST    = ['fixed_pairs','americana_clasica','americana_perfecta','americana_mixta','mexicano','beat_the_box'];
const FORMAT_LIST     = ['sets_completos','sets_cortos','super_tiebreak','tiebreak_directo','por_tiempo'];
const BYE_LIST        = ['none','auto_win','ghost_player','rest_round'];

const DESCRIPTIONS = {
  structures: {
    round_robin:        'Cada jugador/pareja se enfrenta a todos los demás. Se clasifica por puntos totales al finalizar.',
    eliminacion_directa:'Cuadro eliminatorio: quien pierde queda fuera. Solo los ganadores avanzan hasta la final.',
    grupos_eliminatoria:'Primera fase en grupos (todos contra todos); los mejores de cada grupo pasan a eliminatoria directa.',
    pozo:               'Los participantes se agrupan por nivel. Según resultados se asciende o desciende de grupo.',
    rey_pista:          'Una pareja defiende la pista. La retadora juega para ganar el puesto. Quien más turnos defiende, gana.',
    ladder:             'Ranking en escalera. Cada jugador reta a quien está justo por encima para subir posiciones.',
    consolacion:        'Cuadro principal y cuadro de consolación: los eliminados en 1ª ronda siguen compitiendo.',
    maraton:            'Todos juegan el máximo de partidos posibles sin eliminación. Ideal para jornadas largas.',
    express:            'Formato rápido con partidos cortos pensado para completar el torneo en pocas horas.',
    cima_padel:         'Liga social con rotación de cocina. Siempre 6 parejas fijas. Cada jornada 2 parejas cocinan y 4 juegan (2 partidos). En 3 jornadas cada pareja cocina exactamente una vez. Sin repetición de enfrentamientos dentro del ciclo.',
  },
  pairingSystems: {
    fixed_pairs:        'Las parejas se forman antes de empezar y no cambian en toda la competición.',
    americana_clasica:  'Las parejas rotan cada ronda. Cada jugador juega con y contra todos los participantes.',
    americana_perfecta: 'Rotación optimizada: cada jugador tiene exactamente el mismo número de partidos con cada compañero.',
    americana_mixta:    'Combina rondas con parejas fijas y rondas con rotación americana.',
    mexicano:           'Las parejas se forman dinámicamente según el ranking en tiempo real: ganadores con ganadores, perdedores con perdedores.',
    beat_the_box:       'Una pareja defiende la pista; los retadores van rotando para intentar ganar y ocupar su lugar.',
  },
  matchFormats: {
    sets_completos:     'Partidos a sets completos (6 juegos por set), con tie-break si llegan a 6-6.',
    sets_cortos:        'Sets reducidos (normalmente a 4 juegos). Partidos más rápidos manteniendo la lógica de sets.',
    super_tiebreak:     'Dos sets y, en caso de empate 1-1, un super tie-break a 10 puntos decide el ganador.',
    tiebreak_directo:   'Un único tie-break a 7 (o 10) puntos decide el partido. El formato más rápido.',
    por_tiempo:         'El partido dura un tiempo fijo. Gana la pareja que acumula más juegos cuando acaba el tiempo.',
  },
  byeRules: {
    none:         'No hay jugadores sin rival; el cuadro debe estar completo.',
    auto_win:     'Si un jugador no tiene rival asignado en una ronda, gana automáticamente.',
    ghost_player: 'Se añade un jugador ficticio para equilibrar el cuadro; perder contra él no cuenta como derrota real.',
    rest_round:   'El jugador sin rival descansa esa ronda sin sumar ni restar puntos.',
  },
};

const InfoHint = ({ text }) => !text ? null : (
  <div style={{fontSize:11,color:'var(--bp-text-2)',marginTop:5,padding:'5px 8px',background:'var(--bp-bg)',borderRadius:6,lineHeight:1.5,borderLeft:'2px solid var(--line)'}}>
    {text}
  </div>
);




function CreateTournamentForm({ onSave, onCancel, allowedStructures = null, allowedPairingSystems = null }) {
  // Filter available types: null = all allowed
  const structList  = allowedStructures    ? STRUCTURES_LIST.filter(s => allowedStructures.includes(s))    : STRUCTURES_LIST;
  const pairingList = allowedPairingSystems ? PAIRING_LIST.filter(s => allowedPairingSystems.includes(s)) : PAIRING_LIST;

  const defaultStructure  = structList.includes('round_robin')   ? 'round_robin'   : (structList[0]  || 'round_robin');
  const defaultPairing    = pairingList.includes('fixed_pairs')  ? 'fixed_pairs'   : (pairingList[0] || 'fixed_pairs');

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name:'', description:'', structure: defaultStructure,
    pairingSystem: defaultPairing, matchFormat:'sets_completos',
    byeRule:'none', startDate:'', endDate:'', resultMode:'', arbitroId:'',
    allowInvitations: false, maxParticipants: '', visibility: 'internal',
    frequency: 'free', frequencyDays: '14',
  });
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    playerService.getAll().then(r => setAllUsers(r.data||[])).catch(()=>{});
  }, []);

  const S = {
    inp: {width:'100%',border:'1px solid var(--bp-border)',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',boxSizing:'border-box'},
    sel: {width:'100%',border:'1px solid var(--bp-border)',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',background:'var(--bp-surface)'},
  };

  return (
    <div style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--bp-border-2)',padding:16,display:'flex',flexDirection:'column',gap:14}}>
      <div style={{fontWeight:700,fontSize:14,color:'var(--bp-text)'}}>Nuevo torneo</div>

      {/* Step 1: Basic info */}
      <div>
        <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Nombre del torneo *</label>
        <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} required placeholder="Ej: Americana de primavera 2026" style={S.inp}/>
      </div>

      <div>
        <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Descripción</label>
        <input value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="Opcional" style={S.inp}/>
      </div>


      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <div>
          <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Estructura *</label>
          <select value={form.structure} onChange={e=>setForm(p=>({...p,structure:e.target.value}))} style={S.sel}>
            {structList.map(k=><option key={k} value={k}>{ICONS[k]} {LABELS.structures[k]}</option>)}
          </select>
          <InfoHint text={DESCRIPTIONS.structures[form.structure]} />
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Emparejamiento *</label>
          <select value={form.pairingSystem} onChange={e=>setForm(p=>({...p,pairingSystem:e.target.value}))} style={S.sel}>
            {pairingList.map(k=><option key={k} value={k}>{LABELS.pairingSystems[k]}</option>)}
          </select>
          <InfoHint text={DESCRIPTIONS.pairingSystems[form.pairingSystem]} />
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Formato partido *</label>
          <select value={form.matchFormat} onChange={e=>setForm(p=>({...p,matchFormat:e.target.value}))} style={S.sel}>
            {Object.entries(LABELS.matchFormats).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          <InfoHint text={DESCRIPTIONS.matchFormats[form.matchFormat]} />
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Ausencias</label>
          <select value={form.byeRule} onChange={e=>setForm(p=>({...p,byeRule:e.target.value}))} style={S.sel}>
            <option value="none">Sin ausencias</option>
            <option value="auto_win">Victoria automática</option>
            <option value="ghost_player">Jugador fantasma</option>
            <option value="rest_round">Descanso</option>
          </select>
          <InfoHint text={DESCRIPTIONS.byeRules[form.byeRule]} />
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Fecha inicio</label>
          <input type="date" value={form.startDate} onChange={e=>setForm(p=>({...p,startDate:e.target.value}))} style={S.inp}/>
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Fecha fin</label>
          <input type="date" value={form.endDate} onChange={e=>setForm(p=>({...p,endDate:e.target.value}))} style={S.inp}/>
        </div>
      </div>


      <div>
        <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>
          ¿Quién carga resultados? <span style={{color:'var(--crimson)'}}>*</span>
        </label>
        <select value={form.resultMode} onChange={e=>setForm(p=>({...p,resultMode:e.target.value,arbitroId:''}))} style={{...S.sel,border:!form.resultMode?'2px solid var(--crimson-soft)':'1px solid var(--line)'}}>
          <option value="">— Seleccionar —</option>
          <option value="creador">🛡️ Creador del torneo</option>
          <option value="jugador">🎾 Jugadores (proponer / confirmar)</option>
          <option value="arbitro">🟡 Árbitro asignado</option>
        </select>
        {form.resultMode==='jugador' && (
          <div style={{fontSize:11,color:'var(--court-deep)',marginTop:5,padding:'6px 10px',background:'var(--court-soft)',borderRadius:6,lineHeight:1.5}}>
            Un equipo propone, el rival acepta o rechaza. Sin respuesta en 24h → confirmado automáticamente.
          </div>
        )}
        {form.resultMode==='arbitro' && (
          <div style={{marginTop:8}}>
            <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>
              Seleccionar árbitro <span style={{color:'var(--crimson)'}}>*</span>
            </label>
            <select value={form.arbitroId} onChange={e=>setForm(p=>({...p,arbitroId:e.target.value}))}
              style={{...S.sel,border:!form.arbitroId?'2px solid var(--crimson-soft)':'1px solid var(--line)'}}>
              <option value="">— Seleccionar persona —</option>
              {allUsers.map(p=>(
                <option key={p.id} value={p.userId}>{p.name} ({p.user?.email||''})</option>
              ))}
            </select>
            <div style={{fontSize:11,color:'var(--amber)',marginTop:5,padding:'6px 10px',background:'var(--amber-soft)',borderRadius:6,lineHeight:1.5}}>
              El árbitro podrá registrar resultados directamente en los partidos del torneo.
            </div>
          </div>
        )}
      </div>

      {/* Visibility */}
      <div style={{background:'var(--bone-2)',border:'1px solid var(--line)',borderRadius:10,padding:'12px 14px',display:'flex',flexDirection:'column',gap:8}}>
        <div style={{fontWeight:700,fontSize:12,color:'var(--ink)'}}>Visibilidad</div>
        {[['internal','Interno — solo socios del club'],['open','Abierto — cualquier jugador puede unirse']].map(([val,label])=>(
          <label key={val} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:12,color:'var(--ink)'}}>
            <input type="radio" name="visibility" value={val} checked={form.visibility===val}
              onChange={()=>setForm(p=>({...p,visibility:val}))} style={{accentColor:'var(--court)'}}/>
            {label}
          </label>
        ))}
      </div>

      {/* Frequency / Schedule */}
      <div style={{background:'var(--bp-surface-3)',border:'1px solid var(--bp-border)',borderRadius:10,padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>
        <div style={{fontWeight:700,fontSize:12,color:'var(--bp-text)'}}>📅 Calendario de jornadas</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <div>
            <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:3}}>Frecuencia</label>
            <select value={form.frequency} onChange={e=>setForm(p=>({...p,frequency:e.target.value}))} style={S.sel}>
              <option value="free">Libre (sin fechas)</option>
              <option value="weekly">Semanal (7 días)</option>
              <option value="biweekly">Quincenal (14 días)</option>
              <option value="monthly">Mensual</option>
              <option value="custom">Personalizada</option>
            </select>
          </div>
        </div>
        {form.frequency === 'custom' && (
          <div>
            <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:3}}>Días entre jornadas</label>
            <input type="number" min="1" max="365" value={form.frequencyDays}
              onChange={e=>setForm(p=>({...p,frequencyDays:e.target.value}))}
              placeholder="Ej: 10" style={S.inp}/>
          </div>
        )}
        {form.frequency !== 'free' && !form.startDate && (
          <div style={{fontSize:11,color:'var(--amber)',lineHeight:1.5}}>
            ⚠️ Define la fecha de inicio para que el calendario se calcule automáticamente al generar partidos.
          </div>
        )}
        {form.frequency !== 'free' && form.startDate && (
          <div style={{fontSize:11,color:'var(--bp-text-3)'}}>
            Las rondas se programarán automáticamente a partir del {form.startDate}.
            {form.structure === 'cima_padel' && ' CimaPadel genera 3 jornadas al generar partidos (6 parejas, 2 cocinan por jornada).'}
          </div>
        )}
        {form.frequency === 'free' && (
          <div style={{fontSize:11,color:'var(--bp-text-3)'}}>
            Los partidos se generan sin fecha asignada.
          </div>
        )}
      </div>

      {/* Invitation settings */}
      <div style={{background:'var(--court-soft)',border:'1px solid var(--court-soft)',borderRadius:10,padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>
        <div style={{fontWeight:700,fontSize:12,color:'var(--court-deep)'}}>🔗 Invitaciones</div>
        <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
          <input type="checkbox" checked={form.allowInvitations} onChange={e=>setForm(p=>({...p,allowInvitations:e.target.checked}))}
            style={{width:16,height:16,accentColor:'var(--court)'}}/>
          <span style={{fontSize:12,color:'var(--bp-text)'}}>Permitir auto-inscripción mediante enlace</span>
        </label>
        {form.allowInvitations && (
          <div>
            <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Cupo máximo de participantes (opcional)</label>
            <input type="number" min="2" max="256" value={form.maxParticipants}
              onChange={e=>setForm(p=>({...p,maxParticipants:e.target.value}))}
              placeholder="Sin límite"
              style={{width:'100%',border:'1px solid var(--court-soft)',borderRadius:8,padding:'8px 12px',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
          </div>
        )}
      </div>

      <div style={{display:'flex',gap:8}}>
        <button onClick={onCancel} style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',fontSize:13,cursor:'pointer'}}>Cancelar</button>
        <button
          onClick={()=>{
            if (!form.resultMode) { alert('Debes definir quién carga los resultados'); return; }
            if (form.resultMode==='arbitro' && !form.arbitroId) { alert('Debes asignar un árbitro'); return; }
            onSave(form);
          }}
          disabled={!form.name||!form.resultMode||(form.resultMode==='arbitro'&&!form.arbitroId)}
          style={{flex:2,padding:'10px',borderRadius:10,border:'none',
            background:(form.name&&form.resultMode&&(form.resultMode!=='arbitro'||form.arbitroId))?'var(--court)':'var(--line)',
            color:'var(--ink)',fontWeight:700,fontSize:13,
            cursor:(form.name&&form.resultMode&&(form.resultMode!=='arbitro'||form.arbitroId))?'pointer':'default'}}>
          Crear torneo
        </button>
      </div>
    </div>
  );
}

function ResetModal({ onConfirm, onCancel }) {
  const [keepPlayers, setKeepPlayers] = useState(true);
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bp-surface)',borderRadius:16,padding:20,maxWidth:360,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <div style={{fontSize:24,textAlign:'center',marginBottom:8}}>⚠️</div>
        <div style={{fontWeight:800,fontSize:15,color:'var(--bp-text)',textAlign:'center',marginBottom:6}}>Reiniciar torneo</div>
        <div style={{fontSize:13,color:'var(--bp-text-2)',textAlign:'center',marginBottom:16,lineHeight:1.5}}>
          Esto borrará <strong>todos los partidos y resultados</strong>. El torneo volverá a estado borrador.
        </div>
        <label style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',background:'var(--bp-surface-2)',borderRadius:10,marginBottom:16,cursor:'pointer'}}>
          <input type="checkbox" checked={keepPlayers} onChange={e=>setKeepPlayers(e.target.checked)} style={{width:16,height:16,accentColor:'var(--court)'}}/>
          <span style={{fontSize:13,color:'var(--bp-text)',fontWeight:500}}>Mantener los mismos jugadores</span>
        </label>
        <div style={{display:'flex',gap:8}}>
          <button onClick={onCancel} style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',fontSize:13,cursor:'pointer',color:'var(--bp-text-2)',fontWeight:600}}>Cancelar</button>
          <button onClick={()=>onConfirm(keepPlayers)} style={{flex:1,padding:'10px',borderRadius:10,border:'none',background:'var(--crimson)',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:'pointer'}}>
            Reiniciar
          </button>
        </div>
      </div>
    </div>
  );
}

const ABSENCE_REASONS = [
  { value: 'lesion',   label: 'Lesión' },
  { value: 'ausencia', label: 'Ausencia' },
  { value: 'viaje',    label: 'Viaje' },
  { value: 'otro',     label: 'Otro' },
];
const inp1 = { width:'100%', border:'1px solid var(--line)', borderRadius:8, padding:'8px 12px', fontSize:13, outline:'none', boxSizing:'border-box', background:'var(--paper)', color:'var(--ink)' };
const lbl1 = { fontSize:11, color:'var(--ink-soft)', display:'block', marginBottom:4, fontWeight:600 };

function SubstituteModal({ participant, tournamentId, onClose, onDone }) {
  const [tab, setTab] = useState('search');      // 'search' | 'create'
  const [reason, setReason] = useState('lesion');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searching, setSearching] = useState(false);
  const [createForm, setCreateForm] = useState({ name:'', email:'', level:'1' });
  const [creating, setCreating] = useState(false);
  const [createdPlayer, setCreatedPlayer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const substitutePlayer = selected || createdPlayer;

  const doSearch = async (q) => {
    setSearch(q);
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const r = await playerService.search(q);
      setResults((r.data||[]).filter(p => p.id !== participant.playerId));
    } catch(e) { setResults([]); }
    setSearching(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.email.trim()) { setErr('Nombre y email son requeridos'); return; }
    setCreating(true); setErr('');
    try {
      const r = await playerService.createClubPlayer({ ...createForm, level: parseInt(createForm.level)||1, password: 'Bonapinta2026!' });
      setCreatedPlayer(r.data.player || r.data);
      setErr('');
    } catch(ex) { setErr(ex.response?.data?.error || 'Error al crear jugador'); }
    setCreating(false);
  };

  const handleConfirm = async () => {
    if (!substitutePlayer) { setErr('Selecciona o crea un jugador sustituto'); return; }
    setSaving(true); setErr('');
    try {
      await tournamentInstanceService.setSubstitute(tournamentId, participant.id, {
        substitutePlayerId: substitutePlayer.id,
        absenceReason: reason,
        absenceNote: note || null,
      });
      onDone();
    } catch(ex) { setErr(ex.response?.data?.error || 'Error al guardar'); setSaving(false); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--paper)',borderRadius:16,padding:20,maxWidth:420,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.25)',border:'1px solid var(--line)',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:'var(--ink)'}}>Registrar baja</div>
            <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:2}}>{participant.player?.name}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--ink-soft)',fontSize:22,lineHeight:1,padding:4}}>×</button>
        </div>

        {/* Reason + note */}
        <div style={{marginBottom:14}}>
          <label style={lbl1}>MOTIVO</label>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {ABSENCE_REASONS.map(r => (
              <button key={r.value} onClick={()=>setReason(r.value)}
                style={{fontSize:12,padding:'5px 12px',borderRadius:20,border:`1px solid ${reason===r.value?'var(--court)':'var(--line)'}`,background:reason===r.value?'var(--court-soft)':'var(--bone-2)',color:reason===r.value?'var(--court-deep)':'var(--ink-soft)',fontWeight:reason===r.value?700:400,cursor:'pointer'}}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <label style={lbl1}>NOTA (opcional)</label>
          <input style={inp1} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ej: baja hasta la ronda 3..." />
        </div>

        {/* Substitute player selection */}
        <div style={{borderTop:'1px solid var(--line)',paddingTop:14,marginBottom:14}}>
          <label style={lbl1}>JUGADOR SUSTITUTO</label>
          {substitutePlayer ? (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',background:'var(--ok-soft)',border:'1px solid var(--ok-soft)',borderRadius:10,marginBottom:10}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:'var(--ok)'}}>{substitutePlayer.name}</div>
                <div style={{fontSize:11,color:'var(--ok)',opacity:0.8}}>Nv. {substitutePlayer.level}</div>
              </div>
              <button onClick={()=>{setSelected(null);setCreatedPlayer(null);setErr('');}} style={{background:'none',border:'none',color:'var(--crimson)',cursor:'pointer',fontSize:18,lineHeight:1}}>×</button>
            </div>
          ) : (
            <>
              <div style={{display:'flex',gap:0,marginBottom:12,border:'1px solid var(--line)',borderRadius:10,overflow:'hidden'}}>
                {[['search','Buscar jugador'],['create','Crear nuevo']].map(([t,l])=>(
                  <button key={t} onClick={()=>{setTab(t);setErr('');}}
                    style={{flex:1,padding:'8px',border:'none',background:tab===t?'var(--court-soft)':'transparent',color:tab===t?'var(--court-deep)':'var(--ink-soft)',fontWeight:tab===t?700:400,fontSize:12,cursor:'pointer'}}>
                    {l}
                  </button>
                ))}
              </div>
              {tab === 'search' ? (
                <div>
                  <input style={inp1} value={search} onChange={e=>doSearch(e.target.value)} placeholder="Nombre o email del jugador..." />
                  {searching && <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:6}}>Buscando…</div>}
                  {results.length > 0 && (
                    <div style={{border:'1px solid var(--line)',borderRadius:8,overflow:'hidden',marginTop:6,maxHeight:180,overflowY:'auto'}}>
                      {results.slice(0,8).map(p=>(
                        <button key={p.id} onClick={()=>{setSelected(p);setSearch('');setResults([]);}}
                          style={{width:'100%',padding:'9px 12px',border:'none',borderBottom:'1px solid var(--line)',background:'var(--bone-2)',textAlign:'left',cursor:'pointer',fontSize:13,color:'var(--ink)'}}>
                          <span style={{fontWeight:600}}>{p.name}</span>
                          <span style={{fontSize:11,color:'var(--ink-soft)',marginLeft:6}}>Nv.{p.level}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {search && !searching && results.length === 0 && (
                    <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:6}}>No se encontraron jugadores</div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleCreate} style={{display:'flex',flexDirection:'column',gap:8}}>
                  <div><label style={lbl1}>NOMBRE COMPLETO</label><input style={inp1} value={createForm.name} onChange={e=>setCreateForm(f=>({...f,name:e.target.value}))} placeholder="Nombre Apellido" /></div>
                  <div><label style={lbl1}>EMAIL</label><input type="email" style={inp1} value={createForm.email} onChange={e=>setCreateForm(f=>({...f,email:e.target.value}))} placeholder="jugador@email.com" /></div>
                  <div><label style={lbl1}>NIVEL (1-10)</label><input type="number" min="1" max="10" style={inp1} value={createForm.level} onChange={e=>setCreateForm(f=>({...f,level:e.target.value}))} /></div>
                  <button type="submit" disabled={creating}
                    style={{padding:'9px',borderRadius:8,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:'pointer',opacity:creating?0.6:1}}>
                    {creating ? 'Creando...' : 'Crear jugador'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        {err && <div style={{fontSize:12,color:'var(--crimson)',background:'var(--crimson-soft)',borderRadius:8,padding:'8px 12px',marginBottom:12}}>{err}</div>}

        <div style={{display:'flex',gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--line)',background:'var(--bone-2)',color:'var(--ink-soft)',fontWeight:600,cursor:'pointer',fontSize:13}}>Cancelar</button>
          <button onClick={handleConfirm} disabled={saving || !substitutePlayer}
            style={{flex:2,padding:'10px',borderRadius:10,border:'none',background:substitutePlayer?'var(--crimson)':'var(--line)',color: substitutePlayer?'white':'var(--ink-soft)',fontWeight:700,cursor:'pointer',fontSize:13,opacity:saving?0.6:1}}>
            {saving ? 'Guardando…' : 'Confirmar baja'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ParticipantManager({ tournament, allPlayers, onAdd, onRemove, onGenerate, onStart, onReset, onRefresh, isCimaPadel, nextCimaRound, onGenerateCima }) {
  const isFixedPairs = tournament.pairingSystem === 'fixed_pairs';
  const isActive = tournament.status === 'active';
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [msg, setMsg] = useState('');
  const [search1, setSearch1] = useState('');
  const [player1, setPlayer1] = useState(null);
  // For admin pairing: which participant is being paired
  const [pairingId, setPairingId] = useState(null);
  const [pairSearch, setPairSearch] = useState('');
  // For substitute modal
  const [substituteFor, setSubstituteFor] = useState(null);

  const hasMatches = (tournament.matches?.length || 0) > 0;
  const existingIds = (tournament.participants||[]).map(p=>p.playerId);
  const available = allPlayers.filter(p => !existingIds.includes(p.id));
  const filtered1 = available.filter(p => p.name.toLowerCase().includes(search1.toLowerCase()));

  const notify = (m, delay=5000) => { setMsg(m); setTimeout(()=>setMsg(''), delay); };

  const handleAdd = async () => {
    if (!player1) { notify('❌ Selecciona un jugador'); return; }
    await onAdd(player1.id, null);
    setPlayer1(null); setSearch1('');
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await onGenerate();
      notify('✅ ' + res.count + ' partidos generados. Revísalos y pulsa "Iniciar torneo".', 7000);
    } catch(e) { notify('❌ ' + (e.response?.data?.error||'Error'), 7000); }
    finally { setGenerating(false); }
  };

  const handleStart = async () => {
    setStarting(true);
    try { await onStart(); notify('✅ ¡Torneo iniciado!'); }
    catch(e) { notify('❌ ' + (e.response?.data?.error||'Error')); }
    finally { setStarting(false); }
  };

  const handleReset = async (keepPlayers) => {
    setShowReset(false);
    try { await onReset(keepPlayers); notify('✅ Torneo reiniciado'); }
    catch(e) { notify('❌ ' + (e.response?.data?.error||'Error')); }
  };

  const handleAdminPair = async (part2Id) => {
    try {
      await tournamentInstanceService.pairParticipants(tournament.id, { participantId1: pairingId, participantId2: part2Id });
      setPairingId(null); setPairSearch('');
      notify('✅ Pareja formada');
      onRefresh();
    } catch(e) { notify('❌ ' + (e.response?.data?.error||'Error')); }
  };

  const handleAdminUnpair = async (participantId) => {
    try {
      await tournamentInstanceService.unpairParticipant(tournament.id, { participantId });
      notify('✅ Pareja deshecha');
      onRefresh();
    } catch(e) { notify('❌ ' + (e.response?.data?.error||'Error')); }
  };

  // Build display groups for participants list
  const participants = tournament.participants || [];
  const shown = new Set();
  const groups = [];
  participants.forEach(p => {
    if (shown.has(p.id)) return;
    if (isFixedPairs && p.partnerId && p.status === 'active') {
      const partner = participants.find(x => x.playerId === p.partnerId && !shown.has(x.id));
      if (partner) { groups.push({ type: 'pair', members: [p, partner] }); shown.add(p.id); shown.add(partner.id); return; }
    }
    if (isFixedPairs && p.status === 'pair_requested') {
      groups.push({ type: 'pending', members: [p] }); shown.add(p.id); return;
    }
    groups.push({ type: p.partnerId ? 'pair' : 'solo', members: [p] }); shown.add(p.id);
  });

  // For admin pairing: unpaired participants (excluding the one being paired)
  const unpairedParticipants = isFixedPairs
    ? participants.filter(p => (!p.partnerId || p.status !== 'active') && p.status !== 'pair_requested')
    : [];

  const allPaired = isFixedPairs && participants.length > 0 &&
    participants.every(p => p.partnerId && p.status === 'active');
  const hasPending = isFixedPairs && participants.some(p => p.status === 'pair_requested');
  const hasUnpaired = isFixedPairs && participants.some(p => !p.partnerId && p.status === 'active');

  const PlayerPicker = ({ value, search, onSearch, onSelect, filtered }) => (
    <div style={{flex:1,minWidth:0}}>
      {value ? (
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',background:'var(--ok-soft)',border:'1px solid var(--ok-soft)',borderRadius:8}}>
          <span style={{fontSize:13,fontWeight:600,color:'var(--ok)'}}>{value.name}</span>
          <button onClick={()=>onSelect(null)} style={{background:'none',border:'none',color:'var(--crimson)',cursor:'pointer',fontSize:16,lineHeight:1}}>×</button>
        </div>
      ) : (
        <div style={{position:'relative'}}>
          <input value={search} onChange={e=>onSearch(e.target.value)} placeholder="Buscar jugador..."
            style={{width:'100%',border:'1px solid var(--bp-border)',borderRadius:8,padding:'8px 12px',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
          {search && filtered.length > 0 && (
            <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--bp-surface)',border:'1px solid var(--bp-border)',borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,0.1)',zIndex:10,maxHeight:160,overflowY:'auto'}}>
              {filtered.slice(0,8).map(p=>(
                <button key={p.id} onClick={()=>{onSelect(p);onSearch('');}}
                  style={{width:'100%',padding:'8px 12px',border:'none',background:'none',textAlign:'left',cursor:'pointer',fontSize:12,color:'var(--bp-text)',borderBottom:'1px solid var(--bp-border-2)'}}>
                  {p.name}<span style={{fontSize:10,color:'var(--bp-text-3)',marginLeft:6}}>Nv.{p.level}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {showReset && <ResetModal onConfirm={handleReset} onCancel={()=>setShowReset(false)}/>}
      {substituteFor && (
        <SubstituteModal
          participant={substituteFor}
          tournamentId={tournament.id}
          onClose={()=>setSubstituteFor(null)}
          onDone={()=>{ setSubstituteFor(null); onRefresh(); notify('✅ Baja registrada'); }}
        />
      )}

      {/* Status banner */}
      {isActive ? (
        <div style={{background:'var(--ok-soft)',border:'1px solid var(--ok-soft)',borderRadius:12,padding:'12px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontWeight:700,fontSize:13,color:'var(--ok)'}}>Torneo en curso</div>
            <div style={{fontSize:11,color:'var(--court)',marginTop:2}}>
              {isCimaPadel ? 'Genera nuevas jornadas desde esta pestaña o desde Partidos' : 'Los partidos están bloqueados para edición'}
            </div>
          </div>
          <button onClick={()=>setShowReset(true)} style={{fontSize:12,background:'var(--crimson-soft)',border:'1px solid var(--crimson-soft)',borderRadius:8,padding:'6px 12px',color:'var(--crimson)',fontWeight:700,cursor:'pointer'}}>
            Reiniciar
          </button>
        </div>
      ) : hasMatches ? (
        <div style={{background:'#fefce8',border:'1px solid var(--amber-soft)',borderRadius:12,padding:'12px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontWeight:700,fontSize:13,color:'var(--amber)'}}>{isCimaPadel ? 'Jornadas generadas — listo para iniciar' : 'Partidos generados — listo para iniciar'}</div>
            {!isCimaPadel && <div style={{fontSize:11,color:'var(--amber)',marginTop:2}}>Una vez iniciado no se podrán regenerar partidos</div>}
          </div>
          <button onClick={handleStart} disabled={starting}
            style={{fontSize:13,background:'var(--court)',border:'none',borderRadius:8,padding:'8px 16px',color:'var(--ink)',fontWeight:800,cursor:starting?'default':'pointer'}}>
            {starting ? 'Iniciando…' : 'Iniciar torneo'}
          </button>
        </div>
      ) : null}

      {/* Fixed pairs: pairing status warning */}
      {isFixedPairs && !isActive && !hasMatches && (hasUnpaired || hasPending) && (
        <div style={{background:'var(--amber-soft)',border:'1px solid var(--amber-soft)',borderRadius:12,padding:'10px 14px',fontSize:12,color:'#9a3412'}}>
          <strong>Parejas pendientes</strong> — asigna todas las parejas antes de generar partidos.
          {hasPending && <span style={{marginLeft:4}}>Hay solicitudes esperando confirmación.</span>}
        </div>
      )}

      {/* Participants list */}
      <div style={{background:'var(--bp-surface)',borderRadius:14,border:'1px solid var(--bp-border-2)',overflow:'hidden'}}>
        <div style={{padding:'10px 14px',borderBottom:'1px solid var(--bp-border-2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:700,fontSize:13,color:'var(--bp-text)'}}>
            Participantes ({participants.length})
            {isFixedPairs && <span style={{fontSize:10,color: allPaired?'var(--ok)':'var(--amber)',marginLeft:6,fontWeight:600}}>
              {allPaired ? `${Math.floor(participants.length/2)} parejas listas` : `${Math.floor(participants.filter(p=>p.partnerId&&p.status==='active').length/2)}/${Math.floor(participants.length/2)} parejas`}
            </span>}
          </span>
          {isCimaPadel ? (
            <button onClick={onGenerateCima} disabled={hasUnpaired||hasPending}
              style={{fontSize:12,background:(!hasUnpaired&&!hasPending)?'var(--court)':'var(--line)',border:'none',borderRadius:8,padding:'6px 14px',color:'var(--ink)',fontWeight:700,cursor:'pointer'}}>
              {(() => { const d = fmtShortDate(getNextCimaDate(tournament, nextCimaRound)); return d ? `Próxima fecha · ${d}` : `Generar Jornada ${nextCimaRound}`; })()}
            </button>
          ) : !isActive && (
            <button onClick={handleGenerate} disabled={generating||participants.length<2||(isFixedPairs&&(hasUnpaired||hasPending))}
              style={{fontSize:12,background:(participants.length>=2&&(!isFixedPairs||(allPaired&&!hasPending)))?'var(--court)':'var(--line)',border:'none',borderRadius:8,padding:'6px 14px',color:'var(--ink)',fontWeight:700,cursor:'pointer'}}>
              {generating?'Generando...':hasMatches?'Regenerar':'Generar partidos'}
            </button>
          )}
        </div>
        <MsgBanner msg={msg} style={{padding:'8px 14px',fontSize:12}} />

        {participants.length === 0 ? (
          <div style={{padding:'20px',textAlign:'center',color:'var(--bp-text-3)',fontSize:13}}>Sin participantes aún</div>
        ) : (
          groups.map((group, i) => {
            const p = group.members[0];
            const partner = group.members[1];
            const isPaired = group.type === 'pair' && group.members.length === 2;
            const isPending = group.type === 'pending';
            const isBeingPaired = pairingId === p.id;

            // For pending: find the target name
            const pendingTargetPart = isPending && p.partnerId
              ? participants.find(x => x.playerId === p.partnerId)
              : null;

            const isAbsent = p.status === 'absent';
            const hasSub = !!p.substituteId;

            return (
              <div key={p.id}>
                <div style={{padding:'8px 14px',borderBottom:'1px solid var(--bp-border-2)',display:'flex',justifyContent:'space-between',alignItems:'center',background: isAbsent?'#fef2f2': isPending?'#fffbeb': isPaired?'var(--bp-surface)':'var(--amber-soft)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:11,fontWeight:700,color:'var(--bp-text-3)',width:20}}>#{i+1}</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:isAbsent?'var(--crimson)':'var(--bp-text)'}}>
                        {group.members.map(m=>m.player?.name?.split(' ')[0]).join(' & ')}
                        {isAbsent && <span style={{fontSize:10,marginLeft:5,background:'var(--crimson-soft)',color:'var(--crimson)',borderRadius:4,padding:'1px 5px',fontWeight:700}}>BAJA</span>}
                      </div>
                      {hasSub && p.substitute && (
                        <div style={{fontSize:10,marginTop:1,color:'var(--crimson)',fontWeight:600}}>
                          Sust: {p.substitute.name}{p.absenceReason ? ` · ${ABSENCE_REASONS.find(r=>r.value===p.absenceReason)?.label||p.absenceReason}` : ''}
                        </div>
                      )}
                      {isFixedPairs && !isAbsent && (
                        <div style={{fontSize:10,marginTop:1,fontWeight:600,
                          color: isPaired?'var(--ok)': isPending?'var(--amber)':'var(--crimson)'}}>
                          {isPaired ? 'Pareja confirmada' : isPending ? `Solicitud enviada a ${pendingTargetPart?.player?.name||'...'}` : 'Sin pareja'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:5}}>
                    {/* Baja / Revertir button — always visible for admin */}
                    {isAbsent ? (
                      <button onClick={async ()=>{ try { await tournamentInstanceService.setSubstitute(tournament.id, p.id, { substitutePlayerId: null }); onRefresh(); } catch(e) { notify('❌ '+( e.response?.data?.error||'Error')); } }}
                        style={{fontSize:11,background:'var(--ok-soft)',border:'none',borderRadius:6,padding:'3px 8px',color:'var(--ok)',cursor:'pointer',fontWeight:700}}>
                        Revertir
                      </button>
                    ) : (
                      <button onClick={()=>setSubstituteFor(p)}
                        style={{fontSize:11,background:'#fee2e2',border:'none',borderRadius:6,padding:'3px 8px',color:'var(--crimson)',cursor:'pointer',fontWeight:700}}>
                        Baja
                      </button>
                    )}
                    {!isActive && isFixedPairs ? (
                      <>
                        {isPaired ? (
                          <button onClick={()=>handleAdminUnpair(p.id)}
                            style={{fontSize:11,background:'var(--crimson-soft)',border:'none',borderRadius:6,padding:'3px 8px',color:'var(--crimson)',cursor:'pointer'}}>Desemparejar</button>
                        ) : !isPending ? (
                          <button onClick={()=>{ setPairingId(isBeingPaired?null:p.id); setPairSearch(''); }}
                            style={{fontSize:11,background:isBeingPaired?'#dbeafe':'var(--ok-soft)',border:'none',borderRadius:6,padding:'3px 8px',color:isBeingPaired?'var(--court-deep)':'var(--ok)',cursor:'pointer',fontWeight:700}}>
                            {isBeingPaired ? 'Cancelar' : 'Emparejar'}
                          </button>
                        ) : null}
                        <button onClick={()=>onRemove(p.id)}
                          style={{fontSize:11,background:'var(--crimson-soft)',border:'none',borderRadius:6,padding:'3px 8px',color:'var(--crimson)',cursor:'pointer'}}>Quitar</button>
                      </>
                    ) : !isActive ? (
                      <button onClick={()=>{ group.members.forEach(m=>onRemove(m.id)); }}
                        style={{fontSize:11,background:'var(--crimson-soft)',border:'none',borderRadius:6,padding:'3px 8px',color:'var(--crimson)',cursor:'pointer'}}>Quitar</button>
                    ) : null}
                  </div>
                </div>

                {/* Inline partner picker when admin clicked "Emparejar" */}
                {isBeingPaired && (
                  <div style={{padding:'10px 14px',background:'var(--court-soft)',borderBottom:'1px solid var(--bp-border-2)'}}>
                    <div style={{fontSize:11,color:'var(--court-deep)',fontWeight:700,marginBottom:8}}>
                      Selecciona la pareja de {p.player?.name?.split(' ')[0]}:
                    </div>
                    <input value={pairSearch} onChange={e=>setPairSearch(e.target.value)} placeholder="Buscar..."
                      style={{width:'100%',border:'1px solid var(--court-soft)',borderRadius:8,padding:'7px 10px',fontSize:12,outline:'none',boxSizing:'border-box',marginBottom:6}}/>
                    <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:160,overflowY:'auto'}}>
                      {unpairedParticipants
                        .filter(u => u.id !== p.id && (u.player?.name||'').toLowerCase().includes(pairSearch.toLowerCase()))
                        .map(u => (
                          <button key={u.id} onClick={()=>handleAdminPair(u.id)}
                            style={{width:'100%',padding:'8px 12px',border:'1px solid var(--court-soft)',borderRadius:8,background:'white',textAlign:'left',cursor:'pointer',fontSize:12,color:'var(--ink-2)',fontWeight:500}}>
                            {u.player?.name}
                          </button>
                        ))}
                      {unpairedParticipants.filter(u => u.id !== p.id && (u.player?.name||'').toLowerCase().includes(pairSearch.toLowerCase())).length === 0 && (
                        <div style={{fontSize:11,color:'var(--ink-soft)',textAlign:'center',padding:'8px'}}>No hay jugadores sin pareja disponibles</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add individual player */}
      {!isActive && available.length > 0 && (
        <div style={{background:'var(--bp-surface)',borderRadius:14,border:'1px solid var(--bp-border-2)',padding:14}}>
          <div style={{fontWeight:600,fontSize:12,color:'var(--bp-text)',marginBottom:10}}>Añadir jugador</div>
          <div style={{marginBottom:10}}>
            <PlayerPicker value={player1} search={search1} onSearch={setSearch1} onSelect={setPlayer1} filtered={filtered1}/>
          </div>
          <button onClick={handleAdd} disabled={!player1}
            style={{width:'100%',padding:'10px',borderRadius:8,border:'none',
              background:player1?'var(--court)':'var(--line)',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:player1?'pointer':'default'}}>
            {player1 ? `+ Añadir ${player1.name.split(' ')[0]}` : '+ Añadir jugador'}
          </button>
        </div>
      )}
    </div>
  );
}

function ResultForm({ match, t1Name, t2Name, onSave, onCancel }) {
  const [sets, setSets] = useState(match.result?.sets || [{ t1: '', t2: '' }]);
  const [saving, setSaving] = useState(false);

  const updateSet = (i, field, val) => {
    setSets(prev => prev.map((s, j) => j === i ? { ...s, [field]: val } : s));
  };
  const addSet = () => setSets(prev => [...prev, { t1: '', t2: '' }]);
  const removeSet = (i) => setSets(prev => prev.filter((_, j) => j !== i));

  const handleSave = async () => {
    const cleaned = sets.filter(s => s.t1 !== '' && s.t2 !== '').map(s => ({ t1: parseInt(s.t1)||0, t2: parseInt(s.t2)||0 }));
    if (!cleaned.length) return;
    setSaving(true);
    try { await onSave(cleaned); } finally { setSaving(false); }
  };

  return (
    <div style={{background:'var(--bp-surface-2)',border:'1px solid var(--bp-border)',borderRadius:10,padding:12,marginTop:6}}>
      <div style={{fontSize:11,fontWeight:700,color:'var(--bp-text)',marginBottom:8}}>
        Resultado: {t1Name} vs {t2Name}
      </div>
      {sets.map((s, i) => (
        <div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
          <span style={{fontSize:11,color:'var(--bp-text-3)',minWidth:42}}>Set {i+1}</span>
          <input type="number" min="0" max="99" value={s.t1} onChange={e=>updateSet(i,'t1',e.target.value)}
            placeholder={t1Name.split(' ')[0]}
            style={{width:52,border:'1px solid var(--bp-border)',borderRadius:6,padding:'5px 8px',fontSize:13,textAlign:'center',outline:'none'}}/>
          <span style={{color:'var(--bp-text-3)',fontWeight:700}}>-</span>
          <input type="number" min="0" max="99" value={s.t2} onChange={e=>updateSet(i,'t2',e.target.value)}
            placeholder={t2Name.split(' ')[0]}
            style={{width:52,border:'1px solid var(--bp-border)',borderRadius:6,padding:'5px 8px',fontSize:13,textAlign:'center',outline:'none'}}/>
          {sets.length > 1 && (
            <button onClick={()=>removeSet(i)} style={{background:'none',border:'none',color:'var(--crimson)',cursor:'pointer',fontSize:16,lineHeight:1,padding:0}}>×</button>
          )}
        </div>
      ))}
      <div style={{display:'flex',gap:6,marginTop:8}}>
        <button onClick={addSet} style={{fontSize:11,background:'var(--bp-surface-3)',border:'none',borderRadius:6,padding:'5px 10px',cursor:'pointer',color:'var(--bp-text)'}}>+ Set</button>
        <div style={{flex:1}}/>
        <button onClick={onCancel} style={{fontSize:11,background:'var(--bp-surface)',border:'1px solid var(--bp-border)',borderRadius:6,padding:'5px 12px',cursor:'pointer',color:'var(--bp-text-2)'}}>Cancelar</button>
        <button onClick={handleSave} disabled={saving} style={{fontSize:11,background:'var(--court)',border:'none',borderRadius:6,padding:'5px 12px',color:'var(--ink)',fontWeight:700,cursor:saving?'default':'pointer'}}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

function MatchesList({ tournamentId, tournamentStatus, matches, participants, onDeleteMatch, onResultSaved }) {
  const [editingId, setEditingId] = useState(null);
  const isActive = tournamentStatus === 'active';

  const byRound = {};
  matches.forEach(m => {
    if (!byRound[m.round]) byRound[m.round] = [];
    byRound[m.round].push(m);
  });

  const getTeamName = (match, team) => {
    try {
      if (match.group) {
        const g = JSON.parse(match.group);
        const ids = team === 1 ? g.team1 : g.team2;
        return ids.map(id => {
          const p = participants.find(p=>p.id===id);
          return p?.player?.name?.split(' ')[0] || '?';
        }).join(' & ');
      }
    } catch(e) {}
    const id = team === 1 ? match.participant1Id : match.participant2Id;
    if (!id) return 'TBD';
    const p = participants.find(p=>p.id===id);
    if (!p) return id.slice(0,8);
    const name1 = p.player?.name?.split(' ')[0] || '?';
    if (p.partnerId) {
      const partner = participants.find(u => u.playerId === p.partnerId && u.id !== p.id);
      if (partner) return name1 + ' & ' + (partner.player?.name?.split(' ')[0]||'?');
    }
    return name1;
  };

  const handleSaveResult = async (match, sets) => {
    await tournamentInstanceService.setResult(tournamentId, match.id, { sets });
    setEditingId(null);
    onResultSaved && onResultSaved(match.id, sets);
  };

  // Extract cooking couple info from the first match of a round (stored in group._bbq)
  const getBBQCouple = (rMatches) => {
    for (const m of rMatches) {
      if (!m.group) continue;
      try {
        const g = typeof m.group === 'string' ? JSON.parse(m.group) : m.group;
        if (g._bbq?.couples?.length) {
          // New format: array of couples
          const names = g._bbq.couples.map(c =>
            (c.members || [])
              .map(pid => participants.find(p => p.id === pid)?.player?.name?.split(' ')[0] || '?')
              .join(' & ')
          ).join(' / ');
          return { names, isManualOverride: g._bbq.isManualOverride };
        }
        if (g._bbq?.members?.length) {
          // Legacy format: single couple
          const names = g._bbq.members
            .map(pid => participants.find(p => p.id === pid)?.player?.name?.split(' ')[0] || '?')
            .join(' & ');
          return { names, isManualOverride: g._bbq.isManualOverride };
        }
      } catch {}
    }
    return null;
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {Object.entries(byRound).sort((a,b)=>Number(a[0])-Number(b[0])).map(([round, rMatches])=>{
        const bbq = getBBQCouple(rMatches);
        return (
        <div key={round} style={{background:'var(--bp-surface)',borderRadius:14,border:'1px solid var(--bp-border-2)',overflow:'hidden'}}>
          <div style={{padding:'8px 14px',background:'var(--bp-surface-2)',borderBottom:'1px solid var(--bp-border-2)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <span style={{fontWeight:700,fontSize:12,color:'var(--bp-text-2)'}}>
              Ronda {round} · {(rMatches||[]).length} partido{(rMatches||[]).length!==1?'s':''}
            </span>
            {bbq && (
              <span style={{
                display:'inline-flex',alignItems:'center',gap:4,
                fontSize:11,fontWeight:600,
                background:'var(--amber-soft)',color:'var(--amber)',
                borderRadius:20,padding:'2px 9px',
              }}>
                🍖 {bbq.names}{bbq.isManualOverride ? ' ·' : ''}
              </span>
            )}
          </div>
          {rMatches.map(m=>(
            <div key={m.id} style={{padding:'8px 14px',borderBottom:'1px solid var(--bone-2)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontSize:13,color:'var(--bp-text)',flex:1,minWidth:0}}>
                  <span style={{fontWeight:600,color:'var(--court-deep)'}}>{getTeamName(m,1)}</span>
                  <span style={{color:'var(--line)',margin:'0 6px'}}>vs</span>
                  <span style={{fontWeight:600}}>{getTeamName(m,2)}</span>
                  {m.court && (
                    <span style={{display:'inline-flex',alignItems:'center',gap:3,marginLeft:8,
                      fontSize:10,background:'var(--court-soft)',color:'var(--court-deep)',
                      borderRadius:5,padding:'1px 6px',fontWeight:600,verticalAlign:'middle'}}>
                      <MapPinIcon style={{width:9,height:9}}/>{m.court.alias || m.court.name}
                    </span>
                  )}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
                  {m.result?.sets && (
                    <div style={{display:'flex',gap:3}}>
                      {m.result.sets.map((s,i)=>(
                        <span key={i} style={{fontSize:10,background:'var(--bp-surface-2)',border:'1px solid var(--bp-border)',borderRadius:4,padding:'1px 5px',fontWeight:700}}>{s.t1}-{s.t2}</span>
                      ))}
                    </div>
                  )}
                  <span style={{fontSize:10,background:m.status==='completed'?'var(--ok-soft)':'var(--bone-3)',color:m.status==='completed'?'var(--ok)':'var(--ink-soft)',borderRadius:6,padding:'2px 7px'}}>
                    {m.status==='completed'?'✅':'⏳'}
                  </span>
                  {isActive && (
                    <button
                      onClick={()=>setEditingId(editingId===m.id?null:m.id)}
                      style={{fontSize:10,background:editingId===m.id?'var(--court-soft)':'var(--bone-3)',border:'none',borderRadius:5,padding:'3px 8px',cursor:'pointer',color:'var(--court-deep)',fontWeight:600}}>
                      {m.status==='completed'?'✏️':'📝'}
                    </button>
                  )}
                  {onDeleteMatch && !isActive && <button onClick={()=>onDeleteMatch(m.id)} style={{fontSize:10,background:'var(--crimson-soft)',border:'none',borderRadius:4,padding:'2px 6px',color:'var(--crimson)',cursor:'pointer'}}>✕</button>}
                </div>
              </div>
              {editingId===m.id && isActive && (
                <ResultForm
                  match={m}
                  t1Name={getTeamName(m,1)}
                  t2Name={getTeamName(m,2)}
                  onSave={(sets)=>handleSaveResult(m, sets)}
                  onCancel={()=>setEditingId(null)}
                />
              )}
            </div>
          ))}
        </div>
        );
      })}
    </div>
  );
}

function StandingsAdmin({ tournamentId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tournamentInstanceService.getStandings(tournamentId)
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tournamentId]);

  if (loading) return <div style={{textAlign:'center',padding:'32px 0',color:'var(--bp-text-3)'}}>Cargando...</div>;
  if (!data || data.standings.length === 0) {
    return <div style={{background:'var(--amber-soft)',border:'1px solid var(--amber-soft)',borderRadius:12,padding:16,fontSize:13,color:'var(--amber)',textAlign:'center'}}>
      Aún no hay resultados registrados. Entra en Partidos y registra resultados.
    </div>;
  }

  const isPairs = data.tournament?.pairingSystem === 'fixed_pairs';
  const medals = ['🥇','🥈','🥉'];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <div style={{fontSize:12,color:'var(--bp-text-2)'}}>{data.completedMatches} de {data.totalMatches} partidos completados</div>
      <div style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--bp-border-2)',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'32px 1fr 36px 36px 36px 36px 48px',gap:4,padding:'10px 12px',background:'var(--bp-surface-2)',borderBottom:'1px solid var(--bp-border-2)'}}>
          {['#', isPairs?'Pareja':'Jugador','PJ','G','P','E','Pts'].map(h => (
            <div key={h} style={{fontSize:10,fontWeight:700,color:'var(--bp-text-3)',textAlign:h==='Pareja'||h==='Jugador'?'left':'center'}}>{h}</div>
          ))}
        </div>
        {data.standings.map((s, i) => {
          const isTop = i === 0 && s.points > 0;
          let label = '';
          if (isPairs) {
            label = [s.player1?.name?.split(' ')[0], s.player2?.name?.split(' ')[0]].filter(Boolean).join(' & ');
          } else {
            label = s.participant?.player?.name || '—';
          }
          return (
            <div key={i} style={{display:'grid',gridTemplateColumns:'32px 1fr 36px 36px 36px 36px 48px',gap:4,padding:'10px 12px',borderBottom:'1px solid var(--bone-2)'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
                {i<3&&s.points>0?<span style={{fontSize:16}}>{medals[i]}</span>:<span style={{fontSize:12,fontWeight:700,color:'var(--bp-text-3)'}}>{i+1}</span>}
              </div>
              <div style={{display:'flex',alignItems:'center',overflow:'hidden'}}>
                <span style={{fontSize:13,fontWeight:500,color:'var(--bp-text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label}</span>
              </div>
              {[s.played,s.won,s.lost,s.draw].map((v,j)=>(
                <div key={j} style={{textAlign:'center',fontSize:13,color:'var(--bp-text-2)',display:'flex',alignItems:'center',justifyContent:'center'}}>{v}</div>
              ))}
              <div style={{textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span style={{fontSize:13,fontWeight:800,color:isTop?'var(--amber)':'var(--ink-2)',background:isTop?'var(--amber-soft)':'transparent',borderRadius:6,padding:isTop?'2px 8px':'0'}}>{s.points}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RESULT_ACTIONS = new Set(['resultado_propuesto','resultado_aceptado','resultado_admin']);

function OutcomeBadge({ detail }) {
  if (!detail) return null;
  const parts = detail.split('·').map(s => s.trim());
  const outcome = parts[parts.length - 1];
  const sets    = parts.slice(0, -1).join(' · ');
  const isGana  = outcome.toLowerCase().startsWith('gana');
  const isEmpate = outcome.toLowerCase() === 'empate';
  const isInv   = outcome.toLowerCase() === 'inválido';
  if (!isGana && !isEmpate && !isInv)
    return <span style={{fontSize:12,color:'var(--bp-text-2)'}}>{detail}</span>;
  const badgeStyle = {
    fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 7px', flexShrink: 0, whiteSpace: 'nowrap',
    ...(isGana  ? { color:'var(--ok)', background:'var(--ok-soft)', border:'1px solid var(--ok-soft)' } :
        isEmpate ? { color:'var(--ink-mid)', background:'var(--bone-3)', border:'1px solid var(--line)' } :
        isInv    ? { color:'var(--crimson)', background:'var(--crimson-soft)', border:'1px solid var(--crimson-soft)' } :
                   { color:'var(--ink-mid)', background:'var(--bone-3)', border:'1px solid var(--line)' })
  };
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
      {sets && <span style={{fontSize:12,color:'var(--bp-text-2)'}}>{sets}</span>}
      <span style={badgeStyle}>{outcome}</span>
    </span>
  );
}

const ACTION_LABELS = {
  participante_añadido:     { label: 'Jugador añadido',          color: 'var(--ok)', bg: 'var(--ok-soft)', border: 'var(--ok-soft)' },
  participante_eliminado:   { label: 'Jugador eliminado',        color: 'var(--crimson)', bg: 'var(--crimson-soft)', border: 'var(--crimson-soft)' },
  partidos_generados:       { label: 'Partidos generados',       color: 'var(--court-deep)', bg: '#f5f3ff', border: 'var(--court-soft)' },
  resultado_propuesto:      { label: 'Resultado propuesto',      color: 'var(--court-deep)', bg: 'var(--court-soft)', border: 'var(--court-soft)' },
  resultado_aceptado:       { label: 'Resultado confirmado',     color: 'var(--ok)', bg: 'var(--ok-soft)', border: 'var(--ok-soft)' },
  resultado_rechazado:      { label: 'Resultado rechazado',      color: 'var(--crimson)', bg: 'var(--crimson-soft)', border: 'var(--crimson-soft)' },
  resultado_admin:          { label: 'Resultado (admin)',        color: 'var(--amber)', bg: '#fffbeb', border: 'var(--amber-soft)' },
  modo_resultados_cambiado: { label: 'Modo resultados cambiado', color: '#0e7490', bg: '#ecfeff', border: '#a5f3fc' },
};

function TournamentLogs({ tournamentId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tournamentInstanceService.getLogs(tournamentId)
      .then(r => setLogs(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tournamentId]);

  if (loading) return <div style={{textAlign:'center',padding:'32px 0',color:'var(--bp-text-3)',fontSize:13}}>Cargando…</div>;
  if (!logs.length) return (
    <div style={{textAlign:'center',padding:'32px 0',color:'var(--bp-text-3)',fontSize:13}}>
      Sin actividad registrada aún.
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {logs.map(log => {
        const meta = ACTION_LABELS[log.action] || { label: log.action, color:'var(--ink-mid)', bg:'var(--bp-surface-2)', border:'var(--bp-border)' };
        const date = new Date(log.createdAt);
        const dateStr = date.toLocaleDateString('es-ES', { day:'numeric', month:'short' });
        const timeStr = date.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
        return (
          <div key={log.id} style={{background:'var(--bp-surface)',border:'1px solid var(--bp-border)',borderRadius:10,padding:'10px 12px',display:'flex',gap:10,alignItems:'flex-start'}}>
            <span style={{fontSize:10,fontWeight:700,color:meta.color,background:meta.bg,border:`1px solid ${meta.border}`,borderRadius:6,padding:'2px 7px',flexShrink:0,marginTop:1,whiteSpace:'nowrap'}}>
              {meta.label}
            </span>
            <div style={{flex:1,minWidth:0}}>
              {log.playerName && <span style={{fontSize:12,fontWeight:700,color:'var(--bp-text)'}}>{log.playerName} · </span>}
              {log.detail && (RESULT_ACTIONS.has(log.action)
                ? <OutcomeBadge detail={log.detail} />
                : <span style={{fontSize:12,color:'var(--bp-text-2)'}}>{log.detail}</span>
              )}
            </div>
            <div style={{flexShrink:0,textAlign:'right'}}>
              <div style={{fontSize:11,color:'var(--bp-text-3)'}}>{dateStr}</div>
              <div style={{fontSize:10,color:'var(--bp-text-3)'}}>{timeStr}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TournamentInvitationsEditor({ tournament, onUpdate }) {
  const [allow,    setAllow]    = useState(tournament.allowInvitations || false);
  const [maxP,     setMaxP]     = useState(tournament.maxParticipants || '');
  const [inviteUrl, setInviteUrl] = useState(
    tournament.inviteToken && tournament.allowInvitations
      ? `${window.location.origin}/tournaments/join/${tournament.inviteToken}`
      : null
  );
  const [saving,  setSaving]  = useState(false);
  const [genning, setGenning] = useState(false);
  const [copied,  setCopied]  = useState(false);
  const [msg,     setMsg]     = useState('');

  const notify = (m) => { setMsg(m); setTimeout(()=>setMsg(''),4000); };

  const shareWA = (url) => window.open(`https://wa.me/?text=${encodeURIComponent('¡Únete al torneo! Inscríbete con este enlace: ' + url)}`, '_blank');
  const shareTG = (url) => window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('¡Únete al torneo en Bonapinta!')}`, '_blank');
  const copyUrl = async (url) => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(()=>setCopied(false),2000); } catch {}
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const r = await tournamentInstanceService.updateInvite(tournament.id, {
        allowInvitations: allow,
        maxParticipants: maxP || null
      });
      if (r.data.inviteUrl) setInviteUrl(r.data.inviteUrl);
      else if (!allow) setInviteUrl(null);
      onUpdate({ allowInvitations: allow, maxParticipants: r.data.maxParticipants });
      notify('✅ Guardado');
    } catch(e) { notify('❌ '+(e.response?.data?.error||'Error')); }
    finally { setSaving(false); }
  };

  const handleGenerate = async () => {
    setGenning(true);
    try {
      const r = await tournamentInstanceService.generateInvite(tournament.id, {
        allowInvitations: true,
        maxParticipants: maxP || null
      });
      setAllow(true);
      setInviteUrl(r.data.inviteUrl);
      onUpdate({ allowInvitations: true, maxParticipants: r.data.maxParticipants, inviteToken: r.data.inviteToken });
      notify('✅ Enlace generado');
    } catch(e) { notify('❌ '+(e.response?.data?.error||'Error')); }
    finally { setGenning(false); }
  };

  const participantCount = tournament.participants?.length || 0;
  const matchesGenerated = (tournament.matches?.length || 0) > 0;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {matchesGenerated && (
        <div style={{background:'var(--amber-soft)',border:'1px solid var(--amber-soft)',borderRadius:10,padding:'10px 14px',fontSize:12,color:'var(--amber)'}}>
          <strong>Invitaciones bloqueadas.</strong> Una vez generados los partidos el grupo está cerrado y no se pueden añadir más jugadores por enlace.
        </div>
      )}
      <div style={{background:'var(--bp-surface)',borderRadius:14,border:'1px solid var(--bp-border-2)',padding:16,opacity:matchesGenerated?0.5:1,pointerEvents:matchesGenerated?'none':'auto'}}>
        <div style={{fontWeight:700,fontSize:13,color:'var(--bp-text)',marginBottom:12}}>🔗 Invitaciones a este torneo</div>

        {/* Settings */}
        <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:14}}>
          <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',padding:'10px 12px',background:'var(--bp-surface-2)',borderRadius:10,border:'1px solid var(--bp-border)'}}>
            <input type="checkbox" checked={allow} onChange={e=>setAllow(e.target.checked)}
              style={{width:16,height:16,accentColor:'var(--court)'}}/>
            <div>
              <div style={{fontSize:13,color:'var(--bp-text)',fontWeight:600}}>Permitir auto-inscripción</div>
              <div style={{fontSize:11,color:'var(--bp-text-3)'}}>Los jugadores con el enlace pueden apuntarse directamente</div>
            </div>
          </label>
          <div>
            <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Cupo máximo de participantes</label>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input type="number" min="2" max="256" value={maxP}
                onChange={e=>setMaxP(e.target.value)}
                placeholder="Sin límite"
                style={{flex:1,border:'1px solid var(--bp-border)',borderRadius:8,padding:'8px 12px',fontSize:13,outline:'none'}}/>
              <span style={{fontSize:11,color:'var(--bp-text-3)',flexShrink:0}}>{participantCount} inscritos</span>
            </div>
          </div>
        </div>

        <MsgBanner msg={msg} style={{fontSize:12,borderRadius:8,padding:'8px 12px',marginBottom:10}} />

        <div style={{display:'flex',gap:8,marginBottom: inviteUrl ? 14 : 0}}>
          <button onClick={handleSaveSettings} disabled={saving}
            style={{flex:1,padding:'9px',borderRadius:8,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:'var(--bp-text)',fontSize:12,fontWeight:600,cursor:'pointer'}}>
            {saving ? 'Guardando…' : 'Guardar ajustes'}
          </button>
          <button onClick={handleGenerate} disabled={genning}
            style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'var(--court)',color:'var(--ink)',fontSize:12,fontWeight:700,cursor:'pointer',opacity:genning?0.6:1}}>
            {genning ? '...' : tournament.inviteToken ? '↺ Nuevo enlace' : '+ Generar enlace'}
          </button>
        </div>

        {/* Active invite link */}
        {inviteUrl && allow && (
          <div style={{background:'var(--ok-soft)',border:'1px solid var(--ok-soft)',borderRadius:12,padding:'12px 14px'}}>
            <div style={{fontSize:11,color:'var(--ok)',fontWeight:700,marginBottom:8}}>✅ Enlace activo</div>
            <div style={{fontSize:10,color:'var(--bp-text)',background:'var(--bp-surface)',border:'1px solid var(--bp-border)',borderRadius:8,padding:'7px 10px',wordBreak:'break-all',fontFamily:'monospace',marginBottom:10}}>
              {inviteUrl}
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <button onClick={()=>shareWA(inviteUrl)}
                style={{display:'flex',alignItems:'center',gap:5,padding:'7px 12px',borderRadius:10,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:700,fontSize:12,cursor:'pointer'}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                WhatsApp
              </button>
              <button onClick={()=>shareTG(inviteUrl)}
                style={{display:'flex',alignItems:'center',gap:5,padding:'7px 12px',borderRadius:10,border:'none',background:'#0088cc',color:'var(--ink)',fontWeight:700,fontSize:12,cursor:'pointer'}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                Telegram
              </button>
              <button onClick={()=>copyUrl(inviteUrl)}
                style={{padding:'7px 12px',borderRadius:10,border:'1px solid var(--bp-border)',background:copied?'var(--ok-soft)':'white',color:copied?'var(--ok)':'var(--ink-mid)',fontWeight:600,fontSize:12,cursor:'pointer'}}>
                {copied ? '✓ Copiado' : '📋 Copiar'}
              </button>
            </div>
            <div style={{fontSize:10,color:'var(--bp-text-2)',marginTop:8}}>
              ⚠️ Genera un nuevo enlace para invalidar el actual
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SaveAsPresetSection({ tournament }) {
  const [name,    setName]    = useState(tournament.name || '');
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState('');
  const [open,    setOpen]    = useState(false);

  const notify = (m) => { setMsg(m); setTimeout(() => setMsg(''), 5000); };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true); setMsg('');
    try {
      await tournamentService.create({
        name: name.trim(),
        structure:     tournament.structure,
        pairingSystem: tournament.pairingSystem,
        matchFormat:   tournament.matchFormat,
        byeRule:       tournament.byeRule || 'none',
      });
      notify('✅ Preset guardado correctamente');
      setOpen(false);
    } catch (e) {
      notify('❌ ' + (e.response?.data?.error || 'Error al guardar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{background:'var(--bp-surface)',borderRadius:14,border:'1px solid var(--bp-border-2)',padding:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontWeight:700,fontSize:13,color:'var(--bp-text)'}}>Guardar como preset</div>
          <div style={{fontSize:11,color:'var(--bp-text-3)',marginTop:2}}>
            Crea una plantilla reutilizable con la configuración de este torneo.
          </div>
        </div>
        <button onClick={() => { setOpen(o => !o); setName(tournament.name || ''); setMsg(''); }}
          style={{fontSize:12,background:'var(--bp-surface-3)',border:'1px solid var(--bp-border)',borderRadius:8,padding:'6px 12px',cursor:'pointer',color:'var(--bp-text)',fontWeight:600,flexShrink:0}}>
          {open ? 'Cancelar' : 'Crear preset'}
        </button>
      </div>

      {open && (
        <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:10}}>
          {/* Config summary */}
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {[
              [LABELS.structures[tournament.structure], 'var(--court-soft)', 'var(--court)'],
              [LABELS.pairingSystems[tournament.pairingSystem], 'var(--ok-soft)', 'var(--ok)'],
              [LABELS.matchFormats[tournament.matchFormat], 'var(--amber-soft)', 'var(--amber)'],
            ].map(([v, bg, col]) => v ? (
              <span key={v} style={{fontSize:10,background:bg,color:col,borderRadius:4,padding:'2px 7px',fontWeight:600}}>{v}</span>
            ) : null)}
          </div>

          <div>
            <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Nombre del preset *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="Ej: Americana semanal Cima"
              style={{width:'100%',border:'1px solid var(--bp-border)',borderRadius:8,padding:'9px 12px',fontSize:13,outline:'none',boxSizing:'border-box'}}
            />
          </div>

          <MsgBanner msg={msg} style={{fontSize:12,borderRadius:8,padding:'8px 12px'}} />

          <button onClick={handleSave} disabled={saving || !name.trim()}
            style={{width:'100%',padding:'10px',borderRadius:8,border:'none',
              background: name.trim() ? 'var(--court)' : 'var(--line)',
              color:'var(--ink)',fontWeight:700,fontSize:13,
              cursor: (saving || !name.trim()) ? 'default' : 'pointer'}}>
            {saving ? 'Guardando…' : 'Guardar preset'}
          </button>
        </div>
      )}
    </div>
  );
}

function ConfigTab({ tournament, allPlayers, onUpdate }) {
  // ── ResultMode ──
  const [mode,      setMode]      = useState(tournament.resultMode || '');
  const [arbitroId, setArbitroId] = useState(tournament.arbitroId || '');

  // ── MaxParticipants ──
  const currentCount = tournament.participants?.length || 0;
  const [newMax,   setNewMax]   = useState(tournament.maxParticipants ?? '');
  const [toRemove, setToRemove] = useState([]);
  const remaining = currentCount - toRemove.length;
  const needed = newMax !== '' && Number(newMax) < remaining ? remaining - Number(newMax) : 0;
  const showRemoveList = newMax !== '' && Number(newMax) < currentCount;

  const toggleRemove = (pid) =>
    setToRemove(p => p.includes(pid) ? p.filter(x => x !== pid) : [...p, pid]);

  // ── Courts ──
  const clubId = tournament.clubId;
  const assignedCourts = (tournament.courts || []).map(tc => tc.court).filter(Boolean);
  const [clubCourts,     setClubCourts]     = useState(null);
  const [selectedCourts, setSelectedCourts] = useState(() => assignedCourts.map(c => c.id));

  useEffect(() => {
    if (!clubId) { setClubCourts([]); return; }
    clubService.getCourts(clubId)
      .then(r => setClubCourts((r.data || []).filter(c => c.isActive)))
      .catch(() => setClubCourts([]));
  }, [clubId]);

  const toggleCourt = (courtId) =>
    setSelectedCourts(prev => prev.includes(courtId) ? prev.filter(id => id !== courtId) : [...prev, courtId]);

  // ── Unified save ──
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState('');

  const canSave = mode && (mode !== 'arbitro' || arbitroId) && needed === 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true); setMsg('');
    const errors = [];
    try {
      const tasks = [
        tournamentInstanceService.updateResultMode(tournament.id, {
          resultMode: mode,
          arbitroId: mode === 'arbitro' ? arbitroId : null,
        }),
        tournamentInstanceService.updateMaxParticipants(tournament.id, {
          maxParticipants: newMax !== '' ? Number(newMax) : null,
          participantsToRemove: toRemove,
        }),
        ...(clubId ? [tournamentInstanceService.setTournamentCourts(tournament.id, selectedCourts)] : []),
      ];
      const [resMode, resMax, resCourts] = await Promise.allSettled(tasks);

      const merged = {};
      if (resMode.status === 'fulfilled') {
        merged.resultMode = resMode.value.data.resultMode;
        merged.arbitroId  = resMode.value.data.arbitroId;
      } else errors.push('modo de resultados');

      if (resMax.status === 'fulfilled') {
        merged.maxParticipants = resMax.value.data.maxParticipants;
        merged.status          = resMax.value.data.status;
        setToRemove([]);
      } else errors.push('cupo máximo');

      if (clubId && resCourts) {
        if (resCourts.status === 'fulfilled') {
          merged.courts = resCourts.value.data.map(c => ({ court: c }));
        } else errors.push('pistas');
      }

      if (Object.keys(merged).length > 0) onUpdate(merged);

      if (errors.length === 0) {
        const extra = merged.status === 'draft' ? ' — partidos eliminados, torneo en borrador' : '';
        setMsg('✅ Configuración guardada' + extra);
      } else {
        setMsg('❌ Error al guardar: ' + errors.join(', '));
      }
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 5000);
    }
  };

  const S = { sel: {width:'100%',border:'1px solid var(--bp-border)',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',background:'var(--bp-surface)'} };

  const reorderedCourts = [...(clubCourts || [])].sort((a, b) => {
    const aS = selectedCourts.includes(a.id); const bS = selectedCourts.includes(b.id);
    return aS === bS ? a.name.localeCompare(b.name) : aS ? -1 : 1;
  });

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>

      {/* ── Modo de resultados ── */}
      <div style={{background:'var(--bp-surface)',borderRadius:14,border:'1px solid var(--bp-border-2)',padding:16}}>
        <div style={{fontWeight:700,fontSize:13,color:'var(--bp-text)',marginBottom:10}}>Quién puede registrar resultados</div>
        <div style={{fontSize:12,color:'var(--bp-text-2)',background:'var(--court-soft)',border:'1px solid var(--court-soft)',borderRadius:8,padding:'8px 12px',marginBottom:12,lineHeight:1.6}}>
          ℹ️ El creador del torneo siempre puede registrar resultados directamente, independientemente de esta configuración.
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Modo de resultados</label>
          <select value={mode} onChange={e => { setMode(e.target.value); setArbitroId(''); }} style={S.sel}>
            <option value="">— Seleccionar —</option>
            <option value="creador">🛡️ Creador del torneo (solo admin/creador)</option>
            <option value="jugador">🎾 Jugadores (proponer / confirmar)</option>
            <option value="arbitro">🟡 Árbitro asignado</option>
          </select>
        </div>
        {mode === 'jugador' && (
          <div style={{fontSize:11,color:'var(--court-deep)',marginTop:10,padding:'8px 12px',background:'var(--court-soft)',borderRadius:8,lineHeight:1.5}}>
            Un equipo propone el resultado, el rival acepta o rechaza. Sin respuesta en 24h → se confirma automáticamente.
          </div>
        )}
        {mode === 'arbitro' && (
          <div style={{marginTop:10}}>
            <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>
              Árbitro asignado <span style={{color:'var(--crimson)'}}>*</span>
            </label>
            <select value={arbitroId} onChange={e => setArbitroId(e.target.value)}
              style={{...S.sel, border: !arbitroId ? '2px solid var(--crimson-soft)' : '1px solid var(--line)'}}>
              <option value="">— Seleccionar persona —</option>
              {allPlayers.map(p => (
                <option key={p.id} value={p.userId}>{p.name}</option>
              ))}
            </select>
            <div style={{fontSize:11,color:'var(--amber)',marginTop:6,padding:'6px 10px',background:'var(--amber-soft)',borderRadius:6,lineHeight:1.5}}>
              El árbitro podrá registrar resultados directamente en todos los partidos del torneo.
            </div>
          </div>
        )}
      </div>

      {/* ── Cupo máximo ── */}
      <div style={{background:'var(--bp-surface)',borderRadius:14,border:'1px solid var(--bp-border-2)',padding:16,display:'flex',flexDirection:'column',gap:12}}>
        <div style={{fontWeight:700,fontSize:13,color:'var(--bp-text)'}}>Cupo máximo de participantes</div>
        <div>
          <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Nuevo cupo (vacío = sin límite)</label>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <input type="number" min="2" max="256" value={newMax}
              onChange={e => { setNewMax(e.target.value); setToRemove([]); }}
              placeholder="Sin límite"
              style={{flex:1,border:'1px solid var(--bp-border)',borderRadius:8,padding:'8px 12px',fontSize:13,outline:'none'}}/>
            <span style={{fontSize:11,color:'var(--bp-text-3)',flexShrink:0}}>{currentCount} inscritos</span>
          </div>
        </div>
        {showRemoveList && (
          <div>
            <div style={{fontSize:11,color:'var(--crimson)',fontWeight:600,marginBottom:6}}>
              {needed > 0
                ? `Selecciona al menos ${needed} jugador${needed!==1?'es':''} más para eliminar:`
                : 'Jugadores a eliminar del torneo:'}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:200,overflowY:'auto'}}>
              {(tournament.participants||[]).map(p => (
                <label key={p.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:8,background:toRemove.includes(p.id)?'var(--crimson-soft)':'var(--bp-surface-2)',cursor:'pointer',border:`1px solid ${toRemove.includes(p.id)?'var(--crimson-soft)':'var(--bp-border)'}`}}>
                  <input type="checkbox" checked={toRemove.includes(p.id)} onChange={()=>toggleRemove(p.id)}
                    style={{accentColor:'var(--crimson)'}}/>
                  <span style={{fontSize:12,color:'var(--bp-text)'}}>{p.player?.name || p.id}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Pistas ── */}
      <div style={{background:'var(--bp-surface)',borderRadius:14,border:'1px solid var(--bp-border-2)',padding:'14px 16px'}}>
        <div style={{fontWeight:700,fontSize:13,color:'var(--bp-text)',marginBottom:4,display:'flex',alignItems:'center',gap:6}}>
          <MapPinIcon style={{width:15,height:15}}/> Pistas del torneo
        </div>
        {!clubId ? (
          <div style={{fontSize:12,color:'var(--bp-text-3)'}}>Este torneo no tiene un club asignado.</div>
        ) : (
          <>
            <div style={{fontSize:11,color:'var(--bp-text-3)',marginBottom:10}}>
              Selecciona las pistas disponibles. Al generar partidos se asignarán automáticamente en rotación.
            </div>
            {clubCourts === null ? (
              <div style={{fontSize:12,color:'var(--bp-text-3)'}}>Cargando pistas…</div>
            ) : reorderedCourts.length === 0 ? (
              <div style={{fontSize:12,color:'var(--bp-text-3)',padding:'8px 0'}}>
                El club no tiene pistas activas. Créalas en la sección Clubs.
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:5}}>
                {reorderedCourts.map(c => {
                  const active = selectedCourts.includes(c.id);
                  return (
                    <label key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
                      background: active ? 'var(--court-soft)' : 'var(--bone-2)',
                      borderRadius:8,border:`1px solid ${active?'var(--court-soft)':'var(--bp-border-2)'}`,cursor:'pointer'}}>
                      <input type="checkbox" checked={active} onChange={() => toggleCourt(c.id)}
                        style={{width:14,height:14,accentColor:'var(--court)',flexShrink:0}} />
                      <MapPinIcon style={{width:13,height:13,color:active?'var(--court-deep)':'var(--ink-soft)',flexShrink:0}} />
                      <span style={{fontSize:13,fontWeight:active?700:400,color:active?'var(--court-deep)':'var(--bp-text)',flex:1}}>
                        {c.name}
                        {c.alias && <span style={{fontWeight:400,color:'var(--ink-soft)',marginLeft:5,fontSize:11}}>· {c.alias}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Botón unificado ── */}
      <MsgBanner msg={msg} style={{fontSize:12,borderRadius:8,padding:'8px 12px'}} />
      <button onClick={handleSave} disabled={saving || !canSave}
        style={{width:'100%',padding:'12px',borderRadius:10,border:'none',
          background: !canSave ? 'var(--line)' : 'var(--court)',
          color:'var(--ink)',fontWeight:700,fontSize:13,
          cursor: (!canSave || saving) ? 'default' : 'pointer'}}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>

      {/* ── Guardar como preset ── */}
      <SaveAsPresetSection tournament={tournament} />
    </div>
  );
}

const T_PAGE_SIZE = 6;

function TournamentPaginator({ page, total, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
      <button onClick={()=>onChange(page-1)} disabled={page===1}
        style={{padding:'6px 14px',borderRadius:8,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:page===1?'var(--line)':'var(--ink-mid)',cursor:page===1?'default':'pointer',fontSize:13,fontWeight:600}}>
        ‹ Anterior
      </button>
      <span style={{fontSize:12,color:'var(--bp-text-2)',fontWeight:600}}>Pág. {page} / {totalPages}</span>
      <button onClick={()=>onChange(page+1)} disabled={page===totalPages}
        style={{padding:'6px 14px',borderRadius:8,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:page===totalPages?'var(--line)':'var(--ink-mid)',cursor:page===totalPages?'default':'pointer',fontSize:13,fontWeight:600}}>
        Siguiente ›
      </button>
    </div>
  );
}

// ─── CimaPadel Schedule Tab ──────────────────────────────────────────────────

const FREQ_LABEL = { weekly:'Semanal', biweekly:'Quincenal', monthly:'Mensual' };

const STATUS_STYLE = {
  scheduled: { label:'Programada', bg:'var(--ok-soft)',    color:'var(--ok)' },
  cancelled:  { label:'Anulada',    bg:'var(--crimson-soft)',color:'var(--crimson)' },
  shifted:    { label:'Desplazada', bg:'var(--amber-soft)', color:'var(--amber)' },
  moved:      { label:'Movida',     bg:'var(--amber-soft)', color:'var(--amber)' },
};

function CimaPadelScheduleTab({ tournament, onUpdate }) {
  const cfg          = tournament.config || {};
  const jornadaDates = cfg.jornadaDates || [];
  const frequency    = cfg.frequency;
  const freqLabel    = typeof frequency === 'number'
    ? `Cada ${frequency} días`
    : (FREQ_LABEL[frequency] || frequency || '—');
  const isCimaPadel  = tournament.structure === 'cima_padel';

  const [postponeTarget, setPostponeTarget] = useState(null);
  const [action,         setAction]         = useState('cancel');
  const [bbqTarget,      setBBQTarget]      = useState(null);
  const [bbqNewCouples,  setBBQNewCouples]  = useState([]); // 2 selected coupleIds
  const [saving,         setSaving]         = useState(false);
  const [msg,            setMsg]            = useState('');

  const notify = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };

  // Build couples list from participants
  const couples = useMemo(() => {
    const used = new Set();
    const result = [];
    for (const p of (tournament.participants || [])) {
      if (used.has(p.id)) continue;
      used.add(p.id);
      const partner = (tournament.participants || []).find(q => q.playerId === p.partnerId && !used.has(q.id));
      if (partner) used.add(partner.id);
      result.push({
        id: p.id,
        name: `${p.player?.name || '?'}${partner ? ' / ' + (partner.player?.name || '?') : ''}`,
      });
    }
    return result;
  }, [tournament.participants]);

  // Extract cooking couple IDs per round from match group JSON — array (new format) or single (legacy)
  const bbqByRound = useMemo(() => {
    const map = {};
    for (const m of (tournament.matches || [])) {
      if (!m.group || map[m.round] !== undefined) continue;
      try {
        const g = typeof m.group === 'string' ? JSON.parse(m.group) : m.group;
        if (g._bbq?.couples?.length) {
          map[m.round] = g._bbq.couples.map(c => c.coupleId);
        } else if (g._bbq?.coupleId) {
          map[m.round] = [g._bbq.coupleId];
        }
      } catch {}
    }
    return map;
  }, [tournament.matches]);

  // Which rounds have any completed match
  const completedRounds = useMemo(() => new Set(
    (tournament.matches || []).filter(m => m.status === 'completed').map(m => m.round)
  ), [tournament.matches]);

  const matchedRounds = useMemo(() => new Set(
    (tournament.matches || []).map(m => m.round)
  ), [tournament.matches]);

  const handlePostpone = async () => {
    if (!postponeTarget) return;
    setSaving(true);
    try {
      const res = await tournamentInstanceService.postponeJornada(tournament.id, {
        jornada: postponeTarget.jornada, action,
      });
      onUpdate({ config: { ...cfg, jornadaDates: res.data.jornadaDates } });
      setPostponeTarget(null);
      notify('✅ Jornada actualizada');
    } catch (e) {
      notify('❌ ' + (e.response?.data?.error || 'Error al aplazar'));
    } finally { setSaving(false); }
  };

  const handleBBQOverride = async () => {
    if (!bbqTarget || bbqNewCouples.length !== 2) return;
    setSaving(true);
    try {
      await tournamentInstanceService.overrideJornadaBBQ(tournament.id, bbqTarget.jornada, bbqNewCouples);
      onUpdate({ _reload: true });
      setBBQTarget(null);
      setBBQNewCouples([]);
      notify('✅ Parejas de cocina cambiadas — partidos de la jornada regenerados');
    } catch (e) {
      notify('❌ ' + (e.response?.data?.error || 'Error al cambiar cocina'));
    } finally { setSaving(false); }
  };

  const fmt = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  const coupleName = (coupleId) => couples.find(c => c.id === coupleId)?.name || '—';

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <MsgBanner msg={msg} />

      {/* Header */}
      <div style={{background:'var(--bp-surface-3)',border:'1px solid var(--bp-border)',borderRadius:10,padding:'10px 14px',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:12,color:'var(--bp-text)',fontWeight:700}}>
          {isCimaPadel ? '🍖 CimaPadel' : '📅 Calendario'}
        </span>
        <span style={{fontSize:12,color:'var(--bp-text-2)'}}>Frecuencia: <strong>{freqLabel}</strong></span>
        {jornadaDates.length > 0 && (
          <span style={{fontSize:12,color:'var(--bp-text-2)'}}>
            {jornadaDates.length} jornadas · {jornadaDates.filter(j=>j.status==='cancelled').length} anuladas
          </span>
        )}
      </div>

      {jornadaDates.length === 0 ? (
        <div style={{textAlign:'center',padding:'24px',color:'var(--bp-text-3)',fontSize:13,lineHeight:1.8}}>
          Sin fechas programadas aún.<br/>
          {isCimaPadel
            ? 'Genera los partidos para calcular el calendario completo del torneo.'
            : 'Las fechas se calcularán automáticamente al generar los partidos.'}
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          {jornadaDates.map(j => {
            const st          = STATUS_STYLE[j.status] || STATUS_STYLE.scheduled;
            const hasMatches  = matchedRounds.has(j.jornada);
            const isCompleted = completedRounds.has(j.jornada);
            const bbqIds      = bbqByRound[j.jornada] || [];
            return (
              <div key={j.jornada} style={{
                display:'flex',alignItems:'center',gap:8,padding:'10px 12px',
                background:'var(--bp-surface)',borderRadius:8,border:'1px solid var(--bp-border)',
                opacity: j.status === 'cancelled' ? 0.6 : 1,
              }}>
                <span style={{
                  minWidth:28,height:28,borderRadius:'50%',background:'var(--bp-surface-3)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:12,fontWeight:700,color:'var(--bp-text-2)',flexShrink:0,
                }}>J{j.jornada}</span>

                <div style={{flex:1,minWidth:0}}>
                  <span style={{fontSize:13,color:'var(--bp-text)',fontWeight:500}}>
                    {fmt(j.date)}
                    {j.originalDate && j.originalDate !== j.date && (
                      <span style={{fontSize:11,color:'var(--bp-text-3)',marginLeft:6,textDecoration:'line-through'}}>
                        {fmt(j.originalDate)}
                      </span>
                    )}
                  </span>
                  {bbqIds.length > 0 && (
                    <div style={{fontSize:11,color:'var(--amber)',marginTop:2}}>
                      🍳 {bbqIds.map(id => coupleName(id)).join(' / ')}
                    </div>
                  )}
                </div>

                <span style={{
                  fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,
                  background:st.bg, color:st.color, flexShrink:0,
                }}>{st.label}</span>

                {isCompleted && (
                  <span style={{fontSize:10,color:'var(--ok)',fontWeight:600,flexShrink:0}}>jugada</span>
                )}

                {/* Cambiar parejas de cocina — solo si tiene partidos y no están todos completados */}
                {isCimaPadel && hasMatches && !isCompleted && j.status !== 'cancelled' && (
                  <button
                    onClick={() => { setBBQTarget(j); setBBQNewCouples(bbqIds); }}
                    style={{
                      fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid var(--amber)',
                      background:'var(--amber-soft)',cursor:'pointer',color:'var(--amber)',
                      fontWeight:600,flexShrink:0,
                    }}
                  >Cocina</button>
                )}

                {j.status !== 'cancelled' && !isCompleted && (
                  <button
                    onClick={() => { setPostponeTarget(j); setAction('cancel'); }}
                    style={{
                      fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid var(--bp-border)',
                      background:'var(--bp-surface)',cursor:'pointer',color:'var(--bp-text-2)',
                      flexShrink:0,
                    }}
                  >Aplazar</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: cambiar parejas de cocina */}
      {bbqTarget && (
        <div style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',
          display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:16,
        }} onClick={e=>{if(e.target===e.currentTarget)setBBQTarget(null);}}>
          <div style={{
            background:'var(--bp-surface)',borderRadius:16,padding:20,width:'100%',maxWidth:400,
            display:'flex',flexDirection:'column',gap:14,boxShadow:'0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{fontWeight:700,fontSize:15,color:'var(--bp-text)'}}>
              🍳 Cambiar cocina — Jornada {bbqTarget.jornada}
            </div>
            <div style={{fontSize:12,color:'var(--bp-text-3)',lineHeight:1.5}}>
              Selecciona exactamente <strong>2 parejas</strong> que cocinarán. Los partidos de la jornada se regenerarán.
              <span style={{marginLeft:6,fontWeight:700,color: bbqNewCouples.length === 2 ? 'var(--ok)' : 'var(--amber)'}}>
                {bbqNewCouples.length}/2 seleccionadas
              </span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:280,overflowY:'auto'}}>
              {couples.map(c => {
                const isSelected = bbqNewCouples.includes(c.id);
                const isCurrent  = (bbqByRound[bbqTarget.jornada] || []).includes(c.id);
                const toggle = () => {
                  if (isSelected) {
                    setBBQNewCouples(prev => prev.filter(id => id !== c.id));
                  } else if (bbqNewCouples.length < 2) {
                    setBBQNewCouples(prev => [...prev, c.id]);
                  }
                };
                return (
                  <label key={c.id} style={{
                    display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:8,
                    cursor: (!isSelected && bbqNewCouples.length >= 2) ? 'not-allowed' : 'pointer',
                    opacity: (!isSelected && bbqNewCouples.length >= 2) ? 0.5 : 1,
                    background: isSelected ? 'var(--amber-soft)' : 'var(--bp-surface-2)',
                    border: `1px solid ${isSelected ? 'var(--amber)' : 'var(--bp-border)'}`,
                  }}>
                    <input type="checkbox" checked={isSelected} onChange={toggle}
                      disabled={!isSelected && bbqNewCouples.length >= 2}
                      style={{accentColor:'var(--amber)',flexShrink:0}} />
                    <span style={{fontSize:13,fontWeight:isSelected?700:400,color:'var(--bp-text)',flex:1}}>{c.name}</span>
                    {isCurrent && (
                      <span style={{fontSize:10,color:'var(--amber)',fontWeight:700,flexShrink:0}}>actual</span>
                    )}
                  </label>
                );
              })}
            </div>
            <div style={{display:'flex',gap:8,marginTop:4}}>
              <button onClick={() => { setBBQTarget(null); setBBQNewCouples([]); }}
                style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',cursor:'pointer',fontSize:13}}>
                Cancelar
              </button>
              <button onClick={handleBBQOverride} disabled={saving || bbqNewCouples.length !== 2}
                style={{flex:2,padding:'10px',borderRadius:10,border:'none',
                  background: bbqNewCouples.length === 2 ? 'var(--court)' : 'var(--line)',
                  color:'var(--ink)',fontWeight:700,fontSize:13,
                  cursor: bbqNewCouples.length === 2 ? 'pointer' : 'default'}}>
                {saving ? 'Guardando…' : 'Confirmar cambio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: aplazar */}
      {postponeTarget && (
        <div style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',
          display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:16,
        }} onClick={e=>{if(e.target===e.currentTarget)setPostponeTarget(null);}}>
          <div style={{
            background:'var(--bp-surface)',borderRadius:16,padding:20,width:'100%',maxWidth:380,
            display:'flex',flexDirection:'column',gap:14,boxShadow:'0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{fontWeight:700,fontSize:15,color:'var(--bp-text)'}}>
              Aplazar jornada {postponeTarget.jornada} · {fmt(postponeTarget.date)}
            </div>

            {[
              ['cancel',     'Anular',              'La jornada queda sin fecha. No cuenta en la rotación BBQ.'],
              ['move_to_end','Mover al final',       'Se reprograma después de la última jornada del calendario (estira el torneo).'],
              ['shift_all',  'Desplazar todo',       'Esta jornada y todas las siguientes se retrasan un período (estira el torneo).'],
            ].map(([val, label, desc]) => (
              <label key={val} style={{display:'flex',gap:10,cursor:'pointer',alignItems:'flex-start'}}>
                <input type="radio" name="postpone_action" value={val} checked={action===val}
                  onChange={()=>setAction(val)}
                  style={{marginTop:2,accentColor:'var(--court)',flexShrink:0}}/>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--bp-text)'}}>{label}</div>
                  <div style={{fontSize:11,color:'var(--bp-text-3)',lineHeight:1.4,marginTop:2}}>{desc}</div>
                </div>
              </label>
            ))}

            <div style={{display:'flex',gap:8,marginTop:4}}>
              <button onClick={()=>setPostponeTarget(null)}
                style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',cursor:'pointer',fontSize:13}}>
                Cancelar
              </button>
              <button onClick={handlePostpone} disabled={saving}
                style={{flex:2,padding:'10px',borderRadius:10,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                {saving ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CimaPadel helpers ────────────────────────────────────────────────────────

function getNextCimaDate(tournament, nextRound) {
  const cfg = tournament.config || {};
  const entry = (cfg.jornadaDates || []).find(j => j.jornada === nextRound && j.date);
  if (entry) return entry.date;
  if (!tournament.startDate || !cfg.frequency || cfg.frequency === 'free') return null;
  const freqDays = { weekly:7, biweekly:14, monthly:30 }[cfg.frequency] ?? (parseInt(cfg.frequency) || 7);
  const start = new Date(String(tournament.startDate).split('T')[0] + 'T00:00:00');
  start.setDate(start.getDate() + (nextRound - 1) * freqDays);
  return start.toISOString().split('T')[0];
}

function fmtShortDate(iso) {
  if (!iso) return null;
  const [, m, d] = iso.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]}`;
}

// ─── CimaPadel components ─────────────────────────────────────────────────────

function CimaAvailModal({ tournament, nextRound, onConfirm, onCancel }) {
  const couples = useMemo(() => {
    const active = (tournament.participants || []).filter(p => p.status === 'active');
    const used = new Set();
    const result = [];
    for (const p of active) {
      if (used.has(p.id)) continue;
      used.add(p.id);
      const partner = active.find(q => q.playerId === p.partnerId && !used.has(q.id));
      if (partner) used.add(partner.id);
      const n1 = p.player?.name?.split(' ')[0] || '?';
      const n2 = partner?.player?.name?.split(' ')[0] || null;
      result.push({ id: p.id, name: n2 ? `${n1} & ${n2}` : n1 });
    }
    return result;
  }, [tournament.participants]);

  const [selected, setSelected] = useState(() => new Set(couples.map(c => c.id)));
  const [generating, setGenerating] = useState(false);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleConfirm = async () => {
    setGenerating(true);
    try { await onConfirm([...selected]); } finally { setGenerating(false); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:16}}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{background:'var(--bp-surface)',borderRadius:16,padding:20,width:'100%',maxWidth:360,display:'flex',flexDirection:'column',gap:14,boxShadow:'0 8px 32px rgba(0,0,0,0.18)'}}>
        <div style={{fontWeight:700,fontSize:15,color:'var(--bp-text)'}}>
          🍳 Jornada {nextRound} — ¿Quién asiste?
        </div>
        <div style={{fontSize:12,color:'var(--bp-text-3)',lineHeight:1.5}}>
          Marca las parejas presentes. Solo las marcadas participarán.
          <span style={{marginLeft:6,fontWeight:700,color:selected.size>=3?'var(--ok)':'var(--amber)'}}>
            {selected.size} seleccionadas
          </span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:280,overflowY:'auto'}}>
          {couples.map(c => (
            <label key={c.id} style={{
              display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:8,cursor:'pointer',
              background:selected.has(c.id)?'var(--court-soft)':'var(--bp-surface-2)',
              border:`1px solid ${selected.has(c.id)?'var(--court)':'var(--bp-border)'}`,
            }}>
              <input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggle(c.id)}
                style={{accentColor:'var(--court)',flexShrink:0}} />
              <span style={{fontSize:13,fontWeight:selected.has(c.id)?700:400,color:'var(--bp-text)'}}>
                {c.name}
              </span>
            </label>
          ))}
        </div>
        <div style={{display:'flex',gap:8,marginTop:4}}>
          <button onClick={onCancel} style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',cursor:'pointer',fontSize:13}}>
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={generating||selected.size<3}
            style={{flex:2,padding:'10px',borderRadius:10,border:'none',
              background:selected.size>=3?'var(--court)':'var(--line)',
              color:'var(--ink)',fontWeight:700,fontSize:13,cursor:selected.size>=3?'pointer':'default'}}>
            {generating?'Generando…':`Generar Jornada ${nextRound}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function CimaPadelRoundEditor({ round, matches, participants, onAssign, saving }) {
  const roundState = useMemo(() => {
    const cookingIds = [];
    const matchSlots = [];
    for (const m of matches) {
      if (!m.group) continue;
      try {
        const g = typeof m.group === 'string' ? JSON.parse(m.group) : m.group;
        if (g._bbq?.couples?.length) { g._bbq.couples.forEach(c => cookingIds.push(c.coupleId)); break; }
      } catch {}
    }
    for (const m of matches) {
      if (m.participant1Id && m.participant2Id) {
        matchSlots.push({ couple1Id: m.participant1Id, couple2Id: m.participant2Id });
      }
    }
    return { cookingIds, matchSlots };
  }, [matches]);

  // useRef para dragSlot evita re-render en onDragStart, que desmontaría los elementos drag
  const dragSlotRef = useRef(null);
  const [dropTarget, setDropTarget] = useState(null);

  const coupleNameFromId = (id) => {
    const p1 = participants.find(p => p.id === id);
    if (!p1) return '?';
    const n1 = p1.player?.name?.split(' ')[0] || '?';
    if (!p1.partnerId) return n1;
    const p2 = participants.find(p => p.playerId === p1.partnerId && p.id !== p1.id);
    return p2 ? `${n1} & ${p2.player?.name?.split(' ')[0]||'?'}` : n1;
  };

  const getIdAtSlot = (state, slot) => {
    const [type, a, b] = slot.split('-');
    if (type === 'cook') return state.cookingIds[parseInt(a)] ?? null;
    return parseInt(b) === 0 ? state.matchSlots[parseInt(a)]?.couple1Id : state.matchSlots[parseInt(a)]?.couple2Id;
  };

  const setIdAtSlot = (state, slot, id) => {
    const [type, a, b] = slot.split('-');
    if (type === 'cook') {
      const c = [...state.cookingIds]; c[parseInt(a)] = id;
      return { ...state, cookingIds: c };
    }
    const mi = parseInt(a); const si = parseInt(b);
    const ms = state.matchSlots.map((s, i) => i === mi ? { ...s, [si===0?'couple1Id':'couple2Id']: id } : s);
    return { ...state, matchSlots: ms };
  };

  const doSwap = (slotA, slotB) => {
    const idA = getIdAtSlot(roundState, slotA);
    const idB = getIdAtSlot(roundState, slotB);
    if (!idA || !idB || idA === idB) return;
    let s = setIdAtSlot(roundState, slotA, idB);
    s = setIdAtSlot(s, slotB, idA);
    onAssign(s.cookingIds, s.matchSlots);
  };

  // Función de render inline (no componente React) para evitar desmontaje en re-renders
  const renderSlot = (slot, isCooking) => {
    const id = getIdAtSlot(roundState, slot);
    const isOver = dropTarget === slot;
    return (
      <div
        key={slot}
        draggable={!saving}
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; dragSlotRef.current = slot; }}
        onDragOver={e => { e.preventDefault(); if (dropTarget !== slot) setDropTarget(slot); }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={e => {
          e.preventDefault();
          const src = dragSlotRef.current;
          if (src && src !== slot) doSwap(src, slot);
          dragSlotRef.current = null;
          setDropTarget(null);
        }}
        onDragEnd={() => { dragSlotRef.current = null; setDropTarget(null); }}
        style={{
          padding:'7px 12px', borderRadius:8, cursor:saving?'wait':'grab',
          fontSize:12, fontWeight:600, userSelect:'none',
          display:'inline-flex', alignItems:'center', gap:6,
          background: isOver ? 'var(--court-soft)' : (isCooking ? 'var(--amber-soft)' : 'var(--bp-surface-2)'),
          border: `2px solid ${isOver ? 'var(--court)' : (isCooking ? 'var(--amber)' : 'var(--bp-border)')}`,
          color: isCooking ? 'var(--amber)' : 'var(--bp-text)',
          transition: 'background 0.1s, border-color 0.1s', minWidth:90,
        }}>
        <span style={{fontSize:9,opacity:0.5,lineHeight:1}}>⠿</span>
        {coupleNameFromId(id)}
      </div>
    );
  };

  if (!roundState.cookingIds.length && !roundState.matchSlots.length) return null;

  return (
    <div style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>
      {saving && <div style={{fontSize:11,color:'var(--bp-text-3)',textAlign:'center'}}>Guardando…</div>}
      {roundState.cookingIds.length > 0 && (
        <div style={{background:'rgba(245,158,11,0.06)',borderRadius:10,padding:'10px 12px',border:'1px dashed var(--amber)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:'var(--amber)',fontWeight:700,flexShrink:0}}>🍳 Cocinan:</span>
          {roundState.cookingIds.map((_, i) => renderSlot(`cook-${i}`, true))}
        </div>
      )}
      {roundState.matchSlots.map((_, mi) => (
        <div key={mi} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:'var(--bp-text-3)',fontWeight:600,flexShrink:0,minWidth:50}}>Pista {mi+1}:</span>
          {renderSlot(`match-${mi}-0`, false)}
          <span style={{color:'var(--line)',fontWeight:700,fontSize:12}}>vs</span>
          {renderSlot(`match-${mi}-1`, false)}
        </div>
      ))}
      <div style={{fontSize:10,color:'var(--bp-text-3)',marginTop:2}}>↕ Arrastra una pareja a otra posición para intercambiarlas</div>
    </div>
  );
}

function CimaScoreEntry({ match, coupleName, tournamentId, onSaved, onCancel }) {
  const [sets, setSets] = useState([{t1:'',t2:''},{t1:'',t2:''}]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const update = (i, field, val) => {
    if (i === 'add') { setSets(p => [...p, {t1:'',t2:''}]); return; }
    setSets(p => p.map((s, idx) => idx === i ? {...s, [field]: val} : s));
  };
  const valid = sets.filter(s => s.t1 !== '' && s.t2 !== '');
  const t1w = valid.filter(s => parseInt(s.t1) > parseInt(s.t2)).length;
  const t2w = valid.filter(s => parseInt(s.t2) > parseInt(s.t1)).length;

  const handleSave = async () => {
    if (!valid.length || saving) return;
    setSaving(true);
    try {
      await tournamentInstanceService.setResult(tournamentId, match.id, { sets: valid });
      onSaved(match.id, valid);
    } catch(e) {
      setMsg(e.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const n1 = coupleName(match.participant1Id);
  const n2 = coupleName(match.participant2Id);

  return (
    <div style={{padding:'10px 14px',background:'var(--bp-surface-2)',borderTop:'1px solid var(--bp-border-2)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:'var(--bp-text)'}}>Registrar resultado</span>
        <button onClick={onCancel} style={{fontSize:11,background:'none',border:'none',cursor:'pointer',color:'var(--bp-text-3)'}}>✕</button>
      </div>
      <div style={{display:'flex',gap:4,justifyContent:'center',marginBottom:8,fontSize:11,fontWeight:600}}>
        <span style={{color:'var(--court-deep)'}}>{n1}</span>
        <span style={{color:'var(--line)'}}>vs</span>
        <span>{n2}</span>
      </div>
      {sets.map((s, i) => (
        <div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
          <span style={{fontSize:11,color:'var(--bp-text-3)',width:36,flexShrink:0}}>Set {i+1}</span>
          <input type="number" min="0" max="7" value={s.t1} onChange={e=>update(i,'t1',e.target.value)}
            placeholder={n1.split(' ')[0]} style={{width:50,border:'2px solid var(--court)',borderRadius:6,padding:'5px',fontSize:14,textAlign:'center',outline:'none',fontWeight:700,color:'var(--court-deep)'}}/>
          <span style={{color:'var(--line)',fontWeight:700}}>-</span>
          <input type="number" min="0" max="7" value={s.t2} onChange={e=>update(i,'t2',e.target.value)}
            placeholder={n2.split(' ')[0]} style={{width:50,border:'1px solid var(--bp-border)',borderRadius:6,padding:'5px',fontSize:14,textAlign:'center',outline:'none',fontWeight:700}}/>
        </div>
      ))}
      {valid.length > 0 && (
        <div style={{fontSize:11,color:'var(--bp-text-2)',marginBottom:6,textAlign:'center'}}>
          {n1.split(' ')[0]} <strong style={{color:'var(--court-deep)'}}>{t1w}</strong> – <strong>{t2w}</strong> {n2.split(' ')[0]}
        </div>
      )}
      <button type="button" onClick={()=>update('add')} style={{fontSize:11,color:'var(--court-deep)',background:'none',border:'none',cursor:'pointer',marginBottom:8,padding:0}}>+ Set</button>
      {msg && <div style={{fontSize:11,color:'var(--crimson)',marginBottom:6}}>{msg}</div>}
      <div style={{display:'flex',gap:6}}>
        <button onClick={onCancel} style={{flex:1,padding:'7px',borderRadius:7,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',fontSize:12,cursor:'pointer'}}>Cancelar</button>
        <button onClick={handleSave} disabled={saving||!valid.length}
          style={{flex:2,padding:'7px',borderRadius:7,border:'none',background:valid.length?'var(--court)':'var(--line)',color:'var(--ink)',fontWeight:700,fontSize:12,cursor:valid.length?'pointer':'default'}}>
          {saving?'Guardando…':'Guardar resultado'}
        </button>
      </div>
    </div>
  );
}

function CimaPadelMatchesView({ tournament, nextRound, cimaAssigning, onGenerateRound, onAssign, onDeleteRound, onResultSaved }) {
  const matches = tournament.matches || [];
  const participants = tournament.participants || [];
  const byRound = {};
  for (const m of matches) { if (!byRound[m.round]) byRound[m.round]=[]; byRound[m.round].push(m); }
  const rounds = Object.keys(byRound).map(Number).sort((a,b)=>b-a);

  const [editMatchId, setEditMatchId] = useState(null);

  const nextDate = getNextCimaDate(tournament, nextRound);
  const nextLabel = nextDate ? fmtShortDate(nextDate) : null;
  const isActive = tournament.status === 'active';

  const coupleName = (id) => {
    const p1 = participants.find(p => p.id === id);
    if (!p1) return '?';
    const n1 = p1.player?.name?.split(' ')[0]||'?';
    if (!p1.partnerId) return n1;
    const p2 = participants.find(p => p.playerId===p1.partnerId && p.id!==p1.id);
    return p2 ? `${n1} & ${p2.player?.name?.split(' ')[0]||'?'}` : n1;
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0'}}>
        <span style={{fontWeight:700,fontSize:13,color:'var(--bp-text)'}}>
          CimaPadel · {rounds.length} jornada{rounds.length!==1?'s':''}
        </span>
        <button onClick={onGenerateRound} style={{fontSize:12,background:'var(--court)',border:'none',borderRadius:8,padding:'7px 14px',color:'var(--ink)',fontWeight:700,cursor:'pointer'}}>
          {nextLabel ? `Próxima fecha · ${nextLabel}` : `Generar Jornada ${nextRound}`}
        </button>
      </div>

      {rounds.length === 0 && (
        <div style={{textAlign:'center',padding:'40px 0',color:'var(--bp-text-3)',fontSize:13,lineHeight:1.8}}>
          Sin jornadas aún.<br/>{nextLabel ? `Próxima fecha: ${nextLabel}` : 'Pulsa el botón para empezar.'}
        </div>
      )}

      {rounds.map(round => {
        const rMatches = byRound[round];
        const allCompleted = rMatches.every(m => m.status==='completed');
        const hasBBQData = rMatches.some(m => { try { return !!JSON.parse(m.group||'{}')._bbq; } catch { return false; } });
        return (
          <div key={round} style={{background:'var(--bp-surface)',borderRadius:14,border:`1px solid ${allCompleted?'var(--ok-soft)':'var(--bp-border-2)'}`,overflow:'hidden'}}>
            <div style={{padding:'8px 14px',background:'var(--bp-surface-2)',borderBottom:'1px solid var(--bp-border-2)',display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontWeight:700,fontSize:12,color:'var(--bp-text-2)'}}>
                Jornada {round} · {rMatches.length} partido{rMatches.length!==1?'s':''}
              </span>
              {allCompleted && <span style={{fontSize:10,color:'var(--ok)',fontWeight:700}}>✓ Completada</span>}
              {cimaAssigning[round] && <span style={{fontSize:10,color:'var(--bp-text-3)'}}>Guardando…</span>}
              <button onClick={() => onDeleteRound(round, rMatches)}
                style={{marginLeft:'auto',fontSize:11,padding:'3px 9px',borderRadius:6,border:'1px solid var(--crimson-soft)',background:'var(--crimson-soft)',color:'var(--crimson)',cursor:'pointer',fontWeight:600,flexShrink:0}}>
                Eliminar
              </button>
            </div>
            {!allCompleted && hasBBQData && (
              <CimaPadelRoundEditor
                round={round}
                matches={rMatches}
                participants={participants}
                onAssign={(cookingIds, matchSlots) => onAssign(round, cookingIds, matchSlots)}
                saving={!!cimaAssigning[round]}
              />
            )}
            {/* Result entry for every match in the round */}
            <div style={{display:'flex',flexDirection:'column',borderTop: hasBBQData && !allCompleted ? '1px solid var(--bp-border-2)' : undefined}}>
              {rMatches.map(m => {
                const score = m.result?.sets ? m.result.sets.map(s=>`${s.t1}-${s.t2}`).join(', ') : null;
                const isEditing = editMatchId === m.id;
                return (
                  <div key={m.id} style={{borderBottom:'1px solid var(--bone-2)'}}>
                    <div style={{padding:'8px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:12,color:'var(--bp-text)',flex:1,minWidth:0}}>
                        <span style={{fontWeight:600}}>{coupleName(m.participant1Id)}</span>
                        <span style={{color:'var(--line)',margin:'0 5px'}}>vs</span>
                        <span style={{fontWeight:600}}>{coupleName(m.participant2Id)}</span>
                      </span>
                      <div style={{display:'flex',gap:5,alignItems:'center',flexShrink:0}}>
                        {score && <span style={{fontSize:11,color:'var(--bp-text-2)',fontWeight:600}}>{score}</span>}
                        <span style={{fontSize:10,borderRadius:6,padding:'2px 7px',background:m.status==='completed'?'var(--ok-soft)':'var(--bone-3)',color:m.status==='completed'?'var(--ok)':'var(--ink-soft)'}}>
                          {m.status==='completed'?'✓':'⏳'}
                        </span>
                        {isActive && (
                          <button onClick={() => setEditMatchId(isEditing ? null : m.id)}
                            style={{fontSize:10,background:isEditing?'var(--court-soft)':'var(--bone-3)',border:'none',borderRadius:5,padding:'3px 8px',cursor:'pointer',color:isEditing?'var(--court-deep)':'var(--ink-soft)',fontWeight:600}}>
                            {m.status==='completed'?'✏️':'📝'}
                          </button>
                        )}
                      </div>
                    </div>
                    {isEditing && (
                      <CimaScoreEntry
                        match={m}
                        coupleName={coupleName}
                        tournamentId={tournament.id}
                        onSaved={(matchId, sets) => {
                          setEditMatchId(null);
                          onResultSaved && onResultSaved(matchId, sets);
                        }}
                        onCancel={() => setEditMatchId(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TournamentInstances() {
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [allPlayers,  setAllPlayers]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [activeTab,   setActiveTab]   = useState('participants');
  const [mainTab,     setMainTab]     = useState('list');
  const [msg,         setMsg]         = useState('');
  const [tSearch,     setTSearch]     = useState('');
  const [tStatus,     setTStatus]     = useState('');
  const [tClub,       setTClub]       = useState('');
  const [tPage,       setTPage]       = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteInput,   setDeleteInput]   = useState('');
  // Allowed tournament types for current user's club (null = all allowed)
  const [allowedStructures,    setAllowedStructures]    = useState(null);
  const [allowedPairingSystems, setAllowedPairingSystems] = useState(null);
  // CimaPadel incremental generation
  const [showCimaAvail,  setShowCimaAvail]  = useState(false);
  const [cimaAssigning,  setCimaAssigning]  = useState({}); // { [jornada]: boolean }

  useEffect(()=>{
    async function load(){
      try{
        const [tRes, plRes] = await Promise.all([
          tournamentInstanceService.getAll(),
          playerService.search('')
        ]);
        setTournaments(tRes.data||[]);
        setAllPlayers(plRes.data||[]);
      }catch(e){console.error(e);}finally{setLoading(false);}
    }
    load();
  },[]);

  // Load allowed tournament types for the current user's club (ADMIN only)
  useEffect(()=>{
    if (isSuperAdmin()) return; // super admin: no restrictions
    async function loadClubTypes() {
      try {
        const res = await clubService.getAll();
        const clubs = res.data || [];
        // Pick first club (admin's primary club)
        if (clubs.length > 0) {
          const club = clubs[0];
          setAllowedStructures(club.allowedStructures ?? null);
          setAllowedPairingSystems(club.allowedPairingSystems ?? null);
        }
      } catch { /* ignore */ }
    }
    loadClubTypes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const notify = (m) => { setMsg(m); setTimeout(()=>setMsg(''),3000); };

  const nextCimaRound = useMemo(() => {
    if (!selected || selected.structure !== 'cima_padel') return 1;
    const rounds = (selected.matches || []).map(m => m.round);
    return rounds.length > 0 ? Math.max(...rounds) + 1 : 1;
  }, [selected]);

  const handleGenerateCimaRound = async (availableCoupleIds) => {
    try {
      const res = await tournamentInstanceService.generateCimaPadelRound(selected.id, availableCoupleIds);
      await handleRefreshSelected();
      setActiveTab('matches');
      setShowCimaAvail(false);
      notify(`✅ Jornada ${res.data.jornada} generada (${res.data.count} partidos)`);
    } catch(e) {
      notify('❌ ' + (e.response?.data?.error || 'Error al generar'));
    }
  };

  const handleCimaAssign = async (jornada, cookingIds, matchSlots) => {
    setCimaAssigning(prev => ({ ...prev, [jornada]: true }));
    try {
      await tournamentInstanceService.setCimaPadelRoundAssignment(selected.id, jornada, cookingIds, matchSlots);
      await handleRefreshSelected();
    } catch(e) {
      notify('❌ ' + (e.response?.data?.error || 'Error al guardar'));
    } finally {
      setCimaAssigning(prev => ({ ...prev, [jornada]: false }));
    }
  };

  const handleCimaDeleteRound = async (jornada, roundMatches) => {
    if (!confirm(`¿Eliminar Jornada ${jornada} y sus ${roundMatches.length} partido(s)?`)) return;
    try {
      for (const m of roundMatches) {
        await fetch(`/api/tournament-instances/${selected.id}/matches/${m.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('bp_token')}` },
        });
      }
      setSelected(prev => ({ ...prev, matches: (prev.matches || []).filter(m => m.round !== jornada) }));
    } catch(e) {
      notify('❌ Error al eliminar la jornada');
    }
  };

  const handleDeleteTournament = (t, e) => {
    e.stopPropagation();
    setDeleteConfirm({ id: t.id, name: t.name, step: 1 });
    setDeleteInput('');
  };

  const handleDeleteStep1 = async () => {
    try {
      await tournamentInstanceService.deleteTournament(deleteConfirm.id, false);
      setTournaments(p => p.filter(x => x.id !== deleteConfirm.id));
      setDeleteConfirm(null);
      notify('✅ Torneo eliminado');
    } catch(err) {
      if (err.response?.status === 409 && err.response.data?.requiresConfirmation) {
        setDeleteConfirm(prev => ({ ...prev, step: 2, ...err.response.data }));
        setDeleteInput('');
      } else {
        notify('❌ ' + (err.response?.data?.error || 'Error'));
        setDeleteConfirm(null);
      }
    }
  };

  const handleDeleteStep2 = async () => {
    const required = `eliminar torneo ${deleteConfirm.name}`;
    if (deleteInput !== required) return;
    try {
      await tournamentInstanceService.deleteTournament(deleteConfirm.id, true);
      setTournaments(p => p.filter(x => x.id !== deleteConfirm.id));
      setDeleteConfirm(null);
      notify('✅ Torneo eliminado');
    } catch(err) {
      notify('❌ ' + (err.response?.data?.error || 'Error'));
    }
  };

  const handleCreate = async (form) => {
    try{
      const payload = { ...form };
      if (form.frequency && form.frequency !== 'free') {
        const freq = form.frequency === 'custom'
          ? parseInt(form.frequencyDays) || 14
          : form.frequency;
        payload.config = { ...(form.config || {}), frequency: freq };
      }
      const res = await tournamentInstanceService.create(payload);
      setTournaments(p=>[res.data,...p]);
      setShowCreate(false);
      setSelected(res.data);
      setActiveTab('participants');
      notify('✅ Torneo creado');
    }catch(e){ notify('❌ '+(e.response?.data?.error||'Error')); }
  };

  const handleAddParticipant = async (playerId, partnerId=null) => {
    try{
      const res = await tournamentInstanceService.addParticipant(selected.id, { playerId, partnerId: partnerId||null });
      const newParticipants = Array.isArray(res.data) ? res.data : [res.data];
      const updated = { ...selected, participants: [...(selected.participants||[]), ...newParticipants] };
      setSelected(updated);
      setTournaments(p=>p.map(t=>t.id===selected.id?{...t,participants:updated.participants}:t));
    }catch(e){ notify('❌ '+(e.response?.data?.error||'Error')); }
  };

  const handleRemoveParticipant = async (participantId) => {
    try{
      const participant = selected.participants.find(p=>p.id===participantId);
      await tournamentInstanceService.removeParticipant(selected.id, participantId);
      let remaining = selected.participants.filter(p=>p.id!==participantId);
      // If had partner, also remove partner
      if (participant?.partnerId) {
        const partnerEntry = remaining.find(p=>p.playerId===participant.partnerId);
        if (partnerEntry) {
          await tournamentInstanceService.removeParticipant(selected.id, partnerEntry.id);
          remaining = remaining.filter(p=>p.id!==partnerEntry.id);
        }
      }
      const updated = { ...selected, participants: remaining };
      setSelected(updated);
      setTournaments(p=>p.map(t=>t.id===selected.id?{...t,participants:updated.participants}:t));
    }catch(e){ notify('❌ '+(e.response?.data?.error||'Error')); }
  };

  const handleGenerate = async () => {
    const res = await tournamentInstanceService.generateMatches(selected.id);
    const full = await tournamentInstanceService.getById(selected.id);
    const updated = {
      ...full.data,
      matches: full.data.matches || [],
      participants: full.data.participants || []
    };
    setSelected(updated);
    setTournaments(p=>p.map(t=>t.id===selected.id?updated:t));
    setActiveTab('matches');
    return res.data;
  };

  const handleStart = async () => {
    const res = await tournamentInstanceService.start(selected.id);
    const updated = { ...selected, status: 'active' };
    setSelected(updated);
    setTournaments(p=>p.map(t=>t.id===selected.id?{...t,status:'active'}:t));
    return res.data;
  };

  const handleReset = async (keepPlayers) => {
    await tournamentInstanceService.reset(selected.id, keepPlayers);
    const full = await tournamentInstanceService.getById(selected.id);
    const updated = { ...full.data, matches: [], participants: full.data.participants||[] };
    setSelected(updated);
    setTournaments(p=>p.map(t=>t.id===selected.id?updated:t));
    setActiveTab('participants');
  };

  const handleRefreshSelected = async () => {
    const res = await tournamentInstanceService.getById(selected.id);
    const updated = { ...res.data };
    setSelected(updated);
    setTournaments(p=>p.map(t=>t.id===selected.id?updated:t));
  };

  if(loading) return <div style={{display:'flex',justifyContent:'center',padding:'80px 0',color:'var(--bp-text-3)'}}>Cargando...</div>;

  return (
    <>
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {/* Header */}
      <div style={{background:'var(--paper)',borderRadius:20,padding:16,border:'1px solid var(--line)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:11,color:'var(--ink-soft)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Admin</div>
          <div style={{fontWeight:700,fontSize:18,marginTop:4}}>⚡ Torneos activos</div>
          <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:2}}>{(tournaments||[]).length} torneos</div>
        </div>
        <button onClick={()=>{setShowCreate(true);setSelected(null);}} style={{background:'var(--court)',border:'none',borderRadius:10,padding:'10px 16px',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:'pointer'}}>
          + Nuevo torneo
        </button>
      </div>


      <MsgBanner msg={msg} />

      {showCreate && mainTab === 'list' && (
        <CreateTournamentForm onSave={handleCreate} onCancel={()=>setShowCreate(false)}
          allowedStructures={allowedStructures} allowedPairingSystems={allowedPairingSystems}/>
      )}

      {/* Tournament list */}
      {!selected && mainTab==='list' && (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {/* Search + filter */}
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <div style={{position:'relative',flex:1,minWidth:180}}>
              <input
                value={tSearch} onChange={e=>{setTSearch(e.target.value);setTPage(1);}}
                placeholder="Buscar torneo..."
                style={{width:'100%',border:'1px solid var(--bp-border)',borderRadius:10,padding:'9px 32px 9px 12px',fontSize:13,outline:'none',boxSizing:'border-box'}}
              />
              {tSearch && (
                <button onClick={()=>{setTSearch('');setTPage(1);}} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--bp-text-3)',fontSize:18,cursor:'pointer',lineHeight:1}}>×</button>
              )}
            </div>
            <select value={tStatus} onChange={e=>{setTStatus(e.target.value);setTPage(1);}}
              style={{border:'1px solid var(--bp-border)',borderRadius:10,padding:'9px 10px',fontSize:12,outline:'none',background:'var(--bp-surface)',color:'var(--bp-text)',flexShrink:0}}>
              <option value="">Estado: todos</option>
              <option value="draft">Borrador</option>
              <option value="active">Activo</option>
              <option value="completed">Finalizado</option>
              <option value="cancelled">Cancelado</option>
            </select>
            {isAdmin() && (() => {
              const clubs = [];
              const seen = new Set();
              (tournaments||[]).forEach(t => {
                if (t.club && !seen.has(t.club.id)) { seen.add(t.club.id); clubs.push(t.club); }
              });
              const hasNoClub = (tournaments||[]).some(t => !t.club);
              // SUPER_ADMIN: siempre mostrar si hay clubs o torneos sin club
              // ADMIN normal: solo si hay ≥2 clubs distintos
              if (isSuperAdmin() ? clubs.length === 0 && !hasNoClub : clubs.length < 2) return null;
              return (
                <select value={tClub} onChange={e=>{setTClub(e.target.value);setTPage(1);}}
                  style={{border:'1px solid var(--bp-border)',borderRadius:10,padding:'9px 10px',fontSize:12,outline:'none',background:'var(--bp-surface)',color:'var(--bp-text)',flexShrink:0}}>
                  <option value="">Club: todos</option>
                  {clubs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  {isSuperAdmin() && hasNoClub && <option value="__none__">Sin club</option>}
                </select>
              );
            })()}
          </div>

          {(() => {
            const filtered = (tournaments||[]).filter(t =>
              (!tSearch || t.name.toLowerCase().includes(tSearch.toLowerCase())) &&
              (!tStatus || t.status === tStatus) &&
              (!tClub   || (tClub === '__none__' ? !t.club : t.club?.id === tClub))
            );
            const paginated = filtered.slice((tPage-1)*T_PAGE_SIZE, tPage*T_PAGE_SIZE);

            if (filtered.length === 0) return (
              <div style={{textAlign:'center',padding:'32px 0',color:'var(--bp-text-3)',fontSize:13}}>
                {(tournaments||[]).length === 0 ? 'No hay torneos. Crea el primero.' : 'Sin resultados para esta búsqueda.'}
              </div>
            );

            return (
              <>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {paginated.map(t=>(
                    <div key={t.id} onClick={async()=>{
                      const res = await tournamentInstanceService.getById(t.id);
                      setSelected(res.data);
                      setActiveTab('participants');
                    }} style={{background:'var(--bp-surface)',borderRadius:14,border:'1px solid var(--bp-border-2)',padding:'14px 16px',cursor:'pointer'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                        <div style={{flex:1,minWidth:0,marginRight:8}}>
                          <div style={{fontSize:15,fontWeight:700,color:'var(--bp-text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ICONS[t.structure]} {t.name}</div>
                          {t.description&&<div style={{fontSize:12,color:'var(--bp-text-2)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.description}</div>}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                          <span style={{fontSize:10,fontWeight:700,background:t.status==='active'?'var(--ok-soft)':t.status==='completed'?'var(--court-soft)':'var(--bone-3)',color:LABELS.statusColor[t.status]||'var(--ink-soft)',borderRadius:6,padding:'3px 8px'}}>
                            {LABELS.status[t.status]||t.status}
                          </span>
                          <button onClick={(e)=>handleDeleteTournament(t,e)} title="Eliminar torneo"
                            style={{background:'none',border:'none',cursor:'pointer',color:'var(--crimson)',fontSize:14,padding:'2px 4px',borderRadius:4,lineHeight:1}}>🗑</button>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                        <span style={{fontSize:10,background:'var(--bp-surface-3)',color:'var(--bp-text)',borderRadius:5,padding:'2px 7px'}}>{LABELS.structures[t.structure]||t.structure}</span>
                        <span style={{fontSize:10,background:'var(--bp-surface-3)',color:'var(--bp-text)',borderRadius:5,padding:'2px 7px'}}>{LABELS.pairingSystems[t.pairingSystem]||t.pairingSystem}</span>
                        <span style={{fontSize:10,background:'var(--bp-surface-3)',color:'var(--bp-text)',borderRadius:5,padding:'2px 7px',display:'inline-flex',alignItems:'center',gap:3}}><UsersIcon style={{width:10,height:10}}/>{t.participants?.length||0}</span>
                        {t.startDate && <span style={{fontSize:10,background:'var(--bp-surface-3)',color:'var(--bp-text)',borderRadius:5,padding:'2px 7px'}}>📅 {new Date(t.startDate).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}{t.endDate?` → ${new Date(t.endDate).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}`:''}</span>}
                        {isAdmin() && t.club && <span style={{fontSize:10,background:'var(--amber-soft)',color:'var(--amber)',border:'1px solid var(--amber-soft)',borderRadius:5,padding:'2px 7px',fontWeight:700}}>{t.club.name}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:11,color:'var(--bp-text-3)'}}>{filtered.length} torneo{filtered.length!==1?'s':''}</span>
                  <TournamentPaginator page={tPage} total={filtered.length} pageSize={T_PAGE_SIZE} onChange={p=>{setTPage(p);window.scrollTo(0,0);}}/>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Tournament detail */}
      {selected && (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <button onClick={()=>setSelected(null)} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',color:'var(--bp-text-2)',fontSize:13,cursor:'pointer',padding:0}}>
              ← Volver a torneos
            </button>
            <button onClick={()=>navigate(`/tournaments/${selected.id}/view`)}
              style={{fontSize:12,background:'var(--bp-surface-2)',border:'1px solid var(--bp-border)',borderRadius:8,padding:'5px 12px',color:'var(--bp-text)',cursor:'pointer',fontWeight:600}}>
              👁 Vista jugador
            </button>
          </div>

          <div style={{background:'var(--paper)',borderRadius:16,border:'1px solid var(--line)',padding:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,color:'var(--ink-soft)',textTransform:'uppercase',letterSpacing:'0.1em'}}>{LABELS.structures[selected.structure]}</div>
                <div style={{fontWeight:700,fontSize:18,color:'var(--ink)',fontFamily:'var(--display)',marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ICONS[selected.structure]} {selected.name}</div>
                <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:4}}>{LABELS.pairingSystems[selected.pairingSystem]} · {LABELS.matchFormats[selected.matchFormat]}</div>
                <div style={{fontSize:11,color:'var(--ink-soft)',marginTop:2}}>Resultados: {RESULT_MODE_LABELS[selected.resultMode] || selected.resultMode || '—'}</div>
              </div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,flexShrink:0}}>
                <span style={{fontSize:11,fontWeight:700,color:LABELS.statusColor[selected.status]||'var(--ink-soft)',background:'var(--bone-3)',borderRadius:8,padding:'4px 10px'}}>
                  {LABELS.status[selected.status]||selected.status}
                </span>
                {selected.status !== 'draft' && (
                  <button onClick={async()=>{
                    const isArchived = selected.status === 'archived';
                    if (!isArchived && !confirm(`¿Archivar "${selected.name}"? Quedará oculto en la lista activa.`)) return;
                    try {
                      const res = await tournamentInstanceService.archive(selected.id);
                      const newStatus = res.data.status;
                      setSelected(prev=>({...prev,status:newStatus}));
                      setTournaments(prev=>prev.map(t=>t.id===selected.id?{...t,status:newStatus}:t));
                      notify(isArchived?'✅ Torneo restaurado':'✅ Torneo archivado');
                    } catch(e){ notify('❌ '+(e.response?.data?.error||'Error')); }
                  }} style={{fontSize:10,background:selected.status==='archived'?'var(--ok-soft)':'var(--bone-3)',border:`1px solid ${selected.status==='archived'?'var(--ok)':'var(--line)'}`,borderRadius:6,padding:'3px 10px',color:selected.status==='archived'?'var(--ok)':'var(--ink-soft)',cursor:'pointer',fontWeight:600}}>
                    {selected.status==='archived'?'↩ Restaurar':'📦 Archivar'}
                  </button>
                )}
              </div>
            </div>
            <div style={{display:'flex',gap:16,marginTop:12,flexWrap:'wrap'}}>
              <div><div style={{fontSize:20,fontWeight:900,color:'var(--court-deep)',fontFamily:'var(--display)'}}>{selected.participants?.length||0}</div><div style={{fontSize:11,color:'var(--ink-soft)'}}>jugadores</div></div>
              <div><div style={{fontSize:20,fontWeight:900,color:'var(--court-deep)',fontFamily:'var(--display)'}}>{selected.matches?.length||0}</div><div style={{fontSize:11,color:'var(--ink-soft)'}}>partidos</div></div>
              {selected.startDate && <div><div style={{fontSize:13,fontWeight:700,color:'var(--court-deep)'}}>{new Date(selected.startDate).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}</div><div style={{fontSize:11,color:'var(--ink-soft)'}}>inicio</div></div>}
              {selected.endDate   && <div><div style={{fontSize:13,fontWeight:700,color:'var(--court-deep)'}}>{new Date(selected.endDate).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}</div><div style={{fontSize:11,color:'var(--ink-soft)'}}>fin</div></div>}
            </div>
          </div>

          {/* Tabs */}
          <div style={{display:'flex',gap:2,background:'var(--bp-surface-3)',borderRadius:12,padding:4}}>
            {[
              ['participants',UsersIcon,'Jugadores'],
              ['matches',QueueListIcon,'Partidos'],
              ['standings',TrophyIcon,'Tabla'],
              ['logs',DocumentTextIcon,'Actividad'],
              ...(selected.config?.frequency && selected.config.frequency !== 'free' ? [['jornadas',MapPinIcon,'Jornadas']] : []),
              ['invites',LinkIcon,'Invitar'],
              ['config',Cog6ToothIcon,'Config'],
            ].map(([id,Icon,label])=>(
              <button key={id} onClick={()=>setActiveTab(id)} style={{flex:1,padding:'8px',borderRadius:8,border:'none',cursor:'pointer',fontSize:11,fontWeight:600,background:activeTab===id?'white':'transparent',color:activeTab===id?'var(--ink-2)':'var(--ink-soft)',display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                <Icon style={{width:15,height:15}} />{label}
              </button>
            ))}
          </div>

          {activeTab==='participants' && (
            <ParticipantManager
              key={`${selected.id}-${selected.status}-${selected.participants?.length||0}`}
              tournament={selected}
              allPlayers={allPlayers}
              onAdd={handleAddParticipant}
              onRemove={handleRemoveParticipant}
              onGenerate={handleGenerate}
              onStart={handleStart}
              onReset={handleReset}
              onRefresh={handleRefreshSelected}
              isCimaPadel={selected.structure === 'cima_padel'}
              nextCimaRound={nextCimaRound}
              onGenerateCima={() => setShowCimaAvail(true)}
            />
          )}

          {activeTab==='matches' && selected.structure === 'cima_padel' && (
            <CimaPadelMatchesView
              tournament={selected}
              nextRound={nextCimaRound}
              cimaAssigning={cimaAssigning}
              onGenerateRound={() => setShowCimaAvail(true)}
              onAssign={handleCimaAssign}
              onDeleteRound={handleCimaDeleteRound}
              onResultSaved={(matchId, sets) => {
                setSelected(prev => ({
                  ...prev,
                  matches: (prev.matches||[]).map(m =>
                    m.id === matchId
                      ? {...m, status:'completed', result:{sets, completedAt: new Date().toISOString()}}
                      : m
                  )
                }));
              }}
            />
          )}

          {activeTab==='matches' && selected.structure !== 'cima_padel' && (
            selected.matches?.length===0 ? (
              <div style={{textAlign:'center',padding:'32px 0',color:'var(--bp-text-3)',fontSize:13}}>
                Sin partidos. Añade jugadores y genera partidos en la pestaña Jugadores.
              </div>
            ) : (
              <>
                {selected.status !== 'active' && (
                  <div style={{background:'var(--amber-soft)',border:'1px solid var(--amber-soft)',borderRadius:10,padding:'10px 14px',fontSize:12,color:'var(--amber)'}}>
                    ⚠️ Inicia el torneo desde la pestaña <strong>Jugadores</strong> para poder registrar resultados.
                  </div>
                )}
                <MatchesList
                  tournamentId={selected.id}
                  tournamentStatus={selected.status}
                  matches={Array.isArray(selected.matches)?selected.matches:[]}
                  participants={Array.isArray(selected.participants)?selected.participants:[]}
                  onResultSaved={(matchId, sets) => {
                    setSelected(prev=>({
                      ...prev,
                      matches:(prev.matches||[]).map(m=>m.id===matchId?{...m,result:{sets},status:'completed'}:m)
                    }));
                  }}
                  onDeleteMatch={selected.status!=='active' ? async(matchId)=>{
                    if(!confirm('¿Eliminar este partido?')) return;
                    await fetch(`/api/tournament-instances/${selected.id}/matches/${matchId}`, {
                      method:'DELETE',
                      headers:{'Authorization':`Bearer ${localStorage.getItem('bp_token')}`}
                    });
                    setSelected(prev=>({...prev,matches:(prev.matches||[]).filter(m=>m.id!==matchId)}));
                  } : null}
                />
              </>
            )
          )}

          {activeTab==='standings' && (
            <StandingsAdmin key={selected.id} tournamentId={selected.id} />
          )}

          {activeTab==='logs' && (
            <TournamentLogs key={selected.id} tournamentId={selected.id} />
          )}

          {activeTab==='jornadas' && selected.config?.frequency && selected.config.frequency !== 'free' && (
            <CimaPadelScheduleTab
              key={selected.id + '_jornadas'}
              tournament={selected}
              onUpdate={async (updates) => {
                if (updates._reload) {
                  const full = await tournamentInstanceService.getById(selected.id);
                  setSelected(full.data);
                  setTournaments(p => p.map(t => t.id === selected.id ? full.data : t));
                } else {
                  const updated = { ...selected, config: { ...(selected.config||{}), ...updates.config } };
                  setSelected(updated);
                  setTournaments(p => p.map(t => t.id === selected.id ? { ...t, ...updates } : t));
                }
              }}
            />
          )}

          {activeTab==='invites' && (
            <TournamentInvitationsEditor
              key={selected.id}
              tournament={selected}
              onUpdate={(updates) => {
                const updated = { ...selected, ...updates };
                setSelected(updated);
                setTournaments(p => p.map(t => t.id === selected.id ? { ...t, ...updates } : t));
              }}
            />
          )}

          {activeTab==='config' && (
            <ConfigTab
              key={selected.id}
              tournament={selected}
              allPlayers={allPlayers}
              onUpdate={(updates) => {
                const updated = { ...selected, ...updates };
                setSelected(updated);
                setTournaments(p => p.map(t => t.id === selected.id ? { ...t, ...updates } : t));
              }}
            />
          )}
        </div>
      )}
    </div>

    {/* ── DELETE CONFIRMATION MODAL ── */}
    {deleteConfirm && (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
        <div style={{background:'var(--bp-surface)',borderRadius:16,padding:24,maxWidth:400,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>

          {deleteConfirm.step === 1 && (<>
            <div style={{fontSize:28,textAlign:'center',marginBottom:12}}>🗑️</div>
            <div style={{fontWeight:700,fontSize:16,color:'var(--bp-text)',textAlign:'center',marginBottom:8}}>
              ¿Eliminar torneo?
            </div>
            <div style={{fontSize:13,color:'var(--bp-text-2)',textAlign:'center',marginBottom:20,lineHeight:1.5}}>
              Se eliminará <strong>"{deleteConfirm.name}"</strong> junto con todos sus partidos y participantes.<br/>
              Esta acción es <strong style={{color:'var(--crimson)'}}>irreversible</strong>.
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{setDeleteConfirm(null);}}
                style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:'var(--bp-text)',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                Cancelar
              </button>
              <button onClick={handleDeleteStep1}
                style={{flex:1,padding:'10px',borderRadius:10,border:'none',background:'var(--crimson)',color:'var(--ink)',fontSize:13,fontWeight:700,cursor:'pointer'}}>
                Sí, eliminar
              </button>
            </div>
          </>)}

          {deleteConfirm.step === 2 && (<>
            <div style={{fontSize:28,textAlign:'center',marginBottom:12}}>⚠️</div>
            <div style={{fontWeight:700,fontSize:16,color:'var(--bp-text)',textAlign:'center',marginBottom:8}}>
              Confirmación adicional requerida
            </div>
            <div style={{fontSize:13,color:'var(--bp-text-2)',textAlign:'center',marginBottom:16,lineHeight:1.5}}>
              Este torneo tiene <strong>{deleteConfirm.playedCount} partido{deleteConfirm.playedCount!==1?'s':''} con resultado</strong> de un total de {deleteConfirm.totalMatches}.<br/>
              Se perderán todos los resultados registrados.
            </div>
            <div style={{background:'var(--crimson-soft)',border:'1px solid var(--crimson-soft)',borderRadius:10,padding:12,marginBottom:16}}>
              <div style={{fontSize:12,color:'var(--crimson)',fontWeight:600,marginBottom:8}}>
                Escribe para confirmar:
              </div>
              <div style={{fontSize:11,color:'var(--bp-text-3)',marginBottom:6,fontFamily:'monospace',background:'var(--bp-surface-2)',padding:'4px 8px',borderRadius:5}}>
                eliminar torneo {deleteConfirm.name}
              </div>
              <input
                value={deleteInput}
                onChange={e=>setDeleteInput(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&handleDeleteStep2()}
                placeholder={`eliminar torneo ${deleteConfirm.name}`}
                autoFocus
                style={{width:'100%',border:'1px solid var(--crimson-soft)',borderRadius:8,padding:'9px 12px',fontSize:13,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}
              />
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{setDeleteConfirm(null);setDeleteInput('');}}
                style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:'var(--bp-text)',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                Cancelar
              </button>
              <button onClick={handleDeleteStep2}
                disabled={deleteInput !== `eliminar torneo ${deleteConfirm.name}`}
                style={{flex:1,padding:'10px',borderRadius:10,border:'none',background:deleteInput===`eliminar torneo ${deleteConfirm.name}`?'var(--crimson)':'var(--crimson-soft)',color:'var(--ink)',fontSize:13,fontWeight:700,cursor:deleteInput===`eliminar torneo ${deleteConfirm.name}`?'pointer':'default'}}>
                Eliminar definitivamente
              </button>
            </div>
          </>)}

        </div>
      </div>
    )}
    {showCimaAvail && selected && (
      <CimaAvailModal
        tournament={selected}
        nextRound={nextCimaRound}
        onConfirm={handleGenerateCimaRound}
        onCancel={() => setShowCimaAvail(false)}
      />
    )}
    </>
  );
}
