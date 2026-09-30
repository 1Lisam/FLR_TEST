'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Module=require('node:module');
const {execFileSync}=require('node:child_process');
const E=require('../runtime/continuous_match_core.js');
const P=require('../runtime/protagonist_match_controller.js');
const H=require('../live_hybrid_session_v02.js');
const V2=require('../runtime/continuous_spatial_authority_v2.js');
const Scene=require('../live_v06_scene_authority_browser.js');
const ROOT=path.resolve(__dirname,'..'),PROFILE='OPEN_PLAY_LOB_V1',SEED='V63-C4-HANDBACK';
const deep=x=>JSON.parse(JSON.stringify(x,(_k,v)=>v instanceof Set?[...v]:v));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function loadCore(source){
  const filename=path.join(ROOT,'runtime/continuous_match_core.js'),mod=new Module(filename,module);
  mod.filename=filename;mod.paths=module.paths;
  mod._compile(source.replace('return{createMatch,step,snapshot,runToEnd,','return{updateBall,setBallFlight,createMatch,step,snapshot,runToEnd,'),filename);
  return mod.exports;
}
const I=loadCore(fs.readFileSync(path.join(ROOT,'runtime/continuous_match_core.js'),'utf8'));
function fixture({launch=true,engine=I}={}){
  const world=H.createSession({seed:SEED,heroPlayerId:'H-LCM',heroTeam:'HOME',heroRole:'CM',continuousSpatialAuthorityV2Coarse:true});
  world.state.second=100;world.state.minute=100/60;world.state.spatial.time=100;
  world.status='PAUSED';world.boundary={id:'C4-BOUNDARY',sceneId:'C4-SCENE',type:'PROTAGONIST_2D_WINDOW'};
  const lease=world._v2ResolutionLease;V2.prepareResolutionLease(lease,SEED);
  const s=P.create(SEED,{heroPlayerId:'H-LCM',mode:'FULL_MATCH',resolutionRandom:lease.resolutionRandom,deferInitialHistory:true});
  const m=s.m;V2.acquireResolutionLease(lease,world.boundary.sceneId);
  V2.bindResolutionAdapter(lease,m,s,world.state,[...m.players]);
  m.restart=null;m.phase='OPEN_PLAY';m.nextShape=Infinity;
  for(const p of m.players){const x=p.team==='HOME'?5:100;Object.assign(p,{x,y:4,tx:x,ty:4,vx:0,vy:0,nextThink:Infinity,lockTargetUntil:0});}
  const owner=m.playersById['H-LCM'],target=m.playersById['H-ST'];
  Object.assign(owner,{x:40,y:34,tx:40,ty:34,nextThink:100});Object.assign(target,{x:56,y:34,tx:56,ty:34});
  engine.choiceActionBridge().setControlled(m,owner,true);owner.nextThink=100;owner.controlledSince=99;
  assert.ok(P.maybeCheckpoint(s));assert.ok(s.pending.options.some(o=>o.id==='LOB_PASS'&&o.targetId===target.id));
  const f={world,lease,s,m,owner,target,engine};
  f.opened={state:s,E:{...engine,snapshot:match=>V2.resolutionSnapshot(engine.snapshot(match),match,world.state)},P,frames:[]};
  s.spatialAuthorityV2Carry=world.state;
  if(launch)commit(f);
  return f;
}
function commit(f){
  assert.equal(P.applyChoice(f.s,'LOB_PASS',f.target.id,{source:'USER_UI_CLICK_IN_PITCH',confirmedAction:true,actionGestureId:'C4',pendingChoiceId:f.s.pending.id}).ok,true);
  park(f);return f;
}
function park(f){for(const p of f.m.players)Object.assign(p,{x:5,y:4,tx:5,ty:4,vx:0,vy:0,nextThink:Infinity});}
function tick(f,dt=.05){f.m.time+=dt;f.engine.updateBall(f.m,dt);}
function dragCrossingTime(distance,speed,k){return k>0?-Math.log1p(-distance*k/speed)/k:distance/speed;}
function handback(f){return{state:f.s,snapshot:f.opened.E.snapshot(f.m),actualEvents:f.m.events,hadChoice:true};}
function observed(f){return deep({world:f.world,match:f.m,controller:f.s,lease:V2.leaseAudit(f.lease),rng:f.m.r.observe(),trace:H.authorityTraceSnapshot(f.world)});}
function references(f){return[f.world.state,f.world.state.score,f.world.boundary,f.world.state.spatial,f.world.state.spatial.players,...f.m.players,f.m.ball,f.lease,f.lease.controller,f.m.r,f.lease.history,f.s.history];}
function rejected(f,fn,pattern=/OPEN_PLAY_LOB_CONTINUATION_REQUIRES_HIGH_RES/){
  const before=observed(f),refs=references(f);assert.throws(fn,pattern);assert.deepEqual(observed(f),before);
  references(f).forEach((ref,i)=>assert.equal(ref,refs[i]));
}
function rejectAll(f){
  const out=handback(f);
  rejected(f,()=>H.resumeFromHighRes(f.world,out));
  rejected(f,()=>V2.releaseResolutionLease(f.world,out));
  rejected(f,()=>V2.releaseResolutionLease(null,out));
  // A stale/relabelled snapshot cannot override the live canonical ball.
  const stale={...out,snapshot:{...out.snapshot,ball:{mode:'CONTROLLED'},completed:true}};
  rejected(f,()=>H.resumeFromHighRes(f.world,stale));
}
function stateSignature(f){return deep({match:f.m,controller:f.s,rng:f.m.r.observe(),history:f.lease.history});}

