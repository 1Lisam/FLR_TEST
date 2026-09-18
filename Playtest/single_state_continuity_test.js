(function(){'use strict';
const E=window.FLRPG_CONTINUOUS_CORE,P=window.FLRPG_PROTAGONIST_MATCH_CONTROLLER,$=id=>document.getElementById(id);
const canvas=$('pitch'),ctx=canvas.getContext('2d');let trial=1,s=null,phase='IDLE',started=false,last=performance.now(),visibleAccumulator=0,eventCursor=0,replay=[],replayStartReal=0,replayStartGame=0,replayEndGame=0,replayKind=null,liveUntil=0,handledGoals=new Set(),searchTimer=null,livePrevFrame=null,liveCurrFrame=null,searchWallStarted=0,searchGameStarted=0;
const STEP=.10,VISIBLE_STEP=.05,MAX_HIDDEN_STEPS=100000,CPU_BUDGET_MS=180,UI_STATUS_INTERVAL_MS=1000;let lastHiddenUiAt=0;
function seed(){return `SINGLE-V56-${trial}-${$('hero').value}`;}
function log(t){const d=document.createElement('div');d.className='row';d.textContent=t;$('log').prepend(d);while($('log').children.length>80)$('log').lastChild.remove();}
function setup(){phase='IDLE';started=false;handledGoals=new Set();eventCursor=0;replay=[];$('choices').hidden=true;$('choices').innerHTML='';$('result').textContent='';s=P.create(seed(),{heroPlayerId:$('hero').value,mode:'DECISIVE_ONLY',replaySeconds:12,fastReplayHistory:true});$('seed').textContent='SEED '+seed();draw(E.snapshot(s.m));meta();$('state').textContent='단일 상태 생성 완료';$('log').innerHTML='';log('경기 상태 생성 1회 · 이후 재생성 없음');}
function px(x){return 28+x/105*(canvas.width-56)}function py(y){return 24+y/68*(canvas.height-48)}
function draw(f){if(!f)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#315b37';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=3;ctx.strokeRect(28,24,canvas.width-56,canvas.height-48);ctx.beginPath();ctx.moveTo(px(52.5),24);ctx.lineTo(px(52.5),canvas.height-24);ctx.stroke();ctx.beginPath();ctx.arc(px(52.5),py(34),50,0,Math.PI*2);ctx.stroke();ctx.strokeRect(px(0),py(13.84),px(16.5)-px(0),py(54.16)-py(13.84));ctx.strokeRect(px(88.5),py(13.84),px(105)-px(88.5),py(54.16)-py(13.84));
 for(const p of f.players||[]){ctx.beginPath();ctx.fillStyle=p.team==='HOME'?(p.role==='GK'?'#7dd3fc':'#2563eb'):(p.role==='GK'?'#fca5a5':'#dc2626');ctx.arc(px(p.x),py(p.y),p.id===$('hero').value?14:10,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=p.id===$('hero').value?3:1.5;ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 8px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.slot||p.role,px(p.x),py(p.y));}
 const b=f.ball;ctx.beginPath();ctx.fillStyle='#fff';ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.arc(px(b.x),py(b.y),7,0,Math.PI*2);ctx.fill();ctx.stroke();}
function interpolateFrame(a,b,t){
  if(!a||!b)return b||a;
  const mix=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)?x+(y-x)*t:(Number.isFinite(y)?y:x);
  const byId=new Map((b.players||[]).map(p=>[p.id,p]));
  return{...b,time:mix(a.time,b.time),ball:{...b.ball,x:mix(a.ball?.x,b.ball?.x),y:mix(a.ball?.y,b.ball?.y),z:mix(a.ball?.z,b.ball?.z)},
    players:(a.players||[]).map(pa=>{const pb=byId.get(pa.id)||pa;return{...pb,x:mix(pa.x,pb.x),y:mix(pa.y,pb.y),vx:mix(pa.vx,pb.vx),vy:mix(pa.vy,pb.vy)};})};
}
function replayFrameAt(target){
  if(!replay.length)return null;
  if(target<=replay[0].time)return replay[0];
  for(let i=1;i<replay.length;i++){
    if(replay[i].time>=target){const a=replay[i-1],b=replay[i],span=Math.max(.001,b.time-a.time);return interpolateFrame(a,b,Math.max(0,Math.min(1,(target-a.time)/span)));}
  }
  return replay.at(-1);
}
function sceneDiagnostic(frame){
  if(!frame?.players)return;
  const blueBack=frame.players.filter(p=>p.team==='HOME'&&(p.role==='CB'||p.role==='FB'));
  if(blueBack.length>=4){
    const txs=blueBack.map(p=>Number.isFinite(p.tx)?p.tx:p.x),xs=blueBack.map(p=>p.x),targetSpread=Math.max(...txs)-Math.min(...txs),liveSpread=Math.max(...xs)-Math.min(...xs);
    log('진단 · 블루 수비4 현재 X폭 '+liveSpread.toFixed(1)+'m / 목표 X폭 '+targetSpread.toFixed(1)+'m · '+blueBack.map(p=>p.slot+':'+(p.tacticalTask||p.action)+'→'+(Number.isFinite(p.tx)?p.tx.toFixed(1):'-')).join(' | '));
  }
  const other=frame.possession==='HOME'?'AWAY':frame.possession==='AWAY'?'HOME':null;
  if(other){
    const staticForwards=frame.players.filter(p=>p.team===other&&(p.role==='ST'||p.role==='WF')).filter(p=>Math.hypot(p.vx||0,p.vy||0)<.18&&Math.hypot((frame.ball?.x||0)-p.x,(frame.ball?.y||0)-p.y)>22);
    if(staticForwards.length)log('진단 · 공에서 먼 정지 공격수 '+staticForwards.map(p=>p.id+' '+(p.tacticalTask||p.action)+' pos('+p.x.toFixed(1)+','+p.y.toFixed(1)+') target('+(Number.isFinite(p.tx)?p.tx.toFixed(1):'-')+','+(Number.isFinite(p.ty)?p.ty.toFixed(1):'-')+')').join(' | '));
  }
}
function meta(){const sc=s?.m?.score||{HOME:0,AWAY:0},t=s?.m?.time||0;$('clock').textContent=Math.min(90,Math.floor(t/60)+1)+"'";$('score').textContent=sc.HOME+' - '+sc.AWAY;}
function currentFrame(){return E.snapshot(s.m)}
function recentActual(seconds=10,endTime=s.m.time){return (s.history||[]).filter(f=>f.time>=endTime-seconds-.001&&f.time<=endTime+.001).map(x=>JSON.parse(JSON.stringify(x)));}
function situationLabel(kind,endTime){
  const minute=Math.max(1,Math.floor((endTime||s.m.time)/60)+1);
  if(kind==='GOAL')return minute+"분 · 실제 득점 상황";
  if(kind==='CHOICE')return minute+"분 · 주인공 결정적 선택 상황";
  return minute+"분 · 중요 상황";
}
function finishSearchTiming(kind){
  if(!searchWallStarted)return;
  const wall=(performance.now()-searchWallStarted)/1000,game=Math.max(0,s.m.time-searchGameStarted),speed=wall>0?game/wall:0;
  log('스킵 속도 · '+(game/60).toFixed(1)+'분을 '+wall.toFixed(2)+'초 · 약 '+speed.toFixed(0)+'배속 · '+kind);
  searchWallStarted=0;
}
function startReplay(frames,kind,label){if(!frames?.length)return;clearSearchTimer();finishSearchTiming(kind);replay=frames;replayKind=kind;replayStartReal=performance.now()/1000;replayStartGame=frames[0].time;replayEndGame=frames.at(-1).time;phase='REPLAY';$('state').textContent=label||situationLabel(kind,replayEndGame);sceneDiagnostic(frames.at(-1));draw(frames[0]);meta();}
function replayTick(now){const elapsed=(now/1000-replayStartReal),target=replayStartGame+elapsed,f=replayFrameAt(target);draw(f);$('clock').textContent=Math.floor(f.time/60+1)+"'";$('score').textContent=f.score.HOME+' - '+f.score.AWAY;if(target>=replayEndGame-.001){if(replayKind==='CHOICE'){showChoices();}else{phase='SEARCHING';$('state').textContent='다음 중요 상황을 준비 중입니다…';meta();scheduleSearch();}}}
function showChoices(){phase='CHOICE';const box=$('choices');box.innerHTML='';box.hidden=false;$('state').textContent='주인공 선택 · 동일 상태 일시정지';for(const o of s.pending?.options||[]){const b=document.createElement('button');b.textContent=o.label||o.id;b.onclick=()=>choose(o.id,o.targetId||null);box.appendChild(b);}log(`${s.m.time.toFixed(1)}초 · 주인공 선택 발생 · 경기 상태 재생성 없음`);}
function choose(id,targetId){const r=P.applyChoice(s,id,targetId,{source:'SINGLE_STATE_TEST_UI'});if(!r.ok){log('선택 실패 '+(r.reason||''));return;}$('choices').hidden=true;$('result').textContent='선택: '+id+(targetId?' → '+targetId:'');phase='LIVE_RESULT';visibleAccumulator=0;liveUntil=s.m.time+12;livePrevFrame=liveCurrFrame=currentFrame();$('state').textContent='선택 결과 실제 속도 진행';}
function processEvents(){const ev=s.m.events||[];while(eventCursor<ev.length){const e=ev[eventCursor++];if(e.type==='GOAL'){const key=e.type+'|'+e.t+'|'+(e.team||'');if(handledGoals.has(key))continue;handledGoals.add(key);log(`${e.t.toFixed(1)}초 · 실제 GOAL 발생 · 같은 상태의 과거 10초 재생`);const frames=recentActual(10,e.t);startReplay(frames,'GOAL',situationLabel('GOAL',e.t));return true;}}return false;}
function clearSearchTimer(){if(searchTimer!=null){clearTimeout(searchTimer);searchTimer=null;}}
function beginSearchTiming(){
  if(!searchWallStarted){searchWallStarted=performance.now();searchGameStarted=s.m.time;}
  $('clock').textContent='…';
  $('state').textContent='다음 중요 상황 계산 중…';
}
function scheduleSearch(){if(started&&phase==='SEARCHING'&&searchTimer==null){beginSearchTiming();searchTimer=setTimeout(searchPump,0);}}
function searchPump(){
  searchTimer=null;
  if(!started||phase!=='SEARCHING')return;
  const began=performance.now();let n=0;
  while(n++<MAX_HIDDEN_STEPS&&performance.now()-began<CPU_BUDGET_MS&&phase==='SEARCHING'){
    P.step(s,STEP);
    if(s.pending){
      if(s.pending.chained){finishSearchTiming('연속 선택');log(s.m.time.toFixed(1)+'초 · 연속 선택 · 이전 장면에서 그대로 이어짐');showChoices();}
      else startReplay(P.latestReplay(s),'CHOICE',situationLabel('CHOICE',s.m.time));
      break;
    }
    if(processEvents())break;
    if(s.m.completed){finishSearchTiming('경기 종료');phase='COMPLETE';$('state').textContent='경기 종료';meta();log('경기 종료');break;}
  }
  const now=performance.now();
  if(phase==='SEARCHING'&&now-lastHiddenUiAt>=UI_STATUS_INTERVAL_MS){
    lastHiddenUiAt=now;$('clock').textContent='…';$('state').textContent='다음 중요 상황 계산 중…';
  }
  scheduleSearch();
}
function liveResultTick(){
  if(s.pending){showChoices();return;}
  livePrevFrame=liveCurrFrame||currentFrame();
  P.step(s,VISIBLE_STEP);processEvents();
  liveCurrFrame=currentFrame();meta();
  if(phase!=='LIVE_RESULT')return;
  if(s.pending){showChoices();return;}
  if((!s.resultTracker&&!s.activeEpisode)||s.m.time>=liveUntil){
    $('result').textContent=s.lastResult?.headline||'플레이 종료';phase='SEARCHING';$('state').textContent='다음 중요 상황을 준비 중입니다…';scheduleSearch();
  }
}
function loop(now){
  const dt=Math.min(.10,(now-last)/1000);last=now;
  if(started){
    if(phase==='REPLAY')replayTick(now);
    else if(phase==='LIVE_RESULT'){
      visibleAccumulator+=dt;
      let guard=0;
      while(visibleAccumulator>=VISIBLE_STEP&&guard++<4&&phase==='LIVE_RESULT'){
        visibleAccumulator-=VISIBLE_STEP;
        liveResultTick();
      }
      if(phase==='LIVE_RESULT'&&livePrevFrame&&liveCurrFrame)draw(interpolateFrame(livePrevFrame,liveCurrFrame,Math.max(0,Math.min(1,visibleAccumulator/VISIBLE_STEP))));
    }
  }
  requestAnimationFrame(loop);
}
$('start').onclick=()=>{if(phase==='IDLE'||phase==='COMPLETE'){started=true;phase='SEARCHING';searchWallStarted=0;searchGameStarted=s.m.time;$('clock').textContent='…';$('state').textContent='다음 중요 상황 계산 중…';lastHiddenUiAt=0;log('경기 시작 · 결정적 상황까지 화면 없이 동일 상태 고속 진행');scheduleSearch();}};
$('same').onclick=()=>setup();$('new').onclick=()=>{trial++;setup()};$('hero').onchange=setup;setup();requestAnimationFrame(loop);
})();