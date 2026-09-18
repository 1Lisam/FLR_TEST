(function(){'use strict';
const E=window.FLRPG_CONTINUOUS_CORE,P=window.FLRPG_PROTAGONIST_MATCH_CONTROLLER,M=window.FLRPG_MANAGER_TENDENCY_ADAPTER,A=window.FLRPG_ATTRIBUTE_MATCH_ADAPTER,$=id=>document.getElementById(id);
const canvas=$('pitch'),ctx=canvas.getContext('2d');let sceneNoticeTimer=null;let trial=1,s=null,phase='IDLE',started=false,last=performance.now(),visibleAccumulator=0,eventCursor=0,replay=[],replayStartReal=0,replayStartGame=0,replayEndGame=0,replayKind=null,liveUntil=0,handledGoals=new Set(),searchTimer=null,livePrevFrame=null,liveCurrFrame=null,searchWallStarted=0,searchGameStarted=0,choiceInputLocked=false,activeTab='main',compareRunning=false,comparePaused=false,compareElapsed=0,compareAccumulator=0,compareStates=[],compareRecording=[],compareReplayFrames=null,compareReplayIndex=0,compareReplayPlaying=false,compareView='ALL',focusPlayerId='';
const STEP=.10,VISIBLE_STEP=.05,VISIBLE_SPEED=2.00,MAX_HIDDEN_STEPS=100000,CPU_BUDGET_MS=300,UI_STATUS_INTERVAL_MS=1000;let lastHiddenUiAt=0;
function seed(){return `SINGLE-V56-${trial}-${$('hero').value}`;}
function showSceneNotice(text,persistent=false){
  const box=$('sceneNotice');if(!box)return;
  clearTimeout(sceneNoticeTimer);box.textContent=text;box.hidden=false;
  if(!persistent)sceneNoticeTimer=setTimeout(()=>{box.hidden=true;},900);
}
function hideSceneNotice(){clearTimeout(sceneNoticeTimer);const box=$('sceneNotice');if(box)box.hidden=true;}
function log(t){const d=document.createElement('div');d.className='row';d.textContent=t;$('log').prepend(d);while($('log').children.length>80)$('log').lastChild.remove();}
function setup(){hideSceneNotice();phase='IDLE';started=false;handledGoals=new Set();eventCursor=0;replay=[];$('choices').hidden=true;$('choices').innerHTML='';$('result').textContent='';s=P.create(seed(),{heroPlayerId:$('hero').value,mode:'DECISIVE_ONLY',replaySeconds:12,fastReplayHistory:true,fastReplayHistoryInterval:.20});s.m.offBallPolicy=$('offballPolicy')?.value||'CURRENT';$('seed').textContent='SEED '+seed()+' · '+s.m.offBallPolicy;draw(E.snapshot(s.m));meta();$('state').textContent='단일 상태 생성 완료';$('log').innerHTML='';log('경기 상태 생성 1회 · 이후 재생성 없음 · 오프더볼 정책 '+s.m.offBallPolicy);}
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
function offBallStructureDiagnostic(frame){
  if(!frame?.players)return;
  const policy=s?.m?.offBallPolicy||'CURRENT',teams=['HOME','AWAY'];
  for(const team of teams){
    const ps=frame.players.filter(p=>p.team===team&&p.role!=='GK');
    const back=ps.filter(p=>p.role==='CB'||p.role==='FB');
    if(back.length>=4){
      const xs=back.map(p=>p.x),spread=Math.max(...xs)-Math.min(...xs),nearSame=back.slice().sort((a,b)=>a.x-b.x);
      let tiny=0;for(let i=1;i<nearSame.length;i++)if(Math.abs(nearSame[i].x-nearSame[i-1].x)<.35)tiny++;
      log('구조진단 '+team+' · '+policy+' · 수비4 깊이폭 '+spread.toFixed(2)+'m · 거의 같은 열 쌍 '+tiny);
    }
    const stationary=ps.filter(p=>Math.hypot(p.vx||0,p.vy||0)<.12&&Math.hypot((frame.ball?.x||0)-p.x,(frame.ball?.y||0)-p.y)>18);
    if(stationary.length>=3)log('구조진단 '+team+' · 공과 먼 정지 선수 '+stationary.length+'명 · '+stationary.map(p=>p.slot+':'+(p.tacticalTask||p.action)).join(' | '));
    const depth={ST:[],WF:[],CM:[],FB:[],CB:[]};
    for(const p of ps)if(depth[p.role])depth[p.role].push(p.x);
    const avg=r=>depth[r].length?depth[r].reduce((a,b)=>a+b,0)/depth[r].length:null;
    const st=avg('ST'),cm=avg('CM');
    if(st!=null&&cm!=null){
      const attackDir=team==='HOME'?1:-1,relative=(st-cm)*attackDir;
      if(relative<-1.5)log('구조진단 '+team+' · 전후관계 역전 가능 · ST가 CM보다 '+Math.abs(relative).toFixed(1)+'m 뒤');
    }
  }
}
function sceneDiagnostic(frame){
  if(!frame?.players)return;
  offBallStructureDiagnostic(frame);
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
function startReplay(frames,kind,label){if(!frames?.length)return;clearSearchTimer();finishSearchTiming(kind);showSceneNotice(label||situationLabel(kind,frames.at(-1)?.time),false);replay=frames;replayKind=kind;replayStartReal=performance.now()/1000;replayStartGame=frames[0].time;replayEndGame=frames.at(-1).time;phase='REPLAY';$('state').textContent=label||situationLabel(kind,replayEndGame);sceneDiagnostic(frames.at(-1));draw(frames[0]);meta();}
function replayTick(now){const elapsed=(now/1000-replayStartReal)*VISIBLE_SPEED,target=replayStartGame+elapsed,f=replayFrameAt(target);draw(f);$('clock').textContent=Math.floor(f.time/60+1)+"'";$('score').textContent=f.score.HOME+' - '+f.score.AWAY;if(target>=replayEndGame-.001){if(replayKind==='CHOICE'){showChoices();}else{phase='SEARCHING';$('state').textContent='다음 상황까지 진행 중입니다…';meta();scheduleSearch();}}}
function showChoices(){hideSceneNotice();phase='CHOICE';choiceInputLocked=false;const box=$('choices');box.replaceChildren();box.hidden=false;box.style.display='grid';$('state').textContent='주인공 선택 · 동일 상태 일시정지';for(const o of s.pending?.options||[]){const b=document.createElement('button');b.textContent=o.label||o.id;b.onclick=()=>choose(o.id,o.targetId||null);box.appendChild(b);}log(`${s.m.time.toFixed(1)}초 · 주인공 선택 발생 · 경기 상태 재생성 없음`);}
function choose(id,targetId){if(choiceInputLocked)return;choiceInputLocked=true;const box=$('choices');box.hidden=true;box.style.display='none';box.replaceChildren();const r=P.applyChoice(s,id,targetId,{source:'SINGLE_STATE_TEST_UI'});if(!r.ok){choiceInputLocked=false;log('선택 실패 '+(r.reason||''));showChoices();return;}$('result').textContent='선택: '+id+(targetId?' → '+targetId:'');phase='LIVE_RESULT';visibleAccumulator=0;liveUntil=s.m.time+12;livePrevFrame=liveCurrFrame=currentFrame();$('state').textContent='선택 결과 2배속 진행';}
function processEvents(){const ev=s.m.events||[];while(eventCursor<ev.length){const e=ev[eventCursor++];if(e.type==='GOAL'){const key=e.type+'|'+e.t+'|'+(e.team||'');if(handledGoals.has(key))continue;handledGoals.add(key);log(`${e.t.toFixed(1)}초 · 실제 GOAL 발생 · 같은 상태의 과거 10초 재생`);const frames=recentActual(10,e.t);startReplay(frames,'GOAL',situationLabel('GOAL',e.t));return true;}}return false;}
function clearSearchTimer(){if(searchTimer!=null){clearTimeout(searchTimer);searchTimer=null;}}
function beginSearchTiming(){
  if(!searchWallStarted){searchWallStarted=performance.now();searchGameStarted=s.m.time;}
  $('clock').textContent='…';
  $('state').textContent='다음 상황까지 진행 중입니다…';
  showSceneNotice('다음 상황까지 진행 중입니다…',true);
}
function scheduleSearch(){if(activeTab==='main'&&started&&phase==='SEARCHING'&&searchTimer==null){beginSearchTiming();searchTimer=setTimeout(searchPump,0);}}
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
    if(s.m.completed){finishSearchTiming('경기 종료');hideSceneNotice();phase='COMPLETE';$('state').textContent='경기 종료';meta();log('경기 종료');break;}
  }
  const now=performance.now();
  if(phase==='SEARCHING'&&now-lastHiddenUiAt>=UI_STATUS_INTERVAL_MS){
    lastHiddenUiAt=now;$('clock').textContent='…';$('state').textContent='다음 상황까지 진행 중입니다…';
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
    $('result').textContent=s.lastResult?.headline||'플레이 종료';phase='SEARCHING';$('state').textContent='다음 상황까지 진행 중입니다…';scheduleSearch();
  }
}


function compareOptions(){
  return{
    trails:!!$('showTrails')?.checked,
    marks:!!$('showMarks')?.checked,
    targets:!!$('showTargets')?.checked,
    speed:Math.max(.25,Number($('compareSpeed')?.value)||1)
  };
}
function playerTone(p){return p.team==='HOME'?(p.role==='GK'?'#7dd3fc':'#2563eb'):(p.role==='GK'?'#fca5a5':'#dc2626');}
function drawMini(canvasEl,f,index=0,historyRows=[]){
  if(!canvasEl||!f)return;
  const c=canvasEl.getContext('2d'),w=canvasEl.width,h=canvasEl.height,mpx=x=>12+x/105*(w-24),mpy=y=>10+y/68*(h-20),opts=compareOptions();
  c.clearRect(0,0,w,h);c.fillStyle='#315b37';c.fillRect(0,0,w,h);c.strokeStyle='rgba(255,255,255,.72)';c.lineWidth=1.5;c.strokeRect(12,10,w-24,h-20);
  c.beginPath();c.moveTo(mpx(52.5),10);c.lineTo(mpx(52.5),h-10);c.stroke();c.beginPath();c.arc(mpx(52.5),mpy(34),20,0,Math.PI*2);c.stroke();
  c.strokeRect(mpx(0),mpy(13.84),mpx(16.5)-mpx(0),mpy(54.16)-mpy(13.84));c.strokeRect(mpx(88.5),mpy(13.84),mpx(105)-mpx(88.5),mpy(54.16)-mpy(13.84));

  const byId=new Map((f.players||[]).map(p=>[p.id,p]));
  const focus=focusPlayerId||'';

  if(opts.trails&&historyRows?.length){
    const cutoff=(historyRows.at(-1)?.t??0)-3;
    const recent=historyRows.filter(r=>r.t>=cutoff);
    const ids=focus?[focus]:(f.players||[]).filter(p=>p.role!=='GK').map(p=>p.id);
    for(const id of ids){
      const pts=[];
      for(const row of recent){const fr=row.frames?.[index]?.frame,p=fr?.players?.find(x=>x.id===id);if(p)pts.push(p);}
      if(pts.length<2)continue;
      c.beginPath();for(let i=0;i<pts.length;i++){const p=pts[i],x=mpx(p.x),y=mpy(p.y);if(i===0)c.moveTo(x,y);else c.lineTo(x,y);}
      c.strokeStyle=focus&&id===focus?'rgba(255,235,90,.95)':(pts.at(-1)?.team==='HOME'?'rgba(110,175,255,.24)':'rgba(255,130,130,.24)');
      c.lineWidth=focus&&id===focus?2.7:1.1;c.stroke();
    }
  }

  if(opts.targets){
    for(const p of f.players||[]){
      if(p.role==='GK'||!Number.isFinite(p.tx)||!Number.isFinite(p.ty))continue;
      if(focus&&p.id!==focus)continue;
      c.beginPath();c.moveTo(mpx(p.x),mpy(p.y));c.lineTo(mpx(p.tx),mpy(p.ty));c.strokeStyle=focus&&p.id===focus?'rgba(255,235,90,.72)':'rgba(255,255,255,.14)';c.lineWidth=focus&&p.id===focus?1.8:.8;c.stroke();
      c.beginPath();c.arc(mpx(p.tx),mpy(p.ty),focus&&p.id===focus?3.2:1.7,0,Math.PI*2);c.fillStyle=focus&&p.id===focus?'rgba(255,235,90,.9)':'rgba(255,255,255,.40)';c.fill();
    }
  }

  if(opts.marks){
    for(const p of f.players||[]){
      const tid=p.responsibilityTargetId||p.markTargetId;if(!tid)continue;
      if(focus&&p.id!==focus&&tid!==focus)continue;
      const q=byId.get(tid);if(!q)continue;
      c.beginPath();c.moveTo(mpx(p.x),mpy(p.y));c.lineTo(mpx(q.x),mpy(q.y));c.setLineDash([4,3]);c.strokeStyle=focus&&(p.id===focus||tid===focus)?'rgba(255,235,90,.95)':'rgba(255,210,110,.48)';c.lineWidth=focus&&(p.id===focus||tid===focus)?2.2:1;c.stroke();c.setLineDash([]);
    }
  }

  for(const p of f.players||[]){
    const selected=focus&&p.id===focus;
    c.beginPath();c.fillStyle=playerTone(p);c.arc(mpx(p.x),mpy(p.y),selected?6.7:(p.role==='GK'?4.2:3.7),0,Math.PI*2);c.fill();
    c.strokeStyle=selected?'#ffeb5a':'rgba(255,255,255,.9)';c.lineWidth=selected?2.5:.7;c.stroke();
    if(selected){c.fillStyle='#fffbcc';c.font='bold 10px system-ui';c.textAlign='center';c.fillText(p.slot||p.id,mpx(p.x),mpy(p.y)-9);}
  }
  const ball=f.ball;c.beginPath();c.fillStyle='#fff';c.strokeStyle='#111';c.lineWidth=1;c.arc(mpx(ball.x),mpy(ball.y),2.8,0,Math.PI*2);c.fill();c.stroke();
}
function createCompareMatch(policy){
  const m=E.createMatch(seed());
  if(A&&typeof A.assign==='function'){for(const p of m.players)A.assign(m,p.id,A.baseProfile(60));}
  if(M&&typeof M.init==='function')M.init(m,{HOME:'BALANCED',AWAY:'BALANCED'});
  m.offBallPolicy=policy;return m;
}
function compareSummary(m){
  const f=E.snapshot(m),field=f.players.filter(p=>p.role!=='GK'),stationary=field.filter(p=>Math.hypot(p.vx||0,p.vy||0)<.12&&Math.hypot(f.ball.x-p.x,f.ball.y-p.y)>18).length;
  let nearLinePairs=0;for(const team of ['HOME','AWAY']){const back=field.filter(p=>p.team===team&&(p.role==='CB'||p.role==='FB')).sort((a,b)=>a.x-b.x);for(let i=1;i<back.length;i++)if(Math.abs(back[i].x-back[i-1].x)<.35)nearLinePairs++;}
  let focusText='';
  if(focusPlayerId){const p=f.players.find(x=>x.id===focusPlayerId);if(p)focusText=' · '+p.id+' '+(p.tacticalTask||p.action||'-')+' · '+(p.responsibilityType||'-')+(p.responsibilityTargetId||p.markTargetId?'→'+(p.responsibilityTargetId||p.markTargetId):'');}
  return{f,text:(m.time).toFixed(1)+'초 · '+m.score.HOME+'-'+m.score.AWAY+' · 먼거리 정지 '+stationary+'명 · 같은열 '+nearLinePairs+'쌍'+focusText};
}
function populateFocusPlayers(){
  const sel=$('focusPlayer');if(!sel||!compareStates[0])return;const keep=focusPlayerId;sel.innerHTML='<option value="">없음</option>';
  for(const p of E.snapshot(compareStates[0].m).players||[]){const o=document.createElement('option');o.value=p.id;o.textContent=p.team+' · '+(p.slot||p.role)+' · '+p.id;sel.appendChild(o);}
  sel.value=keep;
}
function updateCompareView(){
  const grid=document.querySelector('.compare-grid');if(!grid)return;grid.classList.toggle('single',compareView!=='ALL');
  const cards=[...grid.querySelectorAll('.compare-card')];cards.forEach((card,i)=>card.classList.toggle('focused',compareView==='ALL'||compareView===['A','B','C'][i]));
  document.querySelectorAll('.viewMode').forEach(b=>b.classList.toggle('active',b.dataset.view===compareView));
}
function currentHistoryRows(){return compareReplayPlaying&&compareReplayFrames?compareReplayFrames:compareRecording;}
function renderCompareFrames(rowsOverride=null){
  const hist=rowsOverride||currentHistoryRows();
  for(let i=0;i<compareStates.length;i++){
    const q=compareStates[i];let row=null;
    if(compareReplayPlaying&&compareReplayFrames?.length)row=compareReplayFrames[compareReplayIndex]?.frames?.[i]||null;
    if(!row){const sum=compareSummary(q.m);row={frame:sum.f,text:sum.text};}
    q.lastFrame=row.frame;drawMini(q.canvas,row.frame,i,hist);q.stateEl.textContent=row.text;
  }
}
function focusFromCanvas(q,e){
  const f=q.lastFrame||E.snapshot(q.m),rect=q.canvas.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*105,y=(e.clientY-rect.top)/rect.height*68;
  let best=null,bd=999;for(const p of f.players||[]){const d=Math.hypot(p.x-x,p.y-y);if(d<bd){bd=d;best=p;}}
  if(best&&bd<8){focusPlayerId=best.id;if($('focusPlayer'))$('focusPlayer').value=focusPlayerId;renderCompareFrames();}
}
function resetCompare(){
  compareRunning=false;compareReplayPlaying=false;comparePaused=false;compareElapsed=0;compareAccumulator=0;compareReplayIndex=0;compareRecording=[];
  const policies=['CURRENT','LOCKED_MARK','ZONAL_RELATION'],ids=['compareA','compareB','compareC'],states=['compareAState','compareBState','compareCState'];
  compareStates=policies.map((policy,i)=>({policy,m:createCompareMatch(policy),canvas:$(ids[i]),stateEl:$(states[i]),lastFrame:null}));
  for(const q of compareStates)q.canvas.onclick=e=>focusFromCanvas(q,e);
  populateFocusPlayers();renderCompareFrames([]);
  if($('compareSeed'))$('compareSeed').textContent='SEED '+seed();if($('compareClock'))$('compareClock').textContent='0.0 / 20.0초';if($('compareReplay'))$('compareReplay').disabled=!compareReplayFrames;if($('comparePause'))$('comparePause').textContent='일시정지';updateCompareView();
}
function startCompare(){compareReplayFrames=null;resetCompare();compareRunning=true;if($('compareReplay'))$('compareReplay').disabled=true;}
function toggleComparePause(){comparePaused=!comparePaused;if($('comparePause'))$('comparePause').textContent=comparePaused?'계속':'일시정지';}
function compareTick(dt){
  if(!compareRunning||comparePaused||activeTab!=='compare')return;const scaled=dt*compareOptions().speed;compareElapsed+=scaled;compareAccumulator+=scaled;
  let guard=0;while(compareAccumulator>=.05&&guard++<8){compareAccumulator-=.05;for(const q of compareStates)if(!q.m.completed)E.step(q.m,.05);}
  const snapshotRow={t:Math.min(20,compareElapsed),frames:[]};for(const q of compareStates){const row=compareSummary(q.m);snapshotRow.frames.push({frame:row.f,text:row.text});}compareRecording.push(snapshotRow);renderCompareFrames(compareRecording);
  if($('compareClock'))$('compareClock').textContent=Math.min(20,compareElapsed).toFixed(1)+' / 20.0초';
  if(compareElapsed>=20){compareRunning=false;compareReplayFrames=compareRecording.slice();if($('compareReplay'))$('compareReplay').disabled=!compareReplayFrames.length;if($('compareClock'))$('compareClock').textContent='20.0 / 20.0초 · 완료';}
}
function startCompareReplay(){
  if(!compareReplayFrames?.length)return;
  compareRunning=false;compareReplayPlaying=true;comparePaused=false;compareReplayIndex=0;compareElapsed=0;if($('comparePause'))$('comparePause').textContent='일시정지';renderCompareFrames(compareReplayFrames);
}
function compareReplayTick(dt){
  if(!compareReplayPlaying||comparePaused||activeTab!=='compare'||!compareReplayFrames?.length)return;
  compareElapsed=Math.min(20,compareElapsed+dt*compareOptions().speed);
  while(compareReplayIndex<compareReplayFrames.length-1&&compareReplayFrames[compareReplayIndex+1].t<=compareElapsed+.0001)compareReplayIndex++;
  renderCompareFrames(compareReplayFrames);
  if($('compareClock'))$('compareClock').textContent=compareElapsed.toFixed(1)+' / 20.0초 · 다시보기';
  if(compareElapsed>=20){compareReplayPlaying=false;if($('compareClock'))$('compareClock').textContent='20.0 / 20.0초 · 다시보기 완료';}
}
function switchTab(name){
  activeTab=name;const main=name==='main';$('mainTab').hidden=!main;$('compareTab').hidden=main;$('tabMain').classList.toggle('active',main);$('tabCompare').classList.toggle('active',!main);
  if(main){compareRunning=false;compareReplayPlaying=false;if(started&&phase==='SEARCHING')scheduleSearch();}
  else{clearSearchTimer();resetCompare();}
}

function loop(now){
  const dt=Math.min(.10,(now-last)/1000);last=now;
  if(activeTab==='compare'){if(compareReplayPlaying)compareReplayTick(dt);else compareTick(dt);}
  if(activeTab==='main'&&started){
    if(phase==='REPLAY')replayTick(now);
    else if(phase==='LIVE_RESULT'){
      visibleAccumulator+=dt*VISIBLE_SPEED;
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
$('start').onclick=()=>{if(phase==='IDLE'||phase==='COMPLETE'){started=true;phase='SEARCHING';searchWallStarted=0;searchGameStarted=s.m.time;$('clock').textContent='…';$('state').textContent='다음 상황까지 진행 중입니다…';lastHiddenUiAt=0;log('경기 시작 · 결정적 상황까지 화면 없이 동일 상태 고속 진행');scheduleSearch();}};
$('same').onclick=()=>setup();$('new').onclick=()=>{trial++;setup();if(activeTab==='compare')resetCompare();};$('hero').onchange=()=>{setup();if(activeTab==='compare')resetCompare();};$('tabMain').onclick=()=>switchTab('main');$('tabCompare').onclick=()=>switchTab('compare');$('compareStart').onclick=startCompare;$('compareReplay').onclick=startCompareReplay;$('comparePause').onclick=toggleComparePause;$('compareReset').onclick=resetCompare;$('focusPlayer').onchange=e=>{focusPlayerId=e.target.value;renderCompareFrames();};for(const id of ['showTrails','showMarks','showTargets'])$(id).onchange=()=>renderCompareFrames();document.querySelectorAll('.viewMode').forEach(b=>b.onclick=()=>{compareView=b.dataset.view;updateCompareView();renderCompareFrames();});setup();resetCompare();requestAnimationFrame(loop);
})();