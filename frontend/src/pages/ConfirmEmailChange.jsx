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

export default function ConfirmEmailChange() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [status, setStatus] = useState('confirming'); // confirming | success | error
  const [error,  setError]  = useState('');
  const [email,  setEmail]  = useState('');

  useEffect(() => {
    (async () => {
      if (!token) { setStatus('error'); setError('Token inválido.'); return; }
      try {
        const res = await authService.confirmEmailChange(token);
        setEmail(res.data.email);
        // Opportunistic: if this browser happens to be the same one
        // that's logged in, patch the cached user so Profile.jsx shows
        // the new email without forcing a re-login. The link is often
        // opened from a different device/browser (the new inbox), so
        // there may be no session here at all — that's fine, nothing
        // to patch in that case.
        try {
          const stored = JSON.parse(localStorage.getItem('bp_user') || 'null');
          if (stored) {
            stored.email = res.data.email;
            localStorage.setItem('bp_user', JSON.stringify(stored));
          }
        } catch { /* no local session on this device — nothing to patch */ }
        setStatus('success');
      } catch (e) {
        setError(e.response?.data?.error || 'Error al confirmar el cambio de email');
        setStatus('error');
      }
    })();
  }, [token]);

  const S = {
    wrap: { minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bone)', padding:24 },
    card: { width:'100%', maxWidth:380, background:'white', borderRadius:20, padding:32, textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' },
  };

  if (status === 'confirming') return (
    <div style={S.wrap}>
      <Logo />
      <div style={S.card}>
        <div style={{fontSize:40, marginBottom:12}}>⏳</div>
        <div style={{fontWeight:700, fontSize:16, color:'var(--ink-2)'}}>Confirmando tu nuevo email...</div>
      </div>
    </div>
  );

  if (status === 'success') return (
    <div style={S.wrap}>
      <Logo />
      <div style={S.card}>
        <div style={{fontSize:52, marginBottom:12}}>🎉</div>
        <div style={{fontWeight:800, fontSize:20, color:'var(--ink)', marginBottom:8}}>¡Email actualizado!</div>
        <div style={{fontSize:14, color:'var(--ink-soft)', marginBottom:20}}>A partir de ahora inicia sesión con <strong>{email}</strong>.</div>
        <button onClick={() => navigate('/')} style={{padding:'11px 24px', borderRadius:10, border:'none', background:'var(--court)', color:'var(--ink)', fontWeight:700, fontSize:13, cursor:'pointer'}}>
          Continuar
        </button>
      </div>
    </div>
  );

  return (
    <div style={S.wrap}>
      <Logo />
      <div style={S.card}>
        <div style={{fontSize:40, marginBottom:12}}>⛔</div>
        <div style={{fontWeight:800, fontSize:16, color:'var(--ink-2)', marginBottom:8}}>Error de confirmación</div>
        <div style={{fontSize:13, color:'var(--ink-soft)', marginBottom:20}}>{error}</div>
        <button onClick={() => navigate('/login')} style={{padding:'11px 24px', borderRadius:10, border:'none', background:'var(--court)', color:'var(--ink)', fontWeight:700, fontSize:13, cursor:'pointer'}}>
          Ir al login
        </button>
      </div>
    </div>
  );
}
