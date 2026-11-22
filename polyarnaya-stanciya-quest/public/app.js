'use strict';
const app=document.getElementById('app');
const toastEl=document.getElementById('toast');
const ROLE_ICONS={radio:'📡',navigator:'🧭',engineer:'🛠️',trainer:'🧠',detective:'🔎',artist:'🎨',pilot:'🚀',guardian:'🛡️',messenger:'📣',energy:'⚡'};
const STAGES=[{id:'signal',icon:'📡',label:'Радиомаяк'},{id:'train',icon:'🎁',label:'Обучение ИИ'},{id:'maze',icon:'🤖',label:'Робомаршрут'},{id:'finale',icon:'🌌',label:'Запуск сияния'}];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roomFromUrl=()=>new URLSearchParams(location.search).get('room')?.toUpperCase()||'';
const shareLink=code=>location.origin+location.pathname+'?room='+encodeURIComponent(code);
let room=roomFromUrl(),token='',snapshot=null,publicSnapshot=null,stream=null,selectedRole='',nickname='',loading=false,toastTimer=null,connection='',reconnectTimer=null;
function notification(text){toastEl.textContent=text;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),3500);}
async function fetchJson(path,options={}){
  const r=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  let data;try{data=await r.json();}catch{throw new Error('Сервер временно недоступен.');}
  if(!r.ok)throw new Error(data.error||'Не удалось выполнить действие.');return data;
}
const post=(path,body={})=>fetchJson(path,{method:'POST',body:JSON.stringify(body)});
function roomURL(code){history.replaceState(null,'',location.pathname+'?room='+code);room=code;}
function keyFor(code){return 'polar-station-2027:'+code;}
function hostKeyFor(code){return 'polar-station-2027:host:'+code;}
function persist(code,t){sessionStorage.setItem(keyFor(code),t);}
function rememberHost(code,t){localStorage.setItem(hostKeyFor(code),t);}
function isHostSession(code,t){return !!t&&localStorage.getItem(hostKeyFor(code))===t;}
function dismissSession(){if(room)sessionStorage.removeItem(keyFor(room));token='';snapshot=null;stream?.close();stream=null;clearTimeout(reconnectTimer);reconnectTimer=null;}
function header(){return `<div class="topbar"><div class="brand"><div class="brand-icon">✳</div><div>ПОЛЯРНАЯ СТАНЦИЯ<div class="brand-sub">КОМАНДНАЯ МИССИЯ • 2027</div></div></div><div class="top-actions">${room?`<span class="room-pill">КОМНАТА ${esc(room)}</span>`:''}<span id="connection" class="tiny-pill"><span class="live-dot"></span>${esc(connection||'Идёт подключение')}</span></div></div>`;}
function landing(){return `${header()}<section class="hero-grid"><div><p class="eyebrow">Совместный квест • 1–4 класс • 2–10 игроков</p><h1 class="hero-title">Северное сияние <span class="gradient-text">исчезло!</span></h1><p class="lead">В полярной станции случился сбой. Только команда маленьких экспертов по искусственному интеллекту сможет вернуть праздник. У каждого — своя роль, секрет и кнопки управления.</p><div class="cta-row"><button class="btn primary huge" data-action="create">🚀 Создать комнату</button><div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center"><input class="field" id="room-code" maxlength="5" placeholder="Код из 5 знаков" aria-label="Код комнаты" style="max-width:175px;text-transform:uppercase"><button class="btn outline" data-action="enter-room">Войти по коду →</button></div></div><div class="hero-note"><span class="feature-chip">🔗 Одна ссылка для всей группы</span><span class="feature-chip">📱 У каждого свой пульт</span><span class="feature-chip">🤝 Победа только вместе</span></div></div><div class="hero-art" aria-hidden="true"><div class="art-orbit"></div><div class="art-orbit second"></div><span class="art-moon">🌙</span><span class="art-spark s1">✦</span><span class="art-spark s2">✳</span><span class="art-spark s3">✧</span><div class="art-bot">🤖</div><div class="art-card left">📡 СИГНАЛ: 0%</div><div class="art-card right">⚡ ЗАРЯД: НУЖЕН</div><div class="art-base"></div></div></section><div class="mission-steps">${STAGES.map(s=>`<div class="mission-step"><strong>${s.icon}</strong>${s.label}</div>`).join('')}</div><p class="footer-note">Для ведущего: создайте комнату и отправьте одну ссылку детям. Игра синхронизируется между устройствами в реальном времени.</p>`;}
function joinScreen(){
  const r=publicSnapshot;
  if(!r)return `${header()}<div class="glass panel"><h2>Ищем комнату…</h2><p class="hint">Подключаем игровую станцию.</p></div>`;
  if(r.stage!=='lobby')return `${header()}<div class="glass panel"><h2>🚀 Миссия уже идёт</h2><p class="hint">В комнату ${esc(room)} сейчас нельзя добавить новых участников. Попросите ведущего перезапустить игру.</p><button class="btn outline" data-action="reload-room">🔄 Обновить</button></div>`;
  return `${header()}<section class="room-head"><div><p class="eyebrow">Ваш экипаж ждёт</p><h1>Выбери свою <span class="gradient-text">суперроль</span></h1><p class="hint">Роли не повторяются. Во время квеста у каждого будет личная задача, а некоторые кнопки работают только на его устройстве.</p></div><span class="status-pill">👥 ${r.count}/10 игроков</span></section><div class="glass panel"><p class="section-label">01 / Собираем команду</p><h2 class="mini-title">Кем ты будешь на станции?</h2><div class="role-grid">${r.roles.map(role=>`<button class="role-card ${role.taken?'taken':''} ${selectedRole===role.id?'selected':''}" ${role.taken?'disabled':''} data-action="select-role" data-role="${esc(role.id)}"><span class="role-emoji">${role.icon}</span><strong>${esc(role.name)}</strong><span>${role.taken?'Уже занято':esc(role.job)}</span></button>`).join('')}</div><div class="join-row"><div><label for="nickname">Как тебя назвать?</label><div style="height:7px"></div><input class="field" id="nickname" maxlength="18" placeholder="Например, Саша" value="${esc(nickname)}" autocomplete="nickname"></div><button class="btn primary huge" data-action="join" ${!selectedRole?'disabled':''}>Присоединиться ✨</button></div><p class="hint small" style="margin:17px 0 0">Личные данные вводить не нужно: можно написать игровой псевдоним.</p></div>`;
}
function progress(stage){const active=STAGES.findIndex(s=>s.id===stage);return `<div class="progress-rail">${STAGES.map((s,i)=>`<div class="progress-node ${i===active?'current':''} ${i<active||stage==='win'?'passed':''}"><span>${s.icon}</span>${s.label}</div>`).join('')}</div>`;}
function roster(s){const players=s.players||[];return `<div class="glass panel"><div class="team-title"><h3>👥 Ваш экипаж</h3><span class="status-pill">${players.length}/10</span></div><div class="team-list">${players.map(p=>`<div class="team-member"><div class="avatar">${p.role.icon}</div><div class="team-info"><div class="member-name">${esc(p.name)} ${s.myself?.id===p.id?'(ты)':''}</div><div class="member-job">${esc(p.role.name)}</div></div>${s.host&&s.stage==='lobby'?`<button class="btn small danger" title="Убрать участника" data-action="kick" data-id="${esc(p.id)}">×</button>`:''}${s.stage==='maze'?`<span class="member-flag">${s.maze.charged.includes(p.id)?'⚡':'◌'}</span>`:''}${s.stage==='finale'?`<span class="member-flag">${s.finale.activated.includes(p.id)?'✨':'◌'}</span>`:''}</div>`).join('')||'<div class="empty-slot">Пока здесь тихо. Участники скоро появятся!</div>'}</div>${s.players.length<10&&s.stage==='lobby'?`<p class="hint small" style="margin-top:12px">Осталось свободных ролей: ${10-s.players.length}</p>`:''}</div>`;}
function teacherTools(s){if(!s.host)return '';
  const next=s.done&&['signal','train','maze'].includes(s.stage);
  return `<div class="teacher-tools"><p class="section-label">Пульт ведущего</p><div style="display:flex;gap:7px;flex-wrap:wrap">${s.stage==='lobby'?`<button class="btn primary" data-action="host-start" ${s.players.length<2?'disabled':''}>🚀 Начать миссию (${s.players.length}/10)</button>`:''}${next?`<button class="btn primary" data-action="host-next">➡️ Следующая станция</button>`:''}${s.stage==='finale'&&!s.finale.active?`<button class="btn pink" data-action="finale-start">⏱️ Запустить обратный отсчёт</button>`:''}${['signal','train','maze'].includes(s.stage)&&!s.done?`<button class="btn small outline" data-action="host-skip">Пропустить этап</button>`:''}<button class="btn small outline" data-action="host-reset">↻ Новая игра</button></div></div>`;
}
function lobby(s){return `<div class="room-head"><div><p class="eyebrow">Подготовка к приключению</p><h1>Экипаж <span class="gradient-text">собирается!</span></h1><p class="hint">Как только все выберут роли, ведущий запустит общую миссию.</p></div><span class="status-pill">🟢 Сбор команды</span></div><div class="layout"><div class="glass panel"><p class="section-label">Секретная станция · Комната ${esc(s.room)}</p><h2 class="mini-title">🔗 Одна ссылка для всех</h2><p class="hint">${s.host?'Отправьте ссылку ученикам в чат урока. Каждый откроет её на своём устройстве и выберет свободную роль.':'Пока команда собирается, придумайте боевой клич вашей полярной станции!'}</p><div class="copy-url"><code>${esc(shareLink(s.room))}</code><button class="btn small outline" data-action="copy-link">📋 Копировать</button></div><div class="lobby-message">${s.host?'🧑‍🏫 Вы — ведущий станции. Ваш экран удобно показывать всем участникам. Ученики занимают роли отдельно.':'🌠 Ты — '+esc(s.myself.role.name)+'. Скоро тебе откроется персональный пульт с секретами и заданиями.'}</div><div class="mission-steps">${STAGES.map((a,i)=>`<div class="mission-step"><strong>${a.icon}</strong>${i+1}. ${a.label}</div>`).join('')}</div>${s.host&&s.players.length<2?`<p class="hint small">Для старта подключите минимум двух детей.</p>`:''}${teacherTools(s)}</div>${roster(s)}</div>`;}
function stageTop(s,kicker,title,description){return `${progress(s.stage)}<div class="notice"><span class="notice-icon">${s.done?'🏆':'❄️'}</span><span>${esc(s.notice)}</span></div><p class="section-label">${esc(kicker)}</p><h2 class="station-h">${title}</h2><p class="station-desc">${description}</p>`;}
function signal(s){const d=s.signal,all=d.count,done=d.progress;
 return `${stageTop(s,'Миссия 1 / Тайная связь','📡 Радиомаяк','У каждого есть секретный номер в цепочке сигнала. Расскажите его команде вслух! Нажимайте «Передать» строго по порядку. Ошибка — и цепь обнулится.')}
 <div class="signal-panel"><div><div class="signal-animation"><div class="pulse-circle"></div><div class="pulse-circle"></div><div class="signal-tower">📡</div></div><div class="signal-chain">${Array.from({length:all},(_,i)=>`<div class="signal-bubble ${i<done?'active':i===done?'next':''}">${i<done?'✓':i+1}</div>`).join('')}</div><p class="hint small" style="text-align:center;margin:13px 0">Передано фрагментов: ${done}/${all} · Помех: ${d.errors}</p></div><div class="personal-card">${s.host?`<p class="task-kicker">Экран ведущего</p><h3>Поддержите команду!</h3><p class="hint">Пусть дети назовут свои личные номера, договорятся о порядке и передадут сигнал с собственных устройств.</p>`:`<p class="task-kicker">Только на твоём пульте</p><h3>Твой секретный номер</h3><div class="huge-number">${d.myOrder}</div><p class="hint">Я в эфире <b>№ ${d.myOrder}</b> из ${all}. Скажи это команде!</p><button class="btn primary wide" data-action="signal-send" ${!d.canSend?'disabled':''}>📡 Передать мой сигнал</button><p class="hint small">Не нажимай раньше своего хода! Слушайте друг друга.</p>`}</div></div>${s.done?`<div class="test-result good">🌟 Маяк включён. Поздравляем, станция 1 спасена!</div>`:''}${teacherTools(s)}`;
}
function training(s){const t=s.train;
 return `${stageTop(s,'Миссия 2 / Обучаем искусственный интеллект','🎁 Учебный конвейер','Робот потерял память и путает подарки. Каждый получает свои коробки и отправляет их на склад. Сначала помогите ИИ собрать правильные примеры, затем всей командой протестируйте его.')}
 <div class="training-rule">🧠 Правило для ИИ: ориентируйтесь <u>на значок на коробке</u>, а не на её цвет. ❄️ → холодный склад. ☀️ → тёплый склад.</div>
 <div class="parcel-line"></div><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><b>📦 Подготовлено примеров: ${t.labelled} / ${t.count}</b><span class="status-pill">${Math.round(t.labelled/t.count*100)}%</span></div><div class="meter-wrap"><div class="meter" style="width:${t.labelled/t.count*100}%"></div></div>
 ${s.host?`<div class="inner-box"><h3>🧑‍🏫 Сортировка идёт!</h3><p class="hint">На экране каждого ученика — его коробки. Пусть дети объясняют, почему выбрали холодный или тёплый склад.</p></div>`:`<h3 class="info-title" style="margin:20px 0 0">Твои коробки (${t.mine.length})</h3><div class="package-grid">${t.mine.map(c=>`<div class="parcel"><div class="parcel-id">ГРУЗ № ${c.id} · ${esc(c.color)}</div><div class="parcel-emoji">${c.icon}</div><div class="parcel-stamp">${c.stamp}</div><div class="parcel-footer"><button class="btn ${c.label==='cold'?'primary active-choice':'outline'}" data-action="train-label" data-id="${c.id}" data-label="cold">❄️ Холод</button><button class="btn ${c.label==='warm'?'pink active-choice':'outline'}" data-action="train-label" data-id="${c.id}" data-label="warm">☀️ Тепло</button></div></div>`).join('')}</div>`}
 <div class="inner-box"><h3 class="info-title">👀 Что уже видит ИИ</h3><div class="mini-parcels">${t.parcels.map(p=>`<div class="mini-parcel" title="Груз ${p.id}, ${esc(p.owner)}, метка: ${p.label==='cold'?'холодный':p.label==='warm'?'тёплый':'не выбрана'}">${p.icon}<label>${p.label==='cold'?'❄️':p.label==='warm'?'☀️':'❔'}</label></div>`).join('')}</div><p class="hint small">Когда все распределят коробки, проверьте модель. Если есть ошибки, участники смогут исправить свои метки.</p>${t.test?`<div class="test-result ${t.test.ok?'good':''}">${t.test.ok?'🎉 Проверка пройдена! Все обучающие примеры верны.':`⚠️ ИИ обнаружил ошибки: ${t.test.wrong}. Сверьте маркировку всех коробок и попробуйте ещё раз.`}</div>`:''}<button class="btn ${t.labelled===t.count?'primary':'outline'} wide" data-action="train-test" ${t.labelled!==t.count||s.done?'disabled':''}>🧪 Протестировать обученную модель</button></div>${teacherTools(s)}`;
}
function maze(s){const m=s.maze,arrowLabel={up:'↑',down:'↓',left:'←',right:'→'};const sparkAt=(x,y)=>m.sparks.findIndex(a=>a.x===x&&a.y===y);
 const board=m.grid.map((row,y)=>[...row].map((cell,x)=>{const robot=m.robot.x===x&&m.robot.y===y,goal=m.exit.x===x&&m.exit.y===y,si=sparkAt(x,y),spark=si!==-1&&!m.collected.includes(si);
  return `<div class="tile ${cell==='#'?'wall':''} ${goal?'goal':''} ${spark?'spark':''} ${robot?'robot':''}" title="${robot?'Робот':goal?'Портал':spark?'Искра':''}">${robot?'🤖':spark?'✨':goal?'🌀':''}</div>`;}).join('')).join('');
 return `${stageTop(s,'Миссия 3 / Управляем роботом','🤖 Ледяной маршрут','Роботу нужны три искры ✨ и выход в портал 🌀. Но пульт разделён на части: у разных игроков — разные стрелки! Зарядите свои модули и помогайте друг другу вести робота.')}
 <div class="maze-stats"><span class="stat">✨ Искры: ${m.collected.length}/3</span><span class="stat">⚡ Заряды: ${m.charged.length}/${s.players.length}</span><span class="stat">👣 Шаги: ${m.steps}</span><span class="stat">🧊 Столкновения: ${m.hits}</span></div>
 <div class="maze-frame"><div class="maze-board" role="img" aria-label="Схема лабиринта. Робот собирает искры и ищет портал.">${board}</div></div><div class="inner-box"><p style="margin:0;font-weight:900">📢 ${esc(m.last)}</p><div class="crew-power">${s.players.map(p=>`<span class="power-chip ${m.charged.includes(p.id)?'on':''}">${m.charged.includes(p.id)?'⚡':'◌'} ${esc(p.name)}</span>`).join('')}</div>${s.host?`<p class="hint">Скажите участникам, какие стрелки доступны на их устройствах, и предложите составить общий маршрут.</p>`:`${!m.myCharged?`<button class="btn gold wide" data-action="maze-charge">⚡ Зарядить мой модуль</button>`:`<span class="success-tag">✓ Мой модуль заряжен!</span><p class="hint small" style="margin:14px 0 6px">Мои команды роботу:</p><div class="maze-controls">${m.controls.map(d=>`<button class="arrow-btn" data-action="maze-move" data-dir="${d}" title="Движение ${d}" ${s.done?'disabled':''}>${arrowLabel[d]}</button>`).join('')}</div><p class="hint small" style="text-align:center">Если нужной стрелки нет — попроси помочь другого игрока.</p>`}`}</div>${s.done?`<div class="test-result good">🎊 Искры собраны, портал открыт и все модули активированы!</div>`:''}${teacherTools(s)}`;
}
function finale(s){const d=s.finale;return `${stageTop(s,'Миссия 4 / Синхронизация команды','🌌 Зажги северное сияние','Теперь вы — одна большая сеть. Ведущий запускает 25-секундный отсчёт, а каждый участник должен нажать свою кнопку. Победа получится только тогда, когда все успеют!')}
 <div class="finale-orb ${d.active?'armed':''}">${d.active?'🌈':'❄️'}</div><div class="clock" data-countdown>${d.active?Math.max(0,Math.ceil((d.endsAt-Date.now())/1000)):'—'}</div><p class="hint" style="text-align:center">Активировано искр: ${d.activated.length} / ${s.players.length}</p><div class="activated-list">${s.players.map(p=>`<span class="activated-icon ${d.activated.includes(p.id)?'on':''}" title="${esc(p.name)}">${d.activated.includes(p.id)?'✨':p.role.icon}</span>`).join('')}</div>${s.host?`<div class="inner-box" style="text-align:center"><h3>Управление обратным отсчётом</h3><p class="hint">Убедитесь, что дети готовы, и запускайте попытку. Если время вышло, можно повторить.</p>${!d.active?`<button class="btn pink huge" data-action="finale-start">⏱️ Запустить 25 секунд</button>`:`<span class="success-tag">Отсчёт идёт. Подбадривайте команду!</span>`}</div>`:`<div class="inner-box" style="text-align:center">${d.myActivated?`<span class="success-tag">✨ Ты зажёг свою искру! Ждём остальных.</span>`:`<button class="btn ${d.active?'gold':'outline'} huge wide" data-action="finale-ignite" ${!d.active?'disabled':''}>✨ ЗАЖЕЧЬ МОЮ ИСКРУ!</button>`}<p class="hint small" style="margin:12px 0 0">${d.active?'Сейчас! Зовите товарищей.':'Ожидаем команду ведущего…'}</p></div>`}${teacherTools(s)}`;}
