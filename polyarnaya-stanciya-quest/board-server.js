'use strict';
const crypto = require('node:crypto');

const rooms = new Map();
const MAX_ROOMS = 90;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROLES = [
  {id:'fox',emoji:'🦊',name:'Лисёнок',color:'#fa9257'},
  {id:'penguin',emoji:'🐧',name:'Пингвин',color:'#65bdf0'},
  {id:'bear',emoji:'🐻‍❄️',name:'Мишка',color:'#a9bafd'},
  {id:'owl',emoji:'🦉',name:'Совёнок',color:'#b99aef'},
  {id:'rabbit',emoji:'🐰',name:'Зайка',color:'#f6a1c0'},
  {id:'cat',emoji:'🐱',name:'Котик',color:'#f1c46e'},
  {id:'robot',emoji:'🤖',name:'Робот',color:'#77cfae'},
  {id:'panda',emoji:'🐼',name:'Панда',color:'#9baeb6'},
  {id:'frog',emoji:'🐸',name:'Лягушка',color:'#a9d475'},
  {id:'unicorn',emoji:'🦄',name:'Единорог',color:'#d7a0ea'}
];
const TYPES = ['start','sort','prompt','bonus','spot','route','sort','prompt','spot','bonus',
  'route','sort','spot','prompt','bonus','route','sort','prompt','spot','route','bonus',
  'sort','prompt','spot','finish'];
