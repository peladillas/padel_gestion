import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../services/api';

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await authService.forgotPassword(email);
      setSent(true);
    } catch(err) { setError(err.response?.data?.error || 'Error'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{minHeight:'100vh',background:'var(--bone)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'0 16px'}}>
      <div style={{width:'100%',maxWidth:360}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:56}}>🏓</div>
          <h1 style={{color:'var(--ink)',fontSize:24,fontWeight:800,margin:'10px 0 4px'}}>Recuperar contraseña</h1>
          <p style={{color:'var(--ink-mid)',fontSize:14,margin:0}}>Te enviaremos un enlace por email</p>
        </div>

        {sent ? (
          <div style={{background:'var(--ink-2)',borderRadius:20,padding:24,textAlign:'center'}}>
            <div style={{fontSize:48,marginBottom:12}}>📬</div>
            <div style={{color:'var(--ink)',fontWeight:700,fontSize:16,marginBottom:8}}>Email enviado</div>
            <div style={{color:'var(--ink-soft)',fontSize:13,marginBottom:20}}>
              Si el email existe recibirás un enlace para cambiar tu contraseña en los próximos minutos.
            </div>
            <Link to="/login" style={{color:'var(--court-deep)',fontSize:13}}>← Volver al login</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{background:'var(--ink-2)',borderRadius:20,padding:24,display:'flex',flexDirection:'column',gap:16}}>
            <div>
              <label style={{display:'block',color:'var(--ink-soft)',fontSize:12,marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Tu email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" required
                style={{width:'100%',background:'var(--paper)',border:'1px solid var(--line)',borderRadius:12,padding:'12px 14px',color:'var(--ink)',fontSize:14,outline:'none',boxSizing:'border-box'}}/>
            </div>
            {error && <div style={{background:'rgba(239,68,68,0.15)',color:'var(--crimson)',fontSize:13,borderRadius:10,padding:'10px 14px'}}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{background:'var(--court)',border:'none',borderRadius:12,padding:'14px',color:'var(--ink)',fontWeight:700,fontSize:14,cursor:'pointer',opacity:loading?0.6:1}}>
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </button>
            <div style={{textAlign:'center'}}>
              <Link to="/login" style={{color:'var(--ink-soft)',fontSize:13,textDecoration:'none'}}>← Volver al login</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
