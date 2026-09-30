'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const STRIKE=require('../runtime/ball_strike_model.js');
const corePath=require.resolve('../runtime/continuous_match_core.js');
// Exercise the real selection boundary and integrator, without a product test API
// or an alternate flight model. Telemetry is printed; no evidence files are written.
const mod=new Module(corePath,module);mod.filename=corePath;mod.paths=module.paths;
mod._compile(fs.readFileSync(corePath,'utf8').replace('return{createMatch,step,snapshot,runToEnd,',
  'return{passOptions,candidateToAction,chooseOwnerActionLegacy,updateBall,createMatch,step,snapshot,runToEnd,'),corePath);
const E=mod.exports,PROFILE='OPEN_PLAY_LOB_V1';
const speed=b=>Math.hypot(b.vx,b.vy),deep=x=>JSON.parse(JSON.stringify(x));
const round=x=>Number(x.toFixed(3));
function fixture(team,{x=48,y=34,run=false,wide=false,blocked=false,hero=true}={}){
  const m=E.createMatch('V63-PASS-FAMILY'),prefix=team==='HOME'?'H':'A';
  const world=(x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y},sign=team==='HOME'?1:-1;
  m.restart=null;m.setPieceLive=null;m.phase='OPEN_PLAY';m.time=100;m.nextShape=Infinity;
  for(const p of m.players)Object.assign(p,{...world(p.team===team?5:100,4),vx:0,vy:0,nextThink:Infinity,runUntil:0,tacticalTask:'REST_BALANCE'});
  const owner=m.playersById[`${prefix}-LCM`],target=m.playersById[`${prefix}-${wide?'RW':'ST'}`];
  Object.assign(owner,world(30,34));Object.assign(target,world(x,y));
  for(const p of m.players){p.tx=p.x;p.ty=p.y;}
  E.choiceActionBridge().setControlled(m,owner,true);
  m.protagonistControllerId=hero?owner.id:null;
  owner.controlledSince=97;owner.bodyAngle=team==='HOME'?0:Math.PI;
  Object.assign(target,{tacticalTask:run?(wide?'FAR_SIDE_RUN':'ST_RELEASE_RUN'):'CONNECT_CENTRE',
    vx:run?sign*4:0,vy:run&&wide?sign*2:0});
  if(run)Object.assign(target,{tx:target.x+sign*6,ty:target.y+(wide?sign*3:0),
    runTx:target.x+sign*6,runTy:target.y+(wide?sign*3:0),runUntil:110});
  if(blocked)Object.assign(m.playersById[team==='HOME'?'A-CM':'H-CM'],world(47,34));
  return{m,owner,target,world,sign};
}
function select(f,id){
  const before=deep({ball:f.m.ball,players:f.m.players,rng:f.m.r.observe(),events:f.m.events});
  const opts=E.passOptions(f.m,f.owner),option=opts.find(o=>o.p.id===f.target.id);
  assert.ok(option,'exact receiver has current geometry');
  const action=E.candidateToAction(f.m,f.owner,{id,meta:{targetId:f.target.id}},{opts});
  assert.deepEqual(deep({ball:f.m.ball,players:f.m.players,rng:f.m.r.observe(),events:f.m.events}),before,'selection is RNG-free and does not execute');
  return{action,option};
}
function launch(f,action,aerial=false){
  assert.ok(action);assert.equal(action.target.id,f.target.id);
  for(const key of ['success','winnerId','terminalResult','futureController'])assert.equal(action[key],undefined);
  // Fixed execution draws: eligible ordinary PASSes consume the protected gate;
  // .99 keeps this suite's optional lead geometry neutral. Inspecting candidates
  // must never consume these or select a receiver/result in advance.
  const protectedPassGate=action.kind==='PASS'&&action.reason!=='CANDIDATE_SAFE'&&action.reason!=='CANDIDATE_RECYCLE'&&action.option?.forward>2&&action.option?.open>3;
  const values=[...(protectedPassGate?[.99]:[]),.5,.5,...(action.kind==='LONG_PASS'||action.option?.longDiagonal?[aerial?.1:.99]:[]),.99],draws=[];
  f.m.r=()=>{assert.ok(draws.length<values.length,'unexpected execution draw');const v=values[draws.length];draws.push(v);return v;};
  E.choiceActionBridge().executePass(f.m,f.owner,action.target,action.kind,action.option,action.reason);
  assert.deepEqual(draws,values);assert.equal(f.m.ball.ownerId,null);
  assert.equal(f.m.ball.intendedReceiverId,f.target.id);
  assert.equal(f.m.ball.physicsProfile,undefined);
  return draws;
}
function measure(f,option,{contact=false}={}){
  const b=f.m.ball,initial=deep(b),v0=speed(b),origin={x:b.x,y:b.y};
  const distance=Math.hypot(b.targetX-b.x,b.targetY-b.y),ux=b.vx/v0,uy=b.vy/v0;
  const row={team:f.owner.team,family:b.kind,style:b.strikeStyle,delivery:b.deliveryMode,
    receiverDistance:round(option.d),launchDistance:round(distance),geometry:{forward:round(option.forward),
      feetBlockers:option.block,leadBlockers:option.leadBlock,throughReady:option.throughReady,
      lead:option.lead,wideChannel:option.wideChannel,switchPlay:option.switchPlay},
    launch:round(v0),mid:null,arrival:null,peakZ:b.z,arrivalType:null};
  if(!contact)for(const p of f.m.players)Object.assign(p,{...f.world(5,4),vx:0,vy:0});
  for(let n=0;n<420;n++){
    const live=f.m.ball,previousSpeed=speed(live),previousPosition={x:live.x,y:live.y,z:live.z};
    f.m.time+=.01;E.updateBall(f.m,.01);
    row.peakZ=Math.max(row.peakZ,f.m.ball.z||0);
    const progress=(f.m.ball.x-origin.x)*ux+(f.m.ball.y-origin.y)*uy;
    if(row.mid===null&&progress>=distance/2)row.mid=round(previousSpeed);
    if(f.m.ball.mode!=='FLIGHT'||progress>=distance-.7){
      row.arrival=round(previousSpeed);row.elapsed=round((n+1)*.01);
      row.arrivalType=f.m.ball.ownerId?'CONTACT':'ARRIVAL_WINDOW';
      row.contactOwner=f.m.ball.ownerId||null;row.arrivalPosition=previousPosition;break;
    }
  }
  assert.ok(row.mid!==null&&row.arrival!==null,'ball reaches the actual arrival/contact window');
  assert.ok(row.arrival>3,'pass retains usable momentum at arrival');
  assert.ok(row.arrival<row.launch*.97,'measurable braking before arrival');
  row.peakZ=round(row.peakZ);
  if(initial.deliveryMode==='GROUND')assert.equal(row.peakZ,0);
  else assert.ok(row.peakZ>1.4,'ordinary aerial delivery has real live height');
  return row;
}