test('exact lob: ascent, apex, descent, bounce and LOOSE reject atomically; same controller continues identically',()=>{
  const a=fixture(),b=fixture(),controller=a.s,ball=a.m.ball,rng=a.m.r;
  assert.equal(a.m.ball.lobLaunch.choiceId,'LOB_PASS');assert.equal(a.m.ball.lobLaunch.targetId,a.target.id);
  tick(a,.1);tick(b,.1);assert.ok(a.m.ball.vz>0);rejectAll(a);
  const toApex=a.m.ball.vz/9.81;tick(a,toApex);tick(b,toApex);close(a.m.ball.vz,0);rejectAll(a);
  tick(a,.1);tick(b,.1);assert.ok(a.m.ball.vz<0);rejectAll(a);
  let bounce=false,loose=false;
  for(let n=0;n<80&&!loose;n++){
    tick(a);tick(b);
    if(a.m.ball.lobBounceCount&&!bounce){assert.ok(a.m.ball.z>0);rejectAll(a);bounce=true;}
    if(a.m.ball.mode==='LOOSE'){rejectAll(a);loose=true;}
    assert.deepEqual(stateSignature(a),stateSignature(b));
  }
  assert.ok(bounce&&loose);assert.equal(a.s,controller);assert.equal(a.m.ball,ball);assert.equal(a.m.r,rng);
  // Advance through the real controller after the rejected returns, then obtain
  // actual low control with the same receiver (no synthetic terminal flag).
  P.step(a.s,.05);P.step(b.s,.05);assert.deepEqual(stateSignature(a),stateSignature(b));
  for(const f of [a,b]){Object.assign(f.m.ball,{vx:0,vy:0});Object.assign(f.target,{x:f.m.ball.x,y:f.m.ball.y,tx:f.m.ball.x,ty:f.m.ball.y});tick(f);}
  assert.equal(a.m.ball.mode,'CONTROLLED');assert.equal(a.m.lastLobReceipt.type,'CONTROL');assert.equal(a.m.ball.physicsProfile,undefined);
  assert.deepEqual(stateSignature(a),stateSignature(b));
  const out=handback(a),history=a.lease.history,sp=a.world.state.spatial,players=[...a.m.players],beforeRng=a.m.r.observe();
  H.resumeFromHighRes(a.world,out);assert.equal(a.world.resumeCount,1);assert.equal(a.lease.releases,1);assert.equal(a.lease.owner,'COARSE');
  assert.equal(a.world.state.spatial,sp);assert.equal(a.world.state.ball,ball);assert.equal(a.lease.history,history);assert.equal(a.lease.controller,controller);
  a.m.players.forEach((p,i)=>assert.equal(p,players[i]));assert.deepEqual(a.m.r.observe(),beforeRng);
  rejected(a,()=>H.resumeFromHighRes(a.world,out),/V2_RESOLUTION_LEASE_NOT_ACTIVE/);
  rejected(a,()=>V2.releaseResolutionLease(null,out),/V2_RESOLUTION_LEASE_NOT_ACTIVE/);
});

