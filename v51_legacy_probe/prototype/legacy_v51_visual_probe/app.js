(function(){
'use strict';
const P=window.FLRPG_PROTAGONIST_MATCH_CONTROLLER;
const E=window.FLRPG_CONTINUOUS_CORE;
const H=window.FLR_LEGACY_COMMENTARY_HIGHLIGHT;
const $=id=>document.getElementById(id);
const canvas=$('pitch'),ctx=canvas.getContext('2d');
const STEP=.1,MACRO_STEPS_PER_FRAME=18,LEAD_SPEED=2,POST_SPEED=2,EVENT_SPEED=2;
let session=null,matchObject=null,phase='IDLE',leadFrames=[],leadElapsed=0,eventFrames=[],eventElapsed=0,activeEvent=null,seenEventKeys=new Set(),lastWall=performance.now(),postAccumulator=0,choiceLocked=false,shownScenes=0,shownEvents=0;
const deep=x=>x==null?x:JSON.parse(JSON.stringify(x));

function clock(t){const s=Math.max(0,Math.floor(Number(t)||0)),m=Math.min(90,Math.floor(s/60));return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function draw(frame){
  if(!frame)return;
  const W=canvas.width,H=canvas.height,padX=28,padY=24,fw=W-padX*2,fh=H-padY*2,px=x=>padX+(Number(x)||0)/105*fw,py=y=>padY+(Number(y)||0)/68*fh;
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#315b37';ctx.fillRect(0,0,W,H);ctx.strokeStyle='rgba(245,255,245,.82)';ctx.lineWidth=3;ctx.strokeRect(padX,padY,fw,fh);ctx.beginPath();ctx.moveTo(px(52.5),padY);ctx.lineTo(px(52.5),padY+fh);ctx.stroke();ctx.beginPath();ctx.arc(px(52.5),py(34),9.15/105*fw,0,Math.PI*2);ctx.stroke();ctx.strokeRect(px(0),py(13.84),px(16.5)-px(0),py(54.16)-py(13.84));ctx.strokeRect(px(88.5),py(13.84),px(105)-px(88.5),py(54.16)-py(13.84));
  const hero=session?.heroPlayerId;
  for(const p of frame.players||[]){const x=px(p.x),y=py(p.y),focus=p.id===hero,gk=p.role==='GK';ctx.fillStyle=p.team==='HOME'?(gk?'#7dd3fc':'#2563eb'):(gk?'#fca5a5':'#dc2626');ctx.strokeStyle=focus?'#ffe26a':'rgba(255,255,255,.85)';ctx.lineWidth=focus?5:2;ctx.beginPath();ctx.arc(x,y,focus?14:11,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 8px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.slot||p.role||'',x,y);}
  const b=frame.ball;if(b){ctx.fillStyle='#fff';ctx.strokeStyle='#1c252b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(px(b.x),py(b.y),7+Math.min(4,(Number(b.z)||0)*1.5),0,Math.PI*2);ctx.fill();ctx.stroke();}
  $('clock').textContent=clock(frame.time);$('score').textContent=`${frame.score?.HOME??0} - ${frame.score?.AWAY??0}`;
}
function setScene(title,detail){$('sceneTitle').textContent=title;$('sceneDetail').textContent=detail;}
function setCommentary(text){$('commentary').textContent=text;}
function actualFrames(pending){
  const rows=(pending?.replayFrames||[]).filter(f=>Number(f.time)<=Number(pending.at)+.001);
  return rows.filter(f=>Number(f.time)>=Number(pending.at)-5.001).map(deep);
}
function retainedActualFrames(){
  const rows=[...(session?.currentScene?.postFrames||[]),...(session?.history||[])],seen=new Set();
  return rows.filter(f=>{const key=Number(f?.time).toFixed(3);if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>Number(a.time)-Number(b.time));
}
function status(){
  return {version:'V51_LEGACY_COMMENTARY_HIGHLIGHT_1.0',phase,seed:session?.seed||null,mode:session?.mode||null,matchObjectRetained:!!session&&session.m===matchObject,matchTime:session?.m?.time??null,pending:session?.pending?{id:session.pending.id,choicePairs:session.pending.options.map(o=>[o.id,o.targetId||null]),futureOutcomePrecomputed:session.pending.futureOutcomePrecomputed}:null,shownScenes,shownEvents,activeEvent:activeEvent?{type:activeEvent.type,at:activeEvent.t}:null,futureOutcomePrecomputed:session?.futureOutcomePrecomputed===false};
}
function expose(){window.FLR_LEGACY_SOLO_VISUAL_PROBE={status,start:()=>start($('seed').value),session:()=>session};}
function writeLog(pending){const log=$('sceneLog');if(shownScenes===1)log.innerHTML='';const li=document.createElement('li');const options=pending.options.map(o=>`${o.id}${o.targetId?`→${o.targetId}`:''}`).join(', ');li.innerHTML=`<strong>장면 ${shownScenes}</strong> · ${clock(pending.at)} · ${pending.kind} · <span class="bad-scene">품질과 무관하게 표시</span><br><small>${options}</small>`;log.appendChild(li);}
function beginLeadIn(){
  const p=session?.pending;if(!p)return;
  leadFrames=actualFrames(p);leadElapsed=0;phase='LEAD_IN';choiceLocked=false;shownScenes++;writeLog(p);$('choicePanel').hidden=true;
  const first=leadFrames[0]||E.snapshot(session.m),span=Math.max(0,Number(p.at)-Number(first.time)).toFixed(1);draw(first);$('frameSource').textContent='실제 과거 Legacy frame · 재시뮬레이션/보간 없음';setScene(`장면 ${shownScenes} · 선택 전 실제 ${span}초`,`현재 선택 경계 ${p.id}. 최대 5초의 이미 실행된 frame만 사용해 5–15초 관찰 예산을 지킵니다. 좋고 나쁨, 위치, 충돌, 멈춤을 거르지 않습니다.`);$('integrity').textContent='한 경기 객체 유지 · 현재 상태에서 생성된 정확한 선택 대기 · 미래 결과 미계산';
}
function nextRecordedEvent(){
  if(!session||!H)return null;
  return (session.m.events||[]).find(e=>H.isRecordedPastEvent(e,session.m.time)&&!seenEventKeys.has(H.eventKey(e)))||null;
}
function beginEventScene(event){
  activeEvent=deep(event);seenEventKeys.add(H.eventKey(event));eventFrames=H.actualEventFrames(retainedActualFrames(),event,session.m.time,.8);eventElapsed=0;phase='EVENT_SCENE';shownEvents++;
  const first=eventFrames[0]||E.snapshot(session.m);draw(first);setCommentary(H.commentaryFor(event));$('frameSource').textContent='기록된 실제 이벤트 주변 Legacy frame · 재시뮬레이션/보간 없음';setScene(`기록 ${shownEvents} · ${event.type}`,`이벤트 ${event.type}는 ${clock(event.t)}에 이미 발생한 Legacy 기록입니다. 이 짧은 장면은 그 전후로 현재 시각까지 이미 기록된 frame만 사용합니다.`);$('integrity').textContent='이미 발생한 이벤트만 해설 · 한 경기 객체 유지 · 미래 결과 미계산';
}
function finishEventScene(){
  setCommentary('실제 장면이 끝났습니다. 같은 Legacy 경기가 계속됩니다.');activeEvent=null;eventFrames=[];
  if(session.pending){beginLeadIn();return;}
  phase='MACRO';setScene('기록 뒤 숨김 진행 재개','방금 보인 이벤트 이후에도 같은 Legacy 경기 객체를 그대로 계속 실행합니다.');
}
function showChoice(){
  const p=session.pending;phase='CHOICE';draw(E.snapshot(session.m));$('frameSource').textContent='현재 실제 Legacy 선택 frame';$('choicePanel').hidden=false;$('choiceTitle').textContent=`${p.kind} · ${clock(p.at)}에 내 선택`;$('choiceDetail').textContent=`${p.id} · 아래 버튼 하나가 정확한 choiceId + targetId 제출입니다. 버튼을 누르기 전에는 주인공 행동을 실행하지 않습니다.`;
  const box=$('choices');box.innerHTML='';for(const opt of p.options){const b=document.createElement('button');b.type='button';b.dataset.choiceId=opt.id;b.dataset.targetId=opt.targetId||'';b.innerHTML=`${opt.label}<span>${opt.id}${opt.targetId?` + ${opt.targetId}`:''}</span>`;b.addEventListener('click',()=>choose(opt,b));box.appendChild(b);}
  setScene(`장면 ${shownScenes} · 사용자 선택 대기`,'이 장면은 선택이 불편하거나 보기 나빠도 숨기지 않습니다. 선택하지 않으면 같은 현재 frame에서 멈춥니다.');
}
function choose(opt,button){
  if(choiceLocked||phase!=='CHOICE'||!session?.pending)return;choiceLocked=true;document.querySelectorAll('#choices button').forEach(b=>b.disabled=true);
  const receipt=P.applyChoice(session,opt.id,opt.targetId||null,{source:'USER_UI_CLICK',confirmedAction:true});
  const log=(session.m.userChoiceLog||[]).at(-1);if(!receipt.ok||receipt.choice!==opt.id||(receipt.targetId||null)!==(opt.targetId||null)||log?.choice!==opt.id||(log?.targetId||null)!==(opt.targetId||null)){throw new Error(`EXACT_CHOICE_REJECTED:${receipt.reason||'MISMATCH'}`);}
  $('choicePanel').hidden=true;phase='POST';postAccumulator=0;setScene(`선택 실행 중 · ${opt.label}`,'방금 선택한 현재 입력만 Legacy 엔진에 전달했습니다. 이후 frame은 같은 경기 객체가 실제로 계속 실행한 결과입니다.');$('frameSource').textContent='선택 뒤 실제 Legacy frame';
}
function start(rawSeed){
  if(!P||!E||!H)throw new Error('LEGACY_COMMENTARY_RUNTIME_UNAVAILABLE');const seed=String(rawSeed||'V51-LEGACY-SOLO-001').trim()||'V51-LEGACY-SOLO-001';$('seed').value=seed;
  session=P.create(seed,{heroPlayerId:'H-ST',mode:'PLAYER_ALL',replaySeconds:6});matchObject=session.m;phase='MACRO';leadFrames=[];eventFrames=[];activeEvent=null;seenEventKeys=new Set();shownScenes=0;shownEvents=0;choiceLocked=false;postAccumulator=0;setCommentary('실제 이벤트를 기다립니다. 아직 미래 이벤트를 읽지 않습니다.');$('sceneLog').innerHTML='<li>숨김 진행 중: 기록된 실제 이벤트 또는 자연 선택 경계를 기다립니다.</li>';$('choicePanel').hidden=true;$('sameSeed').disabled=false;draw(E.snapshot(session.m));$('frameSource').textContent='현재 실제 Legacy kickoff frame';setScene('90분을 숨김 진행','기존 PLAYER_ALL controller를 같은 경기 객체에서 진행합니다. 결정적 실제 이벤트는 해설과 짧은 실제 frame으로, 주인공 선택은 행동 전 정지로 표시합니다.');expose();
}
function runMacro(){
  for(let i=0;i<MACRO_STEPS_PER_FRAME&&!session.m.completed;i++){
    P.step(session,STEP);const event=nextRecordedEvent();if(event){beginEventScene(event);return;}if(session.pending){beginLeadIn();return;}
  }
  draw(E.snapshot(session.m));if(session.pending){beginLeadIn();return;}if(session.m.completed){phase='FULL_TIME';$('frameSource').textContent='실제 Legacy final frame';setCommentary('경기 종료입니다. 같은 Legacy 경기의 실제 최종 frame입니다.');setScene('경기 종료','같은 Legacy 경기 객체가 90분을 끝까지 실행했습니다. 이 probe는 품질 PASS나 엔진 수리를 주장하지 않습니다.');}
}
function runEventScene(elapsed){
  if(!eventFrames.length){finishEventScene();return;}eventElapsed+=elapsed*EVENT_SPEED;const first=Number(eventFrames[0].time),last=Number(eventFrames.at(-1).time),target=Math.min(last,first+eventElapsed);let ix=0;while(ix<eventFrames.length-1&&Number(eventFrames[ix+1].time)<=target)ix++;draw(eventFrames[ix]);if(target>=last-.001)finishEventScene();
}
function runLeadIn(elapsed){
  if(!leadFrames.length){showChoice();return;}leadElapsed+=elapsed*LEAD_SPEED;const first=Number(leadFrames[0].time),last=Number(leadFrames.at(-1).time),target=Math.min(last,first+leadElapsed);let ix=0;while(ix<leadFrames.length-1&&Number(leadFrames[ix+1].time)<=target)ix++;draw(leadFrames[ix]);if(target>=last-.001)showChoice();
}
function runPost(elapsed){
  postAccumulator+=elapsed*POST_SPEED;while(postAccumulator>=STEP&&phase==='POST'){postAccumulator-=STEP;P.step(session,STEP);draw(E.snapshot(session.m));if(session.pending){beginLeadIn();return;}if(!session.resultTracker){phase='MACRO';setScene('장면 종료 · 숨김 진행 재개','결과는 실제 Legacy frame 뒤에만 종료했습니다. 같은 경기 객체가 다음 자연 장면까지 계속 진행합니다.');return;}if(session.m.completed){phase='FULL_TIME';return;}}
}
function tick(now){const elapsed=Math.min(.25,Math.max(0,(now-lastWall)/1000));lastWall=now;if(session){if(phase==='MACRO')runMacro();else if(phase==='EVENT_SCENE')runEventScene(elapsed);else if(phase==='LEAD_IN')runLeadIn(elapsed);else if(phase==='POST')runPost(elapsed);$('hiddenClock').textContent=phase==='MACRO'?`숨김 진행: ${clock(session.m.time)} / 90:00`:`경기 시간: ${clock(session.m.time)} / 90:00`;expose();}requestAnimationFrame(tick);}
$('start').addEventListener('click',()=>start($('seed').value));$('sameSeed').addEventListener('click',()=>start($('seed').value));expose();requestAnimationFrame(tick);
})();
