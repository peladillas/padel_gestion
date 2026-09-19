import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/api';

const S = {
  inp: { width:'100%', background:'var(--paper)', border:'1px solid var(--line)', borderRadius:12, padding:'12px 14px', color:'var(--ink)', fontSize:14, outline:'none', boxSizing:'border-box' },
  btn: { width:'100%', background:'var(--court)', border:'none', borderRadius:12, padding:'14px', color:'var(--ink)', fontWeight:700, fontSize:14, cursor:'pointer' },
  err: { background:'rgba(239,68,68,0.15)', color:'var(--crimson)', fontSize:13, borderRadius:10, padding:'10px 14px' },
};

export default function Login() {
  const inactivity = new URLSearchParams(window.location.search).get('reason') === 'inactivity';
  const [step,     setStep]     = useState('login'); // login | 2fa
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [code,     setCode]     = useState('');
  const [userId,   setUserId]   = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await authService.login({ email, password });
      if (res.data.requires2FA) {
        setUserId(res.data.userId);
        setStep('2fa');
      } else {
        localStorage.setItem('bp_token', res.data.token);
        localStorage.setItem('bp_user', JSON.stringify(res.data.user));
        window.location.href = '/';
      }
    } catch(err) {
      const data = err.response?.data;
      if (data?.notActivated) {
        setError('⏳ Tu cuenta aún no está activada. Revisa tu email para el enlace de activación.');
      } else {
        setError(data?.error || 'Error al iniciar sesión');
      }
    }
    finally { setLoading(false); }
  };

  const handle2FA = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await authService.verify2FA({ userId, code });
      localStorage.setItem('bp_token', res.data.token);
      localStorage.setItem('bp_user', JSON.stringify(res.data.user));
      window.location.href = '/';
    } catch(err) { setError(err.response?.data?.error || 'Codigo incorrecto'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{minHeight:'100vh',background:'var(--bone)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'0 16px'}}>
      <div style={{width:'100%',maxWidth:360}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:56,marginBottom:8}}>🏓</div>
          <h1 style={{color:'var(--ink)',fontSize:28,fontWeight:800,margin:'0 0 4px',letterSpacing:'-0.5px'}}>Bonapinta</h1>
          <p style={{color:'var(--ink-mid)',fontSize:14,margin:0}}>Plataforma de ligas deportivas</p>
        </div>

        {step === 'login' && (
          <form onSubmit={handleLogin} style={{background:'var(--paper)',borderRadius:20,padding:24,border:'1px solid var(--line)',boxShadow:'0 4px 24px rgba(0,0,0,0.07)',display:'flex',flexDirection:'column',gap:16}}>
            <div>
              <label style={{display:'block',color:'var(--ink-soft)',fontSize:12,marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Email o usuario</label>
              <input type="text" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com o @usuario" required autoCapitalize="none" autoCorrect="off" style={S.inp}/>
            </div>
            <div>
              <label style={{display:'block',color:'var(--ink-soft)',fontSize:12,marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Contraseña</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required style={S.inp}/>
            </div>
            {error && <div style={S.err}>{error}</div>}
            <button type="submit" disabled={loading} style={{...S.btn,opacity:loading?0.6:1}}>
              {loading ? 'Entrando…' : 'Entrar →'}
            </button>
            <div style={{textAlign:'center'}}>
              <Link to="/forgot-password" style={{color:'var(--court-deep)',fontSize:13,textDecoration:'none'}}>
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>
        )}

        {step === '2fa' && (
          <form onSubmit={handle2FA} style={{background:'var(--paper)',borderRadius:20,padding:24,border:'1px solid var(--line)',boxShadow:'0 4px 24px rgba(0,0,0,0.07)',display:'flex',flexDirection:'column',gap:16}}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:32,marginBottom:8}}>📩</div>
              <div style={{color:'var(--ink)',fontWeight:700,fontSize:16,marginBottom:4}}>Verificacion en dos pasos</div>
              <div style={{color:'var(--ink-soft)',fontSize:13}}>Hemos enviado un codigo a {email}</div>
            </div>
            <div>
              <label style={{display:'block',color:'var(--ink-soft)',fontSize:12,marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Codigo de verificacion</label>
              <input type="text" value={code} onChange={e=>setCode(e.target.value)} placeholder="123456" maxLength={6} required
                style={{...S.inp,textAlign:'center',fontSize:24,fontWeight:700,letterSpacing:'8px'}}/>
            </div>
            {error && <div style={S.err}>{error}</div>}
            <button type="submit" disabled={loading} style={{...S.btn,opacity:loading?0.6:1}}>
              {loading ? 'Verificando…' : 'Verificar'}
            </button>
            <button type="button" onClick={()=>setStep('login')} style={{background:'none',border:'none',color:'var(--ink-soft)',fontSize:13,cursor:'pointer'}}>
              ← Volver al login
            </button>
          </form>
        )}

        <p style={{textAlign:'center',color:'var(--ink-mid)',fontSize:12,marginTop:24}}>Bonapinta © 2026</p>
      </div>
    </div>
  );
}