test('physical settle and redirected descendants retain the guard; pending cannot be bypassed by alternate callers',()=>{
  const f=fixture();Object.assign(f.m.ball,{kind:'HEADER_PASS',z:1,vz:-1,lobSettle:{actorId:f.target.id}});rejectAll(f);
  Object.assign(f.m.ball,{mode:'LOOSE',kind:'LOOSE',z:0,vz:0,airborne:false});rejectAll(f);
  f.s.pending={id:'PENDING-C4',kind:'INCOMING_BALL',options:[{id:'TRAP_CONTROL',targetId:null}]};
  const before=observed(f);for(let n=0;n<4;n++)P.step(f.s,.1);assert.deepEqual(observed(f),before);
  const out=handback(f),pattern=/V2_PENDING_CHOICE_REQUIRES_RESOLUTION/;
  rejected(f,()=>H.resumeFromHighRes(f.world,out),pattern);
  rejected(f,()=>V2.releaseResolutionLease(null,{...out,state:{m:f.m}}),pattern);
});

// Root processResult is executed unmodified, with drawing/DOM calls observed.
// Physical stepping is real; an isolated updater is used only for slow/stalled
// fixtures, so elapsed-budget tests do not depend on NPC tactical choices.
function rootResult(f){
  const source=fs.readFileSync(path.join(ROOT,'step71_hybrid_v06_ui.js'),'utf8');
  const fn=source.match(/^function processResult\(real\)[^\n]+/m)[0],episode=source.match(/^function processEpisodeContinuation\(real\)[^\n]+/m)[0];
  const calls=[],ctx={session:f.s,P,E:f.opened.E,STEP:.1,acc:0,prev:null,curr:null,phase:'RESULT_PROCESS',
    draw(){},renderMeta(){},interp:a=>a,resultReceipt:()=>calls.push('receipt'),showPending:()=>calls.push('pending'),showResult:()=>calls.push('result'),sceneBreakThenHandback:()=>calls.push('handback'),$:()=>({})};
  vm.createContext(ctx);vm.runInContext(fn+'\n'+episode,ctx);return{step:()=>vm.runInContext('processResult(.05)',ctx),episodeStep:()=>vm.runInContext('processEpisodeContinuation(.05)',ctx),calls,ctx};
}
function isolatedSteps(fn){
  const step=E.step;E.step=(m,dt)=>{m.time+=dt;I.updateBall(m,dt);return m;};
  try{return fn();}finally{E.step=step;}
}
function stalled(f){Object.assign(f.m.ball,{x:50,y:34,z:0,vx:0,vy:0,vz:0,airborne:false,mode:'LOOSE',lobContacts:[]});}

test('root watchdog at 8/12/24 seconds retains live LOOSE physics and only finishes after actual control',()=>isolatedSteps(()=>{
  const f=fixture(),root=rootResult(f);stalled(f);const tr=f.s.resultTracker;
  for(let n=0;n<241;n++){
    root.step();
    if([79,119,239].includes(n)){assert.equal(f.s.resultTracker,tr);assert.equal(root.calls.length,0);rejectAll(f);}
  }
  assert.ok(tr.presentationElapsed>24);assert.equal(f.lease.owner,'HIGH_RES');
  Object.assign(f.target,{x:50,y:34,tx:50,ty:34});root.step();
  assert.equal(f.m.ball.mode,'CONTROLLED');assert.equal(f.s.resultTracker,null);assert.ok(root.calls.includes('receipt'));
  H.resumeFromHighRes(f.world,handback(f));assert.equal(f.lease.releases,1);
}));

