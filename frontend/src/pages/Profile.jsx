import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { authService, playerService, clubService } from '../services/api';
import AvatarUpload from '../components/AvatarUpload';
import { UserCircleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

function PrivacyToggle({ label, description, value, onChange, loading }) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',background:'var(--bp-surface-2)',borderRadius:12,border:'1px solid var(--bone-3)'}}>
      <div>
        <div style={{fontWeight:600,fontSize:13,color:'var(--bp-text)'}}>{label}</div>
        <div style={{fontSize:11,color:'var(--bp-text-2)',marginTop:2}}>{description}</div>
      </div>
      <button
        onClick={onChange}
        disabled={loading}
        style={{
          width:44,height:24,borderRadius:12,border:'none',cursor:'pointer',
          background:value?'var(--court)':'var(--line)',
          position:'relative',transition:'background 0.2s',flexShrink:0,
          opacity:loading?0.6:1,
        }}
      >
        <span style={{
          position:'absolute',top:2,left:value?22:2,width:20,height:20,
          borderRadius:'50%',background:'white',
          boxShadow:'0 1px 3px rgba(0,0,0,0.2)',transition:'left 0.2s',
        }}/>
      </button>
    </div>
  );
}

export default function Profile() {
  const { user, logout, isAdmin } = useAuth();
  const [tab, setTab] = useState('datos');
  const [avatar, setAvatar] = useState(null);

  const [curPwd,  setCurPwd]  = useState('');
  const [newPwd,  setNewPwd]  = useState('');
  const [confPwd, setConfPwd] = useState('');
  const [phone,   setPhone]   = useState('');
  const [email,   setEmail]   = useState('');
  const [emailPwd, setEmailPwd] = useState(''); // confirmation required only when admin actually changes their login email
  const [twoFA,   setTwoFA]   = useState(false);
  const [msg,     setMsg]     = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  // Player profile fields
  const [pFirstName, setPFirstName] = useState('');
  const [pLastName,  setPLastName]  = useState('');
  const [pBirth,    setPBirth]    = useState('');
  const [pGender,   setPGender]   = useState('');
  const [pHand,     setPHand]     = useState('');
  const [pPosition, setPPosition] = useState('');

  // Username fields
  const [username,    setUsername]    = useState('');
  const [usernameSug, setUsernameSug] = useState([]);
  const [usernameOk,  setUsernameOk]  = useState(null);

  // Privacy fields
  const [isPublic,    setIsPublic]    = useState(true);
  const [showStats,   setShowStats]   = useState(true);
  const [showMatches, setShowMatches] = useState(true);
  const [showContact, setShowContact] = useState(false);

  // Club selection
  const [clubs,   setCLubs]  = useState([]);
  const [clubId,  setClubId] = useState('');

  useEffect(()=>{
    authService.me().then(r=>{
      setTwoFA(r.data?.twoFactorEnabled || false);
      setPFirstName(r.data?.player?.firstName || '');
      setPLastName(r.data?.player?.lastName || '');
      setPBirth(r.data?.player?.birthDate ? r.data.player.birthDate.split('T')[0] : '');
      setPGender(r.data?.player?.gender || '');
      setPHand(r.data?.player?.dominantHand || '');
      setPPosition(r.data?.player?.position || '');
      setPhone(r.data?.phone || r.data?.player?.phone || '');
      setEmail(r.data?.email || '');
      setAvatar(r.data?.player?.avatarUrl || null);
      setIsPublic(r.data?.player?.isPublic    ?? true);
      setShowStats(r.data?.player?.showStats  ?? true);
      setShowMatches(r.data?.player?.showMatches ?? true);
      setShowContact(r.data?.player?.showContact ?? false);
      setUsername(r.data?.username || '');
      setClubId(r.data?.player?.clubId || '');
    }).catch(()=>{});
    if (!isAdmin()) {
      clubService.listPublic().then(r=>setCLubs(r.data||[])).catch(()=>{});
    }
  },[]);

  const checkUsername = useCallback(async (u, userId) => {
    if (u.length < 3) { setUsernameOk(null); setUsernameSug([]); return; }
    try {
      const r = await authService.checkUsername(u, userId);
      setUsernameOk(r.data.available);
      setUsernameSug(r.data.suggestions || []);
    } catch { setUsernameOk(null); }
  }, []);

  // durationMs=0 means "don't auto-dismiss" — used for messages the
  // user actually needs to act on (e.g. "check your new email"),
  // which used to vanish in the same 3s as a plain "Datos guardados"
  // toast. Those stay up until manually closed (see the × button
  // below) or another save replaces them.
  const notify = (m, isErr=false, durationMs=3000) => {
    if(isErr) setError(m); else setMsg(m);
    if (durationMs > 0) setTimeout(()=>{ setMsg(''); setError(''); }, durationMs);
  };

  const emailChanged = isAdmin() && email.trim() && email.trim() !== (user?.email || '');

  const handleSaveDatos = async (e) => {
    e.preventDefault();
    const trimmedFirstName = pFirstName.trim();
    const trimmedLastName  = pLastName.trim();
    if (!trimmedFirstName)            { notify('El nombre no puede estar vacío', true); return; }
    if (trimmedFirstName.length < 2)  { notify('El nombre debe tener al menos 2 caracteres', true); return; }
    if (trimmedFirstName.length > 60 || trimmedLastName.length > 60) { notify('El nombre o apellido no puede superar 60 caracteres', true); return; }
    if (username.length < 3)    { notify('El usuario debe tener al menos 3 caracteres', true); return; }
    if (isAdmin() && email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      notify('Email inválido', true); return;
    }
    if (emailChanged && !emailPwd) {
      notify('Ingresa tu contraseña actual para cambiar el email', true); return;
    }
    setLoading(true);

    // Named, independent calls run via allSettled (not all-or-nothing
    // Promise.all): if the username is taken but everything else is
    // valid, the other fields still save instead of silently rolling
    // back with one generic error and no indication of what actually
    // went through.
    const playerFields = isAdmin()
      ? { firstName:trimmedFirstName, lastName:trimmedLastName, birthDate:pBirth||null, gender:pGender||null }
      : { firstName:trimmedFirstName, lastName:trimmedLastName, birthDate:pBirth||null, gender:pGender||null, dominantHand:pHand||null, position:pPosition||null };

    const jobs = [
      { label: 'Usuario',    run: () => authService.updateUsername(username) },
      { label: 'Datos de jugador', run: () => playerService.updateMe(playerFields) },
      { label: 'Teléfono',   run: () => authService.updatePhone(phone) },
    ];
    if (emailChanged) jobs.push({ label: 'Email', run: () => authService.updateEmail(email.trim(), emailPwd) });
    if (!isAdmin() && clubs.length > 0) jobs.push({ label: 'Club', run: () => playerService.setClub(clubId || null) });

    const results = await Promise.allSettled(jobs.map(j => j.run()));
    setLoading(false);

    const failed = results
      .map((r, i) => ({ ...r, label: jobs[i].label }))
      .filter(r => r.status === 'rejected');

    if (failed.length === 0) {
      // A successful "Email" job means a verification link was sent
      // to the NEW address — the login email doesn't actually change
      // until that link is clicked (see AuthService::updateEmail).
      // Reverting the field to the still-current email avoids implying
      // the change already took effect.
      const emailJobIndex = jobs.findIndex(j => j.label === 'Email');
      if (emailJobIndex !== -1) {
        setEmail(user?.email || '');
        setEmailPwd('');
      }
      if (emailJobIndex !== -1) {
        // Doesn't auto-dismiss — also landed as a permanent entry in
        // the notification center (see AuthService::updateEmail), but
        // the toast itself shouldn't vanish before they've read it.
        notify(`Datos guardados. Revisa tu nuevo email para confirmar el cambio — hasta entonces sigues entrando con ${user?.email}.`, false, 0);
      } else {
        notify('Datos guardados');
      }
      setUsernameOk(null); setUsernameSug([]);
      return;
    }

    // At least one field saved (or none did) — report exactly which
    // ones failed instead of one generic message hiding a partial save.
    const usernameFailure = failed.find(f => f.label === 'Usuario');
    if (usernameFailure?.reason?.response?.data?.suggestions) {
      setUsernameSug(usernameFailure.reason.response.data.suggestions);
    }

    const succeededLabels = jobs.map(j => j.label).filter(l => !failed.some(f => f.label === l));
    const detail = failed.map(f => `${f.label}: ${f.reason?.response?.data?.error || 'error'}`).join(' · ');
    notify(
      succeededLabels.length > 0
        ? `Guardado parcial — ${detail}. El resto (${succeededLabels.join(', ')}) sí se guardó.`
        : detail,
      true,
    );
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (newPwd !== confPwd) { notify('Las contraseñas no coinciden', true); return; }
    if (newPwd.length < 6)  { notify('Mínimo 6 caracteres', true); return; }
    setLoading(true);
    try {
      await authService.changePassword({ currentPassword: curPwd, newPassword: newPwd });
      notify('Contraseña actualizada');
      setCurPwd(''); setNewPwd(''); setConfPwd('');
    } catch(err) { notify(err.response?.data?.error || 'Error', true); }
    finally { setLoading(false); }
  };

  const handle2FA = async () => {
    setLoading(true);
    try {
      const res = await authService.toggle2FA(!twoFA);
      setTwoFA(res.data.twoFactorEnabled);
      notify(res.data.message);
    } catch { notify('Error', true); }
    finally { setLoading(false); }
  };

  const handlePrivacyToggle = async (field, current, setter) => {
    const newVal = !current;
    setter(newVal);
    try {
      await playerService.updatePrivacy({ [field]: newVal });
      notify('Privacidad actualizada');
    } catch {
      setter(current);
      notify('Error al guardar', true);
    }
  };

  const handleAvatarUpdate = (url) => {
    setAvatar(url);
    const stored = JSON.parse(localStorage.getItem('bp_user') || '{}');
    if (stored.player) stored.player.avatarUrl = url;
    localStorage.setItem('bp_user', JSON.stringify(stored));
  };

  const S = {
    inp: { width:'100%', border:'1px solid var(--bp-border)', borderRadius:10, padding:'10px 12px', fontSize:13, outline:'none', boxSizing:'border-box' },
    btn: { width:'100%', background:'var(--court)', border:'none', borderRadius:10, padding:'11px', color:'var(--ink)', fontWeight:700, fontSize:13, cursor:'pointer' },
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>

      {/* Profile card with avatar */}
      <div style={{background:'var(--paper)',borderRadius:20,padding:20,border:'1px solid var(--line)',display:'flex',alignItems:'center',gap:16}}>
        <AvatarUpload currentAvatar={avatar} playerName={user?.player?.name} onUpdate={handleAvatarUpdate} />
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:18}}>{user?.player?.name}</div>
          <div style={{fontSize:13,color:'var(--ink-mid)',marginTop:2}}>{user?.email}</div>
          <div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}}>
            <span style={{fontSize:11,background:'var(--bone-3)',color:'var(--ink-soft)',borderRadius:6,padding:'2px 8px'}}>Nivel {user?.player?.level}</span>
            <span style={{fontSize:11,background:'var(--bone-3)',color:'var(--ink-soft)',borderRadius:6,padding:'2px 8px'}}>{user?.role}</span>
            {twoFA&&<span style={{fontSize:11,background:'var(--court)',color:'var(--ink)',borderRadius:6,padding:'2px 8px'}}>2FA ✓</span>}
          </div>
        </div>
      </div>

      {/* Notifications — manually dismissible since some (e.g. the
          email-change confirmation) don't auto-close, see notify() */}
      {msg && (
        <div style={{background:'var(--ok-soft)',border:'1px solid var(--ok-soft)',color:'var(--ok)',borderRadius:10,padding:'10px 14px',fontSize:13,fontWeight:500,display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
          <span>{msg}</span>
          <button onClick={()=>setMsg('')} aria-label="Cerrar" style={{background:'none',border:'none',cursor:'pointer',color:'var(--ok)',fontSize:16,lineHeight:1,flexShrink:0,padding:0}}>×</button>
        </div>
      )}
      {error && (
        <div style={{background:'var(--crimson-soft)',border:'1px solid var(--crimson-soft)',color:'var(--crimson)',borderRadius:10,padding:'10px 14px',fontSize:13,fontWeight:500,display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
          <span>{error}</span>
          <button onClick={()=>setError('')} aria-label="Cerrar" style={{background:'none',border:'none',cursor:'pointer',color:'var(--crimson)',fontSize:16,lineHeight:1,flexShrink:0,padding:0}}>×</button>
        </div>
      )}

      {/* Tabs — 2 tabs for all roles */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:2,background:'var(--bp-surface-3)',borderRadius:12,padding:4}}>
        {[
          ['datos',     UserCircleIcon,   'Datos'],
          ['seguridad', ShieldCheckIcon,  'Seguridad'],
        ].map(([id, Icon, label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:'8px 2px',borderRadius:8,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:tab===id?'white':'transparent',color:tab===id?'var(--ink-2)':'var(--ink-soft)',lineHeight:1.3,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
            <Icon style={{width:16,height:16}} />
            {label}
          </button>
        ))}
      </div>

      {/* ── DATOS tab ── */}
      {tab==='datos' && (
        <form onSubmit={handleSaveDatos} style={{display:'flex',flexDirection:'column',gap:12}}>

          {/* Username */}
          <div style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--bp-border-2)',padding:16,display:'flex',flexDirection:'column',gap:10}}>
            <div style={{fontWeight:700,fontSize:14,color:'var(--bp-text)'}}>Nombre de usuario</div>
            <div>
              <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>
                Usuario <span style={{fontWeight:400,color:'var(--bp-text-3)'}}>— se puede usar para iniciar sesión</span>
              </label>
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--bp-text-3)',fontSize:13,pointerEvents:'none'}}>@</span>
                <input value={username}
                  onChange={e=>{const v=e.target.value.toLowerCase().replace(/[^a-z0-9._]/g,'');setUsername(v);checkUsername(v,user?.id);}}
                  placeholder="tu.usuario" autoCapitalize="none" autoCorrect="off"
                  style={{...S.inp,paddingLeft:26,borderColor:usernameOk===true?'var(--court)':usernameOk===false?'var(--crimson)':'var(--bp-border)'}}/>
              </div>
              {usernameOk===true && <span style={{fontSize:11,color:'var(--court)',marginTop:3,display:'block'}}>Disponible</span>}
              {usernameOk===false && usernameSug.length>0 && (
                <div style={{marginTop:4,fontSize:11,color:'var(--bp-text-2)'}}>
                  Ya en uso. Sugerencias:{' '}
                  {usernameSug.map((s,i)=>(
                    <button key={s} type="button" onClick={()=>{setUsername(s);setUsernameOk(null);setUsernameSug([]);}}
                      style={{marginLeft:i>0?6:4,fontSize:11,color:'var(--court-deep)',background:'var(--court-soft)',border:'1px solid var(--court-soft)',borderRadius:4,padding:'1px 6px',cursor:'pointer'}}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Player data */}
          <div style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--bp-border-2)',padding:16,display:'flex',flexDirection:'column',gap:12}}>
            <div style={{fontWeight:700,fontSize:14,color:'var(--bp-text)'}}>Datos de jugador</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div>
                <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Nombre</label>
                <input value={pFirstName} onChange={e=>setPFirstName(e.target.value)} placeholder="Nombre" style={S.inp}/>
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Apellido</label>
                <input value={pLastName} onChange={e=>setPLastName(e.target.value)} placeholder="Apellido" style={S.inp}/>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div>
                <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Fecha de nacimiento</label>
                <input type="date" value={pBirth} onChange={e=>setPBirth(e.target.value)} style={S.inp}/>
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Sexo</label>
                <select value={pGender} onChange={e=>setPGender(e.target.value)} style={S.inp}>
                  <option value="">Sin especificar</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="X">Prefiero no decir</option>
                </select>
              </div>
            </div>
            {!isAdmin() && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div>
                  <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Mano dominante</label>
                  <select value={pHand} onChange={e=>setPHand(e.target.value)} style={S.inp}>
                    <option value="">Sin especificar</option>
                    <option value="right">Diestro</option>
                    <option value="left">Zurdo</option>
                    <option value="both">Ambidiestro</option>
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Posición en pista</label>
                  <select value={pPosition} onChange={e=>setPPosition(e.target.value)} style={S.inp}>
                    <option value="">Sin especificar</option>
                    <option value="drive">Drive (derecha)</option>
                    <option value="reves">Revés (izquierda)</option>
                    <option value="both">Ambas</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Contact */}
          <div style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--bp-border-2)',padding:16,display:'flex',flexDirection:'column',gap:12}}>
            <div style={{fontWeight:700,fontSize:14,color:'var(--bp-text)'}}>Contacto</div>
            <div>
              <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Email</label>
              {isAdmin()
                ? <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="correo@ejemplo.com" style={S.inp}/>
                : <>
                    <input value={user?.email||''} disabled style={{...S.inp,background:'var(--bp-surface-2)',color:'var(--bp-text-3)'}}/>
                    <span style={{fontSize:10,color:'var(--bp-text-3)',marginTop:3,display:'block'}}>El email no se puede cambiar</span>
                  </>
              }
              {emailChanged && (
                <div style={{marginTop:8}}>
                  <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>
                    Confirma tu contraseña actual para cambiar el email
                  </label>
                  <input type="password" value={emailPwd} onChange={e=>setEmailPwd(e.target.value)} placeholder="••••••••" style={S.inp}/>
                </div>
              )}
            </div>
            <div>
              <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Teléfono</label>
              <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+34 600 000 000" style={S.inp}/>
            </div>
          </div>

          {/* Club selector — only for players */}
          {!isAdmin() && clubs.length > 0 && (
            <div style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--bp-border-2)',padding:16,display:'flex',flexDirection:'column',gap:10}}>
              <div style={{fontWeight:700,fontSize:14,color:'var(--bp-text)'}}>Mi club</div>
              <div>
                <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Club al que perteneces</label>
                <select value={clubId} onChange={e=>setClubId(e.target.value)} style={S.inp}>
                  <option value="">Sin club</option>
                  {clubs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <button type="submit" disabled={loading} style={{...S.btn,opacity:loading?0.6:1}}>
            {loading?'Guardando...':'Guardar'}
          </button>
        </form>
      )}

      {/* ── SEGURIDAD tab ── */}
      {tab==='seguridad' && (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>

          {/* Password change */}
          <form onSubmit={handlePassword} style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--bp-border-2)',padding:16,display:'flex',flexDirection:'column',gap:12}}>
            <div style={{fontWeight:700,fontSize:14,color:'var(--bp-text)'}}>Cambiar contraseña</div>
            <div>
              <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Contraseña actual</label>
              <input type="password" value={curPwd} onChange={e=>setCurPwd(e.target.value)} required placeholder="••••••••" style={S.inp}/>
            </div>
            <div>
              <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Nueva contraseña</label>
              <input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)} required placeholder="••••••••" style={S.inp}/>
            </div>
            <div>
              <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Confirmar nueva contraseña</label>
              <input type="password" value={confPwd} onChange={e=>setConfPwd(e.target.value)} required placeholder="••••••••" style={S.inp}/>
            </div>
            <button type="submit" disabled={loading} style={{...S.btn,opacity:loading?0.6:1}}>
              {loading?'Guardando...':'Actualizar contraseña'}
            </button>
          </form>

          {/* 2FA + session */}
          <div style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--bp-border-2)',padding:16,display:'flex',flexDirection:'column',gap:12}}>
            <div style={{fontWeight:700,fontSize:14,color:'var(--bp-text)'}}>Seguridad</div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px',background:'var(--bp-surface-2)',borderRadius:12,border:'1px solid var(--bone-3)'}}>
              <div>
                <div style={{fontWeight:600,fontSize:13,color:'var(--bp-text)'}}>Verificación en dos pasos (2FA)</div>
                <div style={{fontSize:12,color:'var(--bp-text-2)',marginTop:2}}>
                  {twoFA ? 'Activado — recibirás un código por email' : 'Desactivado'}
                </div>
              </div>
              <button onClick={handle2FA} disabled={loading} style={{
                padding:'8px 16px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:700,fontSize:12,
                background:twoFA?'var(--crimson-soft)':'var(--ok-soft)',
                color:twoFA?'var(--crimson)':'var(--ok)',
              }}>
                {twoFA ? 'Desactivar' : 'Activar'}
              </button>
            </div>
            <div style={{padding:'14px',background:'var(--bp-surface-2)',borderRadius:12,border:'1px solid var(--bone-3)'}}>
              <div style={{fontWeight:600,fontSize:13,color:'var(--bp-text)',marginBottom:4}}>Sesión activa</div>
              <div style={{fontSize:12,color:'var(--bp-text-2)'}}>{user?.email}</div>
              <div style={{fontSize:11,color:'var(--bp-text-3)',marginTop:2}}>Rol: {user?.role}</div>
            </div>
          </div>

          {/* Privacy — only for players */}
          {!isAdmin() && (
            <div style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--bp-border-2)',padding:16,display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:'var(--bp-text)'}}>Privacidad del perfil</div>
                <div style={{fontSize:12,color:'var(--bp-text-2)',marginTop:2}}>Controla qué ven los demás jugadores</div>
              </div>
              <PrivacyToggle label="Perfil visible" description={isPublic?'Tu perfil aparece en el directorio':'Tu perfil está oculto a otros jugadores'} value={isPublic} onChange={()=>handlePrivacyToggle('isPublic',isPublic,setIsPublic)} loading={loading}/>
              <PrivacyToggle label="Mostrar estadísticas" description={showStats?'Radar de golpes y valoraciones visibles':'Radar y valoraciones ocultos'} value={showStats} onChange={()=>handlePrivacyToggle('showStats',showStats,setShowStats)} loading={loading}/>
              <PrivacyToggle label="Mostrar partidos" description={showMatches?'Historial de partidos visible':'Historial de partidos oculto'} value={showMatches} onChange={()=>handlePrivacyToggle('showMatches',showMatches,setShowMatches)} loading={loading}/>
              <PrivacyToggle label="Mostrar contacto" description={showContact?'Email visible para los demás jugadores':'Email oculto'} value={showContact} onChange={()=>handlePrivacyToggle('showContact',showContact,setShowContact)} loading={loading}/>
            </div>
          )}
        </div>
      )}

      {/* Logout */}
      <button onClick={()=>{ logout(); window.location.href='/login'; }}
        style={{background:'var(--crimson-soft)',border:'1px solid var(--crimson-soft)',borderRadius:12,padding:'12px',color:'var(--crimson)',fontWeight:600,fontSize:13,cursor:'pointer'}}>
        Cerrar sesión
      </button>
    </div>
  );
}
