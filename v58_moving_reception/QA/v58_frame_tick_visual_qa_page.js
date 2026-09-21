(function(){'use strict';
const E=window.FLRPG_CONTINUOUS_CORE,A=window.FLRPG_ATTRIBUTE_MATCH_ADAPTER,M=window.FLRPG_MANAGER_TENDENCY_ADAPTER;
const c=document.querySelector('#qaPitch'),x=c.getContext('2d'),meta=document.querySelector('#meta');let match=null,tick=0,eventCursor=0,config=null;
const finite=v=>Number.isFinite(Number(v))?Number(v):null,clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function player(m,id){return m.playersById?.[id]||m.players.find(p=>p.id===id)}
function setPos(m,r){const p=player(m,r.id);if(!p)return;p.x=r.x;p.y=r.y;p.tx=r.x;p.ty=r.y;p.vx=0;p.vy=0;p.sprint=false;p.runUntil=0;p.runType=null;p.markTargetId=null;p.responsibilityTargetId=null;p.responsibilityType=null;}
function applyFixture(m,f){
  if(!f||f.kind==='NATURAL')return;
  for(const r of f.positions||[])setPos(m,r);
  m.restart=null;m.setPieceLive=null;m.goalCelebration=null;m.completed=false;m.phase='OPEN_PLAY';m.time=600;m.nextShape=0;m.transitionUntil=0;m._defenceRoleLocks={};m._defensiveResponsibility={};m._markLocks={};m._transitionWideVacancies={};
  if(f.kind==='MOVING_RECEPTION'){
    for(const p of m.players)Object.assign(p,{x:p.team==='HOME'?6:99,y:p.y,tx:p.team==='HOME'?6:99,ty:p.y,vx:0,vy:0,sprint:false,runUntil:0,runType:null});
    const source=player(m,'H-LCM'),receiver=player(m,'H-ST');
    Object.assign(source,{x:38,y:34,tx:38,ty:34,vx:0,vy:0});
    Object.assign(receiver,{x:49,y:34,tx:54,ty:34,vx:4.5,vy:0,bodyAngle:0,sprint:true});
    const bridge=E.choiceActionBridge?.();
    if(!bridge?.setControlled||!bridge?.executePass)throw new Error('MOVING_RECEPTION_BRIDGE_UNAVAILABLE');
    bridge.setControlled(m,source,true);
    bridge.executePass(m,source,receiver,'PASS',{running:true,forward:14,open:8,block:0},'TEST_MOVING_OPEN_PASS');
    return;
  }
  if(f.mark){const p=player(m,f.mark.actorId);if(p)p.markTargetId=f.mark.targetId;}
  if(f.ownerId){for(const p of m.players)p.hasBall=false;const p=player(m,f.ownerId),b=E.choiceActionBridge?.();if(b?.setControlled)b.setControlled(m,p,true);else if(p){p.hasBall=true;m.possession=p.team;m.ball.ownerId=p.id;m.ball.mode='CONTROLLED';m.ball.x=p.x;m.ball.y=p.y;}}
}
function init(o){config=o;tick=0;eventCursor=0;match=E.createMatch(o.seed,o.mode==='D_EXECUTE'?{executionMode:'D_EXECUTE'}:{});for(const p of match.players)if(A?.assign)A.assign(match,p.id,A.baseProfile(60));if(M?.init)M.init(match,{HOME:'BALANCED',AWAY:'BALANCED'});match.offBallPolicy='CURRENT';applyFixture(match,o.fixture);draw();return {ok:true,players:match.players.map(p=>({id:p.id,team:p.team,role:p.role,slot:p.slot})),time:match.time,executionMode:match.executionMode||o.mode};}
function row(){const b=match.tacticalExecutionBoundary||{},contracts=new Map((b.contracts||[]).map(r=>[r.actorId,r]));const pRows=match.players.map(p=>{const q=contracts.get(p.id)||{},f=p.finalMovementIntent||{};return{id:p.id,team:p.team,role:p.role,slot:p.slot,x:finite(p.x),y:finite(p.y),vx:finite(p.vx),vy:finite(p.vy),body:finite(p.bodyAngle),facing:finite(p.faceTargetAngle),tx:finite(p.tx),ty:finite(p.ty),finalMovementIntent:{type:f.type||null,targetId:f.targetId||null,targetPoint:clone(f.targetPoint)||null,executionMode:f.executionMode||null,contractId:f.contractId||null},d2:{mode:q.executionMode||null,duty:q.duty||null,relationshipTargetId:q.relationshipTargetId||null,targetPoint:clone(q.targetPoint)||null,contractId:q.epochId||null},responsibility:{markTargetId:p.markTargetId||null,targetId:p.responsibilityTargetId||null,type:p.responsibilityType||null,task:p.tacticalTask||null,action:p.action||null},movingReceiveApproach:clone(p.movingReceiveApproach)||null};});const ev=(match.events||[]).slice(eventCursor).map(clone);eventCursor=(match.events||[]).length;return{type:'tick',tickIndex:tick,simTime:Number(match.time.toFixed(6)),executionMode:b.executionMode||match.executionMode||config.mode,phase:match.phase||null,possession:match.possession||null,restart:clone(match.restart),setPiece:clone(match.setPieceLive),ball:{mode:match.ball.mode||null,x:finite(match.ball.x),y:finite(match.ball.y),vx:finite(match.ball.vx),vy:finite(match.ball.vy),targetX:finite(match.ball.targetX),targetY:finite(match.ball.targetY),ownerId:match.ball.ownerId||null,intendedReceiverId:match.ball.intendedReceiverId||null,currentReceiverId:match.ball.flightReceiverId||null},protagonist:{controllerId:match.protagonistControllerId||null,paused:!!match.paused,choiceId:match.userChoiceControl?.choiceId||match.userChoiceControl?.choice||match.userIncomingIntent?.choiceId||null,targetId:match.userChoiceControl?.targetId||match.userIncomingIntent?.targetId||null},dEpoch:{id:b.epochId||null,mode:b.executionMode||null},players:pRows,events:ev};}
function step(){if(!match)throw new Error('QA_NOT_INITIALIZED');E.step(match,.05);tick++;draw();return row();}
function draw(){
  if(!match)return;
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
  x.fillText(`V58 QA · ${config?.scenario||'NATURAL'} · t=${(match.time||0).toFixed(2)} · tick ${tick}`,18,28);
  for(const p of match.players){
    const fi=p.finalMovementIntent,target=fi?.targetPoint;
    if(target&&config?.showTargets){x.strokeStyle=p.team==='HOME'?'rgba(100,180,255,.35)':'rgba(255,140,140,.35)';x.beginPath();x.moveTo(px(p.x),py(p.y));x.lineTo(px(target.x),py(target.y));x.stroke();}
    x.beginPath();x.fillStyle=p.team==='HOME'?(p.role==='GK'?'#78d7ff':'#287be8'):(p.role==='GK'?'#ffb38d':'#de3c3c');x.arc(px(p.x),py(p.y),p.id===config?.focusPlayer?15:11,0,Math.PI*2);x.fill();
    x.strokeStyle=p.id===config?.focusPlayer?'#ffed4a':'#fff';x.lineWidth=p.id===config?.focusPlayer?3:1;x.stroke();
    x.fillStyle='#fff';x.font='bold 11px system-ui';x.textAlign='center';x.fillText(p.id,px(p.x),py(p.y)-15);
  }
  // Ball emphasis: visible halo, solid ball, label and flight trail.
  const bx=px(match.ball.x),by=py(match.ball.y);
  if(match.ball.mode==='FLIGHT'){
    const sp=Math.hypot(Number(match.ball.vx)||0,Number(match.ball.vy)||0);
    if(sp>0.15){const ux=(match.ball.vx||0)/sp,uy=(match.ball.vy||0)/sp;x.strokeStyle='rgba(255,235,80,.95)';x.lineWidth=4;x.beginPath();x.moveTo(bx,by);x.lineTo(px(match.ball.x-ux*2.3),py(match.ball.y-uy*2.3));x.stroke();}
  }
  x.beginPath();x.fillStyle='rgba(255,235,80,.32)';x.arc(bx,by,15,0,Math.PI*2);x.fill();
  x.beginPath();x.fillStyle='#fff';x.strokeStyle='#111';x.lineWidth=3;x.arc(bx,by,7.5,0,Math.PI*2);x.fill();x.stroke();
  x.fillStyle='#ffed4a';x.font='bold 11px system-ui';x.textAlign='center';x.fillText('BALL',bx,by-18);
  meta.textContent=`Diagnostic renderer · actual runtime tick · ${config?.scenario||'NATURAL'} · ball=${match.ball.mode||'UNKNOWN'}`;
}
window.FLR_V57_FRAME_TICK_QA={init,step,draw,engineReady:()=>!!E};
})();