test('scene helper default 12-second result budget and 24-second settle budget stop without release or replacement',()=>isolatedSteps(()=>{
  const f=fixture({launch:false});
  // Start the stall after the exact real commit, before its first physical tick.
  const saved=E.step;let first=true;
  E.step=(m,dt)=>{if(first){park(f);stalled(f);first=false;}return saved(m,dt);};
  let out;try{out=Scene.applyChoiceAndAdvance(f.opened,'LOB_PASS',f.target.id);}finally{E.step=saved;}
  assert.ok(f.m.time>=112&&f.m.time<112.2);assert.equal(out.result,null);assert.ok(f.s.resultTracker);rejectAll(f);
  const controller=f.s,start=f.m.time;
  assert.throws(()=>Scene.finalizeEpisode(f.opened,[]),/V2_RESOLUTION_BOUNDARY_NOT_SETTLED_WITHIN_24_VISIBLE_SECONDS/);
  close(f.m.time-start,24);assert.equal(f.s,controller);assert.equal(f.lease.controller,controller);rejectAll(f);
  // A real pending boundary freezes the same state; helpers must not settle past it.
  f.s.pending={id:'C4-PAUSE',kind:'INCOMING_BALL',options:[{id:'TRAP_CONTROL'}]};
  const before=observed(f),pendingOut=Scene.finalizeEpisode(f.opened,[]);
  assert.deepEqual(observed(f),before);assert.equal(pendingOut.nextPending.id,'C4-PAUSE');
  rejected(f,()=>H.resumeFromHighRes(f.world,pendingOut),/V2_PENDING_CHOICE_REQUIRES_RESOLUTION/);
}));

function crossing({side='GOAL_RIGHT',z=1,y=34,last='HOME',kind='PASS'}={}){
  const f=fixture(),b=f.m.ball,right=side==='GOAL_RIGHT';
  const speed=10,k=.20,time=dragCrossingTime(.1,speed,k);
  Object.assign(b,{x:right?104.9:.1,y,z:z+4.905*time**2,vx:right?speed:-speed,vy:0,vz:0,airDragK:k,airborne:true,kind,lastTouchTeam:last,lastTouchPlayer:last==='HOME'?'H-LCM':'A-LCM',lobContacts:[]});
  tick(f,.05);return f;
}
test('lob-only point-ball goalmouth uses actual xyz, both directions, bar threshold, width, last touch and terminal release',()=>{
  for(const side of ['GOAL_LEFT','GOAL_RIGHT'])for(const z of [0,1,2.439999,2.44,2.440001,4])for(const y of [30.3399,30.34,34,37.66,37.6601])for(const own of [false,true]){
    const attacking=side==='GOAL_RIGHT'?'HOME':'AWAY',last=own?(attacking==='HOME'?'AWAY':'HOME'):attacking;
    const f=crossing({side,z,y,last}),goal=f.m.events.find(e=>e.type==='GOAL'),inside=y>=30.34&&y<=37.66&&z<2.44;
    assert.equal(!!goal,inside,JSON.stringify({side,z,y,last}));
    const boundary=f.m.events.find(e=>e.type==='LOB_BOUNDARY').receipt;close(boundary.crossing.z,z);
    assert.equal(boundary.state.lastTouchTeam,last);assert.equal(f.m.lastLobReceipt.continuationRequired,false);
    if(inside){assert.equal(goal.team,attacking);assert.equal(goal.ownGoal,own);assert.equal(goal.actorId,last==='HOME'?'H-LCM':'A-LCM');close(goal.crossing.z,z);assert.equal(f.m.score[attacking],1);assert.equal(f.m.lastLobReceipt.type,'GOAL');assert.equal(f.m.playersById[f.m.goalCelebration.scorerId].team,attacking);}
    else{assert.equal(f.m.restart.kind,own?'CORNER':'GOAL_KICK');assert.equal(f.m.restart.team,own?attacking:(attacking==='HOME'?'AWAY':'HOME'));}
    assert.equal(f.m.ball.physicsProfile,undefined);H.resumeFromHighRes(f.world,handback(f));assert.equal(f.lease.releases,1);
  }
  // A redirected SHOT descendant remains height-gated while its lob profile lives.
  assert.equal(crossing({z:3,kind:'SHOT'}).m.score.HOME,0);
});