test('both teams: family selected from intent/geometry before distinct live delivery motion',t=>{
  const reports=[];
  for(const team of ['HOME','AWAY']){
    const cases=[
      ['stationary_feet',{x:36,y:38},'AVAILABLE_PASS','PASS','GROUND'],
      ['firm_feet',{x:50},'PROGRESSIVE_PASS','PASS','GROUND'],
      ['committed_ground_through',{run:true},'THROUGH_PASS','THROUGH','GROUND'],
      ['npc_wide_lofted_through',{x:55,y:57,run:true,wide:true,hero:false},'THROUGH_PASS','THROUGH','AERIAL'],
      ...[32,34,35].map(d=>[`clean_ground_long_${d}`,{x:30+d},'PROGRESSIVE_PASS','LONG_PASS','GROUND']),
      ['blocked_aerial_long',{x:64,blocked:true},'AVAILABLE_PASS','LONG_PASS','AERIAL'],
      ['switch_aerial_long',{x:50,y:60},'SWITCH_PASS','LONG_PASS','AERIAL']
    ];
    const rows={};
    for(const [name,config,choice,family,delivery] of cases){
      const f=fixture(team,config),{action,option}=select(f,choice);
      assert.equal(action?.kind,family,name);launch(f,action,delivery==='AERIAL');
      assert.equal(f.m.ball.kind,family);assert.equal(f.m.ball.deliveryMode,delivery);
      if(name==='stationary_feet'){assert.equal(f.m.ball.targetX,f.target.x);assert.equal(f.m.ball.targetY,f.target.y);}
      const row=measure(f,option);rows[name]=row;reports.push({case:name,...row});
    }
    assert.ok(rows.stationary_feet.launch<rows.firm_feet.launch-3);
    assert.ok(rows.firm_feet.launch<rows.clean_ground_long_34.launch-5);
    assert.ok(rows.committed_ground_through.arrival<rows.clean_ground_long_34.arrival-2);
    assert.ok(rows.clean_ground_long_34.arrival<18.5,'driven long rolls lose meaningful pace');
    assert.ok(rows.blocked_aerial_long.peakZ>rows.npc_wide_lofted_through.peakZ+.5,'lofted through and long have distinct heights');
    assert.ok(rows.npc_wide_lofted_through.launch>rows.blocked_aerial_long.launch+1,'distinct aerial speeds');
  }
  for(let n=0;n<reports.length/2;n++)for(const field of ['launch','mid','arrival','peakZ'])
    assert.equal(reports[n][field],reports[n+reports.length/2][field],`mirrored ${field}`);
  for(const row of reports)t.diagnostic(JSON.stringify(row));
});

