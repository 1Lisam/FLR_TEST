'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const S=require('../runtime/ball_strike_model.js');
const corePath=require.resolve('../runtime/continuous_match_core.js');
function compile(filename,source){
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;
  mod._compile(source.replace('return{createMatch,step,snapshot,runToEnd,',
    'return{choosePassDelivery,setBallFlight,updateBall,createMatch,step,snapshot,runToEnd,'),filename);
  return mod.exports;
}
const E=compile(corePath,fs.readFileSync(corePath,'utf8'));
const speed=b=>Math.hypot(b.vx,b.vy);
const close=(a,b,tol=.001)=>assert.ok(Math.abs(a-b)<tol,`${a} ~= ${b}`);
function fixture(engine=E,team='HOME'){
  const m=engine.createMatch('V63-CONTEXTUAL-PACE'),prefix=team==='HOME'?'H':'A';
  const world=(x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
  m.phase='OPEN_PLAY';m.restart=null;m.time=100;m.nextShape=Infinity;m.r=()=>.5;
  for(const p of m.players)Object.assign(p,{...world(5,4),vx:0,vy:0,runUntil:0,nextThink:Infinity});
  const owner=m.playersById[prefix+'-LCM'],target=m.playersById[prefix+'-CM'];
  Object.assign(owner,world(30,12));Object.assign(target,world(50,55));
  engine.choiceActionBridge().setControlled(m,owner,true);
  return{m,owner,target,world};
}
function plan(extra={}){
  return S.passPlan({ordinaryOpenPlay:true,kind:'LONG_PASS',deliveryMode:'AERIAL',distance:40,forward:20,passSkill:60,...extra});
}
function park(f){for(const p of f.m.players)Object.assign(p,{x:5,y:4,vx:0,vy:0});}

test('both directions: major switches usually loft, clean 30–35m driven lanes remain ground',()=>{
  for(const team of ['HOME','AWAY']){
    const f=fixture(E,team),{m,owner,target,world}=f;
    function aerialCount(x,y,option={}){
      Object.assign(target,world(x,y));let count=0;
      for(let i=0;i<100;i++){m.r=()=>(i+.5)/100;
        count+=E.choosePassDelivery(m,owner,target,'LONG_PASS',option,Math.hypot(target.x-owner.x,target.y-owner.y))==='AERIAL';}
      return count;
    }
    for(const d of [30,32,35])assert.equal(aerialCount(30+d,12),16);
    const switchCount=aerialCount(50,55);assert.ok(switchCount>=85&&switchCount<100);
    assert.ok(aerialCount(50,40,{switchPlay:true})>=85);
    const transfer=aerialCount(75,12);assert.ok(transfer>=75&&transfer<100);
    // Equal length with neither lateral switch nor defensive origin is still mixed.
    Object.assign(owner,world(48,12));const neutral=aerialCount(93,12);
    assert.ok(neutral<transfer&&neutral<switchCount);
    m.r=()=>.99;assert.equal(E.choosePassDelivery(m,owner,target,'LONG_PASS',{switchPlay:true},45),'GROUND');
    assert.equal(E.choosePassDelivery(m,owner,target,'PASS',{switchPlay:true},45),'GROUND');
  }
});

test('pure current-context planner separates neutral, switch/recycle and penetrating aerial pace',()=>{
  for(const d of [30,40,55]){
    const neutral=plan({distance:d}),sw=plan({distance:d,lateral:28,switchPlay:true});
    const recycle=plan({distance:d,recycle:true}),back=plan({distance:d,forward:-20});
    assert.equal(neutral.style,'LOFTED_LONG');assert.equal(sw.style,'LOFTED_SWITCH');
    assert.equal(recycle.style,'LOFTED_RECYCLE');assert.equal(back.style,'LOFTED_RECYCLE');
    for(const slow of [sw,recycle,back]){
      assert.ok(slow.arrival>neutral.arrival+.25);assert.ok(slow.speed<neutral.speed);
      assert.ok(slow.loft>neutral.loft);
      for(const fast of [plan({distance:d,kind:'CROSS'}),plan({distance:d,kind:'CROSS',sourceX:95}),
        plan({distance:d,kind:'THROUGH'}),plan({distance:d,running:true,penetrating:true})]){
        assert.ok(fast.speed>slow.speed);assert.ok(fast.arrival<slow.arrival);assert.ok(fast.loft<slow.loft);
      }
    }
    const ctx={ordinaryOpenPlay:true,kind:'LONG_PASS',deliveryMode:'AERIAL',distance:d,lateral:28,switchPlay:true};
    const before=structuredClone(ctx);assert.deepEqual(S.passPlan(ctx),S.passPlan(ctx));assert.deepEqual(ctx,before);
  }
  assert.equal(plan({lateral:0,switchPlay:true}).style,'LOFTED_LONG','label alone is not wide geometry');
});

test('executePass forwards current purpose and compensates from actual ball origin in both directions',()=>{
  for(const team of ['HOME','AWAY'])for(const [reason,option,back,style] of [
    [null,{switchPlay:true},false,'LOFTED_SWITCH'],
    ['CANDIDATE_RECYCLE',{},false,'LOFTED_RECYCLE'],
    [null,{},true,'LOFTED_RECYCLE'],
    [null,{running:true,throughReady:true},false,'LOFTED_THROUGH']]){
    const f=fixture(E,team);if(back)Object.assign(f.owner,f.world(70,12));
    E.choiceActionBridge().setControlled(f.m,f.owner,true);
    E.choiceActionBridge().executePass(f.m,f.owner,f.target,'LONG_PASS',option,reason);
    const b=f.m.ball;assert.equal(b.deliveryMode,'AERIAL');assert.equal(b.strikeStyle,style);
    assert.equal(b.intendedReceiverId,f.target.id);assert.ok(b.ordinaryAirDragK>0);assert.equal(b.physicsProfile,undefined);
    const duration=(b.vz+Math.sqrt(b.vz*b.vz+2*9.81*b.z))/9.81;
    const travel=speed(b)*-Math.expm1(-b.ordinaryAirDragK*duration)/b.ordinaryAirDragK;
    close(travel,Math.hypot(b.targetX-b.x,b.targetY-b.y),.015);
    assert.ok(f.target.lockTargetUntil>=f.m.time+duration);
    for(const key of ['futureController','winnerId','terminalResult','success'])assert.equal(b[key],undefined);
  }
});

test('ordinary aerial flight continuously slows and reaches a low, viable current aim across frame sizes',t=>{
  for(const dt of [.01,.05])for(const extra of [{},{lateral:36,switchPlay:true},{recycle:true},{kind:'CROSS'},{kind:'THROUGH'}]){
    const p=plan(extra),f=fixture();
    Object.assign(f.m.ball,{x:25,y:34});
    E.setBallFlight(f.m,{source:f.owner,target:f.target,kind:extra.kind||'LONG_PASS',speed:p.speed,loft:p.loft,
      targetPoint:{x:65,y:34},deliveryMode:'AERIAL',ordinaryAirDragK:p.ordinaryAirDragK});
    park(f);let previous=speed(f.m.ball),elapsed=0,peak=0,arrivalZ=null,arrivalSpeed=null;
    while(f.m.ball.mode==='FLIGHT'&&elapsed<4.1){
      const b=f.m.ball;elapsed+=dt;f.m.time+=dt;E.updateBall(f.m,dt);
      assert.ok(speed(b)<previous);previous=speed(b);peak=Math.max(peak,b.z);
      if(f.m.ball.mode!=='FLIGHT'){arrivalZ=b.z;arrivalSpeed=speed(b);}
    }
    assert.ok(f.m.ball.x>=64.29&&f.m.ball.x<66.5);assert.ok(arrivalZ<1.0,'aim is reachable at receiving height');
    assert.ok(arrivalSpeed>5);assert.ok(arrivalSpeed<p.speed*.9);assert.ok(peak>1.4);
    close(elapsed,p.arrival,.13);
    t.diagnostic(JSON.stringify({style:p.style,dt,launch:p.speed,arrivalSpeed,elapsed,arrivalZ,peak}));
  }
});

test('goal-kick/restart, shot and chip setBallFlight retain exact base launch and Z stepping without ordinary drag',()=>{
  for(const kind of ['GOAL_KICK','THROW_IN','FREE_KICK','CORNER','SHOT','CROSS'])for(const style of [null,'CHIP']){
    const a=fixture(E),args={kind,style,speed:22,loft:3.2,targetPoint:{x:80,y:34},deliveryMode:'AERIAL'};
    E.setBallFlight(a.m,{...args,source:a.owner,target:a.target});park(a);
    const initial={...a.m.ball},chip=kind==='SHOT'&&style==='CHIP';
    assert.equal(Object.hasOwn(initial,'ordinaryAirDragK'),false);
    close(initial.z,chip?0:.15);close(initial.vz,chip?0:Math.sqrt(2*9.81*3.2));
    assert.equal(initial.arcProfile,chip?'CHIP_LOB':null);close(speed(initial),22);
    let z=initial.z,vz=initial.vz;
    for(let i=1;i<=20;i++){
      E.updateBall(a.m,.05);const live=a.m.ball;
      if(chip){const u=Math.min(1,i*.05/initial.arcDuration);z=Math.max(0,4*initial.arcHeight*u*(1-u));}
      else{z=Math.max(0,z+vz*.05);vz-=9.81*.05;}
      close(live.z,z);close(live.x,initial.x+initial.vx*i*.05);close(live.y,initial.y+initial.vy*i*.05);
      assert.equal(Object.hasOwn(live,'ordinaryAirDragK'),false);
    }
  }
  for(const kind of ['GOAL_KICK','THROW_IN','FREE_KICK','CORNER','SHOT','CHIP']){
    assert.equal(plan({kind}).ordinaryAirDragK,undefined);
    const f=fixture();E.setBallFlight(f.m,{source:f.owner,target:f.target,kind,deliveryMode:'AERIAL',loft:3,ordinaryAirDragK:.18});
    assert.equal(Object.hasOwn(f.m.ball,'ordinaryAirDragK'),false);
  }
  const lob={physicsProfile:'OPEN_PLAY_LOB_V1',origin:{x:20,y:34,z:0},target:{x:48,y:34,vx:2,vy:0}};
  // Frozen planner values from exact gameplay base 5aaf697c; no Git dependency in QA.
  const lp=S.passPlan(lob);assert.equal(lp.airDragK,.20);assert.deepEqual(lp.aim,{x:50,y:34});
  close(lp.arrival,1.7);close(lp.vx,20.816732189094843);close(lp.vz,8.3385);
  assert.equal(lp.ordinaryAirDragK,undefined);
});

test('8m short, 20m firm and 30–35m driven ground show stronger compensated decay and viable arrival',t=>{
  let short,firm;
  // Exact base launch/drag observations, used to check improvement rather than
  // merely duplicating the new planner's coefficients.
  const baseline={8:[11.141,.60],20:[17.153,.40],30:[24.197,.32],32:[25.111,.32],35:[26.403,.32]};
  for(const [kind,d] of [['PASS',8],['PASS',20],['LONG_PASS',30],['LONG_PASS',32],['LONG_PASS',35],['THROUGH',25]]){
    const ctx={kind,distance:d,forward:d===8?4:d,deliveryMode:'GROUND',passSkill:60};
    const p=S.passPlan(ctx),f=fixture();
    if(d===8)short=p;if(d===20)firm=p;
    if(kind!=='THROUGH'){
      const [oldSpeed,oldDrag]=baseline[d];assert.ok(p.groundDragK>oldDrag);
      assert.ok(p.speed-p.groundDragK*d<oldSpeed-oldDrag*d,'lower terminal pace despite launch compensation');
    }else assert.deepEqual(p,{style:'THROUGH_GROUND',speed:24.8,loft:.07,arrival:1.33,groundDragK:.4377},'penetrating ground profile preserved');
    Object.assign(f.m.ball,{x:20,y:34});
    E.setBallFlight(f.m,{source:f.owner,target:f.target,kind,speed:p.speed,loft:p.loft,
      targetPoint:{x:20+d,y:34},deliveryMode:'GROUND',groundDragK:p.groundDragK});
    park(f);let previous=p.speed,elapsed=0;
    while(f.m.ball.mode==='FLIGHT'&&elapsed<4){
      f.m.time+=.01;elapsed+=.01;E.updateBall(f.m,.01);assert.ok(speed(f.m.ball)<previous);previous=speed(f.m.ball);
      assert.equal(f.m.ball.z,0);
    }
    assert.ok(f.m.ball.x>=20+d-.71);close(elapsed,p.arrival,.15);
    const incoming=p.speed*Math.exp(-p.groundDragK*elapsed);assert.ok(incoming>4&&incoming<p.speed*.8);
    if(kind==='LONG_PASS'){assert.ok(p.speed>firm.speed);assert.ok(incoming>short.speed-short.groundDragK*8);}
    t.diagnostic(JSON.stringify({style:p.style,d,launch:p.speed,incoming,elapsed}));
  }
  assert.ok(short.speed<firm.speed);
});

test('launch-capped driven passes relax drag safely instead of stopping short',()=>{
  for(const distance of [48,60,68]){
    const p=S.passPlan({kind:'LONG_PASS',distance,forward:distance,deliveryMode:'GROUND'});
    const f=fixture();Object.assign(f.m.ball,{x:20,y:34});
    E.setBallFlight(f.m,{source:f.owner,target:f.target,kind:'LONG_PASS',speed:p.speed,loft:p.loft,
      targetPoint:{x:20+distance,y:34},deliveryMode:'GROUND',groundDragK:p.groundDragK});
    park(f);assert.ok(p.speed<=30);assert.ok(p.speed-p.groundDragK*distance>4);
    for(let i=0;i<400&&f.m.ball.mode==='FLIGHT';i++){f.m.time+=.01;E.updateBall(f.m,.01);}
    assert.ok(f.m.ball.x>=20+distance-.71);assert.ok(p.arrival<4);
  }
});