const PROMPTS = {
  hero:['🐧','🐻‍❄️','🤖'],
  place:['🏔️','🌲','🏰'],
  magic:['✨','🌈','❄️']
};
const ITEM_SETS = [
  [{emoji:'🧤',cold:true},{emoji:'☀️',cold:false},{emoji:'🧣',cold:true}],
  [{emoji:'🌴',cold:false},{emoji:'🧊',cold:true},{emoji:'🍦',cold:true}],
  [{emoji:'🔥',cold:false},{emoji:'⛄',cold:true},{emoji:'🏖️',cold:false}],
  [{emoji:'🧥',cold:true},{emoji:'🌞',cold:false},{emoji:'🛷',cold:true}]
];
const GLITCH_SETS = [
  [{e:'☃️',label:'Снеговик'},{e:'🎄',label:'Ёлка'},{e:'🐧',label:'Пингвин'},{e:'🐠',label:'Рыба в небе'}],
  [{e:'🧤',label:'Варежки'},{e:'🏂',label:'Сноуборд'},{e:'🍉',label:'Арбуз на снегу'},{e:'🛷',label:'Санки'}],
  [{e:'🐻‍❄️',label:'Белый медведь'},{e:'🦌',label:'Олень'},{e:'🌻',label:'Подсолнух изо льда'},{e:'❄️',label:'Снежинка'}],
  [{e:'🎁',label:'Подарок'},{e:'🧸',label:'Игрушка'},{e:'☃️',label:'Снеговик'},{e:'🐙',label:'Осьминог на лыжах'}]
];
const DIRS={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
function clean(x){return String(x??'').trim().slice(0,160);}
function code(){let result='';for(let i=0;i<5;i++)result+=ALPHABET[crypto.randomInt(ALPHABET.length)];return result;}
function token(){return crypto.randomBytes(20).toString('hex');}
function touch(room){room.updatedAt=Date.now();}
function newRoom(preferredCode,preferredToken) {
  if(rooms.size>=MAX_ROOMS)throw Error('Слишком много комнат. Попробуйте позже.');
  let c=preferredCode;
  if(!c){do{c=code();}while(rooms.has(c));}
  const r={code:c,hostToken:preferredToken||token(),status:'lobby',players:[],turn:0,
    totalTurns:0,stars:0,die:null,task:null,notice:'Собираем команду',updatedAt:Date.now(),streams:new Set()};
  rooms.set(c,r);return r;
}
function getRoom(codeValue){return rooms.get(clean(codeValue).toUpperCase());}
function current(room){return room.players[room.turn%room.players.length]||null;}
function view(room,t) {
  const host=room.hostToken===t;
  const me=room.players.find(p=>p.token===t);
  if(!host&&!me)return null;
  return {room:room.code,host,me:me?.id||null,status:room.status,
    roles:ROLES,players:room.players.map(p=>({id:p.id,roleId:p.roleId,name:p.name,pos:p.pos})),
    turn:current(room)?.id||null,totalTurns:room.totalTurns,stars:room.stars,
    goal:Math.max(4,Math.ceil(room.players.length*.8)),die:room.die,
    task:room.task,notice:room.notice,types:TYPES};
}
function lobbyView(room){
  return {room:room.code,status:room.status,players:room.players.map(p=>({name:p.name,roleId:p.roleId})),roles:ROLES};
}
function sendJSON(res,status,body){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(body));
}
function push(room){
  touch(room);
  for(const s of [...room.streams]){
    try{
      const v=view(room,s.token);
      if(v)s.res.write('event: state\ndata: '+JSON.stringify(v)+'\n\n');
      else {s.res.write('event: removed\ndata: {}\n\n');s.res.end();room.streams.delete(s);}
    }catch{room.streams.delete(s);}
  }
}
function body(req){return new Promise((resolve,reject)=>{
  let str='';req.on('data',chunk=>{str+=chunk;if(str.length>14000){reject(Error('Слишком много данных'));req.destroy();}});
  req.on('end',()=>{try{resolve(JSON.parse(str||'{}'));}catch{reject(Error('Некорректные данные'));}});
  req.on('error',reject);
});}
function requireHost(room,t){if(room.hostToken!==t)throw Error('Только ведущий может это сделать.');}
function requireTurn(room,t){
  if(room.status!=='play')throw Error('Сейчас не время хода.');
  const p=current(room);
  if(!p||p.token!==t)throw Error('Сейчас ход другого игрока.');
  return p;
}
function finishTask(room,feedback){
  room.stars++;room.totalTurns++;
  room.task=null;room.die=null;room.notice=feedback+'  +1 ✨';
  const done=room.stars>=Math.max(4,Math.ceil(room.players.length*.8))&&room.totalTurns>=room.players.length;
  if(done){room.status='win';room.notice='Победа! Вы собрали все искры!';}
  else room.turn=(room.turn+1)%room.players.length;
}
function playAction(room,t,action,request) {
  if(action==='start'){
    requireHost(room,t);
    if(room.players.length<2)throw Error('Нужны хотя бы два игрока.');
    if(room.status!=='lobby')throw Error('Игра уже идёт.');
    room.status='play';room.turn=0;room.totalTurns=0;room.stars=0;room.task=null;room.die=null;
    for(const p of room.players)p.pos=0;
    room.notice='Поехали!';push(room);return;
  }
  if(action==='reset'){
    requireHost(room,t);room.status='lobby';room.turn=0;room.totalTurns=0;
    room.stars=0;room.die=null;room.task=null;room.notice='Новая партия';
    for(const p of room.players)p.pos=0;
    push(room);return;
  }
  if(action==='kick'){
    requireHost(room,t);
    if(room.status!=='lobby')throw Error('Удалять участников можно до начала партии.');
    room.players=room.players.filter(p=>p.id!==clean(request.playerId));
    push(room);return;
  }
  if(action==='leave'){
    const before=room.players.length;room.players=room.players.filter(p=>p.token!==t);
    if(before===room.players.length)throw Error('Игрок не найден.');
    if(room.status==='play')throw Error('Нельзя покинуть игру во время партии.');
    push(room);return;
  }
  const player=requireTurn(room,t);
  if(action==='roll'){
    if(room.task)throw Error('Сначала закончи мини-игру.');
    const die=crypto.randomInt(1,4);
    room.die=die;
    player.pos=Math.min(24,player.pos+die);
    let type=TYPES[player.pos];
    if(type==='finish')type='bonus';
    const turn=room.totalTurns;
    if(type==='bonus'){
      finishTask(room,'Сундук с подарком!');
    } else if(type==='sort'){
      room.task={type:'sort',items:ITEM_SETS[turn%ITEM_SETS.length],progress:0};
      room.notice='Разложи 3 предмета';
    } else if(type==='prompt'){
      room.task={type:'prompt',picked:{hero:null,place:null,magic:null}};
      room.notice='Собери открытку';
    } else if(type==='spot'){
      room.task={type:'spot',set:turn%GLITCH_SETS.length,
        choices:GLITCH_SETS[turn%GLITCH_SETS.length],wrong:3};
      // Move the strange picture around, instead of always choosing the last card.
      const target=(turn+player.pos)%4;
      const choices=[...room.task.choices];
      const glitch=choices.pop();
      choices.splice(target,0,glitch);
      room.task.choices=choices;room.task.wrong=target;
      room.notice='Найди необычную картинку';
    } else if(type==='route'){
      room.task={type:'route',x:0,y:1,steps:0};
      room.notice='Проведи робота к подарку';
    } else {finishTask(room,'Отличный ход!');}
    push(room);return;
  }
  if(!room.task)throw Error('Сначала брось кубик.');
  if(action==='sort'){
    if(room.task.type!=='sort')throw Error('Сейчас другое задание.');
    const item=room.task.items[room.task.progress];
    const expected=item.cold?'cold':'warm';
    if(clean(request.choice)!==expected){room.notice='Ещё раз! 😊';push(room);return;}
    room.task.progress++;
    if(room.task.progress>=3)finishTask(room,'Робот научился!');
    else room.notice='Верно! Следующий предмет';
  } else if(action==='pick'){
    if(room.task.type!=='prompt')throw Error('Сейчас другое задание.');
    const group=clean(request.group),value=clean(request.value);
    if(!Object.hasOwn(PROMPTS,group)||!PROMPTS[group].includes(value))throw Error('Неизвестный элемент.');
    room.task.picked[group]=value;
    room.notice='Добавь детали открытки';
  } else if(action==='make'){
    if(room.task.type!=='prompt')throw Error('Сейчас другое задание.');
    if(Object.values(room.task.picked).some(v=>!v))throw Error('Выбери героя, место и волшебство.');
    finishTask(room,'Открытка готова!');
  } else if(action==='spot'){
    if(room.task.type!=='spot')throw Error('Сейчас другое задание.');
    if(Number(request.index)!==room.task.wrong){room.notice='Посмотри ещё! 🔍';push(room);return;}
    finishTask(room,'Глюк найден!');
  } else if(action==='move'){
    if(room.task.type!=='route')throw Error('Сейчас другое задание.');
    const direction=clean(request.direction);const delta=DIRS[direction];
    if(!delta)throw Error('Неизвестная команда.');
    const nx=room.task.x+delta[0],ny=room.task.y+delta[1];
    if(nx<0||nx>2||ny<0||ny>2||(nx===1&&ny===1)){
      room.notice='Тут преграда! 🧊';push(room);return;
    }
    room.task.x=nx;room.task.y=ny;room.task.steps++;
    if(nx===2&&ny===1)finishTask(room,'Робот добрался!');
    else room.notice='Робот едет…';
  } else throw Error('Неизвестная команда.');
  push(room);
}
async function api(req,res,url){
  const pathname=url.pathname;
  if(pathname==='/api/board/health')return sendJSON(res,200,{status:'ok',rooms:rooms.size});
  if(pathname==='/api/board/create'&&req.method==='POST'){
    const room=newRoom();return sendJSON(res,200,{room:room.code,token:room.hostToken});
  }
  if(pathname==='/api/board/public'&&req.method==='GET'){
    const room=getRoom(url.searchParams.get('room'));
    return room?sendJSON(res,200,lobbyView(room)):sendJSON(res,404,{error:'Комната не найдена. Создайте новую.'});
  }
  if(pathname==='/api/board/recover'&&req.method==='POST'){
    const b=await body(req),c=clean(b.room).toUpperCase(),t=clean(b.token);
    if(!/^[A-HJ-NP-Z2-9]{5}$/.test(c)||!/^[a-f0-9]{40}$/.test(t))throw Error('Неверные данные комнаты.');
    let room=getRoom(c);
    if(room){requireHost(room,t);return sendJSON(res,200,{room:c,token:t,recovered:false});}
    room=newRoom(c,t);room.notice='Комната восстановлена. Пригласите игроков снова.';
    return sendJSON(res,200,{room:c,token:t,recovered:true});
  }
  if(pathname==='/api/board/join'&&req.method==='POST'){
    const b=await body(req),room=getRoom(b.room);
    if(!room)throw Error('Комната не найдена. Попросите ведущего открыть её.');
    if(room.status!=='lobby')throw Error('Партия уже началась.');
    if(room.players.length>=10)throw Error('Все 10 мест заняты.');
    const roleId=clean(b.roleId),name=clean(b.name).slice(0,14);
    if(!ROLES.some(r=>r.id===roleId))throw Error('Выбери героя.');
    if(room.players.some(p=>p.roleId===roleId))throw Error('Герой уже занят.');
    if(name.length<2)throw Error('Напиши имя от 2 символов.');
    const p={id:crypto.randomUUID(),token:token(),roleId,name,pos:0};
    room.players.push(p);push(room);
    return sendJSON(res,200,{room:room.code,token:p.token});
  }
  if(pathname==='/api/board/state'&&req.method==='GET'){
    const room=getRoom(url.searchParams.get('room'));
    if(!room)throw Error('Комната закрылась. Ведущему нужно восстановить комнату.');
    const state=view(room,clean(url.searchParams.get('token')));
    if(!state)throw Error('Игрок не найден в комнате.');
    return sendJSON(res,200,state);
  }
  if(pathname==='/api/board/action'&&req.method==='POST'){
    const b=await body(req),room=getRoom(b.room);
    if(!room)throw Error('Комната не найдена.');
    playAction(room,clean(b.token),clean(b.action),b);
    return sendJSON(res,200,{ok:true});
  }
  if(pathname==='/api/board/stream'&&req.method==='GET'){
    const room=getRoom(url.searchParams.get('room')),t=clean(url.searchParams.get('token'));
    if(!room||!view(room,t))throw Error('Сессия недоступна.');
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform',
      'Connection':'keep-alive','X-Accel-Buffering':'no'});
    const entry={res,token:t};
    room.streams.add(entry);
    res.write('retry: 2500\nevent: state\ndata: '+JSON.stringify(view(room,t))+'\n\n');
    const ping=setInterval(()=>{try{res.write(': ping\n\n');}catch{room.streams.delete(entry);clearInterval(ping);}},18000);
    req.on('close',()=>{clearInterval(ping);room.streams.delete(entry);});
    return;
  }
  return sendJSON(res,404,{error:'Не найдено.'});
}
setInterval(()=>{
  for(const [id,room] of rooms)if(Date.now()-room.updatedAt>4*3600*1000){
    for(const stream of room.streams)try{stream.res.end();}catch{}
    rooms.delete(id);
  }
},60000).unref();
module.exports={api};
