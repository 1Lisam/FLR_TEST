'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const S=require('../runtime/ball_strike_model.js');
const Controller=require('../runtime/protagonist_match_controller.js');
const corePath=require.resolve('../runtime/continuous_match_core.js');
const mod=new Module(corePath,module);mod.filename=corePath;mod.paths=module.paths;
mod._compile(fs.readFileSync(corePath,'utf8').replace('return{createMatch,step,snapshot,runToEnd,',
  'return{setBallFlight,updateBall,resolveCrossLanding,captureLooseOrFlight,prepareMovementIntentTargets,movePlayers,hash32,performRestart,createMatch,step,snapshot,runToEnd,'),corePath);
const E=mod.exports,B=E.choiceActionBridge();
const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,`${a} ~= ${b}`);
const speed=p=>Math.hypot(p.vx,p.vy);
function fixture(team='HOME'){
  const m=E.createMatch('V63-HEIGHT-RECEIVE'),prefix=team==='HOME'?'H':'A',sign=team==='HOME'?1:-1;
  const world=(x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
  Object.assign(m,{phase:'OPEN_PLAY',restart:null,time:100,nextShape:Infinity,r:()=>.5});
  for(const p of m.players)Object.assign(p,{...world(p.team===team?5:100,4),vx:0,vy:0,nextThink:Infinity,runUntil:0,sprint:false});
  const source=m.playersById[prefix+'-LCM'],p=m.playersById[prefix+'-CM'],next=m.playersById[prefix+'-ST'];
  Object.assign(source,world(25,34));Object.assign(p,{...world(65,34),tx:world(65,34).x,ty:34,bodyAngle:team==='HOME'?Math.PI:0});Object.assign(next,world(78,34));
  B.setControlled(m,source,true);return{m,source,p,next,world,sign};
}
function plan(d,extra={}){return S.passPlan({ordinaryOpenPlay:true,kind:'LONG_PASS',deliveryMode:'AERIAL',distance:d,forward:20,...extra});}
function flight(d,extra={},dt=.01){
  const f=fixture(),p=plan(d,extra),{m}=f;Object.assign(m.ball,{x:20,y:34});
  E.setBallFlight(m,{source:f.source,target:f.p,kind:extra.kind||'LONG_PASS',...p,deliveryMode:'AERIAL',targetPoint:{x:20+d,y:34}});
  assert.equal(m.ball.arcProfile,'ORDINARY_PASS');
  for(const q of m.players)Object.assign(q,{x:5,y:4});
  let peak=0,last=speed(m.ball),elapsed=0,firstImpact=null;
  while(m.ball.mode==='FLIGHT'&&elapsed<4.3){
    const before={...m.ball};m.time+=dt;elapsed+=dt;E.updateBall(m,dt);
    if(!firstImpact){
      peak=Math.max(peak,m.ball.z);
      if(before.airborne&&m.ball.z===0){
        firstImpact={x:m.ball.x,elapsed};
        // The planner's arrival is an aim/pace input. Ground contact can occur
        // earlier; horizontal travel up to that impact still obeys air drag.
        const k=p.ordinaryAirDragK,travel=p.speed*-Math.expm1(-k*elapsed)/k;
        close(firstImpact.x,20+travel,1e-6);
        assert.equal(m.ball.ordinaryBounceCount,extra.kind==='CROSS'?undefined:1);
        if(extra.kind==='CROSS')assert(m.ball.airborne===false||m.ball.mode==='LOOSE',
          'a grounded CROSS may already have entered the loose-ball phase');
        else assert.equal(m.ball.airborne,true);
      }
    }
    assert.ok(speed(m.ball)<last);last=speed(m.ball);
  }
  assert(firstImpact,`first physical ground contact for ${d}m ${p.style}`);
  assert(firstImpact.elapsed<4.2,`first contact precedes loose-ball timeout for ${d}m ${p.style}`);
  assert.equal(m.ball.mode,'LOOSE',`uncontested ${d}m ${p.style} eventually becomes loose`);
  assert.ok(m.ball.z<=.72);
  return{peak,p};
}
test('35–45m ordinary neutral peaks fall materially below exact-base ballistic duration peaks',t=>{
  for(const d of [35,40,45])for(const dt of [.01,.05]){
    const f=flight(d,{},dt),oldVz=(4.905*f.p.arrival**2-.15)/f.p.arrival,oldPeak=.15+oldVz**2/19.62;
    assert.ok(f.peak<oldPeak*.67);assert.ok(f.peak>2&&f.peak<4);
    t.diagnostic(JSON.stringify({d,dt,oldPeak,peak:f.peak}));
  }
});
test('switch/recycle stay higher than neutral and direct deliveries with bounded ordinary peaks',t=>{
  for(const d of [35,40,45,55]){
    const neutral=flight(d),cross=flight(d,{kind:'CROSS'}),through=flight(d,{kind:'THROUGH'});
    assert.ok(cross.peak<neutral.peak&&through.peak<neutral.peak);
    for(const extra of [{lateral:30,switchPlay:true},{recycle:true}]){
      const f=flight(d,extra);assert.ok(f.peak>neutral.peak+.65);assert.ok(f.peak<5.5);
      t.diagnostic(JSON.stringify({d,style:f.p.style,peak:f.peak}));
    }
  }
});
test('executePass carries the height profile into live Z, preserving planned horizontal speed and drag',()=>{
  for(const team of ['HOME','AWAY']){
    const f=fixture(team);Object.assign(f.p,f.world(60,58));f.m.r=()=>.5;
    B.executePass(f.m,f.source,f.p,'LONG_PASS',{switchPlay:true});
    const b=f.m.ball;assert.equal(b.arcProfile,'ORDINARY_PASS');assert.equal(b.strikeStyle,'LOFTED_SWITCH');
    const d=Math.hypot(b.targetX-b.x,b.targetY-b.y),p=plan(d,{lateral:24,switchPlay:true});
    close(speed(b),p.speed);close(b.ordinaryAirDragK,p.ordinaryAirDragK);
    for(const q of f.m.players)Object.assign(q,{x:5,y:4});
    E.updateBall(f.m,.7);const z=b.z,vz=b.vz;E.updateBall(f.m,.00001);
    close((b.z-z)/.00001,vz,.001);assert.ok(b.z>1&&b.z<5.5);
  }
});
test('goal kick loft 7.5 and excluded restart/shot launches retain exact baseline Z integration',()=>{
  for(const kind of ['GOAL_KICK','THROW_IN','FREE_KICK','CORNER','SHOT','CROSS']){
    const f=fixture(),loft=kind==='GOAL_KICK'?7.5:4.3;
    E.setBallFlight(f.m,{source:f.source,target:f.p,kind,speed:22,loft,deliveryMode:'AERIAL',targetPoint:{x:90,y:34}});
    for(const p of f.m.players)Object.assign(p,{x:5,y:4});
    const b=f.m.ball;assert.equal(b.arcProfile,null);assert.equal(b.ordinaryArcLaunchVz,undefined);assert.equal(b.ordinaryAirDragK,undefined);
    close(b.z,.15);close(b.vz,Math.sqrt(19.62*loft));let z=b.z,vz=b.vz,x=b.x;
    for(let i=0;i<20;i++){z=Math.max(0,z+vz*.05);vz-=9.81*.05;x+=22*.05;E.updateBall(f.m,.05);close(b.z,z);close(b.vz,vz);close(b.x,x);}
  }
  for(const kind of ['GOAL_KICK','THROW_IN','FREE_KICK','CORNER','SHOT','CHIP'])assert.equal(plan(40,{kind}).ordinaryArcHeight,undefined);
  const lob=S.passPlan({physicsProfile:'OPEN_PLAY_LOB_V1',origin:{x:20,y:34,z:0},target:{x:48,y:34,vx:2,vy:0}});
  close(lob.vz,8.3385);assert.equal(lob.ordinaryArcHeight,undefined);
});
function crossFixture(z=4.2,vz=-2){
  const f=fixture();Object.assign(f.source,{x:70,y:34});Object.assign(f.p,{x:88,y:34,tx:88});
  // Exercise the advanced FREE_KICK restart's real CROSS launch, at kicker contact.
  f.m.restart={kind:'FREE_KICK',team:'HOME',x:70,y:34,stage:'APPROACH',until:99,
    setup:{kind:'FREE_KICK',team:'HOME',kickerId:f.source.id,targets:{[f.source.id]:{x:70,y:34,task:'FREE_KICK_APPROACH'}}},userRestartChoice:{targetId:f.p.id}};
  E.performRestart(f.m);assert.equal(f.m.ball.kind,'CROSS');assert.equal(f.m.ball.arcProfile,null);
  Object.assign(f.m.ball,{x:f.p.x,y:f.p.y,z,vz,vx:1,vy:0,age:.9,airborne:true,targetX:f.p.x,targetY:f.p.y});
  return f;
}
test('advanced free-kick high or ascending cross cannot become outfield control or disappear at aim',()=>{
  for(const [z,vz] of [[4.2,-1],[3,-1],[2,1]]){
    const f=crossFixture(z,vz),before={...f.m.ball};
    assert.equal(E.resolveCrossLanding(f.m),false);E.captureLooseOrFlight(f.m,before);assert.equal(f.m.ball.ownerId,null);close(f.m.ball.z,z);
    E.updateBall(f.m,.01);assert.equal(f.m.ball.mode,'FLIGHT');assert.ok(f.m.ball.z>1.9);
  }
});
test('interception and generic capture cannot bypass the cross or knockdown height boundary',()=>{
  for(const kind of ['CROSS','AERIAL_KNOCKDOWN']){
    const f=crossFixture(1.2,-1);f.p.x=65;Object.assign(f.m.playersById['A-CM'],{x:88,y:34});
    f.m.ball.kind=kind;f.m.r=()=>.01;E.updateBall(f.m,.01);
    assert.equal(f.m.ball.ownerId,null);assert.ok(f.m.ball.z>1);assert.equal(f.m.ball.mode,'FLIGHT');
  }
});
test('descending reachable contest preserves contact height and continues as a falling knockdown',()=>{
  for(const defence of [false,true]){
    const f=crossFixture(2.2,-2);Object.assign(f.p,{x:75,y:34});Object.assign(f.m.ball,{x:75,targetX:75});
    if(defence){Object.assign(f.m.playersById['A-CM'],{x:75,y:34});f.p.x=65;}
    assert.equal(E.resolveCrossLanding(f.m),true);assert.equal(f.m.ball.kind,'AERIAL_KNOCKDOWN');assert.equal(f.m.ball.ownerId,null);close(f.m.ball.z,2.2);
    E.updateBall(f.m,.05);assert.ok(f.m.ball.z<2.2&&f.m.ball.z>1.9);assert.equal(f.m.ball.ownerId,null);
    for(const p of f.m.players)Object.assign(p,{x:5,y:4});
    for(let i=0;i<90;i++)E.updateBall(f.m,.05);
    assert.equal(f.m.ball.z,0);assert.equal(f.m.ball.mode,'LOOSE');
  }
});
test('a missed or distant aerial contest stays live, close low control and reachable NPC headers still work',()=>{
  const miss=crossFixture(2,-1);miss.m.r=()=>.99;assert.equal(E.resolveCrossLanding(miss.m),false);close(miss.m.ball.z,2);
  const distant=crossFixture(2,-1);distant.p.y+=2;assert.equal(E.resolveCrossLanding(distant.m),false);
  const low=crossFixture(.3,-1);assert.equal(E.resolveCrossLanding(low.m),true);assert.equal(low.m.ball.ownerId,low.p.id);
  const header=crossFixture(2.2,-1);header.m.r=()=>.1;assert.equal(E.resolveCrossLanding(header.m),true);
  assert.equal(header.m.ball.kind,'SHOT');assert.equal(header.m.ball.deliveryMode,'AERIAL_HEADER');close(header.m.ball.z,2.2);
  const hero=crossFixture(2.2,-1);hero.m.protagonistControllerId=hero.p.id;assert.equal(E.resolveCrossLanding(hero.m),false);assert.equal(hero.m.ball.kind,'CROSS');
});
function receiveFixture({team='HOME',reason='CANDIDATE_PROGRESSIVE',pressure=false,aerial=false,slow=0}={}){
  const f=fixture(team);Object.assign(f.p,{...f.world(45,34),vx:f.sign*slow,tx:f.world(45,34).x});
  if(pressure)Object.assign(f.m.playersById[team==='HOME'?'A-CM':'H-CM'],f.world(45,35));
  B.executePass(f.m,f.source,f.p,aerial?'CROSS':'PASS',null,reason);return f;
}
test('open stationary/slow intended ground receivers make a modest live approach in either direction',()=>{
  for(const team of ['HOME','AWAY'])for(const slow of [0,.5]){
    const f=receiveFixture({team,slow}),start=f.p.x;assert.ok(f.p.stationaryReceiveApproach);
    Object.assign(f.m.ball,{...f.world(38,34),vx:f.sign*9,vy:0,z:0,airborne:false});
    for(let i=0;i<16;i++){f.m.time+=.05;E.prepareMovementIntentTargets(f.m);E.movePlayers(f.m,.05);assert.ok(speed(f.p)<=1.66);}
    assert.ok(f.sign*(start-f.p.x)>.15);assert.ok(Math.abs(start-f.p.x)<=1.12);assert.equal(f.p.sprint,false);
    assert.equal(f.m.ball.ownerId,null);assert.equal(f.m.ball.lastTouchPlayer,f.source.id);
  }
});
test('the actual rolling pass reaches the modest approach through physical contact',()=>{
  for(const team of ['HOME','AWAY']){
    const f=receiveFixture({team}),start=f.p.x;f.m.protagonistControllerId=f.p.id;
    let moved=0,contact=false;
    for(let i=0;i<60;i++){
      f.m.time+=.05;E.prepareMovementIntentTargets(f.m);
      const previous=Object.fromEntries(f.m.players.map(p=>[p.id,{x:p.x,y:p.y}]));
      E.movePlayers(f.m,.05);E.updateBall(f.m,.05,previous);
      moved=Math.max(moved,f.sign*(start-f.p.x));
      if(f.m.ball.ownerId===f.p.id){contact=true;break;}
    }
    assert.ok(contact);assert.ok(moved>.1&&moved<=1.12);assert.equal(f.m.stats.npcOneTouchPasses||0,0);
  }
});
test('feet/recycle, pressure, aerial, off-line/away balls and decision pauses do not force an approach',()=>{
  for(const config of [{reason:'CANDIDATE_SAFE'},{reason:'CANDIDATE_RECYCLE'},{pressure:true},{aerial:true}]){
    const f=receiveFixture(config);assert.equal(f.p.stationaryReceiveApproach,undefined);E.prepareMovementIntentTargets(f.m);close(f.p.tx,f.p.x);
  }
  for(const change of ['away','off-line','pressure','aerial','expired']){
    const f=receiveFixture();Object.assign(f.m.ball,{x:39,y:34,vx:9,vy:0});
    if(change==='away')f.m.ball.vx=-9;if(change==='off-line')f.m.ball.y=38;
    if(change==='pressure')Object.assign(f.m.playersById['A-CM'],{x:45,y:35});
    if(change==='aerial')f.m.ball.airborne=true;if(change==='expired')f.m.time=f.p.stationaryReceiveApproach.expiresAt;
    E.prepareMovementIntentTargets(f.m);close(f.p.tx,f.p.x);
  }
  const f=receiveFixture(),before=structuredClone(f.m.ball),x=f.p.x;
  Controller.step({m:f.m,pending:{id:'USER_DECISION'}},.05);close(f.p.x,x);assert.deepEqual(f.m.ball,before);
});
function incoming(f,gap,y=34){
  Object.assign(f.p,{...f.world(50,34),bodyAngle:f.sign===1?0:Math.PI});
  Object.assign(f.m.ball,{mode:'FLIGHT',kind:'PASS',ownerId:null,...f.world(50-gap,y),z:0,vx:f.sign*9,vy:0,vz:0,age:.8,
    deliveryMode:'GROUND',airborne:false,intendedReceiverId:f.p.id,lastTouchPlayer:f.source.id,lastTouchTeam:f.source.team,targetX:f.p.x,targetY:f.p.y,passMiscontrol:false});
  f.source.hasBall=false;
  for(let i=0;i<500;i++){const seed='STRICT-FOOT-'+i;if((E.hash32(`${seed}|NPC_ONE_TOUCH|1000|${f.p.id}|${f.source.id}`)%10000)/10000<.055){f.m.seed=seed;break;}}
  return{x:f.m.ball.x-f.sign*.4,y:f.m.ball.y};
}
test('possession awareness cannot redirect; close factual foot contact can; protagonist never auto-redirects',()=>{
  for(const team of ['HOME','AWAY']){
    for(const gap of [1.584,.62]){
      const f=fixture(team),prev=incoming(f,gap);E.captureLooseOrFlight(f.m,prev);assert.equal(f.m.stats.npcOneTouchPasses||0,0);
      assert.equal(f.m.ball.ownerId,gap<1?f.p.id:null,'generic possession boundary preserved');
    }
    const f=fixture(team),prev=incoming(f,.4);E.captureLooseOrFlight(f.m,prev);assert.equal(f.m.stats.npcOneTouchPasses,1);
    const hero=fixture(team),hp=incoming(hero,.4);hero.m.protagonistControllerId=hero.p.id;E.captureLooseOrFlight(hero.m,hp);
    assert.equal(hero.m.stats.npcOneTouchPasses||0,0);assert.equal(hero.m.ball.ownerId,hero.p.id);
  }
});
test('relative previous/current player motion proves the strict sweep without enlarging its endpoint',()=>{
  for(const moved of [false,true]){
    const f=fixture(),prev=incoming(f,0,34.5);prev.x=f.p.x;prev.y=34.5;
    E.captureLooseOrFlight(f.m,prev,moved?{[f.p.id]:{x:f.p.x,y:34.3}}:null);
    assert.equal(f.m.stats.npcOneTouchPasses||0,moved?1:0);
  }
  const f=fixture(),prev=incoming(f,0,34.8);E.captureLooseOrFlight(f.m,prev,{[f.p.id]:{x:f.p.x,y:34.6}});
  assert.equal(f.m.stats.npcOneTouchPasses||0,0,'swept contact with distant endpoint cannot redirect');
});