test('stationary labels, stale/backward leads and blocked lead lanes cannot become through passes',()=>{
  for(const team of ['HOME','AWAY']){
    const stationary=fixture(team);stationary.target.tacticalTask='ST_RELEASE_RUN';
    assert.equal(select(stationary,'THROUGH_PASS').action,null);
    assert.equal(select(stationary,'PROGRESSIVE_PASS').action.kind,'PASS');
    const backwards=fixture(team,{run:true});
    Object.assign(backwards.target,{vx:0,vy:0,runTx:backwards.target.x-backwards.sign*5,tx:backwards.target.x-backwards.sign*5});
    assert.equal(select(backwards,'THROUGH_PASS').action,null);
    const blocked=fixture(team,{run:true,blocked:true});assert.equal(select(blocked,'THROUGH_PASS').action,null);
    const leadOnly=fixture(team,{run:true});
    Object.assign(leadOnly.target,{...leadOnly.world(48,40),vx:leadOnly.sign*4,vy:leadOnly.sign*2,
      tx:leadOnly.world(54,43).x,ty:leadOnly.world(54,43).y,runTx:leadOnly.world(54,43).x,runTy:leadOnly.world(54,43).y});
    Object.assign(leadOnly.m.playersById[team==='HOME'?'A-CM':'H-CM'],leadOnly.world(50,41.5));
    const lane=select(leadOnly,'THROUGH_PASS');assert.equal(lane.option.block,0);
    assert.ok(lane.option.leadBlock>0);assert.equal(lane.action,null,'clear feet lane does not imply clear lead lane');
    const stale=fixture(team,{run:true}),opts=E.passOptions(stale.m,stale.owner);
    assert.equal(E.candidateToAction(stale.m,stale.owner,{id:'THROUGH_PASS',meta:{targetId:stale.target.id,
      runLead:true,leadX:stale.target.x+stale.sign*12,leadY:stale.target.y}},{opts}),null,'metadata cannot invent a different run');
    // Named release + real velocity remains causal even if possession setup
    // cleared the old run timer and tactical destination.
    const live=fixture(team,{run:true});Object.assign(live.target,{runUntil:0,tx:live.target.x,ty:live.target.y});
    assert.equal(select(live,'THROUGH_PASS').action.kind,'THROUGH');
    // Same wide runner: explicit user THROUGH stays ground, NPC may loft it.
    const wide=fixture(team,{x:55,y:57,run:true,wide:true}),{action}=select(wide,'THROUGH_PASS');
    assert.equal(action.option.longDiagonal,false);launch(wide,action);assert.equal(wide.m.ball.deliveryMode,'GROUND');
  }
});

test('NPC fallback retains long ground family for a clean stationary progressive receiver',()=>{
  for(const team of ['HOME','AWAY']){
    const f=fixture(team,{x:64,hero:false});
    f.m.r=()=>.99;
    const action=E.chooseOwnerActionLegacy(f.m,f.owner,{opts:E.passOptions(f.m,f.owner),held:3,space:0,pressure:10});
    assert.equal(action.type,'PASS');assert.equal(action.target.id,f.target.id);assert.equal(action.kind,'LONG_PASS');
    launch(f,action);assert.equal(f.m.ball.deliveryMode,'GROUND');
    const wide=fixture(team,{x:55,y:57,run:true,wide:true,hero:false});wide.m.r=()=>.1;
    const release=E.chooseOwnerActionLegacy(wide.m,wide.owner,{opts:E.passOptions(wide.m,wide.owner),held:3,space:0,pressure:10});
    assert.equal(release.kind,'THROUGH');assert.equal(release.target.id,wide.target.id);
    assert.equal(release.option.longDiagonal,true);launch(wide,release,true);
    assert.equal(wide.m.ball.deliveryMode,'AERIAL');
  }
});

