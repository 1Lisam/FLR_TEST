#!/usr/bin/env node
'use strict';

// Real visual initialization and unmodified restart/motor path. Acceptance rows
// never move bodies or force a post-kick target. Separate current-state fixtures
// below exercise authority transitions that a particular delivery may not visit.
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const R=require('../runtime/restart_movement.js');
global.FLRPG_RESTART_MOVEMENT=R;
require('../runtime/free_kick_templates.js');
require('../runtime/free_kick_wall_model.js');
require('../runtime/corner_templates.js');
require('../runtime/v37_set_piece_liveliness_patch.js');
const E=require('../runtime/continuous_match_core.js');
const A=require('../runtime/attribute_match_adapter.js');
const M=require('../runtime/manager_tendency_adapter.js');
const T=require('../runtime/tactical_movement.js');
const DT=.05,EPS=1e-7;
const other=t=>t==='HOME'?'AWAY':'HOME';
const world=(t,x,y)=>t==='HOME'?{x,y}:{x:105-x,y:68-y};
const local=(t,p)=>world(t,p.x,p.y);
const target=(t,p)=>world(t,p.tx,p.ty);
const sign=slot=>slot==='LB'?-1:1;
const player=(m,t,slot)=>m.playersById[`${t[0]}-${slot}`];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clone=x=>x==null?null:JSON.parse(JSON.stringify(x));

