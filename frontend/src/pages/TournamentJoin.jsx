import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tournamentInstanceService, authService } from '../services/api';

const STRUCTURES = {
  round_robin:'Todos contra todos', eliminacion_directa:'Eliminación directa',
  grupos_eliminatoria:'Grupos + Playoff', pozo:'Pozo', rey_pista:'Rey de pista',
  ladder:'Ladder', consolacion:'Con consolación', maraton:'Maratón', express:'Express'
};
const PAIRINGS = {
  fixed_pairs:'Parejas fijas', americana_clasica:'Americana clásica',
  americana_perfecta:'Americana perfecta', americana_mixta:'Americana mixta',
  mexicano:'Mexicano', beat_the_box:'Beat the box'
};
const FORMATS = {
  sets_completos:'Sets completos', sets_cortos:'Sets cortos',
  super_tiebreak:'Super tie-break', tiebreak_directo:'Tie-break directo',
  por_tiempo:'Por tiempo'
};

const INP = { width:'100%', border:'1px solid var(--line)', borderRadius:10, padding:'10px 12px', fontSize:13, outline:'none', boxSizing:'border-box' };

function UsernameField({ value, onChange, suggestions }) {
  return (
    <div>
      <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:3}}>
        Nombre de usuario * <span style={{fontWeight:400,color:'var(--ink-soft)'}}>(sin espacios, solo letras/números/puntos)</span>
      </label>
      <input value={value} onChange={e => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
        placeholder="ej: marc.gerenich" autoCapitalize="none" autoCorrect="off" style={INP}/>
      {suggestions && suggestions.length > 0 && (
        <div style={{marginTop:4,fontSize:11,color:'var(--ink-soft)'}}>
          Sugerencias:{' '}
          {suggestions.map((s, i) => (
            <button key={s} type="button" onClick={() => onChange(s)}
              style={{marginLeft:i>0?6:4,fontSize:11,color:'var(--court-deep)',background:'var(--court-soft)',border:'1px solid var(--court-soft)',borderRadius:4,padding:'1px 6px',cursor:'pointer'}}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AuthForms({ token, onAuthenticated }) {
  const { login } = useAuth();
  const [tab,         setTab]         = useState('login'); // 'login' | 'register'
  const [form,        setForm]        = useState({ name:'', email:'', password:'', confirm:'', username:'' });
  const [showPwd,     setShowPwd]     = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [usernameSug, setUsernameSug] = useState([]);
  const [registered,  setRegistered]  = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const checkUsername = useCallback(async (u) => {
    if (u.length < 3) { setUsernameSug([]); return; }
    try {
      const res = await authService.checkUsername(u);
      if (!res.data.available && res.data.suggestions) setUsernameSug(res.data.suggestions);
      else setUsernameSug([]);
    } catch { setUsernameSug([]); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (form.username) checkUsername(form.username); }, 400);
    return () => clearTimeout(t);
  }, [form.username, checkUsername]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) { setError('Completa todos los campos'); return; }
    setLoading(true); setError('');
    try {
      const data = await login(form.email.trim(), form.password);
      if (data.requires2FA) { setError('2FA activo: accede desde la app e inténtalo de nuevo'); return; }
      onAuthenticated();
    } catch(err) {
      const msg = err.response?.data?.error || 'Credenciales incorrectas';
      setError(msg);
    } finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Nombre obligatorio'); return; }
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) { setError('Email inválido'); return; }
    if (form.password.length < 6) { setError('Contraseña: mínimo 6 caracteres'); return; }
    if (form.password !== form.confirm) { setError('Las contraseñas no coinciden'); return; }
    if (form.username && form.username.length < 3) { setError('Usuario: mínimo 3 caracteres'); return; }
    setLoading(true); setError('');
    try {
      // Self-registration now requires email verification (matches the
      // other two sign-up paths) — the account isn't usable and there's
      // no token to log in with yet, so this can no longer join the
      // tournament immediately. `joinToken` lets the verification email
      // send them back here to finish once they've confirmed it.
      await authService.register({
        name: form.name.trim(), email: form.email.trim(), password: form.password,
        username: form.username || undefined, joinToken: token,
      });
      setRegistered(true);
    } catch(err) {
      const d = err.response?.data;
      if (d?.suggestions) setUsernameSug(d.suggestions);
      setError(d?.error || 'Error al crear la cuenta');
    } finally { setLoading(false); }
  };

  if (registered) {
    return (
      <div style={{marginTop:4, textAlign:'center', padding:'12px 4px'}}>
        <div style={{fontSize:40, marginBottom:10}}>📬</div>
        <div style={{fontWeight:800, fontSize:15, color:'var(--ink-2)', marginBottom:6}}>Revisa tu email</div>
        <div style={{fontSize:13, color:'var(--ink-soft)'}}>
          Te enviamos un enlace a <strong>{form.email}</strong> para confirmar tu cuenta.
          Al verificarlo volverás aquí mismo para completar la inscripción.
        </div>
      </div>
    );
  }

  return (
    <div style={{marginTop:4}}>
      {/* Tab selector */}
      <div style={{display:'flex',gap:2,background:'var(--bone-3)',borderRadius:10,padding:3,marginBottom:16}}>
        {[['login','Tengo cuenta'],['register','Crear cuenta']].map(([id,label])=>(
          <button key={id} onClick={()=>{setTab(id);setError('');}}
            style={{flex:1,padding:'8px',borderRadius:8,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,
              background:tab===id?'white':'transparent',color:tab===id?'var(--ink-2)':'var(--ink-soft)'}}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{background:'var(--crimson-soft)',border:'1px solid var(--crimson-soft)',color:'var(--crimson)',borderRadius:10,padding:'9px 12px',fontSize:12,marginBottom:12}}>
          {error}
        </div>
      )}

      {tab === 'login' ? (
        <form onSubmit={handleLogin} style={{display:'flex',flexDirection:'column',gap:10}}>
          <div>
            <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:3}}>Email o usuario</label>
            <input type="text" value={form.email} onChange={e=>set('email',e.target.value)}
              placeholder="tu@email.com o @usuario" autoFocus autoCapitalize="none" autoCorrect="off" style={INP}/>
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:3}}>Contraseña</label>
            <input type={showPwd?'text':'password'} value={form.password} onChange={e=>set('password',e.target.value)}
              placeholder="••••••" style={INP}/>
          </div>
          <label style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'var(--ink-soft)',cursor:'pointer'}}>
            <input type="checkbox" checked={showPwd} onChange={e=>setShowPwd(e.target.checked)} style={{accentColor:'var(--court)'}}/>
            Mostrar contraseña
          </label>
          <button type="submit" disabled={loading}
            style={{width:'100%',padding:'11px',borderRadius:10,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:800,fontSize:13,cursor:loading?'default':'pointer',opacity:loading?0.6:1}}>
            {loading ? 'Iniciando…' : 'Iniciar sesión e inscribirme →'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleRegister} style={{display:'flex',flexDirection:'column',gap:10}}>
          <div>
            <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:3}}>Nombre completo *</label>
            <input value={form.name} onChange={e=>set('name',e.target.value)}
              placeholder="Ej: Marc Gerenich" autoFocus style={INP}/>
          </div>
          <UsernameField value={form.username} onChange={v => set('username', v)} suggestions={usernameSug} />
          <div>
            <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:3}}>Email *</label>
            <input type="email" value={form.email} onChange={e=>set('email',e.target.value)}
              placeholder="tu@email.com" style={INP}/>
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:3}}>Contraseña * (mín. 6 caracteres)</label>
            <input type={showPwd?'text':'password'} value={form.password} onChange={e=>set('password',e.target.value)}
              placeholder="••••••" style={INP}/>
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:3}}>Confirmar contraseña *</label>
            <input type={showPwd?'text':'password'} value={form.confirm} onChange={e=>set('confirm',e.target.value)}
              placeholder="••••••" style={INP}/>
          </div>
          <label style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'var(--ink-soft)',cursor:'pointer'}}>
            <input type="checkbox" checked={showPwd} onChange={e=>setShowPwd(e.target.checked)} style={{accentColor:'var(--court)'}}/>
            Mostrar contraseña
          </label>
          <button type="submit" disabled={loading}
            style={{width:'100%',padding:'11px',borderRadius:10,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:800,fontSize:13,cursor:loading?'default':'pointer',opacity:loading?0.6:1}}>
            {loading ? 'Creando cuenta…' : 'Crear cuenta e inscribirme →'}
          </button>
        </form>
      )}
    </div>
  );
}