test('earlier physical contact beats a same-step crossing; actual defender touch becomes own goal attribution',()=>{
  const f=fixture(),b=f.m.ball;
  Object.assign(b,{x:104,y:34,z:1.6,vx:10,vy:0,vz:0,airborne:true,lobContacts:[]});
  const defender=f.m.playersById['A-LCM'];Object.assign(defender,{x:104.8,y:34.69,tx:104.8,ty:34.69});
  tick(f,.2);
  const events=f.m.events,contact=events.find(e=>e.type==='LOB_CONTACT');assert.ok(contact);assert.equal(contact.receipt.actorId,defender.id);
  assert.equal(contact.receipt.state.lastTouchTeam,'AWAY');assert.ok(contact.receipt.state.x<105);
  park(f);for(let n=0;n<100&&!f.m.restart;n++)tick(f,.05);
  const goal=f.m.events.find(e=>e.type==='GOAL');assert.ok(goal);assert.equal(goal.ownGoal,true);assert.equal(goal.actorId,defender.id);
  assert.ok(f.m.events.indexOf(contact)<f.m.events.indexOf(goal));
});

// Restricted runners can supply a temporary git-show copy via
// V63_C4_BASELINE_CORE; its SHA-256 below pins the exact approved source.
test('profile-absent SHOT/CHIP/CROSS/PASS and restart classifications match exact approved base, including RNG/events',()=>{
  const source=process.env.V63_C4_BASELINE_CORE?fs.readFileSync(process.env.V63_C4_BASELINE_CORE,'utf8'):execFileSync('git',['show','7ad9353a7e62f16997ad3d1a1b2b74e8a57bb08a:runtime/continuous_match_core.js'],{cwd:ROOT,encoding:'utf8',maxBuffer:4*1024*1024});
  assert.equal(require('node:crypto').createHash('sha256').update(source).digest('hex'),'801f559b1a58e83ed09bb73172b04cc7703e51dd5aceb6f5de37e4e4d356a57c','exact approved core base');
  const base=loadCore(source);
  for(const kind of ['SHOT','CHIP','CROSS','PASS','LONG_PASS'])for(const side of ['GOAL_LEFT','GOAL_RIGHT','TOUCH_TOP','TOUCH_BOTTOM'])for(const z of [1,3]){
    const a=I.createMatch(SEED),b=base.createMatch(SEED);
    for(const [m,engine] of [[a,I],[b,base]]){
      m.restart=null;m.phase='OPEN_PLAY';m.time=100;
      Object.assign(m.ball,{mode:'FLIGHT',kind:kind==='CHIP'?'SHOT':kind,strikeStyle:kind==='CHIP'?'CHIP':null,shotTeam:'HOME',lastTouchTeam:'HOME',lastTouchPlayer:'H-LCM'});
      engine.choiceActionBridge().handleOut(m,{side,x:side==='GOAL_LEFT'?0:side==='GOAL_RIGHT'?105:50,y:side==='TOUCH_TOP'?0:side==='TOUCH_BOTTOM'?68:34,z});
    }
    assert.deepEqual(deep(a),deep(b));assert.deepEqual(a.r.observe(),b.r.observe());
  }
});

