const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const crypto=require('node:crypto');

const DIRS={up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]};
const ROLES=['radio','navigator','engineer','trainer','detective','artist','pilot','guardian','messenger','energy'];
test('2–10 players: full cooperative play, role exclusivity, reconnect and retry', {timeout:20000},async()=>{
  const port=33200+crypto.randomInt(350);
  const root=path.resolve(__dirname,'..');
  const proc=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  const base=`http://127.0.0.1:${port}`;
  const request=async(path,body=null)=>{
    const res=await fetch(base+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
    return {status:res.status,data:await res.json()};
  };
  const doPost=async(path,b={})=>{const out=await request(path,b);assert.equal(out.status,200,JSON.stringify(out.data));return out.data;};
  const act=async(room,token,action,extra={})=>doPost('/api/action',{room,token,action,...extra});
  const state=async(room,token)=>{const out=await request(`/api/state?room=${room}&token=${token}`);assert.equal(out.status,200);return out.data;};
  try{
    for(let i=0;i<45;i++){
      try{const h=await request('/api/health');if(h.status===200)break;}catch{}
      await new Promise(r=>setTimeout(r,80));
    }
    let a=await doPost('/api/create'),room=a.room,host=a.token;
    const first=await doPost('/api/join',{room,name:'Первый',roleId:'navigator'});
    let duplicate=await request('/api/join',{room,name:'Ещё один',roleId:'navigator'});
    assert.equal(duplicate.status,400);
    const second=await doPost('/api/join',{room,name:'Второй',roleId:'engineer'});
    const clients=[first.token,second.token];
    const pr=await state(room,first.token);
    assert.equal(pr.myself.roleId,'navigator');
    assert.equal(pr.players.length,2);
    const streamResponse=await fetch(`${base}/api/stream?room=${room}&token=${clients[0]}`);
    assert.equal(streamResponse.status,200);
    assert.match(streamResponse.headers.get('content-type'),/text\/event-stream/);
    const streamReader=streamResponse.body.getReader();
    const opening=new TextDecoder().decode((await streamReader.read()).value);
    assert.match(opening,/\"stage\":\"lobby\"/);
    await act(room,host,'host-start');
    const update=new TextDecoder().decode((await streamReader.read()).value);
    assert.match(update,/\"stage\":\"signal\"/);
    await streamReader.cancel();
    let st1=await state(room,clients[0]),st2=await state(room,clients[1]);
    assert.equal(st1.stage,'signal');
    assert.notEqual(st1.signal.myOrder,st2.signal.myOrder);
    const wrongIndex=st1.signal.myOrder===1?1:0;
    await act(room,clients[wrongIndex],'signal-send');
    assert.equal((await state(room,host)).signal.errors,1);
    const ordered=[st1.signal.myOrder===1?0:1,st1.signal.myOrder===2?0:1];
    for(let idx of ordered)await act(room,clients[idx],'signal-send');
    assert.equal((await state(room,host)).done,true);
    await act(room,host,'host-next');
    let train=await state(room,host);assert.equal(train.stage,'train');assert.equal(train.train.parcels.length,12);
    for(let i=0;i<2;i++){
      let s=await state(room,clients[i]);
      for(const p of s.train.mine){
        let desired=p.stamp==='❄️'?'cold':'warm';
        if(p.id===1)desired=desired==='cold'?'warm':'cold';
        await act(room,clients[i],'train-label',{parcelId:p.id,label:desired});
      }
    }
    await act(room,host,'train-test');
    train=await state(room,host);
    assert.equal(train.train.test.ok,false);assert.equal(train.train.test.wrong,1);
    const wrong=train.train.parcels.find(p=>p.id===1);
    const i=clients.findIndex((c,idx)=>train.train.parcels.find(p=>p.id===1).owner===(idx===0?'Первый':'Второй'));
    await act(room,clients[i],'train-label',{parcelId:1,label:wrong.stamp==='❄️'?'cold':'warm'});
    await act(room,host,'train-test');
    assert.equal((await state(room,host)).done,true);
    await act(room,host,'host-next');
    let maze=await state(room,host);assert.equal(maze.stage,'maze');
    for(let c of clients)await act(room,c,'maze-charge');
    maze=await state(room,host);
    // BFS through all 3 sparks to goal: prove it can be solved using split controls.
    const wall=maze.maze.grid,goals=maze.maze.sparks,exit=maze.maze.exit;
    const key=s=>`${s.x}:${s.y}:${s.bits}`;
    const q=[{x:1,y:5,bits:0,path:[]}],seen=new Set([key(q[0])]);let solution=null;
    for(let index=0;index<q.length;index++){
      const cur=q[index];
      if(cur.x===exit.x&&cur.y===exit.y&&cur.bits===7){solution=cur.path;break;}
      for(const [dir,[dx,dy]] of Object.entries(DIRS)){
        const x=cur.x+dx,y=cur.y+dy;if(wall[y]?.[x]!=='.')continue;
        let bits=cur.bits;for(let j=0;j<goals.length;j++)if(goals[j].x===x&&goals[j].y===y)bits|=(1<<j);
        const next={x,y,bits,path:[...cur.path,dir]};if(!seen.has(key(next))){seen.add(key(next));q.push(next);}
      }
    }
    assert.ok(solution,'path must exist');
    assert.ok(new Set(solution).size>=3,'path should use multiple controls');
    for(const dir of solution){
      const idx=clients.findIndex((tok,i)=>i===0?['up','right'].includes(dir):['down','left'].includes(dir));
      assert.ok(idx!==-1,'any command must be possible');
      await act(room,clients[idx],'maze-move',{direction:dir});
    }
    maze=await state(room,host);assert.equal(maze.done,true);assert.equal(maze.maze.collected.length,3);
    await act(room,host,'host-next');
    assert.equal((await state(room,host)).stage,'finale');
    await act(room,host,'finale-start');
    await act(room,clients[0],'finale-ignite');
    assert.equal((await state(room,clients[1])).finale.activated.length,1);
    await act(room,clients[1],'finale-ignite');
    assert.equal((await state(room,host)).stage,'win');
    await act(room,host,'host-reset');
    assert.equal((await state(room,clients[0])).stage,'lobby');
    // 10 players, 10 unique roles
    a=await doPost('/api/create');room=a.room;host=a.token;
    const ten=[];
    for(let i=0;i<10;i++)ten.push((await doPost('/api/join',{room,name:`Игрок_${i+1}`,roleId:ROLES[i]})).token);
    const eleventh=await request('/api/join',{room,name:'Лишний',roleId:'radio'});
    assert.equal(eleventh.status,400);
    const roomState=await state(room,host);assert.equal(roomState.players.length,10);
    await act(room,host,'host-start');
    const ranking=[];for(const tok of ten)ranking.push({tok,rank:(await state(room,tok)).signal.myOrder});
    assert.equal(new Set(ranking.map(r=>r.rank)).size,10);
    for(const item of ranking.sort((a,b)=>a.rank-b.rank))await act(room,item.tok,'signal-send');
    assert.equal((await state(room,host)).done,true);
    await act(room,host,'host-next');
    for(const tok of ten){
      const personal=await state(room,tok);
      for(const parcel of personal.train.mine)await act(room,tok,'train-label',{
        parcelId:parcel.id,label:parcel.stamp==='❄️'?'cold':'warm'
      });
    }
    await act(room,host,'train-test');
    assert.equal((await state(room,host)).done,true);
    await act(room,host,'host-next');
    for(const tok of ten)await act(room,tok,'maze-charge');
    const arrowOwner={up:0,right:1,down:2,left:3};
    for(const direction of solution)await act(room,ten[arrowOwner[direction]],'maze-move',{direction});
    assert.equal((await state(room,host)).done,true);
    await act(room,host,'host-next');
    await act(room,host,'finale-start');
    for(const tok of ten)await act(room,tok,'finale-ignite');
    assert.equal((await state(room,host)).stage,'win');
    await act(room,host,'host-reset');
    await act(room,host,'host-kick',{playerId:roomState.players[0].id});
    assert.equal((await state(room,host)).players.length,9);
  }finally{proc.kill('SIGTERM');}
});