function winner(s){return `${progress('win')}<div class="confetti"></div><section class="glass panel winner"><p class="eyebrow">Миссия выполнена</p><div class="trophy">🌌</div><h1>Северное сияние <span class="gradient-text">спасено!</span></h1><p>Команда восстановила радиосигнал, обучила ИИ, провела робота через лёд и объединила все искры. Это было возможно только вместе!</p><div style="display:flex;gap:11px;flex-wrap:wrap;justify-content:center;margin-bottom:24px">${s.players.map(p=>`<span class="feature-chip">${p.role.icon} ${esc(p.name)}</span>`).join('')}</div><p class="hint">🏅 Звание экипажа: <b>«Повелители полярного кода»</b></p>${s.host?`<button class="btn primary huge" data-action="host-reset">🚀 Сыграть ещё раз</button>`:`<span class="success-tag">🎉 Спасибо за миссию!</span>`}</section>`;}
function roomView(s){if(s.stage==='lobby')return `${header()}${lobby(s)}<p class="footer-note">Игра для занятия по искусственному интеллекту • 2–10 участников • без регистрации детей</p>`;
 const main=s.stage==='signal'?signal(s):s.stage==='train'?training(s):s.stage==='maze'?maze(s):s.stage==='finale'?finale(s):winner(s);
 return `${header()}${s.stage==='win'?main:`<div class="room-head"><div><p class="eyebrow">Операция «Полярная станция»</p><h1>${s.host?'Пульт ведущего':`Твой пульт: ${esc(s.myself.role.name)}`}</h1></div><span class="status-pill">${s.host?'🧑‍🏫 Ведущий':s.myself.role.icon+' '+esc(s.myself.name)}</span></div><div class="layout"><div class="glass panel">${main}</div><div>${roster(s)}<div class="glass panel" style="margin-top:18px"><p class="section-label">Совет станции</p><p class="hint small">Договаривайтесь вслух. У каждого игрока свои секреты, предметы или кнопки — в одиночку пройти миссию не получится.</p><button class="btn outline small" data-action="copy-link">🔗 Ссылка на комнату</button></div></div></div>`}<p class="footer-note">Игра обучает принципам ИИ через действия: данные, команды, проверка ошибок и командная работа.</p>`;
}
function render(){app.innerHTML=snapshot?roomView(snapshot):room?(publicSnapshot?joinScreen():`${header()}<div class="loading-screen"><div class="loader">❄</div><p>Ищем полярную комнату…</p></div>`):landing();}
async function loadPublic(){
 if(!room||token)return;
 try{publicSnapshot=await fetchJson('/api/room?room='+encodeURIComponent(room));render();}
 catch(err){publicSnapshot=null;app.innerHTML=`${header()}<div class="glass panel"><h2>🔎 Пока не удаётся войти</h2><p class="hint">${esc(err.message)}</p><p class="hint small">Если сервер Render перезапустился, ведущему нужно снова открыть свою ссылку. Комната восстановится с тем же кодом, и вы сможете занять роль заново. Эта страница повторит подключение автоматически.</p><button class="btn outline" data-action="reload-room">🔄 Попробовать снова</button><button class="btn primary" data-action="go-home">На главную</button></div>`;}
}
async function connect(){
 if(stream)stream.close();clearTimeout(reconnectTimer);reconnectTimer=null;connection='на связи';
 try{snapshot=await fetchJson(`/api/state?room=${encodeURIComponent(room)}&token=${encodeURIComponent(token)}`);render();}
 catch(err){
   // In-memory rooms disappear if the free Render instance restarts.
   if(isHostSession(room,token)&&/комната закрыта|комната не найдена/i.test(err.message)){
     try{
       const out=await post('/api/recover',{room,token});
       snapshot=await fetchJson(`/api/state?room=${encodeURIComponent(room)}&token=${encodeURIComponent(token)}`);
       render();
       if(out.recovered)notification('Комната восстановлена! Попросите учеников снова выбрать роли.');
     }catch(recoveryErr){dismissSession();notification(recoveryErr.message);return loadPublic();}
   }else{dismissSession();notification(err.message);return loadPublic();}
 }
 stream=new EventSource(`/api/stream?room=${encodeURIComponent(room)}&token=${encodeURIComponent(token)}`);
 stream.addEventListener('state',e=>{try{snapshot=JSON.parse(e.data);connection='на связи';render();}catch{}});
 stream.addEventListener('removed',()=>{dismissSession();notification('Ведущий освободил твою роль.');loadPublic();});
 stream.onerror=()=>{
   connection='переподключение…';const badge=document.getElementById('connection');if(badge)badge.textContent=connection;
   if(!reconnectTimer)reconnectTimer=setTimeout(()=>{reconnectTimer=null;if(room&&token)connect();},6500);
 };
}
async function action(a,data={}){
 if(loading)return;loading=true;
 try{
  if(a==='create'){
    const out=await post('/api/create');roomURL(out.room);token=out.token;persist(room,token);rememberHost(room,token);await connect();notification('Комната готова! Отправьте ссылку детям.');
  }else if(a==='enter-room'){
    const code=(document.getElementById('room-code')?.value||'').trim().toUpperCase();
    if(!/^[A-Z0-9]{5}$/.test(code))throw new Error('Введите код комнаты из пяти символов.');
    roomURL(code);selectedRole='';publicSnapshot=null;await loadPublic();
  }else if(a==='select-role'){
    selectedRole=data.role;render();
  }else if(a==='join'){
    const input=document.getElementById('nickname');nickname=(input?.value||nickname).trim();
    if(!selectedRole)throw new Error('Сначала выбери роль!');
    const out=await post('/api/join',{room,roleId:selectedRole,name:nickname});token=out.token;persist(room,token);await connect();
  }else if(a==='copy-link'){
    const link=shareLink(room);
    try{await navigator.clipboard.writeText(link);notification('Ссылка скопирована!');}
    catch{window.prompt('Скопируйте ссылку:',link);}
  }else if(a==='go-home'){
    dismissSession();room='';publicSnapshot=null;selectedRole='';history.replaceState(null,'',location.pathname);render();
  }else if(a==='reload-room')await loadPublic();
  else{
    if(a==='host-reset'&&!confirm('Начать игру заново? Все игроки сохранят свои роли.'))return;
    if(a==='host-skip'&&!confirm('Пропустить текущую станцию для всей команды?'))return;
    if(a==='kick'&&!confirm('Освободить роль этого участника?'))return;
    await post('/api/action',{room,token,action:a,playerId:data.id,parcelId:data.id,label:data.label,direction:data.dir});
  }
 }catch(err){notification(err.message);if(a==='join')await loadPublic();}finally{loading=false;}
}
app.addEventListener('input',event=>{if(event.target.id==='nickname')nickname=event.target.value;});
app.addEventListener('click',event=>{const node=event.target.closest('[data-action]');if(!node||node.disabled)return;const actionName=node.dataset.action;action(actionName,{role:node.dataset.role,id:node.dataset.id,label:node.dataset.label,dir:node.dataset.dir});});
setInterval(()=>{
 if(snapshot?.stage==='finale'&&snapshot.finale?.active){const el=document.querySelector('[data-countdown]');if(el)el.textContent=String(Math.max(0,Math.ceil((snapshot.finale.endsAt-Date.now())/1000)));}
},200);
setInterval(()=>{if(room&&!token&&(!publicSnapshot||publicSnapshot.stage==='lobby'))loadPublic();},6000);
if(room){token=sessionStorage.getItem(keyFor(room))||localStorage.getItem(hostKeyFor(room))||'';if(token)connect();else loadPublic();}else render();
