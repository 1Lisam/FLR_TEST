(function(root) {
'use strict';
const DT = 0.05;
const AIRBORNE_STEP_LIMIT = 20;
const MODES = Object.freeze(['BASELINE', 'NO_LOB', 'FOCUS', 'NATURAL']);
const HERO = 'H-LCM';
const positions = m => m.players.map(p => ({id:p.id,x:p.x,y:p.y,tx:p.tx,ty:p.ty,vx:p.vx,vy:p.vy}));
const horizontalSpeed = b => Math.hypot(Number(b?.vx)||0, Number(b?.vy)||0);
const canonicalTerminal = match => {
  const event=match.events?.at?.(-1);
  return `mode=${match.ball.mode||'NONE'} · owner=${match.ball.ownerId||'NONE'}${event?` · event=${event.type||event.kind||JSON.stringify(event)}`:''}`;
};

// A receipt only: no fixture mutator exists. Even FOCUS starts at canonical kickoff.
function focusFixtureReceipt(match) {
  return {kind:'NO_MUTATION_CANONICAL_KICKOFF',seed:match.seed,t:match.time,
    mutations:[],before:positions(match),after:positions(match),futureOutcomePrecomputed:false};
}
function createSession(mode, seed) {
  if (!MODES.includes(mode)) throw Error('Unknown mode');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) throw Error('Seed must be an integer from 0 to 4294967295');
  const E=root.FLRPG_CONTINUOUS_CORE, P=root.FLRPG_PROTAGONIST_MATCH_CONTROLLER;
  const A=root.FLRPG_ATTRIBUTE_MATCH_ADAPTER, M=root.FLRPG_MANAGER_TENDENCY_ADAPTER;
  let state=null,match;
  if (mode === 'FOCUS') {
    state=P.create(String(seed), {heroPlayerId:HERO,mode:'FULL_MATCH'});
    match=state.m;
    match.protagonistExplicitActionRequired=true;
  } else {
    // Exactly the accepted visual QA initialization and direct core route.
    // No protagonist is assigned in NPC observation modes.
    match=E.createMatch(String(seed));
    for (const p of match.players) A.assign(match,p.id,A.baseProfile(60));
    M.init(match,{HOME:'BALANCED',AWAY:'BALANCED'});
  }
  match.offBallPolicy='CURRENT';
  return {mode,seed,match,state,ticks:0,
    fixtureReceipt:mode==='FOCUS'?focusFixtureReceipt(match):null,
    qa:{lastConfirmedAction:null,latestCommit:null,lobReceipt:null}};
}
function observeLob(session) {
  const receipt=session.qa.lobReceipt,ball=session.match.ball;
  if(!receipt || receipt.terminal) return;
  receipt.steps++;
  const active=ball.physicsProfile==='OPEN_PLAY_LOB_V1';
  if(active) receipt.profileVisible=true;
  if(active && ball.z>0) {
    receipt.positiveZ=true;
    if(!receipt.firstAirborne) receipt.firstAirborne={step:receipt.steps,at:session.match.time,z:ball.z};
  }
  receipt.currentSpeed=horizontalSpeed(ball);
  receipt.minSpeed=Math.min(receipt.minSpeed,receipt.currentSpeed);
  if(!active) {
    receipt.terminal={at:session.match.time,canonical:canonicalTerminal(session.match),
      warning:!receipt.profileVisible||!receipt.positiveZ};
  }
}
function advance(session) {
  const {match,state}=session;
  if (match.completed || state?.pending) return false;
  const E=root.FLRPG_CONTINUOUS_CORE, P=root.FLRPG_PROTAGONIST_MATCH_CONTROLLER;
  const before=match.time;
  if (state) P.step(state, DT);
  else E.step(match, DT);
  if (match.time!==before) {session.ticks++;observeLob(session);}
  return match.time!==before;
}
function commit(session, pendingId, choiceId, targetId) {
  const state=session.state;
  if (!state?.pending || state.pending.id!==pendingId) {
    return session.qa.latestCommit={ok:false,reason:'STALE_PENDING_CHOICE'};
  }
  const option=state.pending.options.find(o=>o.id===choiceId && (o.targetId||null)===(targetId||null));
  if (!option) return session.qa.latestCommit={ok:false,reason:'EXACT_OPTION_UNAVAILABLE'};
  const result=root.FLRPG_PROTAGONIST_MATCH_CONTROLLER.applyChoice(state,choiceId,targetId||null,{
    source:'USER_UI_CLICK_IN_PITCH',confirmedAction:true,pendingChoiceId:pendingId,
    actionGestureId:`V63:${pendingId}:${choiceId}:${targetId||'SELF'}`
  });
  session.qa.latestCommit={ok:!!result.ok,reason:result.reason||result.rejectionReason||'NONE',
    choiceId,targetId:targetId||null,pendingId,at:session.match.time,commitEventId:result.commitEventId||null};
  if(result.ok) session.qa.lastConfirmedAction={choiceId,targetId:targetId||null,pendingId,at:session.match.time};
  if(result.ok&&choiceId==='LOB_PASS') {
    const launch=state.m.ball.lobLaunch?.velocity;
    session.qa.lobReceipt={armedAt:session.match.time,targetId:targetId||null,launchSpeed:horizontalSpeed(launch),
      currentSpeed:horizontalSpeed(state.m.ball),minSpeed:horizontalSpeed(state.m.ball),steps:0,
      launchFrame:{at:session.match.time,mode:state.m.ball.mode,physicsProfile:state.m.ball.physicsProfile,
        z:state.m.ball.z,vz:state.m.ball.vz},
      profileVisible:false,positiveZ:false,firstAirborne:null,presentation:null,terminal:null};
  }
  return result;
}
// Called only after an accepted explicit lob. Stop at the first real airborne
// state; never skip ahead to a peak/landing or change canonical kinematics.
function presentCommittedLob(session) {
  const receipt=session.qa.lobReceipt,commitReceipt=session.qa.latestCommit;
  if(!receipt || !commitReceipt?.ok || commitReceipt.choiceId!=='LOB_PASS' || receipt.steps!==0)
    return {ok:false,reason:'NO_FRESH_COMMITTED_LOB'};
  let reason='AIRBORNE_STEP_LIMIT';
  try {
    for(let i=0;i<AIRBORNE_STEP_LIMIT;i++) {
      if(!advance(session)){reason=session.state?.pending?'PENDING_CHOICE':session.match.completed?'MATCH_COMPLETED':'NO_STEP_PROGRESS';break;}
      if(session.match.ball.physicsProfile==='OPEN_PLAY_LOB_V1' && session.match.ball.z>0)
        return receipt.presentation={ok:true,reason:'FIRST_AIRBORNE_FRAME',step:receipt.steps};
      if(receipt.terminal){reason='LOB_ENDED_BEFORE_AIRBORNE';break;}
    }
  } catch(error) {reason=`STEP_ERROR: ${error.message}`;}
  return receipt.presentation={ok:false,reason,step:receipt.steps};
}
root.FLR_V63_VISUAL=Object.freeze({DT,AIRBORNE_STEP_LIMIT,createSession,advance,commit,presentCommittedLob,focusFixtureReceipt,observeLob});
if (typeof document === 'undefined') return;

const $=id=>document.getElementById(id),c=$('qaPitch'),x=c.getContext('2d');
let session=null,running=false,lastWall=null,elapsed=0,shownPending,selectedTarget=null;
let ready=false;
const params=new URLSearchParams(location.search);
const mode=MODES.includes(params.get('mode'))?params.get('mode'):'BASELINE';
const seedText=params.get('seed')??'1',seed=Number(seedText);
$('mode').value=mode;$('seed').value=seedText;
const tree=mode==='BASELINE'?'control':'wbs2';
function status(text) {$('status').textContent=text;}
function controls() {
  const pending=!!session?.state?.pending,done=!!session?.match.completed;
  $('start').disabled=!ready||running||pending||done;
  $('resume').disabled=!ready||running||pending||done;
  $('pause').disabled=!running;
  $('same').disabled=!ready;$('next').disabled=!ready;
}
function navigate(next=false) {
  const value=Number($('seed').value)+(next?1:0);
  if (!Number.isSafeInteger(value)||value<0||value>4294967295) {status('0–4294967295 범위의 정수 seed를 입력하세요.');return;}
  const url=new URL(location.href);url.search='';url.hash='';
  url.searchParams.set('mode',$('mode').value);url.searchParams.set('seed',String(value));
  // Reload gives each mode its own globals and exact dependency tree.
  location.assign(url.href);
}
$('mode').addEventListener('change',()=>navigate());
$('same').addEventListener('click',()=>navigate());
$('next').addEventListener('click',()=>navigate(true));
function run() {
  if(!session||session.state?.pending||session.match.completed)return;
  running=true;lastWall=null;elapsed=0;status('연속 관찰 중');controls();
}
$('start').addEventListener('click',run);$('resume').addEventListener('click',run);
$('pause').addEventListener('click',()=>{running=false;status('일시정지');controls();});
$('showDebug').addEventListener('change',()=>{$('debug').hidden=!$('showDebug').checked;draw();});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&running){running=false;lastWall=null;elapsed=0;status('탭이 숨겨져 일시정지했습니다. 계속을 눌러주세요.');controls();}
});
function button(label, handler, className='') {
  const b=document.createElement('button');b.textContent=label;b.className=className;
  b.addEventListener('click',handler);return b;
}
function choices() {
  const pending=session.state?.pending||null;
  if(pending===shownPending)return;
  shownPending=pending||null;selectedTarget=null;
  $('targets').replaceChildren();$('actions').replaceChildren();
  if(!pending){
    $('choiceHint').textContent=mode==='FOCUS'?'H-LCM의 실제 선택을 기다립니다. 배치 이동이나 자동 선택은 없습니다.':'NPC 연속 관찰 · FOCUS에서 직접 대상과 동작을 선택할 수 있습니다.';
    return;
  }
  running=false;controls();
  const hasLob=pending.options.some(o=>o.id==='LOB_PASS');
  $('choiceHint').textContent=`${pending.kind} · ${pending.id} · ${hasLob?'로빙 가능: ':''}① 대상 선택 → ② 실제 동작 클릭`;
  status(hasLob?'현재 로빙 선택 가능 · 대상과 LOB_PASS를 직접 선택하세요.':'현재 선택 대기 · 실제 동작을 선택해야 계속됩니다.');
  const ids=[...new Set(pending.options.map(o=>o.targetId||null))];
  for(const target of ids){
    const b=button(target||`${HERO} (자기 동작)`,()=>{
      if(session.state.pending!==pending)return;
      selectedTarget=target;
      for(const child of $('targets').children)child.setAttribute('aria-pressed',String(child===b));
      $('actions').replaceChildren();
      for(const option of pending.options.filter(o=>(o.targetId||null)===selectedTarget)){
        const action=button(`${option.label||option.id} [${option.id}]`,()=>{
          if(session.state.pending!==pending)return;
          const result=commit(session,pending.id,option.id,selectedTarget);
          if(!result.ok){status(`선택 거절: ${result.reason}`);draw();return;}
          if(option.id==='LOB_PASS') {
            running=false;lastWall=null;elapsed=0;
            const presented=presentCommittedLob(session);
            choices();draw();controls();
            status(presented.ok?'첫 실제 AIRBORNE 프레임 · 일시정지 · 계속을 눌러 비행·착지를 관찰하세요.':`QA WARNING: 공중 프레임 없음 · ${presented.reason}`);
            return;
          }
          choices();draw();run();
        },option.id==='LOB_PASS'?'lob':'');
        action.dataset.choiceId=option.id;action.dataset.targetId=target||'';
        $('actions').append(action);
      }
    });
    b.dataset.targetId=target||'';b.setAttribute('aria-pressed','false');$('targets').append(b);
  }
}

