'use strict';
// Polar Station 2027 — dependency-free real-time multiplayer server (SSE + HTTP).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = Number(process.env.PORT || 3000);
const STATIC = path.join(__dirname, 'public');
const MAX_ROOMS = 80;
const MAX_BYTES = 16_000;
const rooms = new Map();
const ROLE_IDS = ['radio','navigator','engineer','trainer','detective','artist','pilot','guardian','messenger','energy'];
const ROLE_INFO = [
  {id:'radio',name:'Радиотехник',icon:'📡',job:'Ловит потерянные сигналы'},
  {id:'navigator',name:'Навигатор',icon:'🧭',job:'Находит путь сквозь метель'},
  {id:'engineer',name:'Инженер',icon:'🛠️',job:'Чинит механизмы станции'},
  {id:'trainer',name:'Тренер ИИ',icon:'🧠',job:'Учит роботов новым правилам'},
  {id:'detective',name:'Детектив',icon:'🔎',job:'Находит ошибки в данных'},
  {id:'artist',name:'Художник',icon:'🎨',job:'Создаёт волшебные сигналы'},
  {id:'pilot',name:'Пилот',icon:'🚀',job:'Управляет полярной техникой'},
  {id:'guardian',name:'Защитник',icon:'🛡️',job:'Охраняет секреты команды'},
  {id:'messenger',name:'Связист',icon:'📣',job:'Помогает команде действовать вместе'},
  {id:'energy',name:'Хранитель энергии',icon:'⚡',job:'Зажигает огни станции'}
];
const CARGO = [
  {id:1,icon:'🧸',color:'голубой',cold:true},{id:2,icon:'🛷',color:'розовый',cold:false},
  {id:3,icon:'🎮',color:'фиолетовый',cold:true},{id:4,icon:'🪁',color:'голубой',cold:false},
  {id:5,icon:'🧩',color:'оранжевый',cold:true},{id:6,icon:'🦄',color:'розовый',cold:false},
  {id:7,icon:'🎸',color:'бирюзовый',cold:true},{id:8,icon:'🎁',color:'фиолетовый',cold:false},
  {id:9,icon:'🪀',color:'оранжевый',cold:true},{id:10,icon:'🧤',color:'голубой',cold:false},
  {id:11,icon:'🛼',color:'розовый',cold:true},{id:12,icon:'📚',color:'бирюзовый',cold:false}
];
const GRID = [
  '#######',
  '#..#..#',
  '#.....#',
  '#.##..#',
  '#....##',
  '#.....#',
  '#######'
];
const SPARKS = [{x:1,y:4},{x:5,y:5},{x:3,y:2}];
const EXIT = {x:5,y:1};
const DIRECTIONS = {up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const clean = val => String(val||'').trim().slice(0,80);
const key = () => crypto.randomBytes(20).toString('hex');
const randomCode = () => Array.from(crypto.randomBytes(5),x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('');
const shuffle = a => {a=[...a];for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const directionsFor = (room, playerId) => {
  const i=room.players.findIndex(p=>p.id===playerId), n=room.players.length;
  if(i<0) return [];
  if(n===2) return i===0?['up','right']:['down','left'];
  if(n===3) return [['up','right'],['down','left'],['up','left']][i];
  return [['up'],['right'],['down'],['left']][i%4];
};
const notify = room => {
  room.updatedAt=Date.now();
  for (const client of [...room.streams]) {
    try { client.res.write('event: state\ndata: '+JSON.stringify(view(room,client.token))+'\n\n'); }
    catch { room.streams.delete(client); }
  }
};
const boardFinished = room => room.maze.collected.length===SPARKS.length && room.maze.robot.x===EXIT.x && room.maze.robot.y===EXIT.y && room.maze.charged.length===room.players.length;
function view(room, token) {
  const host=token===room.hostToken;
  const me=room.players.find(p=>p.token===token);
  const authorized=host||!!me;
  if(!authorized) return null;
  const base={
    room:room.code,host,stage:room.stage,done:room.done,notice:room.notice,
    players:room.players.map(p=>({id:p.id,name:p.name,roleId:p.roleId,online:p.online,role:ROLE_INFO.find(r=>r.id===p.roleId)})),
    roleInfo:ROLE_INFO,
    myself:me?{id:me.id,name:me.name,roleId:me.roleId,role:ROLE_INFO.find(r=>r.id===me.roleId)}:null,
    stageNumber:{lobby:0,signal:1,train:2,maze:3,finale:4,win:5}[room.stage]
  };
  if(room.stage==='signal'){
    base.signal={count:room.players.length,progress:room.signal.progress,errors:room.signal.errors,
      completed:room.signal.order.slice(0,room.signal.progress).map(id=>room.players.find(p=>p.id===id)).filter(Boolean).map(p=>({id:p.id,name:p.name,icon:ROLE_INFO.find(r=>r.id===p.roleId).icon})),
      myOrder:me?room.signal.order.indexOf(me.id)+1:null,
      canSend:!!me && !room.done && !room.signal.order.slice(0,room.signal.progress).includes(me.id)};
  }
  if(room.stage==='train'){
    base.train={
      labelled:room.cargo.filter(c=>c.label!==null).length,
      count:room.cargo.length,
      test:room.trainResult,
      parcels:room.cargo.map(c=>({id:c.id,icon:c.icon,color:c.color,stamp:c.cold?'❄️':'☀️',label:c.label,owner:room.players.find(p=>p.id===c.owner)?.name||'Команда'})),
      mine:me?room.cargo.filter(c=>c.owner===me.id).map(c=>({id:c.id,icon:c.icon,color:c.color,stamp:c.cold?'❄️':'☀️',label:c.label})):[]
    };
  }
  if(room.stage==='maze'){
    base.maze={grid:GRID,robot:room.maze.robot,sparks:SPARKS,exit:EXIT,collected:room.maze.collected,
      charged:room.maze.charged,steps:room.maze.steps,hits:room.maze.hits,last:room.maze.last,
      controls:me?directionsFor(room,me.id):[],myCharged:!!me&&room.maze.charged.includes(me.id)};
  }
  if(room.stage==='finale'){
    base.finale={active:room.finale.active,endsAt:room.finale.endsAt,activated:room.finale.activated,
      myActivated:!!me&&room.finale.activated.includes(me.id),attempt:room.finale.attempt};
  }
  return base;
}
function newRoom(){
  if(rooms.size>=MAX_ROOMS) throw new Error('Сейчас слишком много комнат. Попробуйте позже.');
  let code; do{code=randomCode();}while(rooms.has(code));
  const room={code,hostToken:key(),players:[],streams:new Set(),stage:'lobby',done:false,notice:'Команда собирается на станции.',
    updatedAt:Date.now(),signal:null,cargo:[],trainResult:null,maze:null,finale:null};
  rooms.set(code,room);return room;
}
function start(room){
  if(room.players.length<2) throw new Error('Для квеста нужны минимум 2 участника.');
  room.stage='signal';room.done=false;room.signal={order:shuffle(room.players.map(p=>p.id)),progress:0,errors:0};
  room.notice='Связь потеряна! Соберите радиосигнал в правильном порядке.';
}
function nextStage(room){
  if(room.stage==='signal'){
    room.stage='train';room.done=false;room.trainResult=null;
    const arr=shuffle(CARGO);
    room.cargo=arr.map((c,i)=>({...c,owner:room.players[i%room.players.length].id,label:null}));
    room.notice='ИИ-помощник забыл, как сортировать подарки. Покажите ему примеры!';
  } else if(room.stage==='train'){
    room.stage='maze';room.done=false;
    room.maze={robot:{x:1,y:5},collected:[],charged:[],steps:0,hits:0,last:'Пульт робота готов. Зарядите модули и отправляйтесь в путь!'};
    room.notice='Найдите три искры энергии и доберитесь до светового портала.';
  } else if(room.stage==='maze'){
    room.stage='finale';room.done=false;room.finale={active:false,endsAt:0,activated:[],attempt:0};
    room.notice='Все системы подключены. Осталось зажечь сияние одновременно!';
  }
}
function expectHost(host){if(!host)throw new Error('Это действие доступно только ведущему.');}
function expectPlayer(me){if(!me)throw new Error('Это действие доступно только участнику.');}
function handleAction(room, token, action, body){
  const host=room.hostToken===token, me=room.players.find(p=>p.token===token);
  if(!host&&!me) throw new Error('Ваша сессия не найдена. Войдите заново.');
  if(action==='host-start'){expectHost(host);if(room.stage!=='lobby')throw new Error('Игра уже началась.');start(room);}
  else if(action==='host-next'){
    expectHost(host);if(!room.done) throw new Error('Сначала завершите миссию.');
    if(!['signal','train','maze'].includes(room.stage))throw new Error('Нет следующей станции.');nextStage(room);
  }
  else if(action==='host-skip'){
    expectHost(host);if(!['signal','train','maze'].includes(room.stage))throw new Error('Невозможно пропустить станцию.');nextStage(room);
  }
  else if(action==='host-reset'){
    expectHost(host);room.stage='lobby';room.done=false;room.signal=null;room.cargo=[];room.trainResult=null;room.maze=null;room.finale=null;room.notice='Новый запуск! Команда готовится к миссии.';
  }
  else if(action==='host-kick'){
    expectHost(host);const id=clean(body.playerId);const oldCount=room.players.length;
    room.players=room.players.filter(p=>p.id!==id);
    if(room.players.length===oldCount)throw new Error('Участник не найден.');
    for(const s of [...room.streams])if(s.token!==room.hostToken&&!room.players.some(p=>p.token===s.token)){
      try{s.res.write('event: removed\ndata: {}\n\n');s.res.end();}catch{}room.streams.delete(s);
    }
    if(room.stage==='signal'&&room.signal){room.signal.order=room.signal.order.filter(p=>p!==id);room.signal.progress=0;if(!room.signal.order.length)room.done=true;}
    if(room.stage==='train'&&room.players.length){
      room.cargo.forEach((c,i)=>{if(c.owner===id)c.owner=room.players[i%room.players.length].id;});
      room.trainResult=null;room.done=false;
    }
    if(room.stage==='maze'&&room.maze){room.maze.charged=room.maze.charged.filter(p=>p!==id);room.done=boardFinished(room);}
    if(room.stage==='finale'&&room.finale){room.finale.activated=room.finale.activated.filter(p=>p!==id);}
    if(room.stage!=='lobby'&&room.stage!=='win'&&room.players.length<2){
      room.stage='lobby';room.done=false;room.notice='Для миссии нужны минимум два участника. Позовите нового игрока и начните снова.';
    }else room.notice='Состав команды обновлён.';
  }
  else if(action==='signal-send'){
    expectPlayer(me);if(room.stage!=='signal'||room.done)throw new Error('Станция связи сейчас неактивна.');
    if(room.signal.order[room.signal.progress]===me.id){
      room.signal.progress++;room.notice=`${me.name} передаёт верный фрагмент! 📡`;
      if(room.signal.progress>=room.signal.order.length){room.done=true;room.notice='Сигнал восстановлен! Радиостанция снова работает. 🎉';}
    }else{room.signal.progress=0;room.signal.errors++;room.notice=`Помехи! ${me.name} передал сигнал не по порядку. Попробуйте снова вместе.`;}
  }
  else if(action==='train-label'){
    expectPlayer(me);if(room.stage!=='train'||room.done)throw new Error('Обучение ИИ уже закончено.');
    const parcel=room.cargo.find(c=>c.id===Number(body.parcelId));
    if(!parcel||parcel.owner!==me.id)throw new Error('Этот подарок принадлежит другому участнику.');
    if(!['cold','warm'].includes(body.label))throw new Error('Неверный склад.');
    parcel.label=body.label;room.trainResult=null;room.notice=`${me.name} добавляет пример для обучения ИИ.`;
  }
  else if(action==='train-test'){
    if(room.stage!=='train'||room.done)throw new Error('Обучение ИИ сейчас неактивно.');
    if(room.cargo.some(c=>c.label===null))throw new Error('Сначала распределите все подарки.');
    const wrong=room.cargo.filter(c=>c.label!==(c.cold?'cold':'warm')).length;
    room.trainResult={wrong,ok:wrong===0};room.done=wrong===0;
    room.notice=wrong===0?'ИИ освоил сортировку: все 12 примеров верные! 🎊':`ИИ запутался: неточно размеченных примеров — ${wrong}. Перепроверьте коробки всей командой.`;
  }
  else if(action==='maze-charge'){
    expectPlayer(me);if(room.stage!=='maze'||room.done)throw new Error('Маршрут сейчас неактивен.');
    if(!room.maze.charged.includes(me.id))room.maze.charged.push(me.id);
    room.maze.last=`${me.name} зарядил модуль! ⚡`;
    room.done=boardFinished(room);
  }
  else if(action==='maze-move'){
    expectPlayer(me);if(room.stage!=='maze'||room.done)throw new Error('Робот сейчас неактивен.');
    const d=clean(body.direction);
    if(!directionsFor(room,me.id).includes(d))throw new Error('Эта стрелка не подключена к вашему пульту.');
    if(!room.maze.charged.includes(me.id))throw new Error('Сначала зарядите свой модуль!');
    const [dx,dy]=DIRECTIONS[d], p=room.maze.robot, x=p.x+dx,y=p.y+dy;
    if(!GRID[y]||GRID[y][x]!=='.'){
      room.maze.hits++;room.maze.last=`${me.name}: путь перекрыт льдом! 🧊`;
    }else{
      room.maze.robot={x,y};room.maze.steps++;
      const i=SPARKS.findIndex(s=>s.x===x&&s.y===y);
      if(i!==-1&&!room.maze.collected.includes(i)){
        room.maze.collected.push(i);room.maze.last=`${me.name} нашёл искру энергии! ✨`;
      }else if(x===EXIT.x&&y===EXIT.y){room.maze.last='Робот добрался до портала! Проверьте искры и заряды команды.';}
      else {room.maze.last=`${me.name} передвинул робота.`;}
    }
    room.done=boardFinished(room);
    if(room.done)room.notice='Маршрут пройден! Три искры собраны, вся команда зарядила модули. 🚀';
  }
  else if(action==='finale-start'){
    expectHost(host);if(room.stage!=='finale'||room.done)throw new Error('Финал пока недоступен.');
    room.finale.attempt++;room.finale.active=true;room.finale.endsAt=Date.now()+25000;room.finale.activated=[];
    room.notice='Отсчёт начался! Всем участникам нужно зажечь свою искру за 25 секунд.';
  }
  else if(action==='finale-ignite'){
    expectPlayer(me);if(room.stage!=='finale'||!room.finale.active||room.done)throw new Error('Дождитесь запуска финала от ведущего.');
    if(Date.now()>room.finale.endsAt)throw new Error('Время истекло. Ведущий запустит попытку снова.');
    if(!room.finale.activated.includes(me.id))room.finale.activated.push(me.id);
    room.notice=`${me.name} зажёг искру! ✨`;
    if(room.finale.activated.length===room.players.length){room.stage='win';room.done=true;room.notice='СЕВЕРНОЕ СИЯНИЕ СПАСЕНО! 🎉';}
  }
  else throw new Error('Неизвестное действие.');
  notify(room);
  return view(room,token);
}
function json(res,status,data){
  const b=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(b);
}
function publicRoom(room){return {room:room.code,stage:room.stage,roles:ROLE_INFO.map(r=>({...r,taken:room.players.some(p=>p.roleId===r.id)})),count:room.players.length};}
function readBody(req){return new Promise((resolve,reject)=>{
  let body='';req.on('data',chunk=>{body+=chunk;if(body.length>MAX_BYTES){reject(new Error('Слишком много данных.'));req.destroy();}});
  req.on('end',()=>{try{resolve(JSON.parse(body||'{}'));}catch{reject(new Error('Неверный формат запроса.'));}});
  req.on('error',reject);
});}
async function api(req,res,url){
  if(url.pathname==='/api/health')return json(res,200,{status:'ok',rooms:rooms.size});
  if(url.pathname==='/api/create'&&req.method==='POST'){
    const room=newRoom();return json(res,200,{room:room.code,token:room.hostToken});
  }
  // Render Free can restart an instance, which clears in-memory rooms.
  // Allow the original teacher browser to restore the same invitation code.
  if(url.pathname==='/api/recover'&&req.method==='POST'){
    const body=await readBody(req);
    const code=clean(body.room).toUpperCase(), token=clean(body.token);
    if(!/^[A-HJ-NP-Z2-9]{5}$/.test(code)||!/^[a-f0-9]{40}$/.test(token))
      throw new Error('Некорректный код комнаты или ключ ведущего.');
    let room=rooms.get(code);
    if(room){
      if(room.hostToken!==token)throw new Error('Комната уже существует. Обновите страницу.');
      return json(res,200,{room:code,token,recovered:false});
    }
    if(rooms.size>=MAX_ROOMS)throw new Error('Слишком много комнат. Попробуйте позже.');
    room={code,hostToken:token,players:[],streams:new Set(),stage:'lobby',done:false,
      notice:'Комната восстановлена после перезапуска сервера. Пригласите участников снова.',
      updatedAt:Date.now(),signal:null,cargo:[],trainResult:null,maze:null,finale:null};
    rooms.set(code,room);
    return json(res,200,{room:code,token,recovered:true});
  }
  if(url.pathname==='/api/room'&&req.method==='GET'){
    const room=rooms.get(clean(url.searchParams.get('room')).toUpperCase());return room?json(res,200,publicRoom(room)):json(res,404,{error:'Комната не найдена или закрылась. Попросите ведущего создать новую.'});
  }
  if(url.pathname==='/api/join'&&req.method==='POST'){
    const body=await readBody(req),room=rooms.get(clean(body.room).toUpperCase());
    if(!room)throw new Error('Комната не найдена.');
    if(room.stage!=='lobby')throw new Error('Квест уже начался. Попросите ведущего перезапустить комнату.');
    if(room.players.length>=10)throw new Error('Команда заполнена: максимум 10 участников.');
    const roleId=clean(body.roleId),name=clean(body.name).slice(0,18);
    if(!ROLE_IDS.includes(roleId))throw new Error('Выберите роль.');
    if(room.players.some(p=>p.roleId===roleId))throw new Error('Роль уже занята. Выберите другую.');
    if(name.length<2)throw new Error('Введите имя или псевдоним (от 2 символов).');
    const player={id:crypto.randomUUID(),token:key(),name,roleId,online:true};
    room.players.push(player);notify(room);return json(res,200,{room:room.code,token:player.token});
  }
  if(url.pathname==='/api/state'&&req.method==='GET'){
    const room=rooms.get(clean(url.searchParams.get('room')).toUpperCase());
    if(!room)throw new Error('Комната закрыта.');
    const snapshot=view(room,clean(url.searchParams.get('token')));
    if(!snapshot)throw new Error('Сессия не найдена.');return json(res,200,snapshot);
  }
  if(url.pathname==='/api/action'&&req.method==='POST'){
    const body=await readBody(req),room=rooms.get(clean(body.room).toUpperCase());
    if(!room)throw new Error('Комната не найдена.');
    return json(res,200,handleAction(room,clean(body.token),clean(body.action),body));
  }
  if(url.pathname==='/api/stream'&&req.method==='GET'){
    const room=rooms.get(clean(url.searchParams.get('room')).toUpperCase()),token=clean(url.searchParams.get('token'));
    if(!room||!view(room,token))throw new Error('Нет доступа к комнате.');
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no','Access-Control-Allow-Origin':'same-origin'});
    res.write('retry: 1500\nevent: state\ndata: '+JSON.stringify(view(room,token))+'\n\n');
    const stream={res,token};room.streams.add(stream);
    const heartbeat=setInterval(()=>{try{res.write(': ping\n\n');}catch{clearInterval(heartbeat);room.streams.delete(stream);}},18000);
    req.on('close',()=>{clearInterval(heartbeat);room.streams.delete(stream);});return;
  }
  return json(res,404,{error:'Не найдено.'});
}
function serve(req,res,url){
  const name=url.pathname==='/'?'/index.html':url.pathname;
  let filename;
  try{filename=path.resolve(STATIC,'.'+decodeURIComponent(name));}catch{return json(res,400,{error:'Некорректный путь.'});}
  if(filename!==STATIC&&!filename.startsWith(STATIC+path.sep))return json(res,403,{error:'Нет доступа.'});
  const ext=path.extname(filename),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[ext];
  if(!mime)return json(res,404,{error:'Файл не найден.'});
  fs.readFile(filename,(err,data)=>{if(err)return json(res,404,{error:'Файл не найден.'});res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'"});res.end(data);});
}
const server=http.createServer(async (req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/'))return await api(req,res,url);
    if(req.method!=='GET')return json(res,405,{error:'Метод не поддерживается.'});
    return serve(req,res,url);
  }catch(err){if(!res.headersSent)json(res,400,{error:err.message||'Ошибка сервера.'});}
});
setInterval(()=>{
  for(const [code,room] of rooms){
    if(room.stage==='finale'&&room.finale.active&&Date.now()>room.finale.endsAt){
      room.finale.active=false;room.notice='Отсчёт закончился! Ничего страшного: ведущий может запустить финал ещё раз.';notify(room);
    }
    if(Date.now()-room.updatedAt>4*3600*1000){for(const c of room.streams){try{c.res.end();}catch{}}rooms.delete(code);}
  }
},1200).unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`Polar Station 2027 online: http://localhost:${PORT}`));
