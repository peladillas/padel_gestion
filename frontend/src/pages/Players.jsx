import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { playerService, valorationService, authService, clubService } from '../services/api';
import { EnvelopeIcon, CheckCircleIcon, XCircleIcon, LinkIcon, PencilSquareIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import ConfirmModal from '../components/ui/ConfirmModal';
import { overall } from '../utils/valoration';

const getOverall = overall;

function PlayerMiniCard({ player, stats, onClick }) {
  const initials = player.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
  const ovr = getOverall(stats);
  return (
    <div onClick={onClick} style={{background:'#1a1200',borderRadius:14,overflow:'hidden',border:'1px solid #c9a227',cursor:'pointer',transition:'transform 0.15s'}}
      onMouseEnter={e=>e.currentTarget.style.transform='scale(1.02)'}
      onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
      <div style={{background:'#c9a227',padding:'5px 10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:8,fontWeight:900,color:'#1a1200',letterSpacing:'0.1em'}}>NIV. {player.level}</span>
        {ovr && <span style={{fontSize:9,fontWeight:900,color:'#1a1200'}}>{ovr} OVR</span>}
      </div>
      <div style={{height:100,background:'#0f1a2e',position:'relative',overflow:'hidden'}}>
        {player.avatarUrl ? (
          <img src={player.avatarUrl} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',objectPosition:'center top'}}/>
        ) : (
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,fontWeight:900,color:'#c9a227',opacity:0.4}}>{initials}</div>
        )}
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:30,background:'linear-gradient(to top,#1a1200,transparent)'}}/>
        {stats?.total > 0 && (
          <div style={{position:'absolute',bottom:4,right:6,fontSize:9,color:'#c9a227',fontWeight:700,background:'rgba(26,18,0,0.8)',padding:'1px 5px',borderRadius:4}}>
            {stats.total} val.
          </div>
        )}
      </div>
      <div style={{padding:'8px 10px'}}>
        <div style={{fontSize:13,fontWeight:700,color:'var(--ink)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{player.name.split(' ')[0]}</div>
        <div style={{fontSize:10,color:'#7a6020',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{player.name.split(' ').slice(1).join(' ')}</div>
      </div>
    </div>
  );
}

// ── Create player modal ───────────────────────────────────────────────────
function CreatePlayerModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', phone:'', level:'1', username:'' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameSug, setUsernameSug] = useState([]);

  const inp = { width:'100%', border:'1px solid var(--bp-border)', borderRadius:10, padding:'10px 12px', fontSize:13, outline:'none', boxSizing:'border-box' };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.firstName.trim()) { setError('Nombre obligatorio'); return; }
    if (form.firstName.trim().length < 2) { setError('El nombre debe tener al menos 2 caracteres'); return; }
    if (form.firstName.trim().length > 60 || form.lastName.trim().length > 60) { setError('El nombre o apellido no puede superar 60 caracteres'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) { setError('Email inválido'); return; }
    setLoading(true); setError('');
    try {
      const res = await playerService.invite({ firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone||null, level: parseInt(form.level)||1, username: form.username||null });
      onCreated(res.data);
    } catch(err) {
      const d = err.response?.data;
      if (d?.suggestions) setUsernameSug(d.suggestions);
      setError(d?.error || 'Error al crear jugador');
    } finally { setLoading(false); }
  };

  const checkUsername = async (u) => {
    if (u.length < 3) { setUsernameSug([]); return; }
    try {
      const r = await authService.checkUsername(u);
      if (!r.data.available && r.data.suggestions) setUsernameSug(r.data.suggestions);
      else setUsernameSug([]);
    } catch { setUsernameSug([]); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bp-surface)',borderRadius:20,padding:24,width:'100%',maxWidth:400,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div style={{fontWeight:800,fontSize:16,color:'var(--bp-text)'}}>Nuevo jugador</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--bp-text-3)',lineHeight:1}}>×</button>
        </div>

        {error && <div style={{background:'var(--crimson-soft)',border:'1px solid var(--crimson-soft)',color:'var(--crimson)',borderRadius:10,padding:'10px 12px',fontSize:13,marginBottom:14}}>{error}</div>}

        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div>
              <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Nombre *</label>
              <input value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))} placeholder="Marc" required style={inp} autoFocus/>
            </div>
            <div>
              <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Apellido</label>
              <input value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))} placeholder="Gerenich" style={inp}/>
            </div>
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>
              Usuario <span style={{fontWeight:400,color:'var(--bp-text-3)'}}>(opcional, se genera automático)</span>
            </label>
            <input value={form.username} onChange={e=>{const v=e.target.value.toLowerCase().replace(/[^a-z0-9._]/g,'');setForm(f=>({...f,username:v}));checkUsername(v);}}
              placeholder="ej: marc.gerenich" autoCapitalize="none" autoCorrect="off" style={inp}/>
            {usernameSug.length > 0 && (
              <div style={{marginTop:4,fontSize:11,color:'var(--bp-text-2)'}}>
                Sugerencias:{' '}
                {usernameSug.map((s,i)=>(
                  <button key={s} type="button" onClick={()=>{setForm(f=>({...f,username:s}));setUsernameSug([]);}}
                    style={{marginLeft:i>0?6:4,fontSize:11,color:'var(--court-deep)',background:'var(--court-soft)',border:'1px solid var(--court-soft)',borderRadius:4,padding:'1px 6px',cursor:'pointer'}}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Email *</label>
            <input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="jugador@email.com" required style={inp}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div>
              <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Teléfono</label>
              <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="+34 600..." style={inp}/>
            </div>
            <div>
              <label style={{fontSize:11,color:'var(--bp-text-2)',display:'block',marginBottom:4}}>Nivel (1-10)</label>
              <input type="number" min="1" max="10" value={form.level} onChange={e=>setForm(f=>({...f,level:e.target.value}))} style={inp}/>
            </div>
          </div>
          <div style={{background:'var(--court-soft)',border:'1px solid var(--court-soft)',borderRadius:10,padding:'10px 12px',fontSize:12,color:'var(--court-deep)',display:'flex',alignItems:'center',gap:6}}>
            <EnvelopeIcon style={{width:14,height:14,flexShrink:0}} /> Se enviará un email de invitación para que el jugador active su cuenta y elija contraseña.
          </div>
          <div style={{display:'flex',gap:8,marginTop:4}}>
            <button type="button" onClick={onClose} style={{flex:1,padding:'11px',borderRadius:10,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:'var(--bp-text-2)',fontWeight:600,fontSize:13,cursor:'pointer'}}>
              Cancelar
            </button>
            <button type="submit" disabled={loading} style={{flex:2,padding:'11px',borderRadius:10,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:800,fontSize:13,cursor:'pointer',opacity:loading?0.6:1}}>
              {loading ? 'Creando...' : 'Crear y enviar invitación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Import result modal ───────────────────────────────────────────────────
function ImportResultModal({ result, onClose }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bp-surface)',borderRadius:20,padding:24,width:'100%',maxWidth:400,maxHeight:'80vh',overflow:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:16,color:'var(--bp-text)'}}>Resultado de importación</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--bp-text-3)',lineHeight:1}}>×</button>
        </div>
        <div style={{background:'var(--ok-soft)',border:'1px solid var(--ok-soft)',borderRadius:10,padding:'12px 14px',marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:15,color:'var(--ok)',display:'flex',alignItems:'center',gap:5}}><CheckCircleIcon style={{width:16,height:16,flexShrink:0}}/> {result.imported} jugadores importados</div>
          <div style={{fontSize:12,color:'var(--ok)',marginTop:2}}>Se ha enviado email de activación a cada uno</div>
        </div>
        {result.errors?.length > 0 && (
          <div>
            <div style={{fontWeight:700,fontSize:13,color:'var(--crimson)',marginBottom:8,display:'flex',alignItems:'center',gap:5}}><XCircleIcon style={{width:14,height:14,flexShrink:0}}/> {result.errors.length} errores:</div>
            {result.errors.map((e,i) => (
              <div key={i} style={{fontSize:12,background:'var(--crimson-soft)',border:'1px solid var(--crimson-soft)',borderRadius:8,padding:'8px 10px',marginBottom:6}}>
                <div style={{fontWeight:600,color:'var(--crimson)'}}>{e.email}</div>
                <div style={{color:'#991b1b',marginTop:2}}>{e.error}</div>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{width:'100%',marginTop:12,padding:'11px',borderRadius:10,border:'none',background:'var(--bone-3)',color:'var(--ink-soft)',fontWeight:700,fontSize:13,cursor:'pointer',border:'1px solid var(--line)'}}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ── Invite code section ───────────────────────────────────────────────────
const HIST_PAGE = 5;

function InviteCodeSection() {
  const [codes,      setCodes]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [open,       setOpen]       = useState(false);
  const [copied,     setCopied]     = useState({});
  const [label,      setLabel]      = useState('');
  const [maxUses,    setMaxUses]    = useState(1);
  const [histPage,   setHistPage]   = useState(1);

  const load = async () => {
    try { const r = await authService.listInviteCodes(); setCodes(r.data); }
    catch { /* ignore */ }
  };

  const handleOpen = () => { if (!open) load(); setOpen(v => !v); };

  const generate = async () => {
    setGenLoading(true);
    try {
      await authService.generateInviteCode({ label: label.trim() || undefined, maxUses: Math.max(1, parseInt(maxUses)||1), days: 7 });
      setLabel(''); setMaxUses(1); setHistPage(1);
      await load();
    } catch(e) { /* ignore */ }
    finally { setGenLoading(false); }
  };

  const revoke = async (id) => {
    try { await authService.revokeInviteCode(id); await load(); }
    catch { /* ignore */ }
  };

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(c => ({ ...c, [key]: true }));
      setTimeout(() => setCopied(c => ({ ...c, [key]: false })), 2000);
    } catch { /* ignore */ }
  };

  const shareWA  = (url) => window.open(`https://wa.me/?text=${encodeURIComponent('¡Únete a Bonapinta! Regístrate con este enlace: ' + url)}`, '_blank');
  const shareTG  = (url) => window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('¡Únete a Bonapinta!')}`, '_blank');

  const activeCode = codes.find(c => c.uses < c.maxUses && (!c.expiresAt || new Date(c.expiresAt) > new Date()));

  return (
    <div style={{background:'var(--bp-surface)',borderRadius:16,border:'1px solid var(--court-soft)',overflow:'hidden'}}>
      <button
        onClick={handleOpen}
        style={{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',background:'var(--court-soft)',border:'none',cursor:'pointer'}}
      >
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontWeight:700,fontSize:13,color:'var(--court-deep)',display:'flex',alignItems:'center',gap:5}}><LinkIcon style={{width:14,height:14,flexShrink:0}}/> Enlace de invitación</span>
          <span style={{fontSize:11,color:'var(--court-deep)'}}>Comparte por WhatsApp, Telegram...</span>
        </div>
        <span style={{fontSize:12,color:'var(--court-deep)'}}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:12}}>

          {/* Generate new code */}
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <div style={{display:'flex',gap:8}}>
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Etiqueta opcional (ej: Instagram)"
                style={{flex:1,border:'1px solid var(--bp-border)',borderRadius:10,padding:'9px 12px',fontSize:12,outline:'none'}}
              />
              <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                <span style={{fontSize:11,color:'var(--bp-text-2)',whiteSpace:'nowrap'}}>Usos:</span>
                <input
                  type="number" min="1" max="100" value={maxUses}
                  onChange={e => setMaxUses(e.target.value)}
                  style={{width:52,border:'1px solid var(--bp-border)',borderRadius:8,padding:'9px 8px',fontSize:12,outline:'none',textAlign:'center'}}
                />
              </div>
              <button
                onClick={generate}
                disabled={genLoading}
                style={{padding:'9px 14px',borderRadius:10,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:700,fontSize:12,cursor:'pointer',opacity:genLoading?0.6:1,whiteSpace:'nowrap'}}
              >
                {genLoading ? '...' : '+ Generar'}
              </button>
            </div>
            <div style={{fontSize:10,color:'var(--bp-text-3)'}}>Los enlaces caducan en 7 días · "Usos" = nº de nuevos registros permitidos</div>
          </div>

          {/* Active link with share buttons */}
          {activeCode && (
            <div style={{background:'var(--ok-soft)',border:'1px solid var(--ok-soft)',borderRadius:12,padding:'12px 14px'}}>
              <div style={{fontSize:11,color:'var(--ok)',fontWeight:700,marginBottom:8}}>
                ✅ Enlace activo{activeCode.label ? ` — ${activeCode.label}` : ''} · Uso {activeCode.uses}/{activeCode.maxUses}
              </div>
              <div style={{fontSize:10,color:'var(--bp-text)',background:'var(--bp-surface)',border:'1px solid var(--bp-border)',borderRadius:8,padding:'7px 10px',wordBreak:'break-all',fontFamily:'monospace',marginBottom:10}}>
                {activeCode.inviteUrl}
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                <button
                  onClick={() => shareWA(activeCode.inviteUrl)}
                  style={{display:'flex',alignItems:'center',gap:5,padding:'8px 12px',borderRadius:10,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:700,fontSize:12,cursor:'pointer'}}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                  WhatsApp
                </button>
                <button
                  onClick={() => shareTG(activeCode.inviteUrl)}
                  style={{display:'flex',alignItems:'center',gap:5,padding:'8px 12px',borderRadius:10,border:'none',background:'#0088cc',color:'var(--ink)',fontWeight:700,fontSize:12,cursor:'pointer'}}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                  Telegram
                </button>
                <button
                  onClick={() => copy(activeCode.inviteUrl, activeCode.id)}
                  style={{padding:'8px 12px',borderRadius:10,border:'1px solid var(--bp-border)',background:copied[activeCode.id]?'var(--ok-soft)':'white',color:copied[activeCode.id]?'var(--ok)':'var(--ink-mid)',fontWeight:600,fontSize:12,cursor:'pointer'}}
                >
                  {copied[activeCode.id] ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          )}

          {/* Code history with pagination */}
          {codes.length > 0 && (() => {
            const totalPages = Math.ceil(codes.length / HIST_PAGE);
            const page = Math.min(histPage, totalPages);
            const paginated = codes.slice((page-1)*HIST_PAGE, page*HIST_PAGE);
            return (
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <div style={{fontSize:11,color:'var(--bp-text-3)',fontWeight:600}}>HISTORIAL ({codes.length})</div>
                  {totalPages > 1 && (
                    <div style={{display:'flex',gap:4,alignItems:'center'}}>
                      <button onClick={()=>setHistPage(p=>Math.max(1,p-1))} disabled={page===1}
                        style={{padding:'2px 8px',borderRadius:6,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:page===1?'var(--line)':'var(--ink-mid)',cursor:page===1?'default':'pointer',fontSize:11}}>‹</button>
                      <span style={{fontSize:10,color:'var(--bp-text-3)'}}>{page}/{totalPages}</span>
                      <button onClick={()=>setHistPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                        style={{padding:'2px 8px',borderRadius:6,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:page===totalPages?'var(--line)':'var(--ink-mid)',cursor:page===totalPages?'default':'pointer',fontSize:11}}>›</button>
                    </div>
                  )}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {paginated.map(c => {
                    const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                    const used = c.uses >= c.maxUses;
                    const active = !expired && !used;
                    const expDate = c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('es-ES',{day:'numeric',month:'short'}) : null;
                    return (
                      <div key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'var(--bp-surface-2)',borderRadius:8,border:'1px solid var(--bp-border)'}}>
                        <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:6,background:active?'var(--ok-soft)':used?'var(--crimson-soft)':'var(--bone-3)',color:active?'var(--ok)':used?'var(--crimson)':'var(--ink-soft)',border:`1px solid ${active?'var(--ok-soft)':used?'var(--crimson-soft)':'var(--line)'}`,flexShrink:0}}>
                          {active ? 'ACTIVO' : used ? 'AGOTADO' : 'EXPIRADO'}
                        </span>
                        <span style={{flex:1,fontSize:11,color:'var(--bp-text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {c.label || 'Sin etiqueta'} · {c.uses}/{c.maxUses} usos{expDate ? ` · hasta ${expDate}` : ''}
                        </span>
                        {active && (
                          <button onClick={() => copy(c.inviteUrl, `c-${c.id}`)}
                            style={{padding:'3px 8px',borderRadius:6,border:'1px solid var(--court-soft)',background:copied[`c-${c.id}`]?'var(--ok-soft)':'var(--court-soft)',color:copied[`c-${c.id}`]?'var(--ok)':'var(--court)',fontSize:10,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                            {copied[`c-${c.id}`] ? '✓' : 'Copiar'}
                          </button>
                        )}
                        {active && (
                          <button onClick={() => revoke(c.id)}
                            style={{padding:'3px 8px',borderRadius:6,border:'1px solid var(--crimson-soft)',background:'var(--crimson-soft)',color:'var(--crimson)',fontSize:10,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {codes.length === 0 && (
            <div style={{textAlign:'center',fontSize:12,color:'var(--bp-text-3)',padding:'8px 0'}}>
              No hay códigos generados aún. Genera uno para compartir.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Club player ABM ───────────────────────────────────────────────────────────
const inp0 = { width:'100%', border:'1px solid var(--line)', borderRadius:10, padding:'9px 12px', fontSize:13, outline:'none', boxSizing:'border-box', background:'var(--paper)', color:'var(--ink)' };
const lbl0 = { fontSize:11, color:'var(--ink-soft)', display:'block', marginBottom:4 };

function DirectCreatePlayerModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', username:'', password:'', level:'1', phone:'' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleEmail = (v) => setForm(f => ({ ...f, email:v, username: f.username||v.split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g,'') }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.firstName.trim()||!form.email.trim()||!form.password) { setErr('Nombre, email y contraseña son requeridos'); return; }
    setSaving(true); setErr('');
    try { const res = await playerService.createClubPlayer(form); onCreated(res.data); }
    catch(ex) { setErr(ex.response?.data?.error||'Error al crear jugador'); setSaving(false); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--paper)',borderRadius:16,padding:24,width:'100%',maxWidth:400,border:'1px solid var(--line)',boxShadow:'0 8px 40px rgba(0,0,0,0.18)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <span style={{fontWeight:700,fontSize:16,color:'var(--ink)'}}>Nuevo jugador</span>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--ink-soft)',fontSize:20,lineHeight:1}}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:11}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><label style={lbl0}>NOMBRE</label><input style={inp0} value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))} placeholder="Nombre" /></div>
            <div><label style={lbl0}>APELLIDO</label><input style={inp0} value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))} placeholder="Apellido" /></div>
          </div>
          <div><label style={lbl0}>EMAIL</label><input type="email" style={inp0} value={form.email} onChange={e=>handleEmail(e.target.value)} placeholder="jugador@email.com" /></div>
          <div><label style={lbl0}>USUARIO</label><input style={inp0} value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g,'')}))} placeholder="nombre.apellido" /></div>
          <div><label style={lbl0}>CONTRASEÑA</label><input type="password" style={inp0} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="••••••••" /></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><label style={lbl0}>NIVEL (1-10)</label><input type="number" min="1" max="10" style={inp0} value={form.level} onChange={e=>setForm(f=>({...f,level:e.target.value}))} /></div>
            <div><label style={lbl0}>TELÉFONO</label><input style={inp0} value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="+34 600..." /></div>
          </div>
          {err && <div style={{fontSize:12,color:'var(--crimson)',background:'var(--crimson-soft)',borderRadius:8,padding:'8px 12px'}}>{err}</div>}
          <div style={{display:'flex',gap:8,marginTop:4}}>
            <button type="button" onClick={onClose} style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--line)',background:'var(--bone-2)',color:'var(--ink-soft)',fontWeight:600,cursor:'pointer',fontSize:13}}>Cancelar</button>
            <button type="submit" disabled={saving} style={{flex:2,padding:'10px',borderRadius:10,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:700,cursor:'pointer',fontSize:13,opacity:saving?0.6:1}}>
              {saving?'Creando...':'Crear jugador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditPlayerModal({ player, onClose, onSaved }) {
  const userId = player.user?.id;
  const [form, setForm] = useState({
    firstName: player.firstName || '',
    lastName:  player.lastName || '',
    email:    player.user?.email || '',
    username: player.user?.username || '',
    level:    String(player.level || 1),
    phone:    player.phone || '',
    birthDate: player.birthDate ? player.birthDate.split('T')[0] : '',
    gender:   player.gender || '',
    dominantHand: player.dominantHand || '',
    position: player.position || '',
    password: '',
    confirm:  '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [usernameOk, setUsernameOk] = useState(null);
  const [usernameSug, setUsernameSug] = useState([]);

  const checkUname = useCallback(async (v) => {
    if (v.length < 3) { setUsernameOk(null); setUsernameSug([]); return; }
    try {
      const r = await authService.checkUsername(v, userId);
      setUsernameOk(r.data.available);
      setUsernameSug(r.data.suggestions || []);
    } catch { setUsernameOk(null); }
  }, [userId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.firstName.trim()) { setErr('El nombre es requerido'); return; }
    if (form.firstName.trim().length < 2) { setErr('El nombre debe tener al menos 2 caracteres'); return; }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) { setErr('Email inválido'); return; }
    if (form.username && form.username.length < 3) { setErr('El usuario debe tener al menos 3 caracteres'); return; }
    if (form.password && form.password.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres'); return; }
    if (form.password && form.password !== form.confirm) { setErr('Las contraseñas no coinciden'); return; }
    setSaving(true); setErr('');
    try {
      const res = await playerService.update(player.id, {
        firstName:    form.firstName.trim(),
        lastName:     form.lastName.trim(),
        email:        form.email.trim(),
        level:        parseInt(form.level) || 1,
        phone:        form.phone || null,
        birthDate:    form.birthDate || null,
        gender:       form.gender || null,
        dominantHand: form.dominantHand || null,
        position:     form.position || null,
        username:     form.username || null,
      });
      if (form.password) await playerService.changePassword(player.id, form.password);
      onSaved(res.data);
    } catch(ex) { setErr(ex.response?.data?.error || 'Error al guardar'); setSaving(false); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16,overflowY:'auto'}}>
      <div style={{background:'var(--paper)',borderRadius:16,padding:24,width:'100%',maxWidth:420,border:'1px solid var(--line)',boxShadow:'0 8px 40px rgba(0,0,0,0.18)',margin:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <span style={{fontWeight:700,fontSize:16,color:'var(--ink)'}}>Editar jugador</span>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--ink-soft)',fontSize:20,lineHeight:1}}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:11}}>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><label style={lbl0}>NOMBRE</label><input style={inp0} value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))} /></div>
            <div><label style={lbl0}>APELLIDO</label><input style={inp0} value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))} /></div>
          </div>

          <div><label style={lbl0}>EMAIL</label><input type="email" style={inp0} value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="jugador@email.com" /></div>

          <div>
            <label style={lbl0}>USUARIO</label>
            <div style={{position:'relative'}}>
              <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--ink-soft)',fontSize:12,pointerEvents:'none'}}>@</span>
              <input style={{...inp0,paddingLeft:22,borderColor:usernameOk===true?'var(--ok)':usernameOk===false?'var(--crimson)':inp0.borderColor}}
                value={form.username}
                onChange={e=>{const v=e.target.value.toLowerCase().replace(/[^a-z0-9._]/g,'');setForm(f=>({...f,username:v}));checkUname(v);}}
                placeholder="nombre.apellido" autoCapitalize="none" />
            </div>
            {usernameOk===false && usernameSug.length>0 && (
              <div style={{marginTop:3,fontSize:11,color:'var(--ink-soft)'}}>
                Ya en uso.{' '}
                {usernameSug.map((s,i)=>(
                  <button key={s} type="button" onClick={()=>{setForm(f=>({...f,username:s}));setUsernameOk(null);setUsernameSug([]);}}
                    style={{marginLeft:i>0?4:2,fontSize:11,color:'var(--court-deep)',background:'var(--court-soft)',border:'none',borderRadius:4,padding:'1px 6px',cursor:'pointer'}}>{s}</button>
                ))}
              </div>
            )}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><label style={lbl0}>NIVEL (1-10)</label><input type="number" min="1" max="10" style={inp0} value={form.level} onChange={e=>setForm(f=>({...f,level:e.target.value}))} /></div>
            <div><label style={lbl0}>TELÉFONO</label><input style={inp0} value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div>
              <label style={lbl0}>FECHA NACIMIENTO</label>
              <input type="date" style={inp0} value={form.birthDate} onChange={e=>setForm(f=>({...f,birthDate:e.target.value}))} />
            </div>
            <div>
              <label style={lbl0}>SEXO</label>
              <select style={inp0} value={form.gender} onChange={e=>setForm(f=>({...f,gender:e.target.value}))}>
                <option value="">Sin especificar</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
                <option value="X">Prefiero no decir</option>
              </select>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div>
              <label style={lbl0}>MANO DOMINANTE</label>
              <select style={inp0} value={form.dominantHand} onChange={e=>setForm(f=>({...f,dominantHand:e.target.value}))}>
                <option value="">Sin especificar</option>
                <option value="right">Diestro</option>
                <option value="left">Zurdo</option>
                <option value="both">Ambidiestro</option>
              </select>
            </div>
            <div>
              <label style={lbl0}>POSICIÓN</label>
              <select style={inp0} value={form.position} onChange={e=>setForm(f=>({...f,position:e.target.value}))}>
                <option value="">Sin especificar</option>
                <option value="drive">Drive</option>
                <option value="reves">Revés</option>
                <option value="both">Ambas</option>
              </select>
            </div>
          </div>

          <div style={{borderTop:'1px solid var(--line)',paddingTop:11,marginTop:2}}>
            <div style={{fontSize:11,color:'var(--ink-soft)',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em'}}>Contraseña — dejar en blanco para no cambiar</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <input type="password" style={inp0} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Nueva contraseña" />
              <input type="password" style={{...inp0,opacity:form.password?1:0.5}} value={form.confirm} onChange={e=>setForm(f=>({...f,confirm:e.target.value}))} placeholder="Confirmar contraseña" disabled={!form.password} />
            </div>
          </div>

          {err && <div style={{fontSize:12,color:'var(--crimson)',background:'var(--crimson-soft)',borderRadius:8,padding:'8px 12px'}}>{err}</div>}
          <div style={{display:'flex',gap:8,marginTop:4}}>
            <button type="button" onClick={onClose} style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--line)',background:'var(--bone-2)',color:'var(--ink-soft)',fontWeight:600,cursor:'pointer',fontSize:13}}>Cancelar</button>
            <button type="submit" disabled={saving} style={{flex:2,padding:'10px',borderRadius:10,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:700,cursor:'pointer',fontSize:13,opacity:saving?0.6:1}}>
              {saving?'Guardando...':'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RestorePlayerModal({ player, onClose, onRestored }) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setErr('Introduce un email válido'); return; }
    setSaving(true); setErr('');
    try {
      const r = await playerService.restore(player.id, email.trim());
      onRestored(r.data);
    } catch(ex) { setErr(ex.response?.data?.error || 'Error al restaurar'); setSaving(false); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--paper)',borderRadius:16,padding:24,width:'100%',maxWidth:380,border:'1px solid var(--line)',boxShadow:'0 8px 40px rgba(0,0,0,0.18)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:'var(--ink)'}}>Restaurar jugador</div>
            <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:2}}>{player.name}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--ink-soft)',fontSize:22,lineHeight:1}}>×</button>
        </div>
        <div style={{fontSize:12,color:'var(--ink-soft)',background:'var(--bone)',borderRadius:8,padding:'10px 12px',marginBottom:16,lineHeight:1.5}}>
          El email original fue eliminado por seguridad. Introduce un nuevo email para reactivar la cuenta.
        </div>
        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:10}}>
          <div>
            <label style={lbl0}>NUEVO EMAIL</label>
            <input type="email" style={inp0} value={email} onChange={e=>setEmail(e.target.value)} placeholder="jugador@email.com" autoFocus />
          </div>
          {err && <div style={{fontSize:12,color:'var(--crimson)',background:'var(--crimson-soft)',borderRadius:8,padding:'8px 12px'}}>{err}</div>}
          <div style={{display:'flex',gap:8,marginTop:4}}>
            <button type="button" onClick={onClose} style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--line)',background:'var(--bone-2)',color:'var(--ink-soft)',fontWeight:600,cursor:'pointer',fontSize:13}}>Cancelar</button>
            <button type="submit" disabled={saving} style={{flex:2,padding:'10px',borderRadius:10,border:'none',background:'var(--ok)',color:'white',fontWeight:700,cursor:'pointer',fontSize:13,opacity:saving?0.6:1}}>
              {saving ? 'Restaurando...' : 'Restaurar jugador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const ABM_PAGE_SIZE = 10;

function ClubPlayersPanel({ onReload, isSuperAdmin }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editPlayer, setEditPlayer] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'deleted'
  const [restorePlayer, setRestorePlayer] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Club filter — SUPER_ADMIN sees every player on the platform by
  // default, which doesn't scale once there's more than a handful of
  // clubs; this narrows the list down to one club at a time.
  const [clubs, setClubs] = useState([]);
  const [clubFilter, setClubFilter] = useState('');

  useEffect(() => {
    if (isSuperAdmin) clubService.getAll().then(r => setClubs(r.data || [])).catch(() => {});
  }, [isSuperAdmin]);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const r = isSuperAdmin
        ? await playerService.search('', clubFilter || undefined)
        : await playerService.getClubPlayers();
      setPlayers(r.data || []);
      setPage(1);
    } catch { setLoadError('No se pudieron cargar los jugadores'); }
    finally { setLoading(false); }
  }, [isSuperAdmin, clubFilter]);

  useEffect(() => { load(); }, [load]);

  const confirmDelete = async () => {
    await playerService.delete(deleteTarget.id);
    setPlayers(ps => ps.filter(x => x.id !== deleteTarget.id));
    setDeleteTarget(null);
    onReload();
  };

  const handleCreated = (player) => {
    setPlayers(ps=>[...ps, player].sort((a,b)=>a.name.localeCompare(b.name)));
    setShowCreate(false);
    setPage(1);
    onReload();
  };

  const handleSaved = (updated) => {
    setPlayers(ps=>ps.map(p=>p.id===updated.id?{...p,...updated}:p));
    setEditPlayer(null);
  };

  const handleRestored = (updated) => {
    setPlayers(ps=>ps.map(p=>p.id===updated.id ? { ...p, ...updated } : p));
    setRestorePlayer(null);
    setActiveTab('active');
  };

  const activePlayers  = players.filter(p => p.active !== false);
  const deletedPlayers = players.filter(p => p.active === false);

  const q = search.trim().toLowerCase();
  const tabSource = activeTab === 'deleted' ? deletedPlayers : activePlayers;
  const filtered = q
    ? tabSource.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.user?.email?.toLowerCase().includes(q) ||
        (p.phone || p.user?.phone || '').toLowerCase().includes(q)
      )
    : tabSource;
  const paginated = filtered.slice((page - 1) * ABM_PAGE_SIZE, page * ABM_PAGE_SIZE);

  return (
    <div style={{background:'var(--paper)',borderRadius:16,border:'1px solid var(--line)',overflow:'hidden'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',borderBottom:'1px solid var(--line)'}}>
        <div>
          <div style={{fontWeight:700,fontSize:14,color:'var(--ink)'}}>{isSuperAdmin ? 'Todos los jugadores' : 'Jugadores del club'}</div>
          <div style={{fontSize:11,color:'var(--ink-soft)',marginTop:1}}>
            {filtered.length}{q ? ` de ${tabSource.length}` : ''} jugadores
          </div>
        </div>
        {activeTab === 'active' && (
          <button onClick={()=>setShowCreate(true)}
            style={{display:'flex',alignItems:'center',gap:5,padding:'8px 14px',borderRadius:10,border:'none',background:'var(--court)',color:'var(--ink)',fontWeight:700,fontSize:12,cursor:'pointer'}}>
            <PlusIcon style={{width:14,height:14}} /> Nuevo jugador
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid var(--line)'}}>
        {[
          ['active',  `Activos (${activePlayers.length})`],
          ['deleted', `Eliminados (${deletedPlayers.length})`],
        ].map(([tab, label]) => (
          <button key={tab} onClick={()=>{setActiveTab(tab);setPage(1);setSearch('');}}
            style={{flex:1,padding:'9px 0',border:'none',borderBottom:`2px solid ${activeTab===tab?'var(--court)':'transparent'}`,background:'transparent',fontSize:12,fontWeight:activeTab===tab?700:400,color:activeTab===tab?'var(--court-deep)':'var(--ink-soft)',cursor:'pointer'}}>
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{padding:'10px 16px',borderBottom:'1px solid var(--line)',position:'relative'}}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Buscar por nombre, email o teléfono..."
          style={{width:'100%',border:'1px solid var(--line)',borderRadius:8,padding:'8px 30px 8px 10px',fontSize:12,outline:'none',background:'var(--bone)',color:'var(--ink)',boxSizing:'border-box'}}
        />
        {search && (
          <button onClick={()=>{setSearch('');setPage(1);}}
            style={{position:'absolute',right:22,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--ink-soft)',fontSize:16,cursor:'pointer',lineHeight:1}}>×</button>
        )}
      </div>

      {/* Club filter — super admin only, narrows the platform-wide list */}
      {isSuperAdmin && clubs.length > 0 && (
        <div style={{padding:'0 16px 10px',borderBottom:'1px solid var(--line)'}}>
          <select value={clubFilter} onChange={e=>{setClubFilter(e.target.value);setPage(1);}}
            style={{width:'100%',border:'1px solid var(--line)',borderRadius:8,padding:'7px 10px',fontSize:12,outline:'none',background:'var(--bone)',color:'var(--ink)',boxSizing:'border-box'}}>
            <option value="">Todos los clubs</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Player list */}
      {loading ? (
        <div style={{padding:'24px',textAlign:'center',fontSize:12,color:'var(--ink-soft)'}}>Cargando...</div>
      ) : loadError ? (
        <div style={{padding:'24px',textAlign:'center',fontSize:12,color:'var(--crimson)'}}>
          {loadError}
          <button onClick={load} style={{display:'block',margin:'8px auto 0',background:'none',border:'none',color:'var(--crimson)',fontWeight:700,textDecoration:'underline',cursor:'pointer',fontSize:12}}>
            Reintentar
          </button>
        </div>
      ) : tabSource.length === 0 ? (
        <div style={{padding:'24px',textAlign:'center',fontSize:12,color:'var(--ink-soft)'}}>
          {activeTab === 'deleted'
            ? 'No hay jugadores eliminados.'
            : isSuperAdmin ? 'No hay jugadores registrados.' : 'Sin jugadores en el club aún.'}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{padding:'24px',textAlign:'center',fontSize:12,color:'var(--ink-soft)'}}>Sin resultados para "{search}"</div>
      ) : (
        <>
          <div style={{display:'flex',flexDirection:'column'}}>
            {paginated.map((p, i) => {
              const isDeleted = p.active === false;
              return (
                <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',
                  borderBottom: i < paginated.length-1 ? '1px solid var(--line)' : 'none',
                  background: isDeleted ? 'var(--bone)' : 'transparent', opacity: isDeleted ? 0.75 : 1}}>
                  {p.avatarUrl
                    ? <img src={p.avatarUrl} style={{width:34,height:34,borderRadius:'50%',objectFit:'cover',flexShrink:0}} />
                    : <div style={{width:34,height:34,borderRadius:'50%',background:isDeleted?'var(--line)':'var(--court-soft)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:isDeleted?'var(--ink-soft)':'var(--court-deep)',flexShrink:0}}>
                        {(p.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                      </div>
                  }
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:13,fontWeight:600,color:isDeleted?'var(--ink-soft)':'var(--ink)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}</span>
                      {isDeleted && <span style={{fontSize:9,background:'var(--crimson-soft)',color:'var(--crimson)',borderRadius:4,padding:'1px 5px',fontWeight:700,flexShrink:0}}>BAJA</span>}
                    </div>
                    <div style={{fontSize:11,color:'var(--ink-soft)'}}>{p.user?.email} · Niv.{p.level}</div>
                  </div>
                  {isDeleted ? (
                    <button onClick={()=>setRestorePlayer(p)}
                      style={{fontSize:11,background:'var(--ok-soft)',border:'1px solid var(--ok-soft)',borderRadius:6,padding:'4px 10px',color:'var(--ok)',fontWeight:700,cursor:'pointer',flexShrink:0}}>
                      Restaurar
                    </button>
                  ) : (
                    <>
                      <button onClick={()=>setEditPlayer(p)} title="Editar"
                        style={{background:'none',border:'none',cursor:'pointer',color:'var(--ink-soft)',padding:5,flexShrink:0}}>
                        <PencilSquareIcon style={{width:16,height:16}} />
                      </button>
                      <button onClick={()=>setDeleteTarget(p)} title="Eliminar"
                        style={{background:'none',border:'none',cursor:'pointer',color:'var(--crimson)',padding:5,flexShrink:0}}>
                        <TrashIcon style={{width:16,height:16}} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {filtered.length > ABM_PAGE_SIZE && (
            <div style={{padding:'12px 16px',borderTop:'1px solid var(--line)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:11,color:'var(--bp-text-3)'}}>
                {(page-1)*ABM_PAGE_SIZE+1}–{Math.min(page*ABM_PAGE_SIZE, filtered.length)} de {filtered.length}
              </span>
              <Paginator page={page} total={filtered.length} pageSize={ABM_PAGE_SIZE} onChange={setPage} />
            </div>
          )}
        </>
      )}

      {showCreate    && <DirectCreatePlayerModal onClose={()=>setShowCreate(false)} onCreated={handleCreated} />}
      {editPlayer    && <EditPlayerModal player={editPlayer} onClose={()=>setEditPlayer(null)} onSaved={handleSaved} />}
      {restorePlayer && <RestorePlayerModal player={restorePlayer} onClose={()=>setRestorePlayer(null)} onRestored={handleRestored} />}
      {deleteTarget  && (
        <ConfirmModal
          title="Eliminar jugador"
          message={`¿Eliminar a ${deleteTarget.name}? El jugador quedará marcado como "Jugador eliminado" en sus partidos y torneos anteriores.`}
          confirmLabel="Eliminar jugador"
          onConfirm={confirmDelete}
          onClose={()=>setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

const PAGE_SIZE = 12;

function Paginator({ page, total, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const pages = [];
  for (let i = 1; i <= totalPages; i++) pages.push(i);
  const visible = pages.filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1);

  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4,marginTop:4}}>
      <button onClick={() => onChange(page - 1)} disabled={page === 1}
        style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:page===1?'var(--line)':'var(--ink-mid)',cursor:page===1?'default':'pointer',fontSize:13,fontWeight:600}}>
        ‹
      </button>
      {visible.map((p, i) => {
        const prev = visible[i - 1];
        return (
          <span key={p} style={{display:'flex',alignItems:'center',gap:4}}>
            {prev && p - prev > 1 && <span style={{color:'var(--bp-text-3)',fontSize:12}}>…</span>}
            <button onClick={() => onChange(p)}
              style={{width:32,height:32,borderRadius:8,border:`1px solid ${p===page?'var(--court)':'var(--line)'}`,background:p===page?'var(--court)':'var(--paper)',color:p===page?'var(--ink)':'var(--ink-mid)',cursor:'pointer',fontSize:13,fontWeight:p===page?800:400}}>
              {p}
            </button>
          </span>
        );
      })}
      <button onClick={() => onChange(page + 1)} disabled={page === totalPages}
        style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--bp-border)',background:'var(--bp-surface)',color:page===totalPages?'var(--line)':'var(--ink-mid)',cursor:page===totalPages?'default':'pointer',fontSize:13,fontWeight:600}}>
        ›
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function Players() {
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin } = useAuth();
  const fileRef = useRef();

  const [players,       setPlayers]       = useState([]);
  const [stats,         setStats]         = useState({});
  const [search,        setSearch]        = useState('');
  const [page,          setPage]          = useState(1);
  const [loading,       setLoading]       = useState(true);
  const [showCreate,    setShowCreate]     = useState(false);
  const [importResult,  setImportResult]  = useState(null);
  const [importing,     setImporting]     = useState(false);
  const [notice,        setNotice]        = useState('');

  useEffect(() => { load(''); }, []);

  const load = async (q) => {
    setLoading(true);
    try {
      const res = await playerService.search(q);
      const ps = res.data||[];
      setPlayers(ps);
      setPage(1);
      const statsMap = {};
      await Promise.all(ps.map(async p => {
        try { const r = await valorationService.getByPlayer(p.id); statsMap[p.id] = r.data; }
        catch { statsMap[p.id] = { total:0 }; }
      }));
      setStats(statsMap);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSearch = (e) => {
    const q = e.target.value;
    setSearch(q);
    setTimeout(() => load(q), 300);
  };

  const handleCreated = (player) => {
    setShowCreate(false);
    notify(`✅ ${player.name} creado. Invitación enviada.`);
    load(search);
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    try {
      const res = await playerService.import(file);
      setImportResult(res.data);
      load(search);
    } catch(err) {
      notify('❌ Error al importar el archivo');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const notify = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 4000); };

  const paginated = players.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>

      {showCreate && <CreatePlayerModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
      {importResult && <ImportResultModal result={importResult} onClose={() => setImportResult(null)} />}

      {/* Header */}
      <div style={{background:'var(--paper)',borderRadius:20,padding:16,border:'1px solid var(--line)'}}>
        <div style={{fontSize:11,color:'var(--ink-soft)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Bonapinta</div>
        <div style={{fontWeight:700,fontSize:18,color:'var(--ink)',fontFamily:'var(--display)',marginTop:4}}>Jugadores</div>
        <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:2}}>{players.length} jugadores registrados</div>
      </div>

      {/* Super admin: invite link + CSV import */}
      {isSuperAdmin() && <InviteCodeSection />}
      {isSuperAdmin() && (
        <div style={{display:'flex',gap:8}}>
          <button
            onClick={() => fileRef.current.click()}
            disabled={importing}
            style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:'var(--bone-3)',border:'1px solid var(--line)',borderRadius:12,padding:'11px',color:'var(--ink-mid)',fontWeight:700,fontSize:13,cursor:'pointer',opacity:importing?0.6:1}}
          >
            {importing ? '⏳ Importando...' : '📥 Importar CSV'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} style={{display:'none'}}/>
        </div>
      )}
      {isSuperAdmin() && (
        <div style={{background:'var(--bp-surface-2)',border:'1px solid var(--bp-border)',borderRadius:10,padding:'10px 14px',fontSize:11,color:'var(--bp-text-2)'}}>
          📄 CSV: columnas <code style={{background:'var(--bp-surface-3)',padding:'1px 4px',borderRadius:4}}>email, name, phone, level</code> — se enviará invitación a cada email
        </div>
      )}

      {/* Admin ABM: all players (super admin) or club players (club admin) */}
      {isAdmin() && <ClubPlayersPanel isSuperAdmin={isSuperAdmin()} onReload={() => load(search)} />}

      {/* Notice */}
      {notice && (
        <div style={{background:'var(--ok-soft)',border:'1px solid var(--ok-soft)',color:'var(--ok)',borderRadius:10,padding:'10px 14px',fontSize:13,fontWeight:600}}>
          {notice}
        </div>
      )}

      {/* Search */}
      <div style={{position:'relative'}}>
        <input
          type="text" value={search} onChange={handleSearch}
          placeholder="Buscar jugador..."
          style={{width:'100%',border:'1px solid var(--line)',borderRadius:12,padding:'10px 14px 10px 36px',fontSize:14,outline:'none',background:'var(--paper)',color:'var(--ink)',boxSizing:'border-box'}}
        />
        <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--ink-soft)',fontSize:14}}>🔍</span>
        {search && (
          <button onClick={()=>{setSearch('');load('');}} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--ink-soft)',fontSize:18,cursor:'pointer',lineHeight:1}}>×</button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{display:'flex',justifyContent:'center',padding:'40px 0',color:'var(--bp-text-3)'}}>Cargando...</div>
      ) : players.length === 0 ? (
        <div style={{textAlign:'center',padding:'32px 0',color:'var(--bp-text-3)'}}>No se encontraron jugadores</div>
      ) : (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:10}}>
            {paginated.map(p => (
              <PlayerMiniCard
                key={p.id}
                player={p}
                stats={stats[p.id]||{total:0}}
                onClick={() => navigate(`/players/${p.id}`)}
              />
            ))}
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:11,color:'var(--bp-text-3)'}}>
              {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,players.length)} de {players.length}
            </span>
            <Paginator page={page} total={players.length} pageSize={PAGE_SIZE} onChange={p=>{setPage(p);window.scrollTo(0,0);}}/>
          </div>
        </>
      )}
    </div>
  );
}
