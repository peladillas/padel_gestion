import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { authService } from '../services/api';

function Logo() {
  return (
    <div style={{textAlign:'center', marginBottom:28}}>
      <div style={{fontSize:48}}>🏓</div>
      <div style={{fontSize:24, fontWeight:900, color:'var(--amber)'}}>Bonapinta</div>
    </div>
  );
}

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [error,  setError]  = useState('');

  // `next`, when present, is a same-origin app path (e.g.
  // /tournaments/join/:token) set by AuthService::register() so
  // someone who signed up inline to join a tournament lands back on
  // that invite instead of the dashboard, with the invite context
  // otherwise lost. Only ever a path starting with a single "/" —
  // never followed as a full URL — so this can't be turned into an
  // open redirect.
  const next = params.get('next');
  const redirectTo = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  useEffect(() => {
    (async () => {
      if (!token) { setStatus('error'); setError('Token inválido.'); return; }
      try {
        const res = await authService.verifyEmail(token);
        localStorage.setItem('bp_token', res.data.token);
        localStorage.setItem('bp_user', JSON.stringify(res.data.user));
        setStatus('success');
        setTimeout(() => { window.location.href = redirectTo; }, 2500);
      } catch (e) {
        setError(e.response?.data?.error || 'Error al verificar el email');
        setStatus('error');
      }
    })();
  }, [token, redirectTo]);

  const S = {
    wrap: { minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bone)', padding:24 },
    card: { width:'100%', maxWidth:380, background:'white', borderRadius:20, padding:32, textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' },
  };

  if (status === 'verifying') return (
    <div style={S.wrap}>
      <Logo />
      <div style={S.card}>
        <div style={{fontSize:40, marginBottom:12}}>⏳</div>
        <div style={{fontWeight:700, fontSize:16, color:'var(--ink-2)'}}>Verificando tu email...</div>
      </div>
    </div>
  );

  if (status === 'success') return (
    <div style={S.wrap}>
      <Logo />
      <div style={S.card}>
        <div style={{fontSize:52, marginBottom:12}}>🎉</div>
        <div style={{fontWeight:800, fontSize:20, color:'var(--ink)', marginBottom:8}}>¡Email verificado!</div>
        <div style={{fontSize:14, color:'var(--ink-soft)', marginBottom:16}}>Bienvenido a Bonapinta. Entrando...</div>
        <div style={{width:40, height:4, background:'var(--amber)', borderRadius:2, margin:'0 auto', animation:'none'}}/>
      </div>
    </div>
  );

  return (
    <div style={S.wrap}>
      <Logo />
      <div style={S.card}>
        <div style={{fontSize:40, marginBottom:12}}>⛔</div>
        <div style={{fontWeight:800, fontSize:16, color:'var(--ink-2)', marginBottom:8}}>Error de verificación</div>
        <div style={{fontSize:13, color:'var(--ink-soft)', marginBottom:20}}>{error}</div>
        <button onClick={() => navigate('/login')} style={{padding:'11px 24px', borderRadius:10, border:'none', background:'var(--court)', color:'var(--ink)', fontWeight:700, fontSize:13, cursor:'pointer'}}>
          Ir al login
        </button>
      </div>
    </div>
  );
}