test('existing V2 handback admission rejects before writes; ordinary safe control still returns exactly once',()=>{
  const f=fixture({launch:false});f.s.pending=null;const out=handback(f);
  rejected(f,()=>H.resumeFromHighRes(f.world,{...out,snapshot:{...out.snapshot,spatialAuthorityV2:null}}),/V2_FULL_SPATIAL_HANDBACK_REQUIRED/);
  rejected(f,()=>H.resumeFromHighRes(f.world,{...out,state:{m:{...f.m}}}),/V2_HANDBACK_LEASE_IDENTITY_MISMATCH/);
  rejected(f,()=>H.resumeFromHighRes(f.world,{...out,nextPending:{id:'NEXT'}}),/V2_PENDING_CHOICE_REQUIRES_RESOLUTION/);
  rejected(f,()=>H.resumeFromHighRes(f.world,{...out,snapshot:{...out.snapshot,time:99}}),/V2_RESOLUTION_HANDBACK_TIME_REVERSAL/);
  rejected(f,()=>V2.releaseResolutionLease(f.world,{...out,state:{m:{...f.m}}}),/V2_RESOLUTION_ADAPTER_IDENTITY_LOST/);
  H.resumeFromHighRes(f.world,out);assert.equal(f.world.resumeCount,1);assert.equal(f.lease.releases,1);
  rejected(f,()=>H.resumeFromHighRes(f.world,out),/V2_RESOLUTION_LEASE_NOT_ACTIVE/);
});

test('non-V2 session also refuses a live lob before legacy mutation; full time permits V2 terminal return',()=>{
  const f=fixture();f.world.opts.continuousSpatialAuthorityV2Coarse=false;
  rejected(f,()=>H.resumeFromHighRes(f.world,handback(f)));
  f.world.opts.continuousSpatialAuthorityV2Coarse=true;f.m.completed=true;
  assert.equal(E.lobContinuationRequired(f.m),false);H.resumeFromHighRes(f.world,handback(f));assert.equal(f.lease.releases,1);
});

test('root result loop with the browser V37 step wrapper preserves actual flight then opens a genuine pending return choice',()=>{
  const f=fixture(),root=rootResult(f),originalStep=E.step;
  // Execute the shipped browser wrapper, without a Chromium/DOM rendering claim.
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'runtime/v37_match_feel_patch.js'),'utf8'),{FLRPG_CONTINUOUS_CORE:E});
  try{
    const tr=f.s.resultTracker;tr.presentationElapsed=7.95;
    root.step();assert.ok(E.lobContinuationRequired(f.m));assert.equal(f.s.resultTracker,tr);assert.equal(root.calls.length,0);rejectAll(f);
    // A low returning second ball reaches the protagonist by actual contact.
    Object.assign(f.owner,{x:40,y:34,tx:40,ty:34,vx:0,vy:0});
    Object.assign(f.m.ball,{x:f.owner.x+.1,y:f.owner.y,z:0,vx:0,vy:0,vz:0,airborne:false,mode:'LOOSE',lobContacts:[]});
    root.step();assert.equal(f.m.ball.mode,'CONTROLLED');assert.equal(f.m.ball.ownerId,f.owner.id);
    for(let n=0;n<20&&!f.s.pending;n++)root.episodeStep();
    assert.ok(f.s.pending);assert.ok(root.calls.includes('pending'));assert.ok(!root.calls.includes('handback'));assert.equal(f.s.pending.kind,'ON_BALL');assert.ok(f.s.pending.options.length>1);
    const before=observed(f);for(let n=0;n<5;n++)P.step(f.s,.1);assert.deepEqual(observed(f),before);
    rejected(f,()=>H.resumeFromHighRes(f.world,handback(f)),/V2_PENDING_CHOICE_REQUIRES_RESOLUTION/);
  }finally{E.step=originalStep;delete E.__v37MatchFeelPatch;delete E.V37_MATCH_FEEL_VERSION;}
});