function renderTelemetry() {
  if(!session)return;
  const b=session.match.ball,qa=session.qa,receipt=qa.lobReceipt,active=b.physicsProfile==='OPEN_PLAY_LOB_V1';
  const action=qa.lastConfirmedAction?`${qa.lastConfirmedAction.choiceId} + targetId=${qa.lastConfirmedAction.targetId||'NONE'}`:'NONE';
  const result=qa.latestCommit?`${qa.latestCommit.ok?'ACCEPTED':'REJECTED'} · ${qa.latestCommit.choiceId||'NONE'} + targetId=${qa.latestCommit.targetId||'NONE'} · ${qa.latestCommit.reason}`:'NONE';
  const speed=horizontalSpeed(b);
  const phase=!receipt?'NONE':receipt.steps===0?'LAUNCH':active&&b.z>0?'AIRBORNE':
    receipt.positiveZ&&b.z<=0?'LANDED':!active&&b.z>0?'TERMINAL_AIRBORNE':'NO_AIRBORNE';
  const lines=[
    `live mode: ${session.mode} · step=${session.ticks} · match phase=${session.match.phase} · lob phase=${phase}`,
    `last confirmed user action: ${action}`,
    `latest commit: ${result}`,
    `commit receipt: pendingId=${qa.latestCommit?.pendingId||'NONE'} · commitEventId=${qa.latestCommit?.commitEventId||'NONE'}`,
    `ball physicsProfile: ${b.physicsProfile||'NONE'} · mode: ${b.mode||'NONE'}`,
    `current canonical z=${(Number(b.z)||0).toFixed(3)} · vz=${(Number(b.vz)||0).toFixed(3)} · horizontal speed=${speed.toFixed(3)}`
  ];
  if(active&&receipt){
    const ratio=receipt.launchSpeed>0?speed/receipt.launchSpeed:0;
    lines.push(`open-play lob lineage: launch=${receipt.launchSpeed.toFixed(3)} · current=${speed.toFixed(3)} · current/launch=${ratio.toFixed(3)}`);
  }
  if(receipt){
    lines.push(`historical LAUNCH (step=0): z=${Number(receipt.launchFrame.z).toFixed(3)} · vz=${Number(receipt.launchFrame.vz).toFixed(3)} · mode=${receipt.launchFrame.mode} · physicsProfile=${receipt.launchFrame.physicsProfile||'NONE'}`);
    lines.push(`read-only observation receipt: actual steps=${receipt.steps} · profile visible=${receipt.profileVisible?'YES':'NO'} · z>0=${receipt.positiveZ?'YES':'NO'}`);
    if(receipt.presentation) lines.push(`${receipt.presentation.ok?'presentation: ':'QA WARNING: no airborne frame · '}${receipt.presentation.reason} · step=${receipt.presentation.step}`);
    if(receipt.terminal){
      lines.push(`${receipt.terminal.warning?'QA WARNING: ':'actual terminal: '}${receipt.terminal.canonical}`);
      if(receipt.terminal.warning) lines.push('QA WARNING: LOB_PASS committed, but canonical profile and/or positive z was never observed.');
    }
  }
  $('qaTelemetry').textContent=lines.join('\n');
  $('lobActive').textContent=`${active?'LOB ACTIVE · OPEN_PLAY_LOB_V1':'LOB INACTIVE'} · ${phase}`;
  $('lobActive').className=receipt?.presentation?.ok===false||receipt?.terminal?.warning?'qa-warning':active?'qa-active':'';
}

