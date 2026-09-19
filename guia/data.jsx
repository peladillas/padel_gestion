// Fictional players — 4-player padel teams. Real-feeling Spanish names.
const PLAYERS = {
  me:   { id:'me',    first:'Tú',       last:'',           initials:'YO', level:7, ovr:82 },
  p_ab: { id:'p_ab',  first:'Àlex',     last:'Bergada',    initials:'AB', level:6, ovr:78 },
  p_nc: { id:'p_nc',  first:'Nil',      last:'Canudas',    initials:'NC', level:7, ovr:81 },
  p_js: { id:'p_js',  first:'Jordi',    last:'Serra',      initials:'JS', level:6, ovr:76 },
  p_mr: { id:'p_mr',  first:'Martí',    last:'Roca',       initials:'MR', level:8, ovr:86 },
  p_gv: { id:'p_gv',  first:'Guillem',  last:'Vilanova',   initials:'GV', level:5, ovr:71 },
  p_bm: { id:'p_bm',  first:'Bernat',   last:'Miró',       initials:'BM', level:7, ovr:79 },
  p_ta: { id:'p_ta',  first:'Tomàs',    last:'Aragonès',   initials:'TA', level:6, ovr:75 },
  p_iq: { id:'p_iq',  first:'Ignasi',   last:'Quintana',   initials:'IQ', level:7, ovr:80 },
  p_pl: { id:'p_pl',  first:'Pau',      last:'Llorens',    initials:'PL', level:8, ovr:84 },
  p_dc: { id:'p_dc',  first:'Dídac',    last:'Camprubí',   initials:'DC', level:6, ovr:74 },
};

const TOURNAMENTS = {
  t_spring: { id:'t_spring', name:'Copa Primavera',   short:'PRIMAVERA · 2026', color:'var(--court)' },
  t_clubs:  { id:'t_clubs',  name:'Liga de Clubes',   short:'LIGA CLUBES · J7', color:'var(--clay)' },
  t_amer:   { id:'t_amer',   name:'Americana Perfecta', short:'AMERICANA · NOCHE', color:'#7a8178' },
  t_mex:    { id:'t_mex',    name:'Mexicano Mensual', short:'MEXICANO · ABRIL', color:'#7a6020' },
};

// Status flavors:
//  'pending'   — scheduled, nothing proposed yet
//  'i-proposed'— I proposed a result, waiting for their confirm
//  'they-propose' — they proposed, I must confirm
//  'completed' — agreed
//  'rejected'  — rejected result, can re-propose
const now = new Date();
const d = (days, h=18, m=0) => {
  const x = new Date(now); x.setDate(x.getDate()+days); x.setHours(h,m,0,0); return x.toISOString();
};

const MATCHES = [
  {
    id:'m1',
    status:'they-propose',
    tournament:TOURNAMENTS.t_spring,
    round:'Cuartos',
    scheduledAt: d(-2, 20, 30),
    myTeam:[PLAYERS.me, PLAYERS.p_ab],
    oppTeam:[PLAYERS.p_mr, PLAYERS.p_pl],
    iAmTeam1:true,
    sets:[{me:6,rival:4},{me:3,rival:6},{me:7,rival:5}],
    proposedBy:'them',
    expiresInH:18,
    venue:'Club Pinta · Pista 3',
  },
  {
    id:'m2',
    status:'i-proposed',
    tournament:TOURNAMENTS.t_clubs,
    round:'Jornada 7',
    scheduledAt: d(-1, 19, 0),
    myTeam:[PLAYERS.me, PLAYERS.p_nc],
    oppTeam:[PLAYERS.p_iq, PLAYERS.p_bm],
    iAmTeam1:true,
    sets:[{me:6,rival:2},{me:6,rival:3}],
    proposedBy:'me',
    expiresInH:14,
    venue:'Pàdel Indoor Sarrià',
  },
  {
    id:'m3',
    status:'pending',
    tournament:TOURNAMENTS.t_spring,
    round:'Octavos',
    scheduledAt: d(3, 21, 0),
    myTeam:[PLAYERS.me, PLAYERS.p_ab],
    oppTeam:[PLAYERS.p_gv, PLAYERS.p_ta],
    iAmTeam1:true,
    venue:'Club Pinta · Pista 2',
    commonAvail:[
      { day:'Jue', date:22, month:'abr', slots:['18:00','18:30','19:00','19:30','20:00'] },
      { day:'Sáb', date:24, month:'abr', slots:['10:00','10:30','11:00','17:00','17:30','18:00'] },
      { day:'Dom', date:25, month:'abr', slots:['10:00','10:30','11:00','11:30'] },
    ],
  },
  {
    id:'m4',
    status:'pending',
    tournament:TOURNAMENTS.t_amer,
    round:'Ronda 3',
    scheduledAt: d(1, 21, 30),
    myTeam:[PLAYERS.me, PLAYERS.p_js],
    oppTeam:[PLAYERS.p_dc, PLAYERS.p_pl],
    iAmTeam1:false,
    venue:'Club Pinta · Pista 1',
    commonAvail:[
      { day:'Mar', date:20, month:'abr', slots:['21:00','21:30','22:00'] },
      { day:'Mié', date:21, month:'abr', slots:['20:30','21:00','21:30'] },
    ],
  },
  {
    id:'m5',
    status:'completed',
    tournament:TOURNAMENTS.t_mex,
    round:'Ronda 5',
    scheduledAt: d(-6, 20, 0),
    myTeam:[PLAYERS.me, PLAYERS.p_bm],
    oppTeam:[PLAYERS.p_mr, PLAYERS.p_nc],
    iAmTeam1:true,
    sets:[{me:6,rival:3},{me:6,rival:4}],
    outcome:'win',
    venue:'Club Pinta · Pista 3',
  },
  {
    id:'m6',
    status:'completed',
    tournament:TOURNAMENTS.t_clubs,
    round:'Jornada 6',
    scheduledAt: d(-10, 19, 30),
    myTeam:[PLAYERS.me, PLAYERS.p_nc],
    oppTeam:[PLAYERS.p_pl, PLAYERS.p_iq],
    iAmTeam1:true,
    sets:[{me:4,rival:6},{me:6,rival:7}],
    outcome:'loss',
    venue:'Pàdel Indoor Sarrià',
  },
  {
    id:'m7',
    status:'rejected',
    tournament:TOURNAMENTS.t_spring,
    round:'Grupos',
    scheduledAt: d(-4, 20, 0),
    myTeam:[PLAYERS.me, PLAYERS.p_ab],
    oppTeam:[PLAYERS.p_ta, PLAYERS.p_dc],
    iAmTeam1:true,
    sets:[],
    venue:'Club Pinta · Pista 2',
    commonAvail:[
      { day:'Vie', date:23, month:'abr', slots:['19:00','19:30','20:00'] },
    ],
  },
];

const DAYS_ES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function fmtDate(iso) {
  const x = new Date(iso);
  return {
    day: DAYS_ES[x.getDay()],
    n: x.getDate(),
    mo: MONTHS_ES[x.getMonth()],
    time: `${String(x.getHours()).padStart(2,'0')}:${String(x.getMinutes()).padStart(2,'0')}`,
    year: x.getFullYear(),
  };
}
function calcWins(sets) {
  if (!sets || !sets.length) return [0,0];
  let me=0, rival=0;
  sets.forEach(s => { if (s.me > s.rival) me++; else if (s.rival > s.me) rival++; });
  return [me, rival];
}

Object.assign(window, { PLAYERS, TOURNAMENTS, MATCHES, DAYS_ES, MONTHS_ES, fmtDate, calcWins });
