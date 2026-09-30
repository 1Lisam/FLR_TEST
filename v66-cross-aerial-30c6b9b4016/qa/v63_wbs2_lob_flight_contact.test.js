'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const E=require('../runtime/continuous_match_core.js');
const S=require('../runtime/ball_strike_model.js');
const PROFILE='OPEN_PLAY_LOB_V1';
const corePath=require.resolve('../runtime/continuous_match_core.js');
// Expose the actual lexical updater for isolated collision fixtures without shipping
// a second integrator, test-only launch values, or extra public runtime methods.
function loadCore(source,strike){
  const mod=new Module(corePath,module);mod.filename=corePath;mod.paths=module.paths;
  const original=mod.require.bind(mod);mod.require=id=>id==='./ball_strike_model.js'&&strike?strike:original(id);
  mod._compile(source.replace('return{createMatch,step,snapshot,runToEnd,',
    'return{updateBall,setBallFlight,executeHeaderPass,createMatch,step,snapshot,runToEnd,'),corePath);return mod.exports;
}
const I=loadCore(fs.readFileSync(corePath,'utf8'));
const deep=x=>JSON.parse(JSON.stringify(x));
const close=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} ~= ${b} (+/- ${e})`);
function horizontalDisplacement(v,k,t){return k>0?v*(-Math.expm1(-k*t))/k:v*t;}
function fixture({team='HOME',distance=24,seed='V63-WBS2-B',engine=I}={}){
  const m=engine.createMatch(seed),world=(x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
  m.restart=null;m.phase='OPEN_PLAY';m.time=100;m.nextShape=Infinity;
  for(const p of m.players)Object.assign(p,{x:5,y:4,tx:5,ty:4,vx:0,vy:0,nextThink:Infinity});
  const source=m.playersById[team==='HOME'?'H-LCM':'A-LCM'],target=m.playersById[team==='HOME'?'H-ST':'A-ST'];
  Object.assign(source,world(40,34));Object.assign(target,world(40+distance,34));
  for(const p of [source,target])Object.assign(p,{tx:p.x,ty:p.y});
  engine.choiceActionBridge().setControlled(m,source,true);
  const meta={physicsProfile:PROFILE,choiceId:'LOB_PASS',targetId:target.id,commitEventId:'fixture-commit'};
  return{m,source,target,meta,engine};
}
function launch(f){return f.engine.choiceActionBridge().executePass(f.m,f.source,f.target,'PASS',null,null,f.meta);}
function tick(f,dt=.05,previous){f.m.time+=dt;f.engine.updateBall(f.m,dt,previous);}
function removePlayers(f){for(const p of f.m.players)Object.assign(p,{x:5,y:4,tx:5,ty:4});}
function flight(values={}){
  const f=fixture();launch(f);removePlayers(f);
  Object.assign(f.m.ball,{x:50,y:34,z:1,vx:5,vy:0,vz:0,age:0,airborne:true,offsideAtRelease:false,...values});
  f.m.ball.lobContacts=[];return f;
}
function actor(f,id='A-CM',values={}){
  const p=f.m.playersById[id];Object.assign(p,{x:50,y:34,tx:50,ty:34,vx:0,vy:0,bodyAngle:Math.PI,...values});return p;
}
const receipts=f=>f.m.events.filter(e=>e.type.startsWith('LOB_')).map(e=>e.receipt);

test('pure nominal plan: current origin, bounded lead, nominal ground arc, no mutation',()=>{
  const ctx={physicsProfile:PROFILE,origin:{x:40,y:34,z:.2},target:{x:64,y:34,vx:8,vy:0},passSkill:60};
  const before=deep(ctx),a=S.passPlan(ctx),b=S.passPlan(ctx);
  assert.deepEqual(a,b);assert.deepEqual(ctx,before);assert.equal(a.aim.x,68);
  close(ctx.origin.z+a.vz*a.arrival-4.905*a.arrival**2,0);
  assert.equal(S.passPlan({...ctx,target:{x:100,y:34,vx:0,vy:0}}),null);
  assert.equal(a.futureController,undefined);assert.equal(a.passMiscontrol,undefined);
});

test('launch validates exact pair before mutation; exactly three draws, actual origin and canonical identity',()=>{
  const f=fixture(),{m}=f,b=m.ball,players=m.players,r=m.r,history=[{type:'earlier'}];b.causalHistory=history;
  const state=()=>deep({snapshot:E.snapshot(m),rng:r.observe(),events:m.events});
  for(const bad of [{targetId:null},{targetId:'A-ST'},{choiceId:'SAFE_PASS'}]){
    const before=state();assert.equal(f.engine.choiceActionBridge().executePass(m,f.source,f.target,'PASS',null,null,{...f.meta,...bad}),false);assert.deepEqual(state(),before);
  }
  const origin={x:b.x,y:b.y,z:b.z},count=r.observe().drawCount;
  assert.equal(launch(f),true);assert.equal(m.ball,b);assert.equal(m.players,players);assert.equal(m.r,r);assert.equal(b.causalHistory,history);
  assert.equal(r.observe().drawCount-count,3);assert.deepEqual(b.lobLaunch.origin,origin);assert.equal(b.z,origin.z);
  assert.equal(b.lobLaunch.targetId,f.target.id);assert.equal(b.intendedReceiverId,f.target.id);assert.equal(b.lobLaunch.choiceId,'LOB_PASS');
  assert.equal(b.ownerId,null);assert.equal(b.passMiscontrol,undefined);assert.ok(Object.isFrozen(b.lobLaunch.aim));
  const after=state();assert.equal(launch(f),false);assert.deepEqual(state(),after,'duplicate launch is inert');
});

test('T01/T03/T09: mirrored 8m/24m rise, apex, descent; fixed aim and no age/endpoint snap',()=>{
  for(const team of ['HOME','AWAY'])for(const distance of [8,24]){
    const f=fixture({team,distance});launch(f);const aim=f.m.ball.lobLaunch.aim;removePlayers(f);
    const initial=deep(f.m.ball),zs=[];
    for(let n=0;n<10;n++){tick(f,.1);zs.push(f.m.ball.z);}
    assert.ok(Math.max(...zs)>.8);assert.ok(f.m.ball.vz<0);assert.equal(f.m.ball.lobLaunch.aim,aim);
    const k=initial.airDragK;
    close(f.m.ball.x,initial.x+horizontalDisplacement(initial.vx,k,1));
    close(f.m.ball.y,initial.y+horizontalDisplacement(initial.vy,k,1));
    close(f.m.ball.z,initial.z+initial.vz-4.905);
    Object.assign(f.target,{x:20,y:20,vx:8,vy:0});const vx=f.m.ball.vx;tick(f);close(f.m.ball.vx,vx*Math.exp(-k*.05));
    f.m.ball.age=5;f.m.ball.targetX=f.m.ball.x;f.m.ball.targetY=f.m.ball.y;tick(f);
    assert.equal(f.m.ball.mode,'FLIGHT');assert.ok(f.m.ball.z>0);
  }
});

test('T02: pressure/misalignment change execution velocity, not outcomes; deterministic three-seed replay',()=>{
  for(const seed of ['B-1','B-2','B-3']){
    const a=fixture({seed}),b=fixture({seed});actor(b,'A-CM',{x:40.7,y:34});b.source.bodyAngle=Math.PI;
    launch(a);launch(b);assert.notDeepEqual(a.m.ball.lobLaunch.velocity,b.m.ball.lobLaunch.velocity);
    assert.equal(a.m.r.observe().drawCount,b.m.r.observe().drawCount);
    const replay=fixture({seed});launch(replay);removePlayers(a);removePlayers(replay);
    for(let n=0;n<35;n++){tick(a);tick(replay);assert.deepEqual(deep(a.m.ball),deep(replay.m.ball));}
    assert.deepEqual(a.m.r.observe(),replay.m.r.observe());assert.deepEqual(a.m.events,replay.m.events);
  }
});

test('T04/T18: swept low contact, overhead miss and moving-player sweep at .05/.10/.15',()=>{
  for(const dt of [.05,.10,.15]){
    const f=flight({x:48,z:.4,vx:60,vz:0});actor(f);const before=f.m.r.observe().drawCount;tick(f,dt);
    const contact=receipts(f).find(r=>r.type==='CONTACT');assert.ok(contact);close(contact.incoming.x,49.3);assert.equal(contact.actorId,'A-CM');
    assert.equal(f.m.r.observe().drawCount-before,1);
    const high=flight({x:48,z:3.5,vx:60,vz:0});actor(high);const count=high.m.r.observe().drawCount;tick(high,dt);
    assert.equal(receipts(high).filter(r=>r.type==='CONTACT').length,0);assert.equal(high.m.r.observe().drawCount,count);
    const moving=flight({x:50,z:.4,vx:0});actor(moving,'A-CM',{x:52});
    tick(moving,dt,{'A-CM':{x:48,y:34}});assert.ok(receipts(moving).some(r=>r.type==='CONTACT'));
  }
});

test('earliest event wins: contact before sideline, boundary before later contact; stable simultaneous IDs',()=>{
  const contact=flight({x:50,y:.9,z:.4,vx:0,vy:-10});actor(contact,'A-CM',{x:50,y:.2});tick(contact,.15);
  const rows=receipts(contact).filter(r=>r.type!=='LAUNCH');assert.equal(rows[0].type,'CONTACT');assert.equal(contact.m.restart,null);
  const boundary=flight({x:50,y:.1,z:.4,vx:0,vy:-20});actor(boundary,'A-CM',{x:50,y:-1});tick(boundary,.15);
  assert.equal(receipts(boundary).filter(r=>r.type!=='LAUNCH')[0].type,'BOUNDARY');assert.equal(boundary.m.restart.kind,'THROW_IN');
  const a=flight(),b=flight();for(const f of [a,b]){actor(f,'A-CM');actor(f,'H-CM');}
  b.m.players.reverse();tick(a);tick(b);assert.deepEqual(deep(a.m.ball),deep(b.m.ball));
  assert.equal(receipts(a).find(r=>r.type==='CONTACT').actorId,'A-CM');
});

test('ground precedes later encounter, actual impact/rebound energy, finite decay and second ball',()=>{
  const f=flight({z:.001,vz:-6,vx:10}),initialEnergy=.5*(f.m.ball.vx**2+f.m.ball.vz**2)+9.81*f.m.ball.z;
  for(let n=0;n<100;n++)tick(f);
  const grounds=receipts(f).filter(r=>r.type==='GROUND');assert.ok(grounds.length>=2);
  for(const r of grounds){assert.equal(r.state.z,0);assert.ok(r.state.vz>=0);assert.ok(.5*(r.state.vx**2+r.state.vz**2)<initialEnergy);}
  for(let n=1;n<grounds.length;n++)assert.ok(grounds[n].state.vz<grounds[n-1].state.vz);
  assert.equal(f.m.ball.mode,'LOOSE');assert.equal(f.m.ball.z,0);assert.equal(f.m.ball.physicsProfile,PROFILE);
  assert.ok(receipts(f).some(r=>r.type==='SECOND_BALL'));
  actor(f,'H-CM',{x:f.m.ball.x,y:f.m.ball.y});tick(f);assert.equal(f.m.ball.ownerId,'H-CM');
  assert.equal(f.m.ball.physicsProfile,undefined);assert.equal(f.m.lastLobReceipt.type,'CONTROL');
});

test('foot/body settle, failed touch and head redirect keep continuous physical contact positions',()=>{
  for(const [z,vx,skill,expected] of [[0,2,100,'FOOT_CONTROL'],[1.2,2,100,'SETTLE_TRAP'],[.5,40,1,'FAILED_TOUCH'],[1.8,5,60,'AERIAL_REDIRECT']]){
    const f=flight({z,vx}),p=actor(f);f.m.playerAbilityProfiles={...f.m.playerAbilityProfiles,[p.id]:{ball_control:skill}};
    tick(f,.05);const r=receipts(f).find(r=>r.type==='CONTACT');assert.equal(r.outcome,expected);
    close(r.incoming.x,r.state.x);close(r.incoming.y,r.state.y);close(r.incoming.z,r.state.z);
    assert.equal(r.state.lastTouchPlayer,p.id);
    if(z>0){assert.equal(r.state.ownerId,null);assert.ok(r.state.z>0);assert.equal(f.m.ball.physicsProfile,PROFILE);}
    if(expected==='SETTLE_TRAP'){
      for(let n=0;n<20&&f.m.ball.mode!=='CONTROLLED';n++)tick(f);
      assert.equal(f.m.ball.ownerId,p.id);assert.equal(f.m.lastLobReceipt.state.z,0);
    }
  }
});

test('settle can escape the actor; no target entitlement and no repeated encounter rolls',()=>{
  const f=flight({z:1.2,vx:2}),p=actor(f);tick(f);const count=f.m.r.observe().drawCount;
  tick(f);assert.equal(f.m.r.observe().drawCount,count);
  Object.assign(p,{x:80,y:30});for(let n=0;n<35;n++)tick(f);
  assert.equal(f.m.ball.ownerId,null);assert.ok(f.m.ball.lobBounceCount>0);
  const retry=flight({z:1.8,vx:0,vz:0});actor(retry);tick(retry);
  actor(retry,'A-CM',{x:80});tick(retry);actor(retry);tick(retry);
  assert.equal(receipts(retry).filter(r=>r.type==='CONTACT').length,2,'separated encounter may touch again');
});

test('protagonist physical contact never auto-selects a redirect/shot/target or consumes incoming intent',()=>{
  const f=flight({z:1.8,vx:5}),p=actor(f,'H-ST');f.m.protagonistControllerId=p.id;f.m.protagonistExplicitActionRequired=true;
  const intent={choiceId:'HEADER_PASS',targetId:'H-LW',playerId:p.id};f.m.userIncomingIntent=intent;
  tick(f);assert.equal(receipts(f).find(r=>r.type==='CONTACT').outcome,'FAILED_TOUCH');
  assert.equal(f.m.userIncomingIntent,intent);assert.equal(f.m.ball.kind,'PASS');assert.equal(f.m.ball.ownerId,null);
  assert.ok(!f.m.events.some(e=>['SHOT','USER_CHOICE'].includes(e.type)));
});

test('receipts/snapshots are factual and immutable, keep exact pair, do not consume RNG',()=>{
  const f=flight(),ball=f.m.ball,history=[{old:true}];ball.causalHistory=history;actor(f);const snapshot=E.snapshot(f.m),launchReceipt=snapshot.ball.lobLastReceipt;
  tick(f);assert.equal(f.m.ball,ball);assert.equal(ball.causalHistory,history);
  const count=f.m.r.observe().drawCount;E.snapshot(f.m);E.snapshot(f.m);assert.equal(f.m.r.observe().drawCount,count);
  const receipt=receipts(f).find(r=>r.type==='CONTACT');assert.equal(receipt.choiceId,'LOB_PASS');assert.equal(receipt.targetId,f.target.id);assert.equal(receipt.commitEventId,'fixture-commit');
  assert.equal(launchReceipt.type,'LAUNCH');assert.ok(Object.isFrozen(receipt.state));assert.equal(receipt.state.ownerId,null);
  assert.equal(snapshot.ball.lobLastReceipt,launchReceipt);assert.equal(snapshot.ball.lobSettle,undefined);
});

test('T18: no-contact flight/bounce dt sensitivity is bounded to <2cm over 2.4 seconds',()=>{
  const outcomes=[];for(const dt of [.05,.1,.15]){const f=flight({z:0,vz:7,vx:12});for(let n=0;n<Math.round(2.4/dt);n++)tick(f,dt);outcomes.push(deep(f.m.ball));}
  for(const b of outcomes.slice(1)){const a=outcomes[0];close(a.x,b.x,.02);close(a.z,b.z,.002);close(a.vx,b.vx,.02);close(a.vz,b.vz,.002);assert.equal(a.lobBounceCount,b.lobBounceCount);}
});

test('public core stepping uses lob path, preserves live canonical lease and recorded history',()=>{
  const f=fixture({engine:E});const b=f.m.ball,players=f.m.players,random=f.m.r,history=[{old:true}];b.causalHistory=history;
  f.m._resolutionLease={canonicalBall:b,canonicalPlayers:players,resolutionRandom:random};launch(f);removePlayers(f);
  // Isolate integration from the separately preserved release-time offside rule.
  b.offsideAtRelease=false;
  const vz=b.vz,z=b.z;E.step(f.m,.05);close(b.z,z+vz*.05-4.905*.05**2);
  assert.equal(f.m.ball,b);assert.equal(f.m.players,players);assert.equal(f.m.r,random);assert.equal(b.causalHistory,history);
});

test('launch preserves distance family, offside provenance, invalid-range/phase rejection and moving intent',()=>{
  const f=fixture({distance:35}),before=f.m.r.observe().drawCount;f.target.vx=3;
  const targets={tx:f.target.tx,ty:f.target.ty};launch(f);
  assert.equal(f.m.ball.kind,'LONG_PASS');assert.equal(f.m.r.observe().drawCount-before,3);
  assert.equal(f.m.ball.lobLaunch.aim.x,78);assert.deepEqual({tx:f.target.tx,ty:f.target.ty},targets);
  assert.equal(typeof f.m.ball.offsideAtRelease,'boolean');assert.equal(f.m.ball.releaseBallX,f.m.ball.lobLaunch.origin.x);
  for(const invalid of ['range','restart','opponent','same','NaN']){
    const x=fixture();if(invalid==='range')x.target.x=100;if(invalid==='restart')x.m.restart={kind:'FREE_KICK'};
    if(invalid==='opponent')x.target=x.m.playersById['A-ST'];if(invalid==='same')x.target=x.source;
    if(invalid==='NaN')x.m.ball.z=NaN;x.meta.targetId=x.target.id;
    const old=deep({ball:x.m.ball,rng:x.m.r.observe(),events:x.m.events,stats:x.m.stats});assert.equal(launch(x),false);
    assert.deepEqual(deep({ball:x.m.ball,rng:x.m.r.observe(),events:x.m.events,stats:x.m.stats}),old);
  }
});

test('ground/contact ordering and exact height entry use actual swept time',()=>{
  const ground=flight({x:48,z:.001,vx:20,vz:-2});actor(ground);tick(ground,.15);
  assert.equal(receipts(ground).filter(r=>r.type!=='LAUNCH')[0].type,'GROUND');
  const touch=flight({x:49.31,z:.01,vx:20,vz:-2});actor(touch);tick(touch,.05);
  assert.equal(receipts(touch).filter(r=>r.type!=='LAUNCH')[0].type,'CONTACT');
  const height=flight({z:1.91,vx:0,vz:-1});actor(height);tick(height,.05);
  const contact=receipts(height).find(r=>r.type==='CONTACT');assert.ok(contact.at>100);close(contact.incoming.z,1.9);
  assert.ok(Math.hypot(contact.incoming.x-contact.actorPosition.x,contact.incoming.y-contact.actorPosition.y)<=.70000001);
});

test('both sidelines/endlines carry factual xyz/last touch and restart receipts; corner takes earliest plane',()=>{
  for(const [values,side] of [
    [{x:.1,vx:-10},'GOAL_LEFT'],[{x:104.9,vx:10},'GOAL_RIGHT'],
    [{y:.1,vy:-10},'TOUCH_TOP'],[{y:67.9,vy:10},'TOUCH_BOTTOM'],
    [{x:104.8,y:67.95,vx:10,vy:10},'TOUCH_BOTTOM']]){
    const f=flight({...values,z:2.5,vz:1});tick(f,.05);
    const r=receipts(f).find(r=>r.type==='BOUNDARY');assert.equal(r.crossing.side,side);assert.ok(r.crossing.z>2.5);
    assert.equal(r.state.lastTouchPlayer,f.source.id);assert.equal(f.m.ball.physicsProfile,undefined);
    assert.equal(f.m.lastLobReceipt.type,'RESTART');assert.equal(f.m.lastLobReceipt.continuationRequired,false);
    assert.deepEqual(f.m.lastLobReceipt.state,receipts(f).at(-1).state);
    assert.equal(f.m.score.HOME+f.m.score.AWAY,0,'B retains legacy endline classification; C owns lob goals');
  }
});

test('release immunity ends on physical separation and ground misses have no RNG/touch record',()=>{
  const f=fixture();launch(f);f.m.ball.offsideAtRelease=false;
  const count=f.m.r.observe().drawCount;tick(f,.05);assert.equal(receipts(f).filter(r=>r.type==='CONTACT').length,0);
  tick(f,.05);assert.ok(!f.m.ball.lobContacts.includes(f.source.id));
  Object.assign(f.source,{x:f.m.ball.x,y:f.m.ball.y});tick(f);
  assert.equal(receipts(f).find(r=>r.type==='CONTACT').actorId,f.source.id);assert.equal(f.m.r.observe().drawCount,count+1);
  const miss=flight({z:.5,vx:20});actor(miss,'A-CM',{y:34.701});const draws=miss.m.r.observe().drawCount;tick(miss,.1);
  assert.equal(receipts(miss).filter(r=>r.type==='CONTACT').length,0);assert.equal(miss.m.r.observe().drawCount,draws);
});

test('profile-absent permanent guards keep ground/cross/chip branches and original launch draw counts',()=>{
  for(const [kind,count,delivery] of [['PASS',3,'GROUND'],['THROUGH',3,'GROUND'],['CROSS',0,'AERIAL'],['LONG_PASS',4,null]]){
    const f=fixture(),before=f.m.r.observe().drawCount;
    f.engine.choiceActionBridge().executePass(f.m,f.source,f.target,kind,{running:false,forward:12,open:8,block:0},'CANDIDATE_SAFE');
    assert.equal(f.m.ball.physicsProfile,undefined);assert.equal(f.m.r.observe().drawCount-before,count);
    if(delivery)assert.equal(f.m.ball.deliveryMode,delivery);
  }
  const f=fixture();I.setBallFlight(f.m,{source:f.source,target:f.target,kind:'SHOT',speed:14,loft:3.5,style:'CHIP'});
  assert.equal(f.m.ball.arcProfile,'CHIP_LOB');tick(f);assert.ok(f.m.ball.z>0);assert.equal(f.m.ball.physicsProfile,undefined);
});

test('profile absent: pure plans and launch/step state, events and RNG match untouched source',t=>{
  // Optional baseline files are temporary copies of this checkout taken before edits.
  const baseline=process.env.V63_B_BASELINE_CORE,strikePath=process.env.V63_B_BASELINE_STRIKE;
  if(!baseline||!strikePath)return t.skip('set V63_B_BASELINE_CORE/STRIKE to temporary pre-edit source copies for exact parity');
  const B=loadCore(fs.readFileSync(baseline,'utf8'),require(strikePath));
  for(const kind of ['PASS','THROUGH','LONG_PASS','CROSS','CUTBACK'])for(const team of ['HOME','AWAY']){
    const a=fixture({engine:I,team}),b=fixture({engine:B,team});
    for(const f of [a,b])f.engine.choiceActionBridge().executePass(f.m,f.source,f.target,kind,{running:false,block:0,forward:12,open:8},'CANDIDATE_SAFE');
    for(let n=0;n<30;n++){a.engine.step(a.m,.05);b.engine.step(b.m,.05);assert.deepEqual(deep(a.engine.snapshot(a.m)),deep(b.engine.snapshot(b.m)));assert.deepEqual(a.m.r.observe(),b.m.r.observe());}
  }
  for(const team of ['HOME','AWAY']){
    for(const kind of ['THROW_IN','GOAL_KICK','CORNER','FREE_KICK','KICKOFF','PENALTY','OFFSIDE']){
      const a=fixture({engine:I,team}),b=fixture({engine:B,team});
      for(const f of [a,b])f.engine.choiceActionBridge().startDeadRestart(f.m,kind,team,50,34);
      for(let n=0;n<25;n++){a.engine.step(a.m,.05);b.engine.step(b.m,.05);assert.deepEqual(deep(a.engine.snapshot(a.m)),deep(b.engine.snapshot(b.m)));assert.deepEqual(a.m.r.observe(),b.m.r.observe());}
    }
  }
  for(const style of ['CHIP','HEADER_REDIRECT']){
    const a=fixture({engine:I}),b=fixture({engine:B});
    for(const f of [a,b]){
      if(style==='CHIP')f.engine.setBallFlight(f.m,{source:f.source,target:f.target,kind:'SHOT',speed:14,loft:3.5,style:'CHIP'});
      else f.engine.executeHeaderPass(f.m,f.source,f.target);
    }
    for(let n=0;n<30;n++){tick(a);tick(b);assert.deepEqual(deep(a.m.ball),deep(b.m.ball));assert.deepEqual(a.m.r.observe(),b.m.r.observe());assert.deepEqual(a.m.events,b.m.events);}
  }
  const oldStrike=require(strikePath);
  for(const kind of ['PASS','THROUGH','LONG_PASS','CROSS','CUTBACK'])for(const deliveryMode of ['GROUND','AERIAL']){
    const ctx={kind,deliveryMode,distance:24,passSkill:75,pressure:1};assert.deepEqual(S.passPlan(ctx),oldStrike.passPlan(ctx));
  }
  const chip={oneVOne:true,dGoal:10,gkAdvance:8,roll:0};assert.deepEqual(S.shotPlan(chip),oldStrike.shotPlan(chip));assert.equal(S.shotPlan(chip).style,'CHIP');
});