function init(seed){
  const m=E.createMatch(seed);
  for(const p of m.players)A.assign(m,p.id,A.baseProfile(60));
  M.init(m,{HOME:'BALANCED',AWAY:'BALANCED'});
  m.offBallPolicy='CURRENT';m.time=30;m.protagonistControllerId='NO_USER_CHOICE';
  return m;
}
function anchor(m,team,slot){
  const pr=T.describe(team,m),b=local(team,m.ball),compact=1-(pr.compactness-.5)*.36;
  return{x:Math.max(18,Math.min(39,15+pr.lineHeight*10+b.x*.16))+1.5,
    y:Math.max(5,Math.min(63,34+sign(slot)*25.5*compact+(b.y-34)*(.20+pr.compactness*.18)*.48))};
}
function noDuplicate(state,label){
  assert.deepEqual(state.diagnostics.duplicateThreats,[],`${label}: duplicate diagnostic`);
  const used=new Set();
  for(const t of state.threats){
    assert(t.owners.length<=1,`${label}: ${t.id} duplicate owners`);
    assert(!t.owners.includes(state.coverOwnerId),`${label}: cover reused as marker`);
    for(const id of t.owners){assert(!used.has(id),`${label}: one body spent on multiple threats`);used.add(id);}
  }
}
// The independent band uses #2069's 4.8m protective-cover stagger. A CB's
// CURRENT depth (never its chasing target) and the role anchor both constrain it.
function inspect(m,team,label){
  const state=m._defensiveResponsibility?.[team],defending=!m.restart&&m.possession!==team;
  if(defending)assert(state,`${label}: responsibility exists`);
  if(state)noDuplicate(state,label);
  const fullbacks=['LB','RB'].map(slot=>{
    const fb=player(m,team,slot),cb=player(m,team,slot==='LB'?'LCB':'RCB'),r=state?.records[fb.id]||{};
    const roleAnchor=anchor(m,team,slot),limit=Math.min(roleAnchor.x,local(team,cb).x)+4.8;
    const t=m.playersById[r.targetId],tl=t&&local(team,t),central=t&&['CM','WF'].includes(t.role)&&Math.abs(tl.y-34)<=13.5;
    const nonCarrier=t&&!(m.ball.mode==='CONTROLLED'&&m.ball.ownerId===t.id);
    if(defending&&central&&nonCarrier&&r.type==='MARK'){
      assert(r.centralEmergency?.allowed,`${label}: ${slot} ordinary central runner owned by FB`);
      assert(tl.x<=16.5||tl.x<Math.min(roleAnchor.x,local(team,cb).x),`${label}: current deep penetration required`);
    }
    if(defending&&r.reason==='FULLBACK_CENTRAL_DUTY_RELEASE'){
      assert.equal(r.targetId,null,`${label}: release target`);
      assert.equal(fb.markTargetId,null,`${label}: release explicit mark`);
      assert.equal(fb.tacticalTask,'FB_RETURN_TO_ROLE',`${label}: no later chase writer`);
      // Tactical observations occur less frequently than .05s motor steps. Check
      // the authored band from that observation, not a subsequently moved CB.
      assert(target(team,fb).x<=r.centralBand.forwardLimit+EPS,`${label}: executable line band`);
      assert(distance({x:fb.tx,y:fb.ty},r.motion.actualTarget)<EPS,`${label}: ledger/motor destination`);
      assert.equal(fb.finalMovementIntent?.type||fb.tacticalTask,'FB_RETURN_TO_ROLE',`${label}: final motor authority`);
    }
    return{id:fb.id,slot,currentLocal:local(team,fb),targetLocal:target(team,fb),roleAnchor,forwardLimit:limit,
      sameSideCB:{id:cb.id,currentLocal:local(team,cb),targetLocal:target(team,cb)},
      responsibility:clone(r),targetPlayer:t?{id:t.id,role:t.role,slot:t.slot,currentLocal:tl}:null,
      duty:r.centralEmergency?.allowed?'CENTRAL_EMERGENCY':r.type==='CONTAIN'?'WIDE_CONTAIN':r.type==='PRESS'?'PRESS':r.type==='RECOVERY'?'RECOVERY':r.type||'ZONE',
      tacticalTask:fb.tacticalTask,markTargetId:fb.markTargetId||null};
  });
  assert(!/"(?:futureOutcome|winner|result)"\s*:/.test(JSON.stringify(state)),`${label}: no precomputed outcome`);
  return{time:m.time,defending,responsibilityAt:state?.at??null,ball:{mode:m.ball.mode,ownerId:m.ball.ownerId||null,local:local(team,m.ball)},fullbacks};
}
const specs=[
  {id:'NO_WALL_INDIRECT',kind:'FREE_KICK',x:35,y:54,metadata:{freeKickType:'INDIRECT'},event:'FREE_KICK_TAKEN'},
  {id:'CORNER_TOP',kind:'CORNER',x:0,y:0,metadata:{cornerType:'DELIVERED'},event:'CORNER_KICK'},
  {id:'CORNER_BOTTOM',kind:'CORNER',x:0,y:68,metadata:{cornerType:'DELIVERED'},event:'CORNER_KICK'},
  {id:'STRONG_WALL_DIRECT',kind:'FREE_KICK',x:17,y:34,metadata:{freeKickType:'DIRECT'},event:'FREE_KICK_TAKEN'}
];
function realRestart(spec,attack,seedSuffix=''){
  const defence=other(attack),m=init(`V62-EXACT-${spec.id}${seedSuffix}`);
  const point=attack==='AWAY'?{x:spec.x,y:spec.y}:world('AWAY',spec.x,spec.y);
  E.choiceActionBridge().startDeadRestart(m,spec.kind,attack,point.x,point.y,null,spec.metadata);
  let kickAt=null,kickTick=null,setup=false,wallIds=[];const frames=[];
  for(let tick=0;tick<1000;tick++){
    if(m.restart?.setup)setup=true;
    E.step(m,DT);
    if(kickAt===null&&m.events.some(e=>e.type===spec.event)){kickAt=m.time;kickTick=tick;wallIds=[...(m.setPieceWallRecovery?.wallIds||[])];}
    if(kickAt!==null){
      const offset=Number(((tick-kickTick)*DT).toFixed(2));
      frames.push({...inspect(m,defence,`${spec.id} ${attack}${seedSuffix} +${offset}`),offset});
      if(offset>=2.5)break;
    }
  }
  assert(setup&&kickAt!==null,`${spec.id}: normal setup and kick`);
  assert.equal(frames.length,51,`${spec.id}: kick through +2.5s`);
  for(let i=1;i<frames.length;i++)assert(Math.abs(frames[i].offset-frames[i-1].offset-DT)<EPS,'0.05s sampling');
  // Zero ordinary-central ownership ticks is stronger than permitting a short
  // chase. Record actual displacement as well as the assignment/motor targets.
  let longestChase=0;
  for(const slot of ['LB','RB']){let consecutive=0;
    for(const f of frames){const b=f.fullbacks.find(p=>p.slot===slot),t=b.targetPlayer;
      const chasing=f.defending&&b.responsibility.type==='MARK'&&t?.role==='CM'&&!b.responsibility.centralEmergency?.allowed;
      consecutive=chasing?consecutive+1:0;longestChase=Math.max(longestChase,consecutive);
    }
  }
  assert.equal(longestChase,0,`${spec.id}: no FB-CM long chase sequence`);
  assert(!(m.userChoiceLog||[]).length&&!m.events.some(e=>e.type==='USER_CHOICE'),'no unchosen protagonist action');
  if(spec.id==='STRONG_WALL_DIRECT'){
    assert(wallIds.includes(`${defence[0]}-LB`)&&wallIds.includes(`${defence[0]}-RB`),'wall composition retained');
    for(const f of frames.filter(f=>f.defending))for(const b of f.fullbacks)if(b.responsibility.reason==='FREE_KICK_WALL_ROLE_RECOVERY'){
      assert.equal(b.tacticalTask,'FREE_KICK_WALL_RECOVERY');assert(b.slot==='LB'?b.targetLocal.y<=22:b.targetLocal.y>=46,'wall handoff own side');
    }
  }
  return{id:spec.id,attack,seedSuffix,kickAt,longestChase,frames};
}
function fixture(team,slot){
  const m=init(`V62-CENTRAL-${team}-${slot}`),attack=other(team),sg=sign(slot);
  const put=(p,x,y)=>{const q=world(team,x,y);Object.assign(p,{x:q.x,y:q.y,tx:q.x,ty:q.y,vx:0,vy:0,markTargetId:null});};
  m.restart=null;m.setPieceLive=null;m.phase='OPEN_PLAY';m.possession=attack;m._lastTacticalPossession=attack;m.time=100;
  for(const p of m.players)put(p,p.team===team?75:80,34);
  const fb=player(m,team,slot),cb=player(m,team,slot==='LB'?'LCB':'RCB'),cm=player(m,team,slot==='LB'?'LCM':'RCM');
  const runner=player(m,attack,slot==='LB'?'RCM':'LCM'),owner=player(m,attack,'CM'),press=player(m,team,'ST'),cover=player(m,team,'CM');
  put(fb,32,34+sg*8);put(cb,18,34+sg*8);put(cm,29,34+sg*8);put(runner,34,34+sg*8);put(owner,65,34);put(press,64,34);
  m.ball={...m.ball,mode:'CONTROLLED',ownerId:owner.id,x:owner.x,y:owner.y,z:0,lastTouchTeam:attack,lastTouchPlayer:owner.id};
  m._defenceRoleLocks={[team]:{pressId:press.id,coverId:cover.id,until:110}};
  return{m,team,slot,fb,cb,cm,runner,owner,press,cover,put};
}
function reconcile(f){
  const state=T.reconcileDefensiveResponsibilities(f.m,f.team,f.owner);
  T.executeDefensiveResponsibilityMotion(f.m,f.team,f.owner,state);noDuplicate(state,`${f.team} ${f.slot}`);
  return state;
}
function seedOwnership(f,kind){
  const {m,team,fb,runner}=f;
  if(kind==='explicit')fb.markTargetId=runner.id;
  if(kind==='beaten'){fb.beatenRecoveryUntil=110;fb.beatenRecoveryTargetId=runner.id;fb.tacticalTask='RECOVERY_CHASE';fb.markTargetId=runner.id;}
  if(['prior','LOCKED_MARK'].includes(kind)){
    m.offBallPolicy=kind==='LOCKED_MARK'?'LOCKED_MARK':'CURRENT';
    m._defensiveResponsibility={[team]:{records:{[fb.id]:{type:'MARK',targetId:runner.id,assignmentAt:99.9,holdUntil:110,epoch:1}},threats:[{id:runner.id,owners:[fb.id]}]}};
    m._markLocks={[team]:{pairs:{[fb.id]:runner.id},until:110}};
  }
  if(kind==='vacancy')m._transitionWideVacancies={[team]:{[f.slot]:{slot:f.slot,fbId:fb.id,threatId:runner.id,handoffOwnerId:fb.id,until:110}}};
}
function checkSafe(f,label,expectedOwner=f.cm){
  const state=reconcile(f),r=state.records[f.fb.id],threat=state.threats.find(t=>t.id===f.runner.id);
  assert(!threat.owners.includes(f.fb.id),`${label}: nearest/prior FB must not own ordinary CM`);
  if(expectedOwner)assert.deepEqual(threat.owners,[expectedOwner.id],`${label}: CM first, then suitable CB`);
  else assert.equal(threat.owners.length,0,`${label}: preserve shape without suitable central owner`);
  assert.equal(f.fb.markTargetId,null,`${label}: explicit mark cleared`);
  assert(!f.m._markLocks?.[f.team]?.pairs?.[f.fb.id],`${label}: stale lock cleared`);
  assert.equal(r.reason,'FULLBACK_CENTRAL_DUTY_RELEASE',`${label}: current role recovery`);
  assert.equal(f.fb.tacticalTask,'FB_RETURN_TO_ROLE');
  assert(target(f.team,f.fb).x<=Math.min(anchor(f.m,f.team,f.slot).x,local(f.team,f.cb).x)+4.8+EPS,`${label}: independent band`);
  assert(Math.abs(target(f.team,f.fb).y-anchor(f.m,f.team,f.slot).y)<EPS,`${label}: own flank`);
  return{label,owner:threat.owners[0]||null,target:target(f.team,f.fb)};
}
const mirrored=[];
for(const team of ['HOME','AWAY'])for(const slot of ['LB','RB']){
  const label=`${team} ${slot}`,rows=[];
  for(const kind of ['nearest','explicit','prior','LOCKED_MARK','vacancy','beaten']){
    const f=fixture(team,slot);seedOwnership(f,kind);rows.push(checkSafe(f,`${label} ${kind}`));
  }
  const wf=fixture(team,slot);wf.runner.role='WF';rows.push(checkSafe(wf,`${label} inward WF`));
  const movingLine=fixture(team,slot);rows.push(checkSafe(movingLine,`${label} initial CB band`));
  movingLine.put(movingLine.cb,8,34+sign(slot)*8);
  const highTarget=world(team,65,34+sign(slot)*8);movingLine.cb.tx=highTarget.x;movingLine.cb.ty=highTarget.y;
  movingLine.m.time+=DT;rows.push(checkSafe(movingLine,`${label} retreating CB overrides retained epoch and high CB target`));
  assert(target(team,movingLine.fb).x<=12.8+EPS,'current CB depth controls stagger');
  const intended=fixture(team,slot),landing=world(team,10,34+sign(slot)*8);
  Object.assign(intended.m.ball,{mode:'FLIGHT',ownerId:null,kind:'PASS',intendedTargetX:landing.x,intendedTargetY:landing.y,intendedReceiverId:intended.runner.id});
  rows.push(checkSafe(intended,`${label} intended deep reception confers no emergency`));
  const formerCB=fixture(team,slot);formerCB.cb.markTargetId=formerCB.runner.id;
  rows.push(checkSafe(formerCB,`${label} CM outranks prior CB`));assert.equal(formerCB.cb.markTargetId,null,'no losing explicit CB double mark');
  const cb=fixture(team,slot);cb.put(cb.cm,70,34);rows.push(checkSafe(cb,`${label} CB handoff`,cb.cb));
  const covered=fixture(team,slot);covered.m._defenceRoleLocks[team].coverId=covered.cm.id;covered.cm.markTargetId=covered.runner.id;
  rows.push(checkSafe(covered,`${label} preserve required COVER`,covered.cb));
  assert.equal(covered.m._defensiveResponsibility[team].records[covered.cm.id].type,'COVER');
  const unavailable=fixture(team,slot);unavailable.put(unavailable.cm,70,34);unavailable.put(unavailable.cb,70,34);
  rows.push(checkSafe(unavailable,`${label} no suitable central defender`,null));
  const deep=fixture(team,slot);deep.put(deep.runner,12,34+sign(slot)*8);deep.put(deep.fb,14,34+sign(slot)*12);
  deep.put(deep.cm,60,34);deep.put(deep.cb,30,34+sign(slot)*8);
  let state=reconcile(deep),r=state.records[deep.fb.id];
  assert.equal(r.type,'MARK',`${label}: deep runner emergency retained`);assert.equal(r.targetId,deep.runner.id);
  assert.equal(r.centralEmergency.allowed,true);assert.equal(r.centralEmergency.goalSideCoverIds.length,0);
  const halfspace=fixture(team,slot);halfspace.put(halfspace.runner,19,34+sign(slot)*10);
  halfspace.put(halfspace.fb,21,34+sign(slot)*14);halfspace.put(halfspace.cm,60,34);halfspace.put(halfspace.cb,40,34+sign(slot)*8);
  assert.equal(reconcile(halfspace).records[halfspace.fb.id].targetId,halfspace.runner.id,`${label}: penetrated half-space emergency outside penalty box`);
  // Current structural cover removes the emergency, even with a live MARK epoch.
  deep.put(deep.cm,10,34+sign(slot)*8);deep.m.time+=DT;state=reconcile(deep);
  assert(!state.threats.find(t=>t.id===deep.runner.id).owners.includes(deep.fb.id),'current goal-side cover hands back');
  assert(state.threats.find(t=>t.id===deep.runner.id).owners.includes(deep.cm.id));
  // A runner retreating into second-wave space releases immediately; no timer.
  const retreat=fixture(team,slot);seedOwnership(retreat,'LOCKED_MARK');retreat.put(retreat.runner,45,34+sign(slot)*8);
  const released=reconcile(retreat).records[retreat.fb.id];assert.equal(released.targetId,null);assert.equal(retreat.fb.markTargetId,null);
  assert.equal(retreat.fb.tacticalTask,'FB_RETURN_TO_ROLE','non-material stale central lock recovery');
  // Full production assignment, including proposal collection and later writers.
  const live=fixture(team,slot);seedOwnership(live,'beaten');T.assign(live.m);
  const liveRecord=live.m._defensiveResponsibility[team].records[live.fb.id];
  assert.notEqual(liveRecord.targetId,live.runner.id,'production rejects beaten central chase');
  const wide=fixture(team,slot),wing=player(wide.m,other(team),slot==='LB'?'RW':'LW');
  wide.put(wide.fb,20,34+sign(slot)*24);wide.put(wing,42,34+sign(slot)*24);T.assign(wide.m);
  r=wide.m._defensiveResponsibility[team].records[wide.fb.id];assert.equal(r.type,'CONTAIN');assert.equal(r.targetId,wing.id);
  assert.equal(wide.fb.tacticalTask,'FB_WIDE_ZONE_CONTAIN');
  wide.put(wide.fb,39,34+sign(slot)*24);Object.assign(wide.m.ball,{ownerId:wing.id,x:wing.x,y:wing.y});
  wing.action='CARRY_FORWARD';wing.controlledSince=98;wide.m.time+=DT;T.assign(wide.m);
  r=wide.m._defensiveResponsibility[team].records[wide.fb.id];assert.equal(r.type,'PRESS');assert.equal(r.targetId,wing.id);
  mirrored.push({team,slot,rows,emergency:'PASS',wideContainAndCarrier:'PASS'});
}