// Field geometry, colors, labels and player radii retained from the accepted V58 visual renderer.
function draw(){
  if(!session)return;
  const match=session.match,tick=session.ticks;
  const config={scenario:mode,focusPlayer:session.state?HERO:null,showTargets:false};
  const W=c.width,H=c.height,L=45,T=55,R=W-45,B=H-60,pw=R-L,ph=B-T;
  const px=v=>L+v/105*pw,py=v=>T+v/68*ph,rx=m=>m/105*pw,ry=m=>m/68*ph;
  x.clearRect(0,0,W,H);x.fillStyle='#285b36';x.fillRect(0,0,W,H);
  x.strokeStyle='#d8f2d5';x.lineWidth=3;
  x.strokeRect(L,T,pw,ph);
  x.beginPath();x.moveTo(px(52.5),T);x.lineTo(px(52.5),B);x.stroke();
  x.beginPath();x.arc(px(52.5),py(34),rx(9.15),0,Math.PI*2);x.stroke();
  x.beginPath();x.arc(px(52.5),py(34),3,0,Math.PI*2);x.fillStyle='#d8f2d5';x.fill();
  // Penalty and goal areas.
  x.strokeStyle='#d8f2d5';x.lineWidth=2.5;
  x.strokeRect(px(0),py(13.84),rx(16.5),ry(40.32));
  x.strokeRect(px(105-16.5),py(13.84),rx(16.5),ry(40.32));
  x.strokeRect(px(0),py(24.84),rx(5.5),ry(18.32));
  x.strokeRect(px(105-5.5),py(24.84),rx(5.5),ry(18.32));
  x.beginPath();x.arc(px(11),py(34),3,0,Math.PI*2);x.fillStyle='#d8f2d5';x.fill();
  x.beginPath();x.arc(px(94),py(34),3,0,Math.PI*2);x.fill();
  // Goals outside the goal lines.
  const goalTop=py(34-3.66),goalBottom=py(34+3.66),goalDepth=12;
  x.strokeStyle='#ffffff';x.lineWidth=4;
  x.beginPath();x.moveTo(L,goalTop);x.lineTo(L-goalDepth,goalTop);x.lineTo(L-goalDepth,goalBottom);x.lineTo(L,goalBottom);x.stroke();
  x.beginPath();x.moveTo(R,goalTop);x.lineTo(R+goalDepth,goalTop);x.lineTo(R+goalDepth,goalBottom);x.lineTo(R,goalBottom);x.stroke();
  x.fillStyle='#101820';x.fillRect(0,0,W,42);x.fillStyle='#fff';x.font='bold 20px system-ui';x.textAlign='left';
  x.fillText(`V63 QA · ${config?.scenario||'NATURAL'} · t=${(match.time||0).toFixed(2)} · tick ${tick}`,18,28);
  for(const p of match.players){
    const fi=p.finalMovementIntent,target=fi?.targetPoint;
    if(target&&config?.showTargets){x.strokeStyle=p.team==='HOME'?'rgba(100,180,255,.35)':'rgba(255,140,140,.35)';x.beginPath();x.moveTo(px(p.x),py(p.y));x.lineTo(px(target.x),py(target.y));x.stroke();}
    x.beginPath();x.fillStyle=p.team==='HOME'?(p.role==='GK'?'#78d7ff':'#287be8'):(p.role==='GK'?'#ffb38d':'#de3c3c');x.arc(px(p.x),py(p.y),p.id===config?.focusPlayer?15:11,0,Math.PI*2);x.fill();
    x.strokeStyle=p.id===config?.focusPlayer?'#ffed4a':'#fff';x.lineWidth=p.id===config?.focusPlayer?3:1;x.stroke();
    x.fillStyle='#fff';x.font='bold 11px system-ui';x.textAlign='center';x.fillText(p.id,px(p.x),py(p.y)-15);
  }
  // Ball emphasis: visible halo, solid ball, label and flight trail.
  // Rendering only: retain canonical x/y/z, project altitude above a ground shadow.
  const bx=px(match.ball.x),groundY=py(match.ball.y),z=Math.max(0,Number(match.ball.z)||0),by=groundY-ry(z);
  x.beginPath();x.fillStyle='rgba(0,0,0,.48)';x.ellipse(bx,groundY,9,4.5,0,0,Math.PI*2);x.fill();
  if(match.ball.mode==='FLIGHT'){
    const sp=Math.hypot(Number(match.ball.vx)||0,Number(match.ball.vy)||0);
    if(sp>0.15){const ux=(match.ball.vx||0)/sp,uy=(match.ball.vy||0)/sp;x.strokeStyle='rgba(255,235,80,.95)';x.lineWidth=4;x.beginPath();x.moveTo(bx,by);x.lineTo(px(match.ball.x-ux*2.3),py(match.ball.y-uy*2.3)-ry(z));x.stroke();}
  }
  x.beginPath();x.fillStyle='rgba(255,235,80,.32)';x.arc(bx,by,15,0,Math.PI*2);x.fill();
  x.beginPath();x.fillStyle='#fff';x.strokeStyle='#111';x.lineWidth=3;x.arc(bx,by,7.5,0,Math.PI*2);x.fill();x.stroke();
  x.fillStyle='#ffed4a';x.font='bold 11px system-ui';x.textAlign='center';x.fillText(`BALL z=${z.toFixed(2)}m`,bx,by-18);
  const seconds=Math.floor(match.time),minute=Math.floor(seconds/60);
  $('score').textContent=`HOME ${match.score.HOME} : ${match.score.AWAY} AWAY · ${String(minute).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')} · ${match.phase}`;
  renderTelemetry();
  if($('showDebug').checked){
    const b=match.ball,last=match.events.at(-1);
    $('debug').textContent=`${mode} / ${tree} · seed=${session.seed} · t=${match.time.toFixed(2)} · tick=${tick} · dt=${DT}\nball xyz=(${b.x.toFixed(3)}, ${b.y.toFixed(3)}, ${(b.z||0).toFixed(3)}) · ${b.mode} · owner=${b.ownerId||'—'}\nlast actual event: ${last?JSON.stringify(last):'—'}`;
  }
}

