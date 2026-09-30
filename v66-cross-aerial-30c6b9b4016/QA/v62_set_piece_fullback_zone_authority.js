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
function wides(m,team,slot){
  return m.players.filter(p=>p.team===other(team)&&['WF','FB'].includes(p.role)).filter(p=>{
    const q=local(team,p),vacancy=Object.values(m._transitionWideVacancies?.[team]||{}).some(v=>v?.threatId===p.id&&m.time<v.until);
    return Math.sign(q.y-34)===sign(slot)&&Math.abs(q.y-34)>=15&&(q.x<=49||vacancy);
  });
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
function inspect(m,team,label,{motor=false}={}){
  const state=m._defensiveResponsibility?.[team];
  const defending=!m.restart&&m.possession!==team;
  if(defending)assert(state,`${label}: production responsibility exists`);
  if(state)noDuplicate(state,label);
  const rows=['LB','RB'].map(slot=>{
    const fb=player(m,team,slot),cb=player(m,team,slot==='LB'?'LCB':'RCB'),r=state?.records[fb.id]||{};
    const material=wides(m,team,slot),q=target(team,fb);
    // During motor intervals the ledger is the most recent tactical assignment;
    // assertions on its authored relationship use that same causal observation.
    if(defending&&material.length){
      assert(!state.threats.some(t=>['CENTRAL','CENTRAL_RUNNER'].includes(t.kind)&&t.owners.includes(fb.id)),`${label}: ${slot} spent centrally`);
    }
    if(defending&&material.length&&r.reason!=='FREE_KICK_WALL_ROLE_RECOVERY'){
      const currentCarrier=m.ball.mode==='CONTROLLED'&&m.playersById[m.ball.ownerId];
      const liveDuty=['PRESS','COVER'].includes(r.type)&&currentCarrier;
      const currentContact=['PRIMARY_LOOSE_BALL_CHASE','CURRENT_FLIGHT_CONTACT'].includes(r.reason);
      assert(r.type==='CONTAIN'||liveDuty||currentContact||r.wideUrgency,`${label}: ${slot} non-urgent wide duty must be zonal`);
      if(r.type==='MARK'){
        assert.equal(r.wideUrgency?.reason,'CURRENT_WIDE_RECEIVE',`${label}: tight mark needs current receive evidence`);
        assert(r.wideUrgency.distanceToThreat<=2.05,`${label}: immediate receive proximity`);
      }
    }
    if(defending&&r.type==='CONTAIN'){
      assert.equal(r.reason,'FULLBACK_WIDE_ZONAL_CONTROL');
      assert.equal(fb.tacticalTask,'FB_WIDE_ZONE_CONTAIN',`${label}: ${slot} later writer replaced zone`);
      assert.equal(fb.markTargetId,null,`${label}: ${slot} hard mark retained`);
      assert.equal(r.motion.markBand,null,`${label}: ${slot} tight mark band`);
      const z=r.wideZone,w=z.currentThreatLocal;
      if(!motor){
        assert(distance(z.anchorLocal,anchor(m,team,slot))<EPS,`${label}: role-aware anchor reference`);
        assert(q.x<=Math.min(anchor(m,team,slot).x,local(team,cb).x)+4.8+EPS,`${label}: independent current back-line bound`);
      }
      assert(q.x<=Math.max(2.5,w.x-3.2)+EPS,`${label}: ${slot} not goal-side at assignment`);
      assert(q.x<=Math.min(z.anchorLocal.x,z.cbLocal.x)+4.8+EPS,`${label}: ${slot} abandoned CB depth`);
      assert(distance(q,w)>=3.2-EPS,`${label}: ${slot} tight chasing target`);
      assert(sign(slot)*(q.y-34)>0,`${label}: ${slot} swapped side`);
      assert(sign(slot)*(q.y-z.cbLocal.y)>0,`${label}: ${slot} inside CB`);
      const live=m.playersById[r.targetId];
      if(live){const wl=local(team,live);assert(q.x<=Math.max(2.5,wl.x+.5),`${label}: ${slot} runs beyond current attacker`);}
      if(motor){
        assert.equal(fb.finalMovementIntent?.type,'FB_WIDE_ZONE_CONTAIN',`${label}: final arbiter consumes zonal task`);
        assert(distance(fb.finalMovementIntent.targetPoint,{x:fb.tx,y:fb.ty})<EPS,`${label}: sealed motor destination`);
      }
      assert(distance({x:fb.tx,y:fb.ty},r.motion.actualTarget)<EPS,`${label}: ledger and motor target disagree`);
    }
    return{id:fb.id,actualLocal:local(team,fb),targetLocal:q,anchorLocal:anchor(m,team,slot),
      cb:{id:cb.id,actualLocal:local(team,cb),targetLocal:target(team,cb)},
      materialWide:material.map(p=>({id:p.id,local:local(team,p)})),
      responsibility:clone(r),tacticalTask:fb.tacticalTask,action:fb.action,markTargetId:fb.markTargetId||null,
      wideContainRelationship:clone(fb.wideContainRelationship),finalMovementIntent:clone(fb.finalMovementIntent)};
  });
  if(rows.every(r=>r.responsibility.type==='CONTAIN'))assert(rows[0].targetLocal.y<rows[1].targetLocal.y,`${label}: LB/RB order`);
  assert(!/"(?:futureOutcome|winner|result)"\s*:/.test(JSON.stringify(state)),`${label}: precomputed outcome`);
  return{time:m.time,defending,phase:m.phase,responsibilityAt:state?.at??null,ball:{mode:m.ball.mode,ownerId:m.ball.ownerId||null,local:local(team,m.ball),z:m.ball.z||0},fullbacks:rows};
}

const specs=[
  {id:'NO_WALL_INDIRECT',kind:'FREE_KICK',x:35,y:54,metadata:{freeKickType:'INDIRECT'},event:'FREE_KICK_TAKEN'},
  {id:'CORNER_TOP',kind:'CORNER',x:0,y:0,metadata:{cornerType:'DELIVERED'},event:'CORNER_KICK'},
  {id:'CORNER_BOTTOM',kind:'CORNER',x:0,y:68,metadata:{cornerType:'DELIVERED'},event:'CORNER_KICK'},
  {id:'STRONG_WALL_DIRECT',kind:'FREE_KICK',x:17,y:34,metadata:{freeKickType:'DIRECT'},event:'FREE_KICK_TAKEN'}
];
function realRestart(spec,attack){
  const defence=other(attack),m=init(`V62-EXACT-${spec.id}`);
  // HOME fixtures rotate the entire restart about the pitch centre; LB/RB are
  // always evaluated in their OWN team's coordinates.
  const kickPoint=attack==='AWAY'?{x:spec.x,y:spec.y}:world('AWAY',spec.x,spec.y);
  E.choiceActionBridge().startDeadRestart(m,spec.kind,attack,kickPoint.x,kickPoint.y,null,spec.metadata);
  let kickAt=null,kickTick=null,setup=false;const frames=[];
  for(let tick=0;tick<1000;tick++){
    if(m.restart?.setup)setup=true;
    E.step(m,DT);
    if(kickAt===null&&(m.events||[]).some(e=>e.type===spec.event)){kickAt=m.time;kickTick=tick;}
    if(kickAt!==null){
      const offset=Number(((tick-kickTick)*DT).toFixed(2));
      frames.push({...inspect(m,defence,`${spec.id} ${attack} +${offset.toFixed(2)}`,{motor:true}),offset});
      if(offset>=2.1)break;
    }
  }
  assert(setup&&kickAt!==null,`${spec.id} ${attack}: normal restart setup and kick`);
  assert(frames.length>=41&&frames.at(-1).offset>=2,`${spec.id}: at least +2s captured`);
  for(let i=1;i<frames.length;i++)assert(Math.abs(frames[i].offset-frames[i-1].offset-DT)<EPS,`${spec.id}: .05s sampling`);
  assert(!(m.userChoiceLog||[]).length&&!m.events.some(e=>e.type==='USER_CHOICE'),`${spec.id}: unchosen protagonist action`);
  const zonal=frames.filter(f=>f.defending).flatMap(f=>f.fullbacks).filter(f=>f.responsibility.type==='CONTAIN');
  if(spec.id!=='STRONG_WALL_DIRECT')assert(zonal.length>0,`${spec.id} ${attack}: real delivery must exercise zonal control`);
  if(spec.id==='STRONG_WALL_DIRECT'){
    assert(m.setPieceWallRecovery?.wallIds.includes(`${defence[0]}-LB`)&&m.setPieceWallRecovery.wallIds.includes(`${defence[0]}-RB`),'strong wall FB membership retained');
    for(const f of frames.filter(f=>f.defending))for(const fb of f.fullbacks){
      if(fb.responsibility.reason==='FREE_KICK_WALL_ROLE_RECOVERY'){
        assert.equal(fb.tacticalTask,'FREE_KICK_WALL_RECOVERY');
        assert(fb.id.endsWith('LB')?fb.targetLocal.y<=22:fb.targetLocal.y>=46,'#2062 own-side wall handoff');
      }
    }
  }
  return{id:spec.id,attack,defence,kickAt,frames,zonalSamples:zonal.length};
}

function fixture(team,slot){
  const m=init(`V62-ZONE-${team}-${slot}`),attack=other(team),sg=sign(slot);
  const put=(p,x,y)=>{const q=world(team,x,y);Object.assign(p,{x:q.x,y:q.y,tx:q.x,ty:q.y,vx:0,vy:0,markTargetId:null});};
  m.restart=null;m.setPieceLive=null;m.phase='OPEN_PLAY';m.possession=attack;m._lastTacticalPossession=attack;m.time=100;
  for(const p of m.players)put(p,p.team===team?30:78,34);
  const fb=player(m,team,slot),cb=player(m,team,slot==='LB'?'LCB':'RCB'),wing=player(m,attack,slot==='LB'?'RW':'LW'),owner=player(m,attack,'CM');
  put(fb,20,34+sg*24);put(cb,18,34+sg*8);put(wing,42,34+sg*24);put(owner,40,34);
  put(player(m,team,'CM'),38,34);put(player(m,team,slot==='LB'?'RCB':'LCB'),20,34-sg*8);
  const ball=(mode,p=owner)=>{m.ball={...m.ball,mode,ownerId:mode==='CONTROLLED'?p.id:null,x:p.x,y:p.y,z:0,lastTouchTeam:attack,lastTouchPlayer:p.id};};
  ball('CONTROLLED');
  return{m,team,slot,fb,cb,wing,owner,put,ball};
}
function assigned(f,label){T.assign(f.m);return inspect(f.m,f.team,label).fullbacks.find(p=>p.id===f.fb.id);}
function expectZone(f,label){
  const row=assigned(f,label);
  assert.equal(row.responsibility.type,'CONTAIN',`${label}: explicit zonal owner`);
  assert.equal(row.responsibility.targetId,f.wing.id,`${label}: own-flank responsibility`);
  assert(distance(row.targetLocal,local(f.team,f.wing))>3.45,`${label}: no former FB tight-mark maximum`);
  return row;
}
const mirrored=[];
for(const team of ['HOME','AWAY'])for(const slot of ['LB','RB']){
  const label=`${team} ${slot}`,f=fixture(team,slot);
  const first=expectZone(f,`${label} default`);
  // A prior MARK lock, beaten-runner flag and live-looking recovery proposal
  // cannot confer current ball authority on a non-carrier.
  f.m.offBallPolicy='LOCKED_MARK';f.fb.beatenRecoveryUntil=110;f.fb.beatenRecoveryTargetId=f.wing.id;
  f.fb.markTargetId=f.wing.id;f.fb.tacticalTask='RECOVERY_CHASE';
  f.m._defensiveResponsibility[team].records[f.fb.id]={type:'MARK',targetId:f.wing.id,assignmentAt:99.9,holdUntil:110,epoch:20};
  f.m._markLocks[team]={pairs:{[f.fb.id]:f.wing.id},until:110};f.m.time+=DT;
  expectZone(f,`${label} stale MARK and RECOVERY_CHASE`);
  assert(!f.m._markLocks[team].pairs[f.fb.id],`${label}: no retained man-mark lock`);
  // A non-carrier that is now goal-side of the FB still calls for channel
  // recovery, not a run alongside it to reduce Euclidean distance.
  f.put(f.fb,45,34+sign(slot)*24);f.m.time+=DT;expectZone(f,`${label} FB beyond non-carrier`);
  // Current receive proximity releases the zone, but intended landing alone does not.
  const flight=fixture(team,slot);flight.ball('FLIGHT');
  flight.m.ball.kind='CROSS';flight.m.ball.intendedTargetX=flight.wing.x;flight.m.ball.intendedTargetY=flight.wing.y;
  expectZone(flight,`${label} distant cross intent`);
  flight.m.time+=DT;flight.ball('FLIGHT',flight.wing);
  flight.m.ball.x+=team==='HOME'?-.5:.5;flight.m.ball.vx=team==='HOME'?-10:10;
  expectZone(flight,`${label} outgoing kick proximity`);
  flight.m.time+=DT;flight.ball('FLIGHT',flight.wing);flight.m.ball.lastTouchPlayer=flight.owner.id;flight.m.ball.z=4.2;
  expectZone(flight,`${label} overhead ball not playable`);
  flight.m.time+=DT;flight.m.ball.z=1;

  const receive=assigned(flight,`${label} current playable receive`);
  assert.equal(receive.responsibility.type,'MARK',`${label}: immediate receive permits tighter duty`);
  const contact=fixture(team,slot);contact.ball('FLIGHT',contact.fb);contact.m.ball.kind='CROSS';contact.m.ball.z=3;
  const contest=assigned(contact,`${label} current flight contact`);
  assert.equal(contest.tacticalTask,'AERIAL_FIRST_BALL',`${label}: current defender contact retained`);
  const loose=fixture(team,slot);loose.ball('LOOSE',loose.fb);
  const looseRow=assigned(loose,`${label} loose primary`);
  assert.equal(looseRow.tacticalTask,'CHASE_LOOSE',`${label}: selected loose responder retained`);
  const emergency=fixture(team,slot);emergency.put(emergency.fb,10,35);emergency.put(emergency.owner,8,34);emergency.ball('CONTROLLED');
  emergency.owner.action='CARRY_FORWARD';emergency.owner.controlledSince=98;
  const lastCover=assigned(emergency,`${label} goal-line last cover`);
  assert.equal(lastCover.responsibility.type,'PRESS',`${label}: current goal-line carrier can override flank shape`);
  const switched=fixture(team,slot);expectZone(switched,`${label} initial flank owner`);
  switched.m.offBallPolicy='LOCKED_MARK';switched.put(switched.wing,75,34+sign(slot)*24);
  const newWide=player(switched.m,other(team),slot==='LB'?'RB':'LB');switched.put(newWide,38,34+sign(slot)*23);switched.m.time+=DT;
  const switchRow=assigned(switched,`${label} different current wide threat`);
  assert.equal(switchRow.responsibility.type,'CONTAIN');assert.equal(switchRow.responsibility.targetId,newWide.id,`${label}: relationship is not a one-to-one lock`);
  const geometry=[];
  for(const [cbX,wideX] of [[10,24],[18,42],[30,48]]){
    const g=fixture(team,slot);g.put(g.cb,cbX,34+sign(slot)*8);g.put(g.wing,wideX,34+sign(slot)*24);
    geometry.push(expectZone(g,`${label} relational geometry ${cbX}/${wideX}`).targetLocal.x);
  }
  assert(Math.max(...geometry)-Math.min(...geometry)>8,`${label}: target follows structural geometry, not a fixed coordinate`);
  // Change possession authority in the existing match, with no phase timer.
  f.m.offBallPolicy='CURRENT';f.fb.beatenRecoveryUntil=0;f.put(f.fb,39,34+sign(slot)*24);f.ball('CONTROLLED',f.wing);
  f.wing.action='CARRY_FORWARD';f.wing.controlledSince=98;f.m.time+=DT;
  const carrier=assigned(f,`${label} current carrier`);
  assert.equal(carrier.responsibility.type,'PRESS',`${label}: current carrier pressure`);
  assert(['PRESS_CONTAIN','ENGAGE','RECOVERY_CHASE'].includes(carrier.tacticalTask),`${label}: carrier can step out`);
  assert(carrier.targetLocal.x>first.targetLocal.x+4.8,`${label}: line band does not suppress current carrier response`);
  f.put(f.fb,40.5,34+sign(slot)*24);f.fb.duelPairCooldownUntil=f.m.time+1;f.fb.duelPairCooldownOwnerId=f.wing.id;f.m.time+=DT;
  assert.notEqual(assigned(f,`${label} contact cooldown`).tacticalTask,'ENGAGE',`${label}: existing contact cooldown`);
  f.fb.duelPairCooldownUntil=0;f.fb.duelContainUntil=0;f.m.time+=DT;
  assert.equal(assigned(f,`${label} current contact`).tacticalTask,'ENGAGE',`${label}: eligible current contact remains active`);
  // Carrier handback immediately restores zone, including an old PRESS epoch.
  f.ball('CONTROLLED');f.m.time+=DT;expectZone(f,`${label} carrier handback`);
  // Retreat out of material geometry, without waiting for the old hold deadline.
  f.put(f.wing,70,34+sign(slot)*24);f.m.time+=DT;
  const release=assigned(f,`${label} threat released`),a=anchor(f.m,team,slot);
  assert.equal(release.responsibility.targetId,null,`${label}: released target`);
  assert.equal(release.tacticalTask,'FB_RETURN_TO_ROLE',`${label}: anchor recovery, not stale chase`);
  assert(distance(release.targetLocal,a)<EPS,`${label}: return points at current role anchor`);
  f.put(f.fb,a.x,a.y);f.m.time+=DT;
  assert.notEqual(assigned(f,`${label} arrived at role`).responsibility.reason,'FULLBACK_WIDE_ZONE_RELEASE',`${label}: physical arrival releases recovery`);
  // Safe-flank legitimate central tuck stays available (#2066).
  const tuck=fixture(team,slot);tuck.put(tuck.wing,70,34+sign(slot)*24);
  tuck.put(player(tuck.m,other(team),'ST'),17,34);
  for(const p of tuck.m.players.filter(p=>p.team===team&&p.id!==tuck.fb.id&&p.role!=='GK'))tuck.put(p,80,34);
  tuck.m._defenceRoleLocks={};
  const tuckState=T.reconcileDefensiveResponsibilities(tuck.m,team,null);
  assert(tuckState.threats.some(t=>t.kind==='CENTRAL'&&t.owners.includes(tuck.fb.id)),`${label}: safe flank can tuck`);
  mirrored.push({team,slot,default:first.targetLocal,carrier:carrier.targetLocal,release:release.targetLocal,status:'PASS'});
}

// Reuse the V53 exact-choice/no-precompute scenario without its evidence-file
// writer. Rejecting an invalid target must leave pending state AND RNG unchanged.
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
// This repair must remain wholly outside choice execution and outcome resolution.
const source=fs.readFileSync(path.join(__dirname,'../runtime/tactical_movement.js'),'utf8');
assert(!/\b(?:futureOutcome|winner|result)\s*[:=]/.test(source),'no outcome precompute in tactical source');
const report={verdict:'PASS_V62_FULLBACK_ZONE_AUTHORITY',source:{tacticalMovementSha256:require('crypto').createHash('sha256').update(source).digest('hex')},sampleInterval:DT,clock:'MOTOR_STEPS_0.05_SECONDS (match dead-clock compression recorded separately as time)',real,mirrored,exactChoice:exactChoiceBoundary(),
  futureOutcomePrecomputed:false,protagonistControlChanged:false,userVisualPass:false};
console.log(JSON.stringify(report,null,2));
