import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/api';

export default function ActivateAccount() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState(false);
  const [showPwd,   setShowPwd]   = useState(false);

  useEffect(() => {
    if (!token) setError('Enlace de activación inválido. Contacta al administrador.');
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return; }
    if (password.length < 6)  { setError('Mínimo 6 caracteres'); return; }
    setLoading(true); setError('');
    try {
      const res = await authService.activate({ token, password });
      // Auto-login after activation
      localStorage.setItem('bp_token', res.data.token);
      localStorage.setItem('bp_user', JSON.stringify(res.data.user));
      setDone(true);
      setTimeout(() => { window.location.href = '/'; }, 2000);
    } catch(err) {
      const msg = err.response?.data?.error || 'Error al activar la cuenta';
      setError(msg);
      if (err.response?.data?.expired) {
        setError(msg + ' Contacta al administrador para que te reenvíe la invitación.');
      }
    } finally { setLoading(false); }
  };

  const inp = { width:'100%', border:'1px solid var(--line)', borderRadius:10, padding:'11px 12px', fontSize:14, outline:'none', boxSizing:'border-box' };

  if (done) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bone)',padding:24}}>
      <div style={{textAlign:'center',color:'var(--ink)'}}>
        <div style={{fontSize:56,marginBottom:16}}>🎉</div>
        <div style={{fontSize:22,fontWeight:800,color:'var(--amber)',marginBottom:8}}>¡Cuenta activada!</div>
        <div style={{fontSize:14,color:'var(--ink-soft)'}}>Entrando a Bonapinta...</div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'var(--bone)',padding:24}}>
      <div style={{width:'100%',maxWidth:400}}>
        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:48}}>🏓</div>
          <div style={{fontSize:24,fontWeight:900,color:'var(--amber)',letterSpacing:'-0.02em'}}>Bonapinta</div>
          <div style={{fontSize:13,color:'var(--ink-mid)',marginTop:4}}>Liga de pádel</div>
        </div>

        <div style={{background:'white',borderRadius:20,padding:28,boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
          <div style={{textAlign:'center',marginBottom:24}}>
            <div style={{fontSize:32,marginBottom:8}}>🎾</div>
            <div style={{fontSize:18,fontWeight:800,color:'var(--ink)'}}>Activa tu cuenta</div>
            <div style={{fontSize:13,color:'var(--ink-soft)',marginTop:6}}>Elige una contraseña para empezar a jugar</div>
          </div>

          {error && (
            <div style={{background:'var(--crimson-soft)',border:'1px solid var(--crimson-soft)',color:'var(--crimson)',borderRadius:10,padding:'10px 14px',fontSize:13,marginBottom:16,fontWeight:500}}>
              {error}
            </div>
          )}

          {!token ? null : (
            <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
              <div style={{position:'relative'}}>
                <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:5}}>Nueva contraseña</label>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  style={inp}
                  autoFocus
                />
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--ink-soft)',display:'block',marginBottom:5}}>Confirmar contraseña</label>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  required
                  style={inp}
                />
              </div>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'var(--ink-soft)',cursor:'pointer',userSelect:'none'}}>
                <input type="checkbox" checked={showPwd} onChange={e => setShowPwd(e.target.checked)} style={{accentColor:'var(--court)'}} />
                Mostrar contraseña
              </label>
              <button
                type="submit"
                disabled={loading || !password || !confirm}
                style={{background:'var(--court)',border:'none',borderRadius:12,padding:'13px',color:'var(--ink)',fontWeight:800,fontSize:15,cursor:'pointer',opacity:loading||!password||!confirm?0.6:1,marginTop:4}}
              >
                {loading ? 'Activando...' : 'Activar y entrar →'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
