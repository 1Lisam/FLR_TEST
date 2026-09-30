'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {createHash}=require('node:crypto');
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const BASE='196a08c0540da53a793985ebe61162963f39b3b2';
const root=path.resolve(__dirname,'..');
const corePath=path.join(root,'runtime/continuous_match_core.js');
const strikePath=path.join(root,'runtime/ball_strike_model.js');
function compile(filename,source,strike){
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;
  if(strike){const original=mod.require.bind(mod);mod.require=id=>id==='./ball_strike_model.js'?strike:original(id);}
  mod._compile(source.replace('return{createMatch,step,snapshot,runToEnd,',
    'return{setBallFlight,updateBall,chooseOwnerAction,shotAssessment,candidateContext,candidateRank,passOptions,ballCarrierPressureDistance,forwardSpace,finalThirdDelivery,earlyCrossDelivery,takeOnOpportunity,candidateToAction,movePlayers,ownerThink,createMatch,step,snapshot,runToEnd,'),filename);
  return mod.exports;
}
const S=require(strikePath);
const E=compile(corePath,fs.readFileSync(corePath,'utf8'),S);
// Frozen observations generated from the exact BASE above, including every
// sampled z/vz state in trajectory digests. No Git process or donor is needed
// to run QA. Changes to these observations require an explicit baseline change.
const BASELINE={
  "commit":"196a08c0540da53a793985ebe61162963f39b3b2",
  "ordinary":{
    "35/neutral":{"plan":{"style":"LOFTED_LONG","speed":20.026,"loft":5.079,"arrival":2.05,"groundDragK":null,"ordinaryAirDragK":0.16,"ordinaryArcHeight":3.1},"peak":3.0244609190588476},
    "35/switch":{"plan":{"style":"LOFTED_SWITCH","speed":16.625,"loft":8.512,"arrival":2.646,"groundDragK":null,"ordinaryAirDragK":0.18,"ordinaryArcHeight":4.54},"peak":4.4813174492756005},
    "35/recycle":{"plan":{"style":"LOFTED_RECYCLE","speed":16.625,"loft":8.512,"arrival":2.646,"groundDragK":null,"ordinaryAirDragK":0.18,"ordinaryArcHeight":4.54},"peak":4.4813174492756005},
    "35/through":{"plan":{"style":"LOFTED_THROUGH","speed":25.164,"loft":2.765,"arrival":1.522,"groundDragK":null,"ordinaryAirDragK":0.12,"ordinaryArcHeight":1.92},"peak":1.8659392511263233},
    "40/neutral":{"plan":{"style":"LOFTED_LONG","speed":21.628,"loft":5.822,"arrival":2.193,"groundDragK":null,"ordinaryAirDragK":0.16,"ordinaryArcHeight":3.2},"peak":3.1860832893834212},
    "40/switch":{"plan":{"style":"LOFTED_SWITCH","speed":18.031,"loft":9.756,"arrival":2.831,"groundDragK":null,"ordinaryAirDragK":0.18,"ordinaryArcHeight":4.66},"peak":4.670548347905002},
    "40/recycle":{"plan":{"style":"LOFTED_RECYCLE","speed":18.031,"loft":9.756,"arrival":2.831,"groundDragK":null,"ordinaryAirDragK":0.18,"ordinaryArcHeight":4.66},"peak":4.670548347905002},
    "40/through":{"plan":{"style":"LOFTED_THROUGH","speed":25.483,"loft":3.634,"arrival":1.739,"groundDragK":null,"ordinaryAirDragK":0.12,"ordinaryArcHeight":1.98},"peak":2.0316871147110858},
    "45/neutral":{"plan":{"style":"LOFTED_LONG","speed":23.09,"loft":6.615,"arrival":2.336,"groundDragK":null,"ordinaryAirDragK":0.16,"ordinaryArcHeight":3.3},"peak":3.3323455629099374},
    "45/switch":{"plan":{"style":"LOFTED_SWITCH","speed":19.332,"loft":11.084,"arrival":3.017,"groundDragK":null,"ordinaryAirDragK":0.18,"ordinaryArcHeight":4.78},"peak":4.8383411382457036},
    "45/recycle":{"plan":{"style":"LOFTED_RECYCLE","speed":19.332,"loft":11.084,"arrival":3.017,"groundDragK":null,"ordinaryAirDragK":0.18,"ordinaryArcHeight":4.78},"peak":4.8383411382457036},
    "45/through":{"plan":{"style":"LOFTED_THROUGH","speed":25.806,"loft":4.619,"arrival":1.957,"groundDragK":null,"ordinaryAirDragK":0.12,"ordinaryArcHeight":2.04},"peak":2.1464163549981334},
    "55/neutral":{"plan":{"style":"LOFTED_LONG","speed":25.688,"loft":8.352,"arrival":2.621,"groundDragK":null,"ordinaryAirDragK":0.16,"ordinaryArcHeight":3.5},"peak":3.591282513333471},
    "55/switch":{"plan":{"style":"LOFTED_SWITCH","speed":21.688,"loft":13.993,"arrival":3.387,"groundDragK":null,"ordinaryAirDragK":0.18,"ordinaryArcHeight":5.0200000000000005},"peak":5.132073534532283},
    "55/recycle":{"plan":{"style":"LOFTED_RECYCLE","speed":21.688,"loft":13.993,"arrival":3.387,"groundDragK":null,"ordinaryAirDragK":0.18,"ordinaryArcHeight":5.0200000000000005},"peak":5.132073534532283},
    "55/through":{"plan":{"style":"LOFTED_THROUGH","speed":26.458,"loft":6.937,"arrival":2.391,"groundDragK":null,"ordinaryAirDragK":0.12,"ordinaryArcHeight":2.16},"peak":2.3029976697138483},
  },
  "cross":{
    "85/25/0.01":{"plan":{"style":"CROSS","speed":19.797,"loft":2.16,"arrival":1.35,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":1.8},"digest":"62b179d24a44c9c05ba7df8d314567176774546cc473da6c0a4b551185259cfa"},
    "85/25/0.05":{"plan":{"style":"CROSS","speed":19.797,"loft":2.16,"arrival":1.35,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":1.8},"digest":"ec51456aefbb47d144e838cfb710a5f72b31fc1922f366fa75d204e2e79bf211"},
    "85/25/0.1":{"plan":{"style":"CROSS","speed":19.797,"loft":2.16,"arrival":1.35,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":1.8},"digest":"67b7d055a1a8ab4e8a2b0bef9181ed26fedf31a3c72223cdc61f6f3304d94ef8"},
    "85/40/0.01":{"plan":{"style":"CROSS","speed":25.557,"loft":3.478,"arrival":1.702,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":1.98},"digest":"938c905dc82290e2e6d37a8ebf213a293ba8c3f78fff2023a340cbfc22ba254e"},
    "85/40/0.05":{"plan":{"style":"CROSS","speed":25.557,"loft":3.478,"arrival":1.702,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":1.98},"digest":"274bb05aafdf3b26290b1daa009d1b4c9a111bcdc266aa5f4850827f93cab7cb"},
    "85/40/0.1":{"plan":{"style":"CROSS","speed":25.557,"loft":3.478,"arrival":1.702,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":1.98},"digest":"1b64631c2b4b30954a174d1bf67e9d637979b993321f93a0091357900811f987"},
    "85/55/0.01":{"plan":{"style":"CROSS","speed":26.357,"loft":6.642,"arrival":2.34,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":2.16},"digest":"f155ca7abdfe8a30fa9ade225f14a709e2317bcd5f800b558c48987317605d97"},
    "85/55/0.05":{"plan":{"style":"CROSS","speed":26.357,"loft":6.642,"arrival":2.34,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":2.16},"digest":"1a94753ec879d90f0f53627282d3af4cf7c6442aa288765ace316235702f9971"},
    "85/55/0.1":{"plan":{"style":"CROSS","speed":26.357,"loft":6.642,"arrival":2.34,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":2.16},"digest":"acaa98d51acd40ea850913d132d8f6f540fb8f1a0c40dd099ce9548cfe845f8b"},
    "96/25/0.01":{"plan":{"style":"BYLINE_CROSS","speed":19.797,"loft":2.16,"arrival":1.35,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":1.8},"digest":"62b179d24a44c9c05ba7df8d314567176774546cc473da6c0a4b551185259cfa"},
    "96/25/0.05":{"plan":{"style":"BYLINE_CROSS","speed":19.797,"loft":2.16,"arrival":1.35,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":1.8},"digest":"ec51456aefbb47d144e838cfb710a5f72b31fc1922f366fa75d204e2e79bf211"},
    "96/25/0.1":{"plan":{"style":"BYLINE_CROSS","speed":19.797,"loft":2.16,"arrival":1.35,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":1.8},"digest":"67b7d055a1a8ab4e8a2b0bef9181ed26fedf31a3c72223cdc61f6f3304d94ef8"},
    "96/40/0.01":{"plan":{"style":"BYLINE_CROSS","speed":25.557,"loft":3.478,"arrival":1.702,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":1.98},"digest":"938c905dc82290e2e6d37a8ebf213a293ba8c3f78fff2023a340cbfc22ba254e"},
    "96/40/0.05":{"plan":{"style":"BYLINE_CROSS","speed":25.557,"loft":3.478,"arrival":1.702,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":1.98},"digest":"274bb05aafdf3b26290b1daa009d1b4c9a111bcdc266aa5f4850827f93cab7cb"},
    "96/40/0.1":{"plan":{"style":"BYLINE_CROSS","speed":25.557,"loft":3.478,"arrival":1.702,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":1.98},"digest":"1b64631c2b4b30954a174d1bf67e9d637979b993321f93a0091357900811f987"},
    "96/55/0.01":{"plan":{"style":"BYLINE_CROSS","speed":26.357,"loft":6.642,"arrival":2.34,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":2.16},"digest":"f155ca7abdfe8a30fa9ade225f14a709e2317bcd5f800b558c48987317605d97"},
    "96/55/0.05":{"plan":{"style":"BYLINE_CROSS","speed":26.357,"loft":6.642,"arrival":2.34,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":2.16},"digest":"1a94753ec879d90f0f53627282d3af4cf7c6442aa288765ace316235702f9971"},
    "96/55/0.1":{"plan":{"style":"BYLINE_CROSS","speed":26.357,"loft":6.642,"arrival":2.34,"groundDragK":null,"ordinaryAirDragK":0.1,"ordinaryArcHeight":2.16},"digest":"acaa98d51acd40ea850913d132d8f6f540fb8f1a0c40dd099ce9548cfe845f8b"},
  },
  "excluded":{
    "GOAL_KICK/0.01":"3f2db896ee891d888d83a4f4e56dd04932a9948ab1d2a7bb18febcb014ebb871",
    "GOAL_KICK/0.05":"36f716e2eb279f9f6c9def506d6aed2a68ccd4e17316e107073afe93164ba959",
    "GOAL_KICK/0.1":"d42e0fe3a8333bac93ed5a3e959ca32dfbf945f31692dc321dd2d05916e2d720",
    "FREE_KICK/0.01":"76b603610ce01c80e218832fb8b0e73c39438b71843e933d6dea9001acb21e8a",
    "FREE_KICK/0.05":"86f7a97689a3d9e31a70e151e92e3ccbe0dae675afd451736dcbe199cf9bfcb0",
    "FREE_KICK/0.1":"25e29cc2ed8e05500d04f87f644d4a25047066adf12256c8f3b3bbdac40bda66",
    "THROW_IN/0.01":"54a24c4e71751d7b2a7422754c2e7826e311f56cd6fb8f4de5d46c601cd42d4a",
    "THROW_IN/0.05":"ae9321e0d0593e0365f9c02c3d11b3029d99bb9c3e10279b1cafd860e7195e26",
    "THROW_IN/0.1":"d4a5a2551c45ae5f3c9073fd0725048ff964fdc7189ddb30b2f0b326d490a91c",
    "CORNER/0.01":"8e178b38e7d86c8e9f9b1e4ee275ea3cdbcb6b579e12c4bead545631eaea38d0",
    "CORNER/0.05":"d6658e04b2e6b4cac3f1583c1aed9aa8985e2adcb98e049f1ae18456c57613c0",
    "CORNER/0.1":"7e5dd15917f61298042f1f381cfdf06c720fbb1104f0e3179ce17614a824d48f",
    "SHOT/0.01":"e163c944790a839f247d5f7b5b5ce217f10ccceca8ff69689e1113d79f27b7d5",
    "SHOT/0.05":"3a9b0d2a2c1c66e15fea0d5d9020340576fcc31ce29a38181f62bfa2410a13fb",
    "SHOT/0.1":"1a431586c08cd5c9f35e8a60fab22cbd511333eb62ab01884e9db9542d7f3314",
    "CHIP/0.01":"477590fe573b025b3c134e670ccd7c967068f56d48b9fd8a01fba812a92152c5",
    "CHIP/0.05":"2d60de01d053659592ed69f9700a9592fe41f5f9b133bf03295450b77de4dc96",
    "CHIP/0.1":"9db9fac0fd5e5dec945fa668066e40186fb3dfd15c54afa73032f7ef6d90c40c",
  },
  "plateauGain":0.029604776808381524,
  "lob":{"physicsProfile":"OPEN_PLAY_LOB_V1","style":"OPEN_PLAY_LOB","aim":{"x":50,"y":34},"arrival":1.7000000000000002,"vx":20.816732189094843,"vy":0,"vz":8.338500000000002,"airDragK":0.2,"error":{"azimuth":0.039,"horizontal":0.065,"vertical":0.057}},
};
assert.equal(BASELINE.commit,BASE);
const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,`${a} ~= ${b} (+/- ${tol})`);
const speed=b=>Math.hypot(b.vx,b.vy);
function fixture(engine=E,team='HOME',seed='GRAVITY-BOX'){
  const m=engine.createMatch(seed),prefix=team==='HOME'?'H':'A';
  const world=(x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
  Object.assign(m,{phase:'OPEN_PLAY',restart:null,time:100,nextShape:Infinity,kickoffBuildUntil:0,r:()=>.99});
  for(const p of m.players)Object.assign(p,{...world(p.team===team?5:100,4),vx:0,vy:0,nextThink:Infinity,runUntil:0,sprint:false});
  const owner=m.playersById[prefix+'-ST'],target=m.playersById[prefix+'-CM'];
  Object.assign(owner,{...world(25,34),bodyAngle:team==='HOME'?0:Math.PI});Object.assign(target,world(70,34));
  engine.choiceActionBridge().setControlled(m,owner,true);
  return{m,owner,target,world,engine};
}
const contexts={neutral:{},switch:{lateral:30,switchPlay:true},recycle:{recycle:true},through:{kind:'THROUGH'}};
function launch(extra={},d=40,engine=E,strike=S){
  const f=fixture(engine),ctx={ordinaryOpenPlay:true,kind:'LONG_PASS',deliveryMode:'AERIAL',distance:d,forward:20,...extra};
  const plan=strike.passPlan(ctx);Object.assign(f.m.ball,{x:20,y:34});
  engine.setBallFlight(f.m,{source:f.owner,target:f.target,kind:ctx.kind,...plan,deliveryMode:'AERIAL',targetPoint:{x:20+d,y:34}});
  for(const p of f.m.players)Object.assign(p,{x:5,y:4});
  return{...f,plan};
}
function tick(f,dt=.01){f.m.time+=dt;f.engine.updateBall(f.m,dt);}
function peak(f,dt=.01){let z=f.m.ball.z;for(let i=0;i<420&&f.m.ball.airborne;i++){tick(f,dt);z=Math.max(z,f.m.ball.z);}return z;}
function box(team='HOME',seed='GRAVITY-BOX',x=91,y=34){
  const f=fixture(E,team,seed);Object.assign(f.owner,{...f.world(x,y),bodyAngle:Math.atan2(34-y,105-x)+(team==='HOME'?0:Math.PI)});
  Object.assign(f.target,f.world(78,24));
  // A goal-side defender outside the actual shot lane makes this an ordinary
  // box chance, not the already-decisive strict 1v1/clear-keeper special case.
  const defender=f.m.playersById[team==='HOME'?'A-LCB':'H-LCB'];Object.assign(defender,f.world(96,39));
  Object.assign(f.m.playersById[team==='HOME'?'A-GK':'H-GK'],f.world(102,34));
  E.choiceActionBridge().setControlled(f.m,f.owner,true);f.owner.controlledSince=97;
  Object.assign(f.m.attackRhythm[team],{settleUntil:200,counterUntil:0});
  return{...f,defender};
}
function ranking(f){
  const {m,owner}=f,shot=E.shotAssessment(m,owner),opts=E.passOptions(m,owner,true),pressure=E.ballCarrierPressureDistance(m,owner),space=E.forwardSpace(m,owner,13),held=Math.max(0,m.time-(owner.controlledSince||m.time));
  const deep=E.finalThirdDelivery(m,owner),early=E.earlyCrossDelivery(m,owner),takeOn=E.takeOnOpportunity(m,owner,shot,held);
  const ctx=E.candidateContext(m,owner,shot,opts,pressure,space,held,deep,early,takeOn);
  return{shot,ctx,ranked:E.candidateRank(m,owner,ctx),frame:{shot,ctx,opts,pressure,space,held,deep,early,takeOn}};
}

function marginalBox(team,seed,alternative){
  const f=box(team,seed,alternative==='PASS'?89:91,alternative==='PASS'?38:34);
  if(alternative==='PASS'){
    Object.assign(f.defender,f.world(94,41));Object.assign(f.target,f.world(96,30));
  }else{
    Object.assign(f.defender,f.world(96,43));
    // Actual carry history reduces the value of another carry; no candidate
    // score or random draw is stubbed to manufacture a near tie.
    Object.assign(f.owner,{lastBoxCarryAt:99,boxCarryChain:3});
  }
  return f;
}

test('ordinary peak ordering remains bounded while equal post-apex slices accelerate down at gravity',t=>{
  for(const d of [35,40,45,55]){
    const peaks={},oldPeaks={};
    for(const [name,extra] of Object.entries(contexts)){
      const f=launch(extra,d);
      peaks[name]=peak(f);oldPeaks[name]=BASELINE.ordinary[`${d}/${name}`].peak;
      assert.ok(peaks[name]<=f.plan.ordinaryArcHeight+.151);
      assert.ok(Math.abs(peaks[name]-oldPeaks[name])<.25,'roughly retain the accepted low peak budget');
      for(const dt of [.01,.05,.10]){
        const live=launch(extra,d),v0=live.m.ball.vz,apex=v0/9.81;
        // Reach the actual apex, then sample three equal live time slices.
        while(live.m.ball.age+dt<apex)tick(live,dt);
        tick(live,apex-live.m.ball.age);close(live.m.ball.vz,0);
        const velocities=[];
        for(let i=0;i<3;i++){tick(live,.15);velocities.push(live.m.ball.vz);assert.ok(live.m.ball.z>0);}
        close(velocities[1]-velocities[0],-9.81*.15);close(velocities[2]-velocities[1],-9.81*.15);
        assert.ok(-velocities[2]>-velocities[0]*2.9,'no compressed post-apex plateau');
      }
    }
    for(const p of [peaks,oldPeaks])assert.ok(p.switch>p.neutral&&p.recycle>p.neutral&&p.neutral>p.through);
    t.diagnostic(JSON.stringify({d,peaks,basePeaks:oldPeaks}));
  }
});

test('long switch plateau is gone: first .3 seconds of descent gain materially more speed than base',()=>{
  const f=launch(contexts.switch,55);
  tick(f,f.m.ball.ordinaryArcLaunchVz/9.81);tick(f,.15);const first=f.m.ball.vz;tick(f,.15);
  const gain=first-f.m.ball.vz;close(gain,1.4715);assert.ok(gain>BASELINE.plateauGain*2);
});

test('CROSS and BYLINE_CROSS plans and full sampled paths exactly match the gameplay base',()=>{
  for(const sourceX of [85,96])for(const d of [25,40,55])for(const dt of [.01,.05,.10]){
    const a=launch({kind:'CROSS',sourceX},d),baseline=BASELINE.cross[`${sourceX}/${d}/${dt}`],rows=[];
    assert.deepEqual(a.plan,baseline.plan);assert.equal(a.plan.style,sourceX>=94?'BYLINE_CROSS':'CROSS');
    for(let i=0;i<Math.ceil(4/dt);i++){
      tick(a,dt);rows.push(['x','y','z','vx','vy','vz','mode','airborne'].map(k=>a.m.ball[k]));
    }
    assert.equal(digest(rows),baseline.digest,`${a.plan.style} full sampled path`);
  }
});

test('GOAL_KICK, restarts, SHOT and CHIP sampled z/vz paths exactly match base including landing',()=>{
  for(const kind of ['GOAL_KICK','FREE_KICK','THROW_IN','CORNER','SHOT','CHIP'])for(const dt of [.01,.05,.10]){
    const f=fixture(E),rows=[];
    Object.assign(f.m.ball,{x:20,y:34});
    f.engine.setBallFlight(f.m,{source:f.owner,target:null,kind:kind==='CHIP'?'SHOT':kind,style:kind==='CHIP'?'CHIP':null,
      speed:12,loft:kind==='GOAL_KICK'?7.5:3.2,deliveryMode:'AERIAL',targetPoint:{x:95,y:34}});
    for(const p of f.m.players)Object.assign(p,{x:5,y:4});
    for(let i=0;i<Math.ceil(3.5/dt);i++){tick(f,dt);rows.push(structuredClone(f.m.ball));}
    assert.equal(digest(rows),BASELINE.excluded[`${kind}/${dt}`],`${kind} full sampled path`);
  }
  const ctx={physicsProfile:'OPEN_PLAY_LOB_V1',origin:{x:20,y:34,z:0},target:{x:48,y:34,vx:2,vy:0}};
  assert.deepEqual(S.passPlan(ctx),BASELINE.lob);
});

test('horizontal air drag hierarchy stays exact; early landing rolls forward without awarding the intended receiver',()=>{
  for(const d of [35,45,55]){
    for(const slow of [contexts.switch,contexts.recycle])for(const fast of [contexts.through,{kind:'CROSS'}]){
      const a=launch(slow,d),b=launch(fast,d);assert.ok(speed(a.m.ball)<speed(b.m.ball));
      tick(a,.4);tick(b,.4);assert.ok(speed(a.m.ball)<speed(b.m.ball));
    }
    for(const [name,extra] of Object.entries(contexts)){
      const f=launch(extra,d),base=BASELINE.ordinary[`${d}/${name}`],{m}=f;
      close(f.plan.speed,base.plan.speed);close(f.plan.ordinaryAirDragK,base.plan.ordinaryAirDragK);
      while(m.ball.airborne){const before=speed(m.ball);tick(f);assert.ok(speed(m.ball)<before);}
      assert.equal(m.ball.mode,'FLIGHT');assert.equal(m.ball.ownerId,null);assert.equal(m.ball.z,0);assert.equal(m.ball.vz,0);
      assert.ok(m.ball.x<m.ball.targetX-2,'height budget permits landing before the horizontal aim');
      const x=m.ball.x,v=speed(m.ball);tick(f,.05);
      assert.ok(m.ball.x>x);assert.ok(speed(m.ball)<v&&speed(m.ball)>v*.9);assert.equal(m.ball.ownerId,null);
      // Move an actual player into the next physical contact. A remote intended
      // receiver has no ownership entitlement, even after the natural landing.
      const interceptor=m.playersById['A-CM'];Object.assign(interceptor,{x:m.ball.x+m.ball.vx*.01,y:m.ball.y});
      m.r=()=>0;tick(f,.01);assert.equal(m.ball.ownerId,interceptor.id);assert.equal(m.lastTouchPlayer,interceptor.id);
      assert.notEqual(m.ball.ownerId,f.target.id);
    }
  }
});

test('central top-ranked shot beats rhythm and commitment in both directions without executing a result',()=>{
  for(const team of ['HOME','AWAY'])for(let i=0;i<32;i++){
    const seed=`BOX-${i}`;
    const f=box(team,seed,94),{m,owner}=f,{shot,ranked}=ranking(f);
    assert.ok(shot.inBox&&shot.openWindow);assert.equal(shot.oneVOne,false);assert.equal(shot.clearKeeperChance,false);
    assert.equal(ranked[0].id,'SHOT');
    owner.candidateShotDecline={until:200,controlledSince:owner.controlledSince,dGoal:shot.dGoal,centrality:0};
    const ball=structuredClone(m.ball),action=E.chooseOwnerAction(m,owner);
    assert.equal(action.type,'SHOT');assert.equal(action.reason,'OPEN_BOX_SHOT_SUPERIOR');assert.equal(owner.candidateShotDecline,null);
    assert.deepEqual(m.ball,ball);assert.equal(m.stats.shots||0,0);assert.equal(m.attackingDecisionTrace.at(-1).futureOutcomePrecomputed,false);
  }
});

test('seeded marginal box shots sometimes beat a strictly higher executable pass or carry',t=>{
  for(const team of ['HOME','AWAY'])for(const alternative of ['PASS','CARRY']){
    let eligible=0,shots=0,continued=0;
    for(let i=0;i<128;i++){
      const seed=`MARGINAL-${i}`,f=marginalBox(team,seed,alternative),{m,owner}=f;
      const {shot,ctx,ranked,frame}=ranking(f),sc=ranked.find(c=>c.id==='SHOT'),top=ranked[0];
      assert.ok(shot.inBox&&shot.openWindow&&!shot.turningRequired);
      assert.equal(shot.oneVOne,false);assert.equal(shot.clearKeeperChance,false);
      const gap=top.score-sc.score;
      if(gap<=0||gap>.35)continue;
      // Check the real action adapter, not merely an advertised candidate ID.
      const executable=E.candidateToAction(m,owner,top,frame);
      assert.equal(executable?.type,alternative);
      if(alternative==='PASS')assert.equal(executable.target.id,f.target.id);
      assert.ok(top.score>sc.score&&top.score-sc.score<=.35);eligible++;
      const ball=structuredClone(m.ball),stats=structuredClone(m.stats),action=E.chooseOwnerAction(m,owner);
      assert.deepEqual(m.ball,ball);assert.deepEqual(m.stats,stats);
      assert.deepEqual(ranking(f).ranked,ranked,'selection must not boost final SHOT scores');
      const replay=marginalBox(team,seed,alternative);
      assert.deepEqual(E.chooseOwnerAction(replay.m,replay.owner),action,'same seed and current state replay exactly');
      if(action.type==='SHOT'){
        shots++;assert.equal(action.reason,'MARGINAL_BOX_SHOT');
        const trace=m.attackingDecisionTrace.at(-1);
        assert.equal(trace.selectionReason,'CURRENT_MARGINAL_SHOT');assert.equal(trace.futureOutcomePrecomputed,false);
        assert.equal(trace.alternatives[0].score,top.score);
        // This very seed would select an NPC shot, but may not execute an
        // unselected protagonist action through the live owner-think path.
        Object.assign(replay.m,{protagonistControllerId:replay.owner.id,protagonistExplicitActionRequired:true});
        replay.owner.nextThink=0;
        const controlledBall=structuredClone(replay.m.ball),controlledStats=structuredClone(replay.m.stats);
        E.ownerThink(replay.m,replay.owner);
        assert.deepEqual(replay.m.ball,controlledBall);assert.deepEqual(replay.m.stats,controlledStats);
      }else continued++;
      // Same held-time commitment and time bucket: no fresh lottery merely
      // because the unchanged owner thinks again a few milliseconds later.
      m.time+=.01;
      assert.equal(E.chooseOwnerAction(m,owner).type,action.type);
      assert.ok(ctx.pressure>=2.2);
    }
    assert.ok(eligible>=30,`${team}/${alternative}: insufficient strictly lower SHOT fixtures (${eligible})`);
    assert.ok(shots>0&&shots<eligible*.25,`${team}/${alternative}: ${shots}/${eligible} should be a small nonzero tail`);
    assert.ok(continued>shots,'higher alternatives still normally win');
    t.diagnostic(JSON.stringify({team,alternative,eligible,shots,continued}));
  }
});

test('marginal tail excludes poor geometry and materially superior alternatives across seeds',()=>{
  const shotCounts={};
  for(const team of ['HOME','AWAY'])for(let i=0;i<64;i++)for(const kind of ['blocked','pressure','back','wide','superior-carry']){
    const f=box(team,`POOR-${i}`,kind==='wide'?96:91,kind==='wide'?49:34);
    if(kind==='blocked')for(const [slot,y] of [['LCB',32],['RCB',34],['CM',36]]){
      Object.assign(f.m.playersById[(team==='HOME'?'A-':'H-')+slot],f.world(97,y));
    }
    if(kind==='pressure')Object.assign(f.defender,f.world(91.5,34));
    if(kind==='back')f.owner.bodyAngle=team==='HOME'?Math.PI:0;
    if(kind==='superior-carry'){
      Object.assign(f.defender,f.world(96,43));
      const {ranked}=ranking(f);assert.equal(ranked[0].id,'CARRY');
      assert.ok(ranked[0].score>ranked.find(c=>c.id==='SHOT').score+.35);
    }
    const selected=E.chooseOwnerAction(f.m,f.owner);
    assert.notEqual(selected.reason,'MARGINAL_BOX_SHOT',`${team}/${kind}/${i}`);
    const key=`${team}/${kind}`;shotCounts[key]=(shotCounts[key]||0)+(selected.type==='SHOT'?1:0);
    if(kind==='superior-carry')assert.equal(selected.type,'CARRY');
  }
  // Existing wide-angle commitment already allows rare attempts. Preserve
  // that behavior while rejecting routine poor shots or any new tail there.
  for(const [key,count] of Object.entries(shotCounts))assert.ok(count<=6,`${key}: ${count}/64 shots`);
});

test('strict one-v-one remains decisive and arbitrary elapsed possession does not gate a central shot',()=>{
  for(const held of [.05,.5,1,3,30,300]){
    const f=box();f.owner.controlledSince=f.m.time-held;f.m.attackRhythm.HOME.possessionStartedAt=f.m.time-held;
    assert.equal(E.chooseOwnerAction(f.m,f.owner).reason,'OPEN_BOX_SHOT_SUPERIOR');
  }
  const f=box('HOME','ONE-V-ONE',96,34);Object.assign(f.defender,{x:80,y:60});
  assert.equal(ranking(f).shot.oneVOne,true);assert.equal(E.chooseOwnerAction(f.m,f.owner).reason,'DECISIVE_ONE_V_ONE');
});

test('purposeful angle carry gives way to a fresh superior shot before the old decline expires',()=>{
  const f=box('HOME','SHOT-0',91,44);Object.assign(f.defender,{x:96,y:46});f.m.time=100.995;
  const first=E.chooseOwnerAction(f.m,f.owner);assert.equal(first.type,'CARRY');assert.equal(first.reason,'OPEN_SHOT_CREATE_ANGLE');
  const decline=f.owner.candidateShotDecline;assert.ok(decline.until>f.m.time);
  // Execute one actual carry. Other players hold their current positions so
  // the decision changes only with the live owner movement/body orientation.
  for(const p of f.m.players){p.tx=p.x;p.ty=p.y;}
  E.choiceActionBridge().executeCarry(f.m,f.owner);
  for(let i=0;i<20;i++){f.m.time+=.05;E.movePlayers(f.m,.05);E.updateBall(f.m,.05);}
  assert.ok(f.owner.y<43&&f.m.time<decline.until);
  assert.equal(f.owner.controlledSince,97);assert.equal(f.m.stats.carries,1);
  assert.equal(ranking(f).ranked[0].id,'SHOT');
  assert.equal(E.chooseOwnerAction(f.m,f.owner).type,'SHOT');assert.equal(f.owner.candidateShotDecline,null);
});

test('blocked, pressured, back-to-goal and poor-angle geometry retain purposeful alternatives',()=>{
  for(const kind of ['blocked','pressure','back','wide']){
    const f=box('HOME','ALTERNATIVE',kind==='wide'?96:91,kind==='wide'?49:34);
    if(kind==='blocked'){
      for(const [id,y] of [['A-LCB',32],['A-RCB',34],['A-CM',36]])Object.assign(f.m.playersById[id],{x:97,y});
    }
    if(kind==='pressure')Object.assign(f.defender,{x:91.5,y:34});
    if(kind==='back')f.owner.bodyAngle=Math.PI;
    Object.assign(f.target,{x:88,y:42});
    const action=E.chooseOwnerAction(f.m,f.owner);
    assert.ok(['PASS','CARRY','TAKE_ON','TURN_BACK','HOLD'].includes(action.type),`${kind}: ${JSON.stringify(action)}`);
    assert.notEqual(action.reason,'OPEN_BOX_SHOT_SUPERIOR');
  }
});

test('decline clears on new control and on a new owner even at the same timestamp',()=>{
  const f=box(),{m,owner,target}=f;
  owner.candidateShotDecline={until:200,controlledSince:97,dGoal:14,centrality:0};
  E.choiceActionBridge().setControlled(m,owner,true);assert.equal(owner.candidateShotDecline,null);
  Object.assign(target,{x:95,y:34,bodyAngle:0});target.candidateShotDecline={until:200,controlledSince:m.time,dGoal:14,centrality:0};
  E.choiceActionBridge().setControlled(m,target,true);assert.equal(target.candidateShotDecline,null);
  assert.equal(E.chooseOwnerAction(m,target).type,'SHOT');
});

test('explicit protagonist authority still prevents an unselected central shot',()=>{
  const f=box();Object.assign(f.m,{protagonistControllerId:f.owner.id,protagonistExplicitActionRequired:true});f.owner.nextThink=0;
  const ball=structuredClone(f.m.ball);E.ownerThink(f.m,f.owner);assert.deepEqual(f.m.ball,ball);assert.equal(f.m.stats.shots||0,0);
});


test('ordinary flight integrates altered live z/vz instead of replaying an age-based arc',()=>{
  const f=launch(contexts.switch);tick(f,.3);
  f.m.ball.z+=.4;f.m.ball.vz-=1.2;
  const {z,vz}=f.m.ball;tick(f,.1);
  close(f.m.ball.z,z+vz*.1-4.905*.1*.1);close(f.m.ball.vz,vz-.981);
});

test('a genuinely superior carry remains available in an open central box state',()=>{
  const f=box();Object.assign(f.defender,{x:96,y:43});
  const {shot,ranked}=ranking(f);assert.ok(shot.inBox&&shot.openWindow);
  assert.equal(ranked[0].id,'CARRY');assert.ok(ranked[0].score>ranked.find(c=>c.id==='SHOT').score+.35);
  const selected=E.chooseOwnerAction(f.m,f.owner);assert.equal(selected.type,'CARRY');assert.equal(selected.reason,'CLEAR_RUNWAY');
});
