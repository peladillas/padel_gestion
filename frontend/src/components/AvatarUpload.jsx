import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import api from '../services/api';

function getCroppedImg(imageSrc, pixelCrop) {
  return new Promise((resolve) => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, 200, 200);
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    };
  });
}

export default function AvatarUpload({ currentAvatar, playerName, onUpdate }) {
  const [step,       setStep]       = useState('idle'); // idle | crop | uploading
  const [imageSrc,   setImageSrc]   = useState(null);
  const [crop,       setCrop]       = useState({ x:0, y:0 });
  const [zoom,       setZoom]       = useState(1);
  const [croppedArea,setCroppedArea]= useState(null);
  const [error,      setError]      = useState('');

  const initials = playerName
    ? playerName.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()
    : '?';

  const onFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setImageSrc(reader.result); setStep('crop'); };
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((_, croppedAreaPixels) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  const handleUpload = async () => {
    if (!croppedArea) return;
    setStep('uploading');
    setError('');
    try {
      const blob = await getCroppedImg(imageSrc, croppedArea);
      const formData = new FormData();
      formData.append('avatar', blob, 'avatar.jpg');
      const res = await api.post('/upload/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onUpdate(res.data.avatarUrl);
      setStep('idle');
      setImageSrc(null);
    } catch(e) {
      setError('Error al subir la imagen');
      setStep('crop');
    }
  };

  const handleRemove = async () => {
    try {
      await api.delete('/upload/avatar');
      onUpdate(null);
    } catch(e) { setError('Error al eliminar'); }
  };

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>

      {/* Avatar preview */}
      <div style={{position:'relative'}}>
        <div style={{
          width:100,height:100,borderRadius:'50%',overflow:'hidden',
          background:'var(--court)',display:'flex',alignItems:'center',
          justifyContent:'center',border:'3px solid #e2e8f0',
          flexShrink:0
        }}>
          {currentAvatar ? (
            <img src={currentAvatar} alt="Avatar" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
          ) : (
            <span style={{fontSize:28,fontWeight:900,color:'var(--clay)'}}>{initials}</span>
          )}
        </div>
        {/* Edit button */}
        <label style={{
          position:'absolute',bottom:0,right:0,
          width:28,height:28,borderRadius:'50%',
          background:'var(--court)',border:'2px solid white',
          display:'flex',alignItems:'center',justifyContent:'center',
          cursor:'pointer',fontSize:13
        }}>
          ✏️
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} style={{display:'none'}}/>
        </label>
      </div>

      {/* Crop modal */}
      {step === 'crop' && (
        <div style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',
          zIndex:1000,display:'flex',flexDirection:'column',
          alignItems:'center',justifyContent:'center',gap:16,padding:20
        }}>
          <div style={{color:'var(--bone)',fontWeight:700,fontSize:16}}>Ajusta tu foto</div>

          <div style={{position:'relative',width:280,height:280,borderRadius:12,overflow:'hidden'}}>
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>

          <div style={{display:'flex',alignItems:'center',gap:10,width:280}}>
            <span style={{fontSize:11,color:'#94a3b8'}}>Zoom</span>
            <input type="range" min={1} max={3} step={0.01} value={zoom}
              onChange={e=>setZoom(Number(e.target.value))}
              style={{flex:1}}/>
          </div>

          <div style={{display:'flex',gap:10,width:280}}>
            <button onClick={()=>{setStep('idle');setImageSrc(null);}} style={{
              flex:1,padding:'11px',borderRadius:10,border:'1px solid rgba(255,255,255,0.2)',
              background:'transparent',color:'var(--bone)',fontWeight:600,fontSize:13,cursor:'pointer'
            }}>Cancelar</button>
            <button onClick={handleUpload} style={{
              flex:2,padding:'11px',borderRadius:10,border:'none',
              background:'var(--court)',color:'var(--ink)',fontWeight:700,fontSize:13,cursor:'pointer'
            }}>Guardar foto</button>
          </div>
        </div>
      )}

      {step === 'uploading' && (
        <div style={{fontSize:13,color:'#64748b'}}>Subiendo foto…</div>
      )}

      {error && <div style={{fontSize:12,color:'#dc2626'}}>{error}</div>}

      {currentAvatar && step === 'idle' && (
        <button onClick={handleRemove} style={{
          fontSize:11,color:'#dc2626',background:'none',border:'none',cursor:'pointer',padding:0
        }}>Eliminar foto</button>
      )}
    </div>
  );
}
