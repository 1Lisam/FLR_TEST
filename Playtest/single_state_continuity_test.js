(function(){'use strict';
const E=window.FLRPG_CONTINUOUS_CORE,P=window.FLRPG_PROTAGONIST_MATCH_CONTROLLER,$=id=>document.getElementById(id);
const canvas=$('pitch'),ctx=canvas.getContext('2d');let trial=1,s=null,phase='IDLE',started=false,last=performance.now(),visibleAccumulator=0,eventCursor=0,replay=[],replayStartReal=0,replayStartGame=0,replayEndGame=0,replayKind=null,liveUntil=0,handledGoals=new Set();
const STEP=.10,MAX_HIDDEN_STEPS=96,CPU_BUDGET_MS=5,UI_STATUS_INTERVAL_MS=250;let lastHiddenUiAt=0;
function seed(){return `SINGLE-V56-${trial}-${$('hero').value}`;}
function log(t){const d=document.createElement('div');d.className='row';d.textContent=t;$('log').prepend(d);while($('log').children.length>80)$('log').lastChild.remove();}
function setup(){phase='IDLE';started=false;handledGoals=new Set();eventCursor=0;replay=[];$('choices').hidden=true;$('choices').innerHTML='';$('result').textContent='';s=P.create(seed(),{heroPlayerId:$('hero').value,mode:'DECISIVE_ONLY',replaySeconds:12});$('seed').textContent='SEED '+seed();draw(E.snapshot(s.m));meta();$('state').textContent='단일 상태 생성 완료';$('log').innerHTML='';log('경기 상태 생성 1회 · 이후 재생성 없음');}
function px(x){return 28+x/105*(canvas.width-56)}function py(y){return 24+y/68*(canvas.height-48)}
function draw(f){if(!f)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#315b37';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=3;ctx.strokeRect(28,24,canvas.width-56,canvas.height-48);ctx.beginPath();ctx.moveTo(px(52.5),24);ctx.lineTo(px(52.5),canvas.height-24);ctx.stroke();ctx.beginPath();ctx.arc(px(52.5),py(34),50,0,Math.PI*2);ctx.stroke();ctx.strokeRect(px(0),py(13.84),px(16.5)-px(0),py(54.16)-py(13.84));ctx.strokeRect(px(88.5),py(13.84),px(105)-px(88.5),py(54.16)-py(13.84));
 for(const p of f.players||[]){ctx.beginPath();ctx.fillStyle=p.team==='HOME'?(p.role==='GK'?'#7dd3fc':'#2563eb'):(p.role==='GK'?'#fca5a5':'#dc2626');ctx.arc(px(p.x),py(p.y),p.id===$('hero').value?14:10,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=p.id===$('hero').value?3:1.5;ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 8px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.slot||p.role,px(p.x),py(p.y));}
 const b=f.ball;ctx.beginPath();ctx.fillStyle='#fff';ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.arc(px(b.x),py(b.y),7,0,Math.PI*2);ctx.fill();ctx.stroke();}
function meta(){const sc=s?.m?.score||{HOME:0,AWAY:0},t=s?.m?.time||0;$('clock').textContent=Math.min(90,Math.floor(t/60)+1)+"'";$('score').textContent=sc.HOME+' - '+sc.AWAY;}
function currentFrame(){return E.snapshot(s.m)}
function recentActual(seconds=10,endTime=s.m.time){return (s.history||[]).filter(f=>f.time>=endTime-seconds-.001&&f.time<=endTime+.001).map(x=>JSON.parse(JSON.stringify(x)));}
function situationLabel(kind,endTime){
  const minute=Math.max(1,Math.floor((endTime||s.m.time)/60)+1);
  if(kind==='GOAL')return minute+"분 · 실제 득점 상황";
  if(kind==='CHOICE')return minute+"분 · 주인공 결정적 선택 상황";
  return minute+"분 · 중요 상황";
}
function startReplay(frames,kind,label){if(!frames?.length)return;replay=frames;replayKind=kind;replayStartReal=performance.now()/1000;replayStartGame=frames[0].time;replayEndGame=frames.at(-1).time;phase='REPLAY';$('state').textContent=label||situationLabel(kind,replayEndGame);draw(frames[0]);meta();}
function replayTick(now){const elapsed=(now/1000-replayStartReal),target=replayStartGame+elapsed;let f=replay[0];for(const row of replay){if(row.time<=target+.001)f=row;else break;}draw(f);$('clock').textContent=Math.floor(f.time/60+1)+"'";$('score').textContent=f.score.HOME+' - '+f.score.AWAY;if(target>=replayEndGame-.001){if(replayKind==='CHOICE'){showChoices();}else{phase='SEARCHING';$('state').textContent='다음 중요 상황을 준비 중입니다…';meta();}}}
function showChoices(){phase='CHOICE';const box=$('choices');box.innerHTML='';box.hidden=false;$('state').textContent='주인공 선택 · 동일 상태 일시정지';for(const o of s.pending?.options||[]){const b=document.createElement('button');b.textContent=o.label||o.id;b.onclick=()=>choose(o.id,o.targetId||null);box.appendChild(b);}log(`${s.m.time.toFixed(1)}초 · 주인공 선택 발생 · 경기 상태 재생성 없음`);}
function choose(id,targetId){const r=P.applyChoice(s,id,targetId,{source:'SINGLE_STATE_TEST_UI'});if(!r.ok){log('선택 실패 '+(r.reason||''));return;}$('choices').hidden=true;$('result').textContent='선택: '+id+(targetId?' → '+targetId:'');phase='LIVE_RESULT';visibleAccumulator=0;liveUntil=s.m.time+12;$('state').textContent='선택 결과 실제 속도 진행';}
function processEvents(){const ev=s.m.events||[];while(eventCursor<ev.length){const e=ev[eventCursor++];if(e.type==='GOAL'){const key=e.type+'|'+e.t+'|'+(e.team||'');if(handledGoals.has(key))continue;handledGoals.add(key);log(`${e.t.toFixed(1)}초 · 실제 GOAL 발생 · 같은 상태의 과거 10초 재생`);const frames=recentActual(10,e.t);startReplay(frames,'GOAL',situationLabel('GOAL',e.t));return true;}}return false;}
function hiddenTick(){
  const began=performance.now();let n=0;
  while(n++<MAX_HIDDEN_STEPS&&performance.now()-began<CPU_BUDGET_MS&&phase==='SEARCHING'){
    P.step(s,STEP);
    if(s.pending){startReplay(P.latestReplay(s),'CHOICE',situationLabel('CHOICE',s.m.time));break;}
    if(processEvents())break;
    if(s.m.completed){phase='COMPLETE';$('state').textContent='경기 종료';log('경기 종료');break;}
  }
  const now=performance.now();
  if(phase==='SEARCHING'&&now-lastHiddenUiAt>=UI_STATUS_INTERVAL_MS){
    lastHiddenUiAt=now;meta();$('state').textContent='다음 중요 상황을 준비 중입니다…';
  }
}
function liveResultTick(){if(s.pending){showChoices();return;}P.step(s,STEP);processEvents();draw(currentFrame());meta();if(phase!=='LIVE_RESULT')return;if(s.pending){showChoices();return;}if((!s.resultTracker&&!s.activeEpisode)||s.m.time>=liveUntil){$('result').textContent=s.lastResult?.headline||'플레이 종료';phase='SEARCHING';$('state').textContent='다음 중요 상황을 준비 중입니다…';}}
function loop(now){
  const dt=Math.min(.10,(now-last)/1000);last=now;
  if(started){
    if(phase==='SEARCHING')hiddenTick();
    else if(phase==='REPLAY')replayTick(now);
    else if(phase==='LIVE_RESULT'){
      visibleAccumulator+=dt;
      let guard=0;
      while(visibleAccumulator>=STEP&&guard++<3&&phase==='LIVE_RESULT'){
        visibleAccumulator-=STEP;
        liveResultTick();
      }
    }
  }
  requestAnimationFrame(loop);
}
$('start').onclick=()=>{if(phase==='IDLE'||phase==='COMPLETE'){started=true;phase='SEARCHING';$('state').textContent='다음 중요 상황을 준비 중입니다…';lastHiddenUiAt=0;log('경기 시작 · 결정적 상황까지 화면 없이 동일 상태 고속 진행');}};
$('same').onclick=()=>setup();$('new').onclick=()=>{trial++;setup()};$('hero').onchange=setup;setup();requestAnimationFrame(loop);
})();