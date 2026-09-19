import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { authService } from '../services/api';

export default function JoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get('code');

  const [step,     setStep]     = useState('validating'); // validating | form | sent | error
  const [codeInfo, setCodeInfo] = useState(null);
  const [form,     setForm]     = useState({ name:'', email:'', password:'', confirm:'' });
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [fieldErr, setFieldErr] = useState({});

  useEffect(() => {
    if (!code) { setStep('error'); setError('Enlace de invitación inválido. Pide uno nuevo al organizador.'); return; }
    authService.validateInviteCode(code)
      .then(r => { setCodeInfo(r.data); setStep('form'); })
      .catch(e => {
        const d = e.response?.data;
        setError(d?.error || 'Enlace inválido');
        setStep('error');
      });
  }, [code]);

  const validate = () => {
    const errs = {};
    if (!form.name.trim())          errs.name     = 'Nombre obligatorio';
    if (!form.email.trim())         errs.email    = 'Email obligatorio';
    if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Email inválido';
    if (form.password.length < 6)   errs.password = 'Mínimo 6 caracteres';
    if (form.password !== form.confirm) errs.confirm = 'Las contraseñas no coinciden';
    setFieldErr(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true); setError('');
    try {
      await authService.registerWithInvite({ inviteCode: code, name: form.name.trim(), email: form.email.trim(), password: form.password });
      setStep('sent');
    } catch(err) {
      const d = err.response?.data;
      if (d?.used || d?.expired || d?.invalid) { setStep('error'); setError(d.error); }
      else setError(d?.error || 'Error al crear la cuenta');
    } finally { setLoading(false); }
  };

  const S = {
    wrap: { minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bone)', padding:24 },
    card: { width:'100%', maxWidth:420, background:'white', borderRadius:20, padding:28, boxShadow:'0 20px 60px rgba(0,0,0,0.4)' },
    inp:  { width:'100%', border:'1px solid var(--line)', borderRadius:10, padding:'11px 12px', fontSize:14, outline:'none', boxSizing:'border-box' },
    err:  { fontSize:11, color:'var(--crimson)', marginTop:4 },
    btn:  { width:'100%', padding:'13px', borderRadius:12, border:'none', background:'var(--court)', color:'var(--ink)', fontWeight:800, fontSize:15, cursor:'pointer' },
  };

  const Logo = () => (
    <div style={{textAlign:'center', marginBottom:28}}>
      <div style={{fontSize:48}}>🏓</div>
      <div style={{fontSize:24, fontWeight:900, color:'var(--amber)', letterSpacing:'-0.02em'}}>Bonapinta</div>
      <div style={{fontSize:13, color:'var(--ink-mid)', marginTop:4}}>Liga de pádel</div>
    </div>
  );

  if (step === 'validating') return (
    <div style={S.wrap}>
      <Logo />
      <div style={{color:'var(--ink-soft)', fontSize:14}}>Validando enlace...</div>
    </div>
  );

  if (step === 'error') return (
    <div style={S.wrap}>
      <Logo />
      <div style={S.card}>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:40, marginBottom:12}}>⛔</div>
          <div style={{fontWeight:800, fontSize:16, color:'var(--ink-2)', marginBottom:8}}>Enlace no válido</div>
          <div style={{fontSize:13, color:'var(--ink-soft)'}}>{error}</div>
        </div>
      </div>
    </div>
  );

  if (step === 'sent') return (
    <div style={S.wrap}>
      <Logo />
      <div style={S.card}>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:48, marginBottom:12}}>📬</div>
          <div style={{fontWeight:800, fontSize:18, color:'var(--ink)', marginBottom:10}}>¡Revisa tu email!</div>
          <div style={{fontSize:14, color:'var(--ink-soft)', marginBottom:16}}>
            Te hemos enviado un enlace a <strong>{form.email}</strong>.<br/>
            Haz clic en él para verificar tu cuenta y empezar a jugar.
          </div>
          <div style={{background:'var(--amber-soft)', border:'1px solid var(--amber-soft)', borderRadius:10, padding:'10px 14px', fontSize:12, color:'var(--amber)', marginBottom:16}}>
            El enlace caduca en 24 horas. Revisa también la carpeta de spam.
          </div>
          <button onClick={() => navigate('/login')} style={{...S.btn, fontSize:13}}>
            Ir al login →
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={S.wrap}>
      <Logo />
      <div style={S.card}>
        <div style={{textAlign:'center', marginBottom:20}}>
          <div style={{fontSize:28, marginBottom:6}}>🎾</div>
          <div style={{fontWeight:800, fontSize:18, color:'var(--ink)'}}>Crea tu cuenta</div>
          {codeInfo?.label && <div style={{fontSize:12, color:'var(--ink-soft)', marginTop:4}}>{codeInfo.label}</div>}
          <div style={{fontSize:12, color:'var(--ink-soft)', marginTop:4}}>Invitación válida · Únete a la liga</div>
        </div>

        {error && <div style={{background:'var(--crimson-soft)', border:'1px solid var(--crimson-soft)', color:'var(--crimson)', borderRadius:10, padding:'10px 12px', fontSize:13, marginBottom:14}}>{error}</div>}

        <form onSubmit={handleSubmit} style={{display:'flex', flexDirection:'column', gap:12}}>
          <div>
            <label style={{fontSize:11, color:'var(--ink-soft)', display:'block', marginBottom:4}}>Nombre completo *</label>
            <input
              value={form.name}
              onChange={e => setForm(f=>({...f, name:e.target.value}))}
              placeholder="Ej: Marc Gerenich"
              style={{...S.inp, borderColor: fieldErr.name?'var(--crimson-soft)':'var(--line)'}}
              autoFocus
            />
            {fieldErr.name && <div style={S.err}>{fieldErr.name}</div>}
          </div>

          <div>
            <label style={{fontSize:11, color:'var(--ink-soft)', display:'block', marginBottom:4}}>Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f=>({...f, email:e.target.value}))}
              placeholder="tu@email.com"
              style={{...S.inp, borderColor: fieldErr.email?'var(--crimson-soft)':'var(--line)'}}
            />
            {fieldErr.email && <div style={S.err}>{fieldErr.email}</div>}
          </div>

          <div>
            <label style={{fontSize:11, color:'var(--ink-soft)', display:'block', marginBottom:4}}>Contraseña *</label>
            <input
              type={showPwd ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm(f=>({...f, password:e.target.value}))}
              placeholder="Mínimo 6 caracteres"
              style={{...S.inp, borderColor: fieldErr.password?'var(--crimson-soft)':'var(--line)'}}
            />
            {fieldErr.password && <div style={S.err}>{fieldErr.password}</div>}
          </div>

          <div>
            <label style={{fontSize:11, color:'var(--ink-soft)', display:'block', marginBottom:4}}>Confirmar contraseña *</label>
            <input
              type={showPwd ? 'text' : 'password'}
              value={form.confirm}
              onChange={e => setForm(f=>({...f, confirm:e.target.value}))}
              placeholder="Repite la contraseña"
              style={{...S.inp, borderColor: fieldErr.confirm?'var(--crimson-soft)':'var(--line)'}}
            />
            {fieldErr.confirm && <div style={S.err}>{fieldErr.confirm}</div>}
          </div>

          <label style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--ink-soft)', cursor:'pointer', userSelect:'none'}}>
            <input type="checkbox" checked={showPwd} onChange={e=>setShowPwd(e.target.checked)} style={{accentColor:'var(--court)'}}/>
            Mostrar contraseña
          </label>

          <button type="submit" disabled={loading} style={{...S.btn, opacity:loading?0.6:1, marginTop:4}}>
            {loading ? 'Creando cuenta...' : 'Crear cuenta →'}
          </button>

          <div style={{textAlign:'center', fontSize:12, color:'var(--ink-soft)'}}>
            ¿Ya tienes cuenta?{' '}
            <span onClick={() => navigate('/login')} style={{color:'var(--court-deep)', cursor:'pointer', fontWeight:600}}>Iniciar sesión</span>
          </div>
        </form>
      </div>
    </div>
  );
}