function exactChoiceBoundary(){
  const H=require('../live_hybrid_session_v02'),V=require('../live_v06_scene_authority_browser'),S=require('../runtime/continuous_spatial_authority_v2');
  const hash=x=>require('crypto').createHash('sha256').update(JSON.stringify(x)).digest('hex');
  const seed='V53-EXACT-CHOICE-CURRENT',session=H.createSession({seed,heroTeam:'HOME',heroRole:'ST',heroPlayerId:'H-ST',durationSeconds:180,continuousSpatialAuthorityV2Coarse:true,matchId:seed});
  const hero=session.state.spatial.players.find(p=>p.id==='H-ST');
  S.advanceCoarseTo(session,8,{heroPlayerId:null,record:()=>{
    const sp=session.state.spatial,row=clone({...sp,boundaryId:null,rngState:session.rngState,eventId:'V53_ACTUAL_COARSE',possession:session.state.possession,phase:session.state.phase,score:session.state.score});
    S.appendActualHistory(session.actualHistory,row,'ACTUAL_COARSE_INTEGRATION',45);
  }});
  Object.assign(session.state.ball,{mode:'CONTROLLED',kind:'CONTROL',ownerId:hero.id,lastTouchPlayerId:hero.id,lastTouchTeam:hero.team,x:hero.x,y:hero.y});S.syncBallDerived(session.state);
  const boundary=H.advanceUntilBoundary(session).boundary;assert.equal(boundary.type,'PROTAGONIST_2D_WINDOW');
  const opened=V.runToChoice(boundary,{seed:`${seed}|${boundary.sceneId}|CURRENT`,runtimeDir:path.join(__dirname,'../runtime')});
  const option=opened.state.pending?.options.find(o=>o.targetId)||opened.state.pending?.options[0];assert(option);
  assert(!(opened.state.m.userChoiceLog||[]).length&&!opened.state.m.events.some(e=>e.type==='USER_CHOICE'),'no action before user choice');
  const signature=()=>hash({snapshot:opened.E.snapshot(opened.state.m),pending:opened.state.pending,rng:opened.state.m.r.observe()}),before=signature();
  assert.throws(()=>V.applyChoiceAndAdvance(opened,option.id,'EXACT-TARGET-DOES-NOT-EXIST'),/CHOICE_TARGET_NOT_AVAILABLE/);
  assert.equal(signature(),before,'invalid exact target cannot mutate simulation or RNG');
  const applied=V.applyChoiceAndAdvance(opened,option.id,option.targetId??null,{maxPostSeconds:1});
  const receipt=applied.applyReceipt,commit=applied.state.m.events.find(e=>e.type==='USER_CHOICE'&&e.commitEventId===receipt.commitEventId);
  assert(commit&&applied.committedEvent?.commitEventId===receipt.commitEventId,'causal user commit');
  assert.equal(applied.selectedChoice.id,option.id);assert.equal(receipt.choice,option.id);assert.equal(commit.choiceId,option.id);
  for(const value of [receipt.targetId,commit.targetId,applied.committedEvent.targetId])assert.equal(value??null,option.targetId??null,'exact target authority');
  (function scan(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(key==='futureOutcomePrecomputed')assert.equal(child,false);else scan(child);}})({receipt,snapshot:applied.snapshot,commit,nextPending:applied.nextPending});
  return{status:'PASS',choiceId:option.id,targetId:option.targetId??null,invalidTargetUnchanged:true,noUnchosenAction:true,futureOutcomePrecomputed:false};
}

const real=specs.flatMap(spec=>['AWAY','HOME'].map(team=>realRestart(spec,team)));
// Small independent seed sample uses the same unmodified real restart path.
const sample=specs.slice(0,3).map(spec=>realRestart(spec,'AWAY','-CENTRAL-SAMPLE-2'));
const source=fs.readFileSync(path.join(__dirname,'../runtime/tactical_movement.js'),'utf8');
assert(!/\b(?:futureOutcome|winner|result)\s*[:=]/.test(source),'no outcome precompute in tactical source');
console.log(JSON.stringify({verdict:'PASS_V62_FULLBACK_CENTRAL_MIDFIELD_CHASE',sampleInterval:DT,
  clock:'MOTOR_STEPS_0.05_SECONDS',sourceSha256:require('crypto').createHash('sha256').update(source).digest('hex'),
  real,sample,mirrored,exactChoice:exactChoiceBoundary(),futureOutcomePrecomputed:false,userVisualPass:false},null,2));