test('feet pass travels to a real receiver; record incoming contact speed, not controlled-ball zero',t=>{
  for(const team of ['HOME','AWAY']){
    const f=fixture(team,{x:36,y:38}),{action,option}=select(f,'AVAILABLE_PASS');launch(f,action);
    // All post-launch contact draws remain deterministic; no winner is supplied.
    f.m.r=()=>.5;
    const row=measure(f,option,{contact:true});
    assert.equal(row.arrivalType,'CONTACT');assert.equal(row.contactOwner,f.target.id);
    assert.ok(row.elapsed>.3);assert.ok(row.arrival>5);t.diagnostic(JSON.stringify(row));
  }
});

test('explicit LOB_PASS is isolated, exact, RNG-free until commit, and retains R2 airborne drag/live Z',t=>{
  for(const team of ['HOME','AWAY']){
    const f=fixture(team),bridge=E.choiceStateBridge(),before=deep({ball:f.m.ball,rng:f.m.r.observe(),events:f.m.events});
    const frame=bridge.inspect(f.m,f.owner.id),row=frame.candidates.find(c=>c.id==='LOB_PASS'&&c.targetId===f.target.id);
    assert.ok(row);assert.deepEqual(deep({ball:f.m.ball,rng:f.m.r.observe(),events:f.m.events}),before);
    const action=E.candidateToAction(f.m,f.owner,row,frame._frame);assert.equal(action.physicsProfile,PROFILE);
    const plan=STRIKE.passPlan({physicsProfile:PROFILE,origin:{x:f.m.ball.x,y:f.m.ball.y,z:f.m.ball.z},target:f.target});
    assert.equal(plan.airDragK,.20);
    const draws=f.m.r.observe().drawCount;
    assert.equal(E.choiceActionBridge().executePass(f.m,f.owner,f.target,action.kind,null,null,
      {...action,targetId:'MISSING',commitEventId:'bad'}),false);
    assert.equal(f.m.r.observe().drawCount,draws);
    assert.equal(E.choiceActionBridge().executePass(f.m,f.owner,f.target,action.kind,null,null,
      {...action,commitEventId:'exact-lob'}),true);
    const b=f.m.ball;assert.equal(f.m.r.observe().drawCount-draws,3);
    assert.equal(b.lobLaunch.choiceId,'LOB_PASS');assert.equal(b.lobLaunch.targetId,f.target.id);
    assert.equal(b.passMiscontrol,undefined);assert.equal(b.airDragK,.20);
    const report={team,family:b.kind,physicsProfile:b.physicsProfile,distance:round(Math.hypot(b.targetX-b.x,b.targetY-b.y)),launch:round(speed(b)),mid:null,arrival:null,peakZ:0};
    for(const p of f.m.players)Object.assign(p,{...f.world(5,4),vx:0,vy:0});
    let previous=speed(b);
    for(let n=1;n<=Math.floor(plan.arrival/.01);n++){
      f.m.time+=.01;E.updateBall(f.m,.01);report.peakZ=Math.max(report.peakZ,b.z);
      assert.ok(Math.abs(E.snapshot(f.m).ball.z-b.z)<.001,'presentation exposes live Z');
      if(b.lobBounceCount)break;
      assert.ok(speed(b)<previous);previous=speed(b);
      if(n===Math.floor(plan.arrival/.02))report.mid=round(speed(b));
      report.arrival=round(speed(b));
    }
    assert.ok(report.peakZ>1);assert.ok(report.mid<report.launch&&report.arrival<report.mid);
    assert.ok(report.arrival/report.launch>.65&&report.arrival/report.launch<.9);
    assert.equal(b.physicsProfile,PROFILE);report.peakZ=round(report.peakZ);t.diagnostic(JSON.stringify(report));
  }
});
