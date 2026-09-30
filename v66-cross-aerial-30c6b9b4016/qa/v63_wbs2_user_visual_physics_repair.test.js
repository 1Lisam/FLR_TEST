'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const STRIKE=require('../runtime/ball_strike_model.js');
const corePath=require.resolve('../runtime/continuous_match_core.js');

// Test the existing lexical integrators directly; this does not add a runtime API.
function loadCore(){
  const mod=new Module(corePath,module);mod.filename=corePath;mod.paths=module.paths;
  mod._compile(fs.readFileSync(corePath,'utf8').replace('return{createMatch,step,snapshot,runToEnd,',
    'return{updateBall,movePlayers,createMatch,step,snapshot,runToEnd,'),corePath);
  return mod.exports;
}
const E=loadCore(),PROFILE='OPEN_PLAY_LOB_V1';
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const speed=b=>Math.hypot(b.vx,b.vy);
function lobFixture(seed='V63-WBS2-VISUAL-PHYSICS'){
  const m=E.createMatch(seed),source=m.playersById['H-LCM'],target=m.playersById['H-ST'];
  m.restart=null;m.phase='OPEN_PLAY';m.time=100;m.nextShape=Infinity;
  for(const p of m.players)Object.assign(p,{x:5,y:4,tx:5,ty:4,vx:0,vy:0,nextThink:Infinity});
  Object.assign(source,{x:40,y:34,tx:40,ty:34});Object.assign(target,{x:64,y:34,tx:64,ty:34});
  E.choiceActionBridge().setControlled(m,source,true);
  assert.equal(E.choiceActionBridge().executePass(m,source,target,'PASS',null,null,{physicsProfile:PROFILE,choiceId:'LOB_PASS',targetId:target.id,commitEventId:'visual-physics'}),true);
  // The nominal trajectory intentionally has no future player/contact state.
  for(const p of m.players)Object.assign(p,{x:5,y:4,tx:5,ty:4,vx:0,vy:0});
  return{m,source,target};
}
function tick(f,dt=.01){f.m.time+=dt;E.updateBall(f.m,dt,null);}
function nominalize(f){
  const b=f.m.ball,aim=b.lobLaunch.aim,p=STRIKE.passPlan({physicsProfile:PROFILE,origin:{x:b.x,y:b.y,z:b.z},target:{x:aim.x,y:aim.y,vx:0,vy:0}});
  Object.assign(b,{vx:p.vx,vy:p.vy,vz:p.vz,airDragK:p.airDragK,airborne:true,age:0,lobContacts:[]});
  return p;
}

test('OPEN_PLAY_LOB_V1 keeps real vertical rise/descent while deterministic drag slows horizontal flight to the compensated aim',()=>{
  const f=lobFixture(),plan=nominalize(f),b=f.m.ball,initialSpeed=speed(b),speeds=[initialSpeed],zs=[b.z];
  for(let elapsed=0;elapsed<plan.arrival-.011;elapsed+=.01){tick(f);speeds.push(speed(b));zs.push(b.z);}
  assert.ok(b.z>0,'pre-arrival state is still physically airborne');
  assert.ok(Math.max(...zs)>.80,'real vertical state rises');
  const apex=zs.indexOf(Math.max(...zs));assert.ok(apex>0&&apex<zs.length-1);
  assert.ok(zs.at(-1)<zs[apex],'same vertical state descends after its peak');
  for(let i=1;i<speeds.length;i++)assert.ok(speeds[i]<speeds[i-1],'airborne horizontal speed monotonically falls before contact/ground');
  const ratio=speeds.at(-1)/initialSpeed;assert.ok(ratio>.65&&ratio<.90,`pre-arrival drag remains bounded: ${ratio}`);
  if(b.age<plan.arrival-1e-9)tick(f,plan.arrival-b.age);
  close(b.x,plan.aim.x,.004);close(b.y,plan.aim.y,.004);
  tick(f,.01);
  assert.ok(b.lobBounceCount>=1,'arrival is a physical ground impact, not an endpoint snap');
  assert.ok(b.vz>0,'bounce retains causal vertical rebound');
});

function movementFixture(){
  const m=E.createMatch('V63-WBS2-MOVEMENT'),p=m.playersById['H-CM'];
  m.time=100;m.nextShape=Infinity;m.restart=null;m.phase='OPEN_PLAY';
  for(const q of m.players)Object.assign(q,{x:q.id===p.id?50:(q.team==='HOME'?8:97),y:q.id===p.id?34:(q.role==='GK'?8:60),tx:q.id===p.id?50:(q.team==='HOME'?8:97),ty:q.role==='GK'?8:60,vx:0,vy:0,nextThink:Infinity,sprint:false});
  Object.assign(p,{x:50,y:34,tx:80,ty:34,vx:0,vy:0,bodyAngle:0,sprint:true,action:'CHASE_LOOSE',tacticalTask:'CHASE_LOOSE'});
  m.playerAbilityProfiles={[p.id]:{acceleration:50,pace:50,agility:50}};
  return{m,p};
}
function move(f){E.movePlayers(f.m,.10);}

test('single player integrator brakes harder on reverse/turn slip while ordinary same-direction acceleration and top speed stay unchanged',()=>{
  const baseline=movementFixture();move(baseline);const oldAccelBound=baseline.p.vx;
  assert.ok(oldAccelBound>.1,'baseline captures the previous acceleration-only convergence bound');

  const reverse=movementFixture();Object.assign(reverse.p,{tx:48,ty:34,vx:6,vy:0,bodyAngle:Math.PI});move(reverse);
  const reverseLoss=6-reverse.p.vx;
  assert.ok(reverseLoss>oldAccelBound*1.5,`reverse braking ${reverseLoss} exceeds old bound ${oldAccelBound}`);
  assert.ok(reverse.p.vx>0,'braking is continuous and does not snap through zero');

  const turn=movementFixture();Object.assign(turn.p,{tx:50,ty:52,vx:6,vy:0,bodyAngle:0});move(turn);
  assert.ok(6-turn.p.vx>oldAccelBound*.9,'strong lateral slip is shed during a target turn');
  assert.ok(turn.p.vy>0,'turn remains an organic curve toward the same target');

  const forward=movementFixture();move(forward);close(forward.p.vx,oldAccelBound,1e-8);
  const top=movementFixture();Object.assign(top.p,{vx:6.8,vy:0,tx:90,ty:34,bodyAngle:0});move(top);
  assert.ok(top.p.vx>=6.8,'same-direction motion is not treated as braking');
  const firstTop=top.p.vx;move(top);close(top.p.vx,firstTop,1e-8);
});