function frame(now) {
  if(lastWall===null)lastWall=now;
  const delta=Math.min(100,Math.max(0,now-lastWall));lastWall=now;
  if(running&&session){
    elapsed+=delta*Number($('speed').value);
    if(elapsed>=DT*1000){
      // One actual motor step and draw per animation frame. Never batch hidden
      // steps to catch up: even at 8x, every 0.05 s state reaches the canvas.
      elapsed=Math.min(elapsed-DT*1000,DT*1000);
      advance(session);draw();choices();
      if(session.match.completed){running=false;status('실제 경기 종료');controls();}
    }
  }
  requestAnimationFrame(frame);
}
async function boot() {
  const response=await fetch('EXPECTED_MANIFEST.json');
  if(!response.ok)throw Error('Build manifest unavailable; run the builder and serve its output');
  const manifest=await response.json();
  const files=manifest.runtime_order;
  if(!Array.isArray(files)||files.length!==19)throw Error('Unexpected runtime set');
  for(const file of files){
    if(!/^runtime\/[a-z0-9_]+\.js$/.test(file)||!manifest.files[`${tree}/${file}`])throw Error('Non-local runtime path');
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=`${tree}/${file}`;
      script.onload=resolve;script.onerror=()=>reject(Error(`Asset failed: ${file}`));document.head.append(script);
    });
  }
  session=createSession(mode,seed);
  $('source').textContent=`${mode} · ${tree==='control'?manifest.baseline_commit:manifest.wbs2_commit} · Legacy/core dt=0.05s`;
  $('receipt').textContent=session.fixtureReceipt?JSON.stringify(session.fixtureReceipt,null,2):'이 모드에는 fixture가 없습니다.';
  ready=true;choices();draw();status('준비 완료 · 시작을 눌러주세요.');controls();requestAnimationFrame(frame);
  // Read-only diagnostics for browser QA. State mutation is not exposed here.
  root.FLR_V63_DEBUG=Object.freeze({snapshot:()=>({mode,seed,ticks:session.ticks,running,
    pending:session.state?.pending?JSON.parse(JSON.stringify(session.state.pending)):null,
    match:root.FLRPG_CONTINUOUS_CORE.snapshot(session.match),
    fixtureReceipt:session.fixtureReceipt,qa:JSON.parse(JSON.stringify(session.qa))}),ballProjection:()=>({z:session.match.ball.z||0,
      offsetPixels:(session.match.ball.z||0)/68*(c.height-115)})});
}
boot().catch(error=>{running=false;status(`중단: ${error.message}`);controls();console.error(error);});
})(typeof globalThis!=='undefined'?globalThis:this);
