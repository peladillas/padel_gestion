import { useState, useEffect } from 'react';
import { availabilityService } from '../services/api';

const AV_SLOTS=[];
for(let h=6;h<24;h++){AV_SLOTS.push(String(h).padStart(2,'0')+':00');AV_SLOTS.push(String(h).padStart(2,'0')+':30');}
const AV_GROUPS=[];
for(let i=0;i<AV_SLOTS.length;i+=2)AV_GROUPS.push({label:`${i/2+6}h`,s0:AV_SLOTS[i],s1:AV_SLOTS[i+1]});
const AV_DAYS=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const AV_MONTHS=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const AV_MONTHS_LONG=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const AV_QUICK=[{label:'Mañana',start:'06:00',end:'11:30'},{label:'Tarde',start:'12:00',end:'17:30'},{label:'Noche',start:'18:00',end:'23:30'},{label:'Todo',start:'06:00',end:'23:30'}];
const avIsWknd=d=>d.getDay()===0||d.getDay()===6;
const avDKey=d=>d.toISOString().split('T')[0];
function avGenDates(start,end){const dates=[],s=new Date(start),e=new Date(end);for(let d=new Date(s);d<=e;d.setDate(d.getDate()+1))dates.push(new Date(d));return dates;}

export default function AvailabilityPanel() {
  const [slots,setSlots]=useState({});
  const [open,setOpen]=useState(new Set());
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [loading,setLoading]=useState(true);
  const [currentMonth,setCurrentMonth]=useState(()=>{const t=new Date();return{y:t.getFullYear(),m:t.getMonth()};});

  const today=new Date();today.setHours(0,0,0,0);
  const threeMonths=new Date(today);threeMonths.setMonth(threeMonths.getMonth()+3);
  const dates=avGenDates(today,threeMonths);

  useEffect(()=>{
    async function load(){
      try{
        const av=await availabilityService.get();
        setSlots(av.data?.slots||{});
        const wknds=new Set();
        dates.forEach(dt=>{if(avIsWknd(dt))wknds.add(avDKey(dt));});
        setOpen(wknds);
      }catch(e){console.error(e);}finally{setLoading(false);}
    }
    load();
  },[]);

  const save=async(data)=>{setSaving(true);try{await availabilityService.update(data);setSaved(true);setTimeout(()=>setSaved(false),2000);}catch(e){console.error(e);}finally{setSaving(false);};};
  const toggle=async(dk,slot)=>{const k=dk+'_'+slot,u={...slots};u[k]?delete u[k]:(u[k]=true);setSlots(u);await save(u);};
  const toggleRange=async(dk,start,end)=>{const ia=AV_SLOTS.indexOf(start),ib=AV_SLOTS.indexOf(end);if(ia<0||ib<0)return;const range=AV_SLOTS.slice(ia,ib+1),u={...slots};const allOn=range.every(s=>u[dk+'_'+s]);range.forEach(s=>{allOn?delete u[dk+'_'+s]:(u[dk+'_'+s]=true);});setSlots(u);await save(u);};
  const toggleDay=dk=>setOpen(prev=>{const s=new Set(prev);s.has(dk)?s.delete(dk):s.add(dk);return s;});

  if(loading)return <div style={{textAlign:'center',padding:'40px 0',color:'var(--bp-text-3)'}}>Cargando...</div>;

  const total=Object.keys(slots).length;
  const maxDate=new Date(today);maxDate.setMonth(maxDate.getMonth()+3);
  const minMonth={y:today.getFullYear(),m:today.getMonth()};
  const maxMonth={y:maxDate.getFullYear(),m:maxDate.getMonth()};
  const canPrev=currentMonth.y>minMonth.y||(currentMonth.y===minMonth.y&&currentMonth.m>minMonth.m);
  const canNext=currentMonth.y<maxMonth.y||(currentMonth.y===maxMonth.y&&currentMonth.m<maxMonth.m);
  const prevMonth=()=>{if(!canPrev)return;setCurrentMonth(({y,m})=>m===0?{y:y-1,m:11}:{y,m:m-1});};
  const nextMonth=()=>{if(!canNext)return;setCurrentMonth(({y,m})=>m===11?{y:y+1,m:0}:{y,m:m+1});};
  const visibleDates=dates.filter(d=>d.getFullYear()===currentMonth.y&&d.getMonth()===currentMonth.m);
  const monthSlots=Object.keys(slots).filter(k=>k.startsWith(`${currentMonth.y}-${String(currentMonth.m+1).padStart(2,'0')}`)).length;

  return(
    <div>
      <div style={{background:'var(--court-soft)',border:'1px solid var(--court-soft)',borderRadius:14,padding:'12px 16px',marginBottom:12}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div>
            <div style={{fontWeight:700,fontSize:13,color:'var(--bp-text)'}}>Mi disponibilidad</div>
            <div style={{fontSize:11,color:'var(--bp-text-2)',marginTop:2}}>Slots de 30 min · 06:00–23:30</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {saving&&<span style={{fontSize:11,color:'var(--bp-text-3)'}}>Guardando…</span>}
            {saved&&<span style={{fontSize:11,color:'#10b981',fontWeight:700}}>✓ Guardado</span>}
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:26,fontWeight:900,color:'var(--court-deep)',lineHeight:1}}>{total}</div>
              <div style={{fontSize:10,color:'var(--bp-text-3)'}}>slots</div>
            </div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--court-soft)',borderRadius:10,padding:'8px 12px'}}>
          <button onClick={prevMonth} disabled={!canPrev} style={{width:32,height:32,borderRadius:8,border:'none',background:canPrev?'white':'transparent',cursor:canPrev?'pointer':'default',fontSize:16,color:canPrev?'var(--court)':'var(--line)',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:20,fontWeight:900,color:'var(--ink)',letterSpacing:-0.5}}>{AV_MONTHS_LONG[currentMonth.m]}</div>
            <div style={{fontSize:11,color:'var(--bp-text-2)'}}>{currentMonth.y} · {monthSlots} slots</div>
          </div>
          <button onClick={nextMonth} disabled={!canNext} style={{width:32,height:32,borderRadius:8,border:'none',background:canNext?'white':'transparent',cursor:canNext?'pointer':'default',fontSize:16,color:canNext?'var(--court)':'var(--line)',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>›</button>
        </div>
      </div>
      {visibleDates.length===0&&<div style={{textAlign:'center',padding:'32px 0',color:'var(--bp-text-3)',fontSize:13}}>Sin días disponibles en este mes</div>}
      {visibleDates.map(date=>{
        const dk=avDKey(date),isOpen=open.has(dk),weekend=avIsWknd(date);
        const count=AV_SLOTS.filter(s=>slots[dk+'_'+s]).length;
        return(
          <div key={dk} style={{marginBottom:6,borderRadius:10,overflow:'hidden',border:'1px solid '+(weekend?'var(--ink-mid)':count>0?'var(--court-soft)':'var(--line)'),background:weekend?'var(--ink-2)':'white'}}>
            <button onClick={()=>toggleDay(dk)} style={{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',border:'none',background:'transparent',cursor:'pointer'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:15,fontWeight:800,color:weekend?'var(--bone-2)':'var(--ink)'}}>{AV_DAYS[date.getDay()]}</span>
                <span style={{fontSize:13,fontWeight:600,color:weekend?'var(--ink-soft)':'var(--ink-mid)'}}>{date.getDate()+' '+AV_MONTHS[date.getMonth()]}</span>
                {weekend&&<span style={{fontSize:9,background:'var(--court)',color:'var(--ink)',borderRadius:4,padding:'1px 5px'}}>FDS</span>}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                {count>0&&<span style={{fontSize:10,fontWeight:700,background:weekend?'var(--court)':'var(--court-soft)',color:weekend?'white':'var(--court)',borderRadius:10,padding:'2px 8px'}}>{count}</span>}
                <span style={{fontSize:11,color:weekend?'var(--ink-soft)':'var(--line)'}}>{isOpen?'▲':'▼'}</span>
              </div>
            </button>
            {isOpen&&(
              <div style={{padding:'4px 10px 10px',borderTop:'1px solid '+(weekend?'var(--ink-mid)':'var(--bone-3)')}}>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',margin:'8px 0'}}>
                  {AV_QUICK.map(q=>{
                    const range=AV_SLOTS.slice(AV_SLOTS.indexOf(q.start),AV_SLOTS.indexOf(q.end)+1);
                    const allOn=range.every(s=>slots[dk+'_'+s]);
                    return(<button key={q.label} onClick={()=>toggleRange(dk,q.start,q.end)} style={{fontSize:10,padding:'3px 10px',borderRadius:6,border:'none',cursor:'pointer',fontWeight:600,background:allOn?'var(--court)':weekend?'var(--ink)':'var(--bone-3)',color:allOn?'white':weekend?'var(--ink-soft)':'var(--ink-soft)'}}>{q.label}</button>);
                  })}
                </div>
                <div style={{display:'flex',gap:2,width:'100%'}}>
                  {AV_GROUPS.map(({label,s0,s1})=>(
                    <div key={label} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'stretch',minWidth:0}}>
                      <div style={{fontSize:8,color:'var(--bp-text-3)',marginBottom:3,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label}</div>
                      <div style={{display:'flex',height:28}}>
                        {[s0,s1].map((slot,si)=>(
                          <div key={slot} onClick={()=>toggle(dk,slot)} style={{flex:1,background:slots[dk+'_'+slot]?'var(--court)':weekend?'#1e3a5f':'var(--bone-3)',borderRadius:si===0?'3px 0 0 3px':'0 3px 3px 0',border:'1px solid rgba(0,0,0,0.07)',cursor:'pointer'}}/>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
