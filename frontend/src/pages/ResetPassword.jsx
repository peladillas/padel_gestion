import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authService } from '../services/api';

export default function ResetPassword() {
  const [params]   = useSearchParams();
  const token      = params.get('token');
  const navigate   = useNavigate();
  const [pwd,  setPwd]  = useState('');
  const [pwd2, setPwd2] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (pwd !== pwd2) { setError('Las contraseñas no coinciden'); return; }
    if (pwd.length < 6) { setError('Minimo 6 caracteres'); return; }
    setLoading(true);
    try {
      await authService.resetPassword({ token, newPassword: pwd });
      setDone(true);
      setTimeout(()=>navigate('/login'), 3000);
    } catch(err) { setError(err.response?.data?.error || 'Error'); }
    finally { setLoading(false); }
  };

  if (!token) return (
    <div style={{minHeight:'100vh',background:'var(--bone)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{color:'var(--crimson)',textAlign:'center'}}>
        <div style={{fontSize:48}}>❌</div>
        <div style={{marginTop:12}}>Token invalido</div>
        <Link to="/login" style={{color:'var(--court-deep)',fontSize:13,display:'block',marginTop:12}}>Volver al login</Link>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:'100vh',background:'var(--bone)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'0 16px'}}>
      <div style={{width:'100%',maxWidth:360}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:56}}>🔑</div>
          <h1 style={{color:'var(--ink)',fontSize:24,fontWeight:800,margin:'10px 0 4px'}}>Nueva contraseña</h1>
        </div>

        {done ? (
          <div style={{background:'var(--ink-2)',borderRadius:20,padding:24,textAlign:'center'}}>
            <div style={{fontSize:48,marginBottom:12}}>✅</div>
            <div style={{color:'var(--ink)',fontWeight:700,marginBottom:8}}>Contraseña actualizada</div>
            <div style={{color:'var(--ink-soft)',fontSize:13}}>Redirigiendo al login…</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{background:'var(--ink-2)',borderRadius:20,padding:24,display:'flex',flexDirection:'column',gap:16}}>
            <div>
              <label style={{display:'block',color:'var(--ink-soft)',fontSize:12,marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Nueva contraseña</label>
              <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="••••••••" required
                style={{width:'100%',background:'var(--paper)',border:'1px solid var(--line)',borderRadius:12,padding:'12px 14px',color:'var(--ink)',fontSize:14,outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div>
              <label style={{display:'block',color:'var(--ink-soft)',fontSize:12,marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Confirmar contraseña</label>
              <input type="password" value={pwd2} onChange={e=>setPwd2(e.target.value)} placeholder="••••••••" required
                style={{width:'100%',background:'var(--paper)',border:'1px solid var(--line)',borderRadius:12,padding:'12px 14px',color:'var(--ink)',fontSize:14,outline:'none',boxSizing:'border-box'}}/>
            </div>
            {error && <div style={{background:'rgba(239,68,68,0.15)',color:'var(--crimson)',fontSize:13,borderRadius:10,padding:'10px 14px'}}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{background:'var(--court)',border:'none',borderRadius:12,padding:'14px',color:'var(--ink)',fontWeight:700,fontSize:14,cursor:'pointer',opacity:loading?0.6:1}}>
              {loading ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
