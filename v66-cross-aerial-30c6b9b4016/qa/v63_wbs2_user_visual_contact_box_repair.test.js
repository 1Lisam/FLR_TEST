'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const STRIKE=require('../runtime/ball_strike_model.js');
const corePath=require.resolve('../runtime/continuous_match_core.js');
const mod=new Module(corePath,module);mod.filename=corePath;mod.paths=module.paths;
// Expose existing boundaries only in this test compilation; use the real physics,
// candidate ranking and contact dispatch, with no alternate outcome resolver.
mod._compile(fs.readFileSync(corePath,'utf8').replace('return{createMatch,step,snapshot,runToEnd,',
  'return{captureLooseOrFlight,prepareMovementIntentTargets,movePlayers,updateBall,choosePassDelivery,chooseOwnerAction,shotAssessment,hash32,createMatch,step,snapshot,runToEnd,'),corePath);
const E=mod.exports,bridge=E.choiceActionBridge();
const speed=p=>Math.hypot(p.vx,p.vy);
function fixture(team='HOME',seed='CONTACT-11'){
  const m=E.createMatch(seed),prefix=team==='HOME'?'H':'A',sign=team==='HOME'?1:-1;
  const world=(x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
  m.restart=null;m.phase='OPEN_PLAY';m.time=100;m.nextShape=Infinity;m.r=()=>.5;
  for(const p of m.players){const at=world(p.team===team?5:100,4);Object.assign(p,{...at,tx:at.x,ty:at.y,vx:0,vy:0,nextThink:Infinity,runUntil:0,sprint:false});}
  const source=m.playersById[prefix+'-LCM'],p=m.playersById[prefix+'-CM'],next=m.playersById[prefix+'-ST'];
  Object.assign(source,world(30,34));Object.assign(p,{...world(50,34),tx:world(50,34).x,ty:34,bodyAngle:team==='HOME'?0:Math.PI});Object.assign(next,world(63,34));
  bridge.setControlled(m,source,true);
  return{m,source,p,next,world,sign};
}
function incoming(f,gap,{loose=false,lateral=false}={}){
  const {m,p,source,world}=f;
  Object.assign(m.ball,{mode:loose?'LOOSE':'FLIGHT',kind:loose?'LOOSE':'PASS',ownerId:null,
    ...world(lateral?50:50-gap,lateral?34+gap:34),z:0,vx:f.sign*9,vy:0,vz:0,age:.8,
    deliveryMode:'GROUND',airborne:false,intendedReceiverId:p.id,lastTouchPlayer:source.id,lastTouchTeam:source.team,
    targetX:p.x,targetY:p.y,passMiscontrol:false});
  source.hasBall=false;return{x:m.ball.x-f.sign*.4,y:m.ball.y};
}
function oneTouchSeed(f){
  // Select a deterministic hash draw that would redirect at valid contact.
  for(let i=0;i<200;i++){const seed='CONTACT-ONE-'+i;
    if((E.hash32(`${seed}|NPC_ONE_TOUCH|1000|${f.p.id}|${f.source.id}`)%10000)/10000<.055)return seed;
  }
  assert.fail('missing deterministic one-touch seed');
}

test('1.584m non-intersecting intended receiver gap grants neither control nor one-touch',()=>{
  for(const team of ['HOME','AWAY'])for(const loose of [false,true]){
    const f=fixture(team);f.m.seed=oneTouchSeed(f);
    const prev=incoming(f,1.584,{loose,lateral:true}),before={x:f.m.ball.x,y:f.m.ball.y};
    E.captureLooseOrFlight(f.m,prev);
    assert.equal(f.m.ball.ownerId,null);assert.equal(f.m.ball.mode,loose?'LOOSE':'FLIGHT');
    assert.equal(f.m.stats.npcOneTouchPasses||0,0);assert.deepEqual({x:f.m.ball.x,y:f.m.ball.y},before);
    assert.equal(f.m.ball.lastTouchPlayer,f.source.id);
  }
});

test('valid close control and NPC one-touch share the contact gate; attachment only smooths a bounded offset',()=>{
  for(const team of ['HOME','AWAY']){
    const f=fixture(team);f.m.protagonistControllerId=f.p.id;
    const prev=incoming(f,.62),before={x:f.m.ball.x,y:f.m.ball.y};
    E.captureLooseOrFlight(f.m,prev);
    assert.equal(f.m.ball.ownerId,f.p.id);assert.equal(f.m.ball.mode,'CONTROLLED');
    assert.equal(f.m.stats.npcOneTouchPasses||0,0,'unselected protagonist redirect remains forbidden');
    assert.deepEqual({x:f.m.ball.x,y:f.m.ball.y},before,'no contact-time teleport');
    const residual=()=>Math.hypot(f.m.ball.x-(f.p.x+f.sign*.42),f.m.ball.y-f.p.y);
    assert.ok(residual()<=1.12);assert.ok(f.m.ball.attachBlend>0);
    const initial=residual();E.updateBall(f.m,.05);assert.ok(residual()<initial);
    const npc=fixture(team);npc.m.seed=oneTouchSeed(npc);const close=incoming(npc,.40);
    E.captureLooseOrFlight(npc.m,close);
    assert.equal(npc.m.stats.npcOneTouchPasses,1);assert.equal(npc.p.lastDecision,'NPC_ONE_TOUCH_PASS');
    assert.equal(npc.m.ball.lastTouchPlayer,npc.p.id);assert.equal(npc.m.ball.ownerId,null);
  }
});

test('actual receiver motion participates in the swept contact proof without expanding endpoint attachment',()=>{
  const f=fixture();f.m.protagonistControllerId=f.p.id;
  const prev=incoming(f,.85); // Endpoint alone lies outside the .70m physical envelope.
  E.captureLooseOrFlight(f.m,prev);assert.equal(f.m.ball.ownerId,null);
  // During this step the player moved .65m forwards: the relative segment did touch.
  E.captureLooseOrFlight(f.m,prev,{[f.p.id]:{x:f.p.x-.65,y:f.p.y}});
  assert.equal(f.m.ball.ownerId,null,'even a swept contact cannot leave a >1.12m foot attachment');
  Object.assign(f.m.ball,{x:f.p.x,y:f.p.y+.80});
  const lateralPrev={x:f.p.x-.1,y:f.p.y+.80};
  E.captureLooseOrFlight(f.m,lateralPrev);assert.equal(f.m.ball.ownerId,null,'stationary segment misses');
  E.captureLooseOrFlight(f.m,lateralPrev,{[f.p.id]:{x:f.p.x,y:f.p.y+.30}});
  assert.equal(f.m.ball.ownerId,f.p.id,'actual player motion proves contact with a small endpoint offset');
});

function movingFixture({safe=false,pressured=false,team='HOME'}={}){
  const f=fixture(team);Object.assign(f.p,{vx:f.sign*4,vy:0});f.m.protagonistControllerId=f.p.id;
  if(pressured)Object.assign(f.m.playersById[team==='HOME'?'A-CM':'H-CM'],f.world(50,35.5));
  bridge.executePass(f.m,f.source,f.p,'PASS',{running:true,forward:20,open:pressured?1.5:8,block:0},safe?'CANDIDATE_SAFE':'CANDIDATE_PROGRESSIVE');
  return f;
}
test('open moving ground reception retains approach through contact beyond the old finite runway',()=>{
  for(const team of ['HOME','AWAY']){
    const f=movingFixture({team}),start=f.p.x,oldEnd=f.p.movingReceiveApproach.meetingX+f.sign*1.25;
    assert.ok(f.p.movingReceiveApproach);let minSpeed=Infinity,beyond=false,contact=false;
    for(let n=0;n<70;n++){
      f.m.time+=.05;E.prepareMovementIntentTargets(f.m);
      const previous=Object.fromEntries(f.m.players.map(p=>[p.id,{x:p.x,y:p.y}]));
      E.movePlayers(f.m,.05);E.updateBall(f.m,.05,previous);
      if(f.sign*(f.p.x-oldEnd)>0)beyond=true;
      if(f.m.ball.ownerId===f.p.id){contact=true;break;}
      minSpeed=Math.min(minSpeed,speed(f.p));
    }
    assert.ok(contact,'live pass reaches actual receiver contact');assert.ok(beyond,'old 1.25m endpoint is exhausted');
    assert.ok(minSpeed>1,`no pre-contact stop: ${minSpeed}`);assert.ok(f.sign*(f.p.x-start)>3);
  }
});
test('to-feet and pressured receivers can settle; lost current eligibility ends moving continuity',()=>{
  for(const config of [{safe:true},{pressured:true}]){
    const f=movingFixture(config);assert.equal(f.p.movingReceiveApproach,undefined);
    Object.assign(f.p,{x:f.p.tx,y:f.p.ty,vx:0,vy:0});
    E.prepareMovementIntentTargets(f.m);E.movePlayers(f.m,.05);assert.equal(speed(f.p),0);
  }
  for(const change of ['pressure','aerial','passed','expired']){
    const f=movingFixture();assert.ok(f.p.movingReceiveApproach);
    if(change==='pressure')Object.assign(f.m.playersById['A-CM'],{x:f.p.x,y:f.p.y+1});
    if(change==='aerial')f.m.ball.airborne=true;
    if(change==='passed')f.m.ball.x=f.p.x+2;
    if(change==='expired')f.m.time=f.p.movingReceiveApproach.expiresAt;
    E.prepareMovementIntentTargets(f.m);assert.equal(f.p.movingReceiveApproach,undefined,change);
  }
});

test('ground styles brake monotonically with compensated viable delivery at the current aim',t=>{
  for(const [kind,d,oldDrag] of [['PASS',8,.38],['PASS',20,.24],['LONG_PASS',34,.20],['LONG_PASS',48,.20],['THROUGH',25,0]]){
    const plan=STRIKE.passPlan({kind,distance:d,forward:d===8?4:d,deliveryMode:'GROUND',passSkill:60,targetSpeed:0});
    const f=fixture();for(const p of f.m.players)Object.assign(p,{x:5,y:4});
    Object.assign(f.m.ball,{mode:'FLIGHT',kind,ownerId:null,x:20,y:34,z:0,vx:plan.speed,vy:0,vz:0,airborne:false,
      age:0,deliveryMode:'GROUND',intendedReceiverId:null,targetX:20+d,targetY:34,groundDragK:plan.groundDragK});
    assert.ok(plan.groundDragK>oldDrag);let previous=plan.speed,elapsed=0;
    while(f.m.ball.mode==='FLIGHT'&&elapsed<4){f.m.time+=.01;elapsed+=.01;E.updateBall(f.m,.01);
      assert.ok(speed(f.m.ball)<previous);previous=speed(f.m.ball);assert.equal(f.m.ball.z,0);}
    assert.ok(f.m.ball.x>=20+d-.71,'delivery reaches aim vicinity before becoming loose');
    assert.ok(Math.abs(elapsed-plan.arrival)<.18,'planner and actual rolling arrival agree');
    const incoming=plan.speed*Math.exp(-plan.groundDragK*elapsed);
    assert.ok(incoming>3);if(kind!=='THROUGH')assert.ok(incoming/plan.speed<.75,'visible slowing');
    if(d===34){assert.ok(elapsed<2.3);assert.ok(incoming<16.5);}
    t.diagnostic(JSON.stringify({kind,d,launch:plan.speed,incoming,elapsed,arrival:plan.arrival}));
  }
});

test('LONG_PASS preserves clean 30–35m ground and contextual aerial choices',()=>{
  const f=fixture();
  for(const d of [30,32,35]){f.m.r=()=>.20;assert.equal(E.choosePassDelivery(f.m,f.source,f.p,'LONG_PASS',{block:0},d),'GROUND');}
  for(const [d,option,role,lateral] of [[48,{},'CM',0],[35,{switchPlay:true},'CM',28],[35,{block:1},'CM',0],[35,{},'GK',0]]){
    f.source.role=role;f.p.y=f.source.y+lateral;f.m.r=()=>.35;
    assert.equal(E.choosePassDelivery(f.m,f.source,f.p,'LONG_PASS',option,d),'AERIAL');
    f.m.r=()=>.99;assert.equal(E.choosePassDelivery(f.m,f.source,f.p,'LONG_PASS',option,d),'GROUND');
  }
});

function boxFixture(seed){
  const f=fixture('HOME',seed),{m}=f,p=f.next;m.time=100.99;m.kickoffBuildUntil=0;m.r=()=>.99;
  for(const q of m.players)Object.assign(q,{x:q.team==='HOME'?5:100,y:4});
  Object.assign(p,{x:91,y:44,bodyAngle:Math.atan2(-10,14)});Object.assign(m.playersById['A-LCB'],{x:96,y:46});
  bridge.setControlled(m,p,true);p.controlledSince=97;const shot=E.shotAssessment(m,p);
  assert.equal(shot.oneVOne,false);assert.equal(shot.clearKeeperChance,false);
  p.candidateShotDecline={until:100.995,controlledSince:97,dGoal:shot.dGoal,centrality:10};
  return{m,p};
}
test('same-control shot decline suppresses before until, expires at until, and reopens actual current ranking',()=>{
  const {m,p}=boxFixture('SHOT-4'),before=E.shotAssessment(m,p),ball={...m.ball};
  assert.notEqual(E.chooseOwnerAction(m,p).type,'SHOT');assert.equal(p.candidateShotDecline.until,100.995);
  m.time=100.995;const action=E.chooseOwnerAction(m,p);
  assert.equal(action.type,'SHOT');assert.equal(action.reason,'CANDIDATE_SHOT');assert.equal(p.candidateShotDecline,null);
  assert.deepEqual(E.shotAssessment(m,p),before,'unchanged geometry, same control');
  assert.deepEqual(m.ball,ball,'candidate evaluation does not execute a shot');assert.equal(p.controlledSince,97);
});
test('expired decline can still choose purposeful angle creation instead of shooting',()=>{
  const {m,p}=boxFixture('SHOT-0');m.time=100.995;
  const action=E.chooseOwnerAction(m,p);assert.equal(action.type,'CARRY');assert.equal(action.reason,'OPEN_SHOT_CREATE_ANGLE');
  assert.ok(p.candidateShotDecline.until>m.time,'fresh commitment rejection uses the existing decline window');
  assert.equal(m.ball.mode,'CONTROLLED');assert.equal(m.stats.shots||0,0);
});