export default function TournamentJoin() {
  const { token } = useParams();
  const navigate  = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [info,    setInfo]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    tournamentInstanceService.getJoinInfo(token)
      .then(r => setInfo(r.data))
      .catch(e => setError(e.response?.data?.error || 'Enlace inválido o expirado'))
      .finally(() => setLoading(false));
  }, [token]);

  const doJoin = async () => {
    setJoining(true); setError('');
    try {
      await tournamentInstanceService.joinByToken(token);
      setDone(true);
    } catch(e) {
      const data = e.response?.data;
      if (data?.alreadyJoined) setDone(true);
      else setError(data?.error || 'Error al inscribirse');
    } finally { setJoining(false); }
  };

  // Called after successful auth (login or register)
  const handleAuthenticated = () => { doJoin(); };

  if (authLoading || loading) {
    return (
      <div style={{minHeight:'100vh',background:'var(--bone)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--ink)'}}>
        Cargando…
      </div>
    );
  }

  if (error && !info) {
    return (
      <div style={{minHeight:'100vh',background:'var(--bone)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
        <div style={{background:'white',borderRadius:20,padding:28,maxWidth:380,width:'100%',textAlign:'center',boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
          <div style={{fontSize:48,marginBottom:12}}>🔒</div>
          <div style={{fontWeight:800,fontSize:17,color:'var(--ink-2)',marginBottom:8}}>Enlace no válido</div>
          <div style={{fontSize:13,color:'var(--ink-soft)',marginBottom:20}}>{error}</div>
          <button onClick={()=>navigate('/')} style={{width:'100%',padding:'11px',borderRadius:10,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:'pointer'}}>
            Ir al inicio
          </button>
        </div>
      </div>
    );
  }

  const isFull = info?.maxParticipants && (info._count?.participants ?? 0) >= info.maxParticipants;

  return (
    <div style={{minHeight:'100vh',background:'var(--bone)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'var(--paper)',borderRadius:20,padding:28,maxWidth:420,width:'100%',border:'1px solid var(--line)',boxShadow:'0 4px 24px rgba(0,0,0,0.08)'}}>

        {/* Header */}
        <div style={{background:'var(--bone-2)',borderRadius:14,padding:'16px 18px',marginBottom:20,border:'1px solid var(--line)'}}>
          <div style={{fontSize:10,color:'var(--ink-soft)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>Invitación al torneo</div>
          <div style={{fontWeight:800,fontSize:19,color:'var(--ink)',fontFamily:'var(--display)',lineHeight:1.2}}>{info?.name}</div>
          {info?.description && <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:6}}>{info.description}</div>}
        </div>

        {/* Info grid */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:20}}>
          {[
            ['Estructura',      STRUCTURES[info?.structure]     || info?.structure],
            ['Emparejamiento',  PAIRINGS[info?.pairingSystem]   || info?.pairingSystem],
            ['Formato',         FORMATS[info?.matchFormat]      || info?.matchFormat],
            ['Inscritos',       `${info?._count?.participants ?? 0}${info?.maxParticipants ? ' / ' + info.maxParticipants : ''}`],
            info?.startDate && ['Inicio', new Date(info.startDate).toLocaleDateString('es-ES',{day:'numeric',month:'long'})],
            info?.endDate   && ['Fin',    new Date(info.endDate).toLocaleDateString('es-ES',{day:'numeric',month:'long'})],
          ].filter(Boolean).map(([label, value]) => (
            <div key={label} style={{background:'var(--bone-2)',borderRadius:10,padding:'10px 12px'}}>
              <div style={{fontSize:10,color:'var(--ink-soft)',fontWeight:600,marginBottom:2}}>{String(label).toUpperCase()}</div>
              <div style={{fontSize:13,fontWeight:600,color:'var(--ink-2)'}}>{value}</div>
            </div>
          ))}
        </div>

        {/* Status messages */}
        {done && (
          <div style={{background:'var(--ok-soft)',border:'1px solid var(--ok-soft)',borderRadius:12,padding:18,textAlign:'center',marginBottom:16}}>
            <div style={{fontSize:32,marginBottom:8}}>🎉</div>
            <div style={{fontWeight:800,fontSize:16,color:'var(--ok)',marginBottom:4}}>¡Inscripción completada!</div>
            <div style={{fontSize:13,color:'var(--court)'}}>Ya estás apuntado al torneo</div>
          </div>
        )}
        {!done && isFull && (
          <div style={{background:'var(--crimson-soft)',border:'1px solid var(--crimson-soft)',borderRadius:12,padding:16,textAlign:'center',marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:14,color:'var(--crimson)'}}>Torneo completo</div>
            <div style={{fontSize:12,color:'var(--crimson)',marginTop:4}}>Se ha alcanzado el cupo máximo de participantes</div>
          </div>
        )}
        {error && !done && (
          <div style={{background:'var(--crimson-soft)',border:'1px solid var(--crimson-soft)',borderRadius:10,padding:'10px 12px',fontSize:13,color:'var(--crimson)',marginBottom:16}}>
            {error}
          </div>
        )}

        {/* Actions */}
        {done || isFull ? (
          <button onClick={()=>navigate('/')}
            style={{width:'100%',padding:'11px',borderRadius:12,border:'1px solid var(--line)',background:'white',color:'var(--ink-mid)',fontWeight:600,fontSize:13,cursor:'pointer'}}>
            Ir al inicio
          </button>
        ) : user ? (
          <button onClick={doJoin} disabled={joining}
            style={{width:'100%',padding:'13px',borderRadius:12,border:'none',background:joining?'var(--line)':'var(--ink)',color:joining?'white':'var(--amber)',fontWeight:800,fontSize:14,cursor:joining?'default':'pointer'}}>
            {joining ? 'Inscribiendo…' : '🎾 Inscribirme en el torneo'}
          </button>
        ) : (
          <AuthForms token={token} onAuthenticated={handleAuthenticated} />
        )}
      </div>
    </div>
  );
}
