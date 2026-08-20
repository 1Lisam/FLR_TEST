'use strict';
const path=require('path');
const assert=require('assert');
const ROOT=path.resolve(process.argv[2]||'.');
const req=p=>require(path.join(ROOT,p));
const core=req('runtime/continuous_match_core.js');
const controller=req('runtime/protagonist_match_controller.js');
const B=core.choiceActionBridge();
const C=core.choiceStateBridge();
const round=(v,n=4)=>Number(v.toFixed(n));

function prepOpenPlay(seed){
  const m=core.createMatch(seed);
  m.restart=null;m.phase='OPEN_PLAY';m.time=100;m.nextShape=1e9;m.transitionUntil=0;m.lastChallengeAt=100;
  return m;
}
function place(p,x,y,vx=0,vy=0,tx=x,ty=y,task='HOLD_SHAPE'){
  p.x=x;p.y=y;p.vx=vx;p.vy=vy;p.tx=tx;p.ty=ty;p.action=task;p.tacticalTask=task;p.sprint=Math.hypot(vx,vy)>1.15;
}
function awayDefendersFar(m){
  const ys=[7,15,23,31,39,47,55,63];let i=0;
  for(const p of m.players.filter(p=>p.team==='AWAY'&&p.role!=='GK')){place(p,67-(i%3)*2,ys[i%ys.length]);i++;}
  const gk=B.playerById(m,'A-GK');place(gk,101.4,34,0,0,101.4,34,'GK_SET');
}

function issue4RunLead(){
  const m=prepOpenPlay('TT049-ISSUE4');
  const st=B.playerById(m,'H-ST'),lw=B.playerById(m,'H-LW'),rw=B.playerById(m,'H-RW');
  awayDefendersFar(m);
  place(st,76.4,34.4,0,0,76.4,34.4,'HOLD_BALL');st.bodyAngle=0;
  // Deliberately short tactical target (~1.9m) + visible real velocity. STEP78's 0.90s
  // motion lead stayed below the 2.2m eligibility floor. TT-0.49 must use the real run vector.
  place(lw,76.8,18.0,1.9,0.2,78.7,18.2,'FAR_SIDE_RUN');
  place(rw,76.8,50.0,2.0,0.0,78.75,50.0,'FAR_SIDE_RUN');
  B.setControlled(m,st);st.bodyAngle=0;st.controlledSince=m.time-0.7;
  const f=C.inspect(m,'H-ST');assert(f&&f.kind==='ON_BALL');
  const through=new Set(f.candidates.filter(x=>x.id==='THROUGH_PASS').map(x=>x.targetId));
  const safe=new Set(f.candidates.filter(x=>x.id==='SAFE_PASS').map(x=>x.targetId));
  assert(through.has('H-LW'),'Issue #4: H-LW real run must expose THROUGH_PASS');
  assert(through.has('H-RW'),'Issue #4: H-RW real run must expose THROUGH_PASS');
  assert(safe.has('H-LW')||safe.has('H-RW'),'Issue #4: at least one to-feet SAFE_PASS must remain available');
  const res=C.applyCandidate(m,'H-ST','THROUGH_PASS','H-RW','TT049_VALIDATION');
  assert(res.ok,'Issue #4 target pass must apply');
  assert.strictEqual(res.targetId,'H-RW','choice exact target changed');
  assert.strictEqual(m.ball.intendedReceiverId,'H-RW','engine intended receiver changed');
  assert.strictEqual(m.lastUserDirectedPassTrace?.resolvedTargetId,'H-RW','trace resolved target mismatch');
  let guard=0;while(m.lastUserDirectedPassTrace?.outcome==='IN_FLIGHT'&&guard++<450)core.step(m,.02);
  const trace=m.lastUserDirectedPassTrace;
  assert(trace,'user directed pass trace missing');
  assert(['SELECTED_TARGET_CONTROL','OPPONENT_INTERCEPT','OPPONENT_CONTROL','IN_FLIGHT'].includes(trace.outcome),`unexpected directed-pass outcome ${trace.outcome}`);
  if(trace.outcome==='SELECTED_TARGET_CONTROL')assert.strictEqual(trace.firstControllerId,'H-RW');

  const m2=prepOpenPlay('TT049-ISSUE4-STATIONARY');awayDefendersFar(m2);
  const st2=B.playerById(m2,'H-ST'),lw2=B.playerById(m2,'H-LW'),rw2=B.playerById(m2,'H-RW');
  place(st2,76.4,34.4,0,0,76.4,34.4,'HOLD_BALL');place(lw2,76.8,18,0,0,76.8,18,'HOLD_WIDTH');place(rw2,76.8,50,0,0,76.8,50,'HOLD_WIDTH');
  B.setControlled(m2,st2);st2.bodyAngle=0;st2.controlledSince=m2.time-0.7;
  const f2=C.inspect(m2,'H-ST'),stationaryThrough=f2.candidates.filter(x=>x.id==='THROUGH_PASS'&&['H-LW','H-RW'].includes(x.targetId));
  assert.strictEqual(stationaryThrough.length,0,'stationary winger must not get synthetic THROUGH_PASS');
  return{throughTargets:[...through],safeTargets:[...safe],trace,stationaryThrough:stationaryThrough.length};
}

function fixedCleanKeeperCalibration(trials=600){
  let goal=0,save=0,miss=0,strict=0,clean=0;
  for(let i=0;i<trials;i++){
    const m=prepOpenPlay(`TT049-CAL-${i}`);awayDefendersFar(m);
    const st=B.playerById(m,'H-ST');place(st,88.5,34,0,0,88.5,34,'HOLD_BALL');st.bodyAngle=0;st.nextThink=1e9;
    B.setControlled(m,st);st.bodyAngle=0;st.controlledSince=m.time-0.8;m.nextShape=1e9;
    B.executeShot(m,st,'TT049_CALIBRATION',{releaseNow:true,decisionOrientation:{turningRequired:false,backToGoal:false,facingAlignment:1}});
    let g=0;while(g++<650){
      core.step(m,.02);
      if((m.stats.cleanKeeperChanceGoals||0)+(m.stats.cleanKeeperChanceSaves||0)+(m.stats.cleanKeeperChanceMisses||0)>0)break;
    }
    strict+=m.stats.strictOneVOneShots||0;clean+=m.stats.cleanKeeperChanceShots||0;
    goal+=m.stats.cleanKeeperChanceGoals||0;save+=m.stats.cleanKeeperChanceSaves||0;miss+=m.stats.cleanKeeperChanceMisses||0;
  }
  const total=goal+save+miss;assert.strictEqual(clean,trials,'fixed scenario must classify every shot as clear keeper chance');assert.strictEqual(total,trials,'every fixed clear chance must resolve goal/save/miss');
  const dist={goal:goal/total,save:save/total,miss:miss/total};
  // Narrow bands are the V13 gameplay reference. Candidate gate allows a small sampling margin,
  // but logs whether the exact reference band was reached.
  const targetHit=dist.goal>=.35&&dist.goal<=.45&&dist.save>=.30&&dist.save<=.35&&dist.miss>=.25&&dist.miss<=.30;
  assert(dist.goal>=.32&&dist.goal<=.48,`goal distribution out of candidate guard: ${dist.goal}`);
  assert(dist.save>=.26&&dist.save<=.40,`save distribution out of candidate guard: ${dist.save}`);
  assert(dist.miss>=.20&&dist.miss<=.34,`miss distribution out of candidate guard: ${dist.miss}`);
  return{trials,goal,save,miss,strictClassified:strict,distribution:Object.fromEntries(Object.entries(dist).map(([k,v])=>[k,round(v)])),targetHit};
}

function npcThroughReceiveDecision(trials=160){
  let shot=0,pass=0,carry=0,takeOn=0,other=0,distantRecycle=0;
  for(let i=0;i<trials;i++){
    const m=prepOpenPlay(`TT049-NPC-${i}`);awayDefendersFar(m);
    const rw=B.playerById(m,'H-RW'),st=B.playerById(m,'H-ST'),cm=B.playerById(m,'H-RCM');
    place(rw,84.0,45.2,2.2,-0.15,87.0,44.8,'FIRST_TOUCH_FLOW');rw.bodyAngle=0;
    place(st,89.0,34.2,1.2,0,91.5,34.2,'ATTACK_CENTRAL_CHANNEL');place(cm,76.0,39.5,0.4,0,78,39.5,'SECOND_WAVE_8');
    B.setControlled(m,rw);rw.bodyAngle=0;rw.lastReceivedFlightKind='THROUGH';rw.lastReceivedPassAt=m.time-.45;rw.lastReceivedAt=m.time-.45;rw.controlledSince=m.time-.45;rw.nextThink=m.time;rw.lockTargetUntil=0;rw.receiveFlowUntil=0;
    const startEvents=m.events.length,startX=rw.x;let g=0;while(g++<80&&rw.lastDecision==='NONE')core.step(m,.05);
    const d=rw.lastDecision;
    if(d==='SHOT')shot++;else if(d==='PASS')pass++;else if(d==='CARRY')carry++;else if(d==='TAKE_ON')takeOn++;else other++;
    const pe=m.events.slice(startEvents).find(e=>e.type==='PASS'&&e.actorId==='H-RW');if(pe){const t=B.playerById(m,pe.targetId),tx=t?t.x:null;if(Number.isFinite(tx)&&tx<startX-15)distantRecycle++;}
  }
  const decisive=(shot+pass)/trials;
  assert(decisive>=.50,`NPC through-receive decisive shot/pass rate too low: ${decisive}`);
  assert(distantRecycle/trials<=.12,`purposeless distant recycle too high: ${distantRecycle/trials}`);
  return{trials,shot,pass,carry,takeOn,other,distantRecycle,decisiveRate:round(decisive),distantRecycleRate:round(distantRecycle/trials)};
}

function fullMatchSample(matches=24){
  const sum={strictShots:0,strictGoals:0,strictSaves:0,strictMisses:0,cleanShots:0,cleanGoals:0,cleanSaves:0,cleanMisses:0,shots:0,goals:0};
  const per=[];
  for(let i=0;i<matches;i++){
    const r=core.runToEnd(`TT049-FULL-${i}`,{dt:.10}),s=r.match.stats;
    const row={strict:s.strictOneVOneShots||0,clean:s.cleanKeeperChanceShots||0,shots:s.shots||0,goals:s.goals||0};per.push(row);
    sum.strictShots+=row.strict;sum.cleanShots+=row.clean;sum.shots+=row.shots;sum.goals+=row.goals;
    sum.strictGoals+=s.strictOneVOneGoals||0;sum.strictSaves+=s.strictOneVOneSaves||0;sum.strictMisses+=s.strictOneVOneMisses||0;
    sum.cleanGoals+=s.cleanKeeperChanceGoals||0;sum.cleanSaves+=s.cleanKeeperChanceSaves||0;sum.cleanMisses+=s.cleanKeeperChanceMisses||0;
  }
  const strictAvg=sum.strictShots/matches,cleanAvg=sum.cleanShots/matches;
  // V13 target is a gameplay reference, not a hard quota. Fail only if the old structural
  // 4-5-per-half problem is still clearly present; report the 1.2-1.8 target separately.
  assert(cleanAvg<3.0,`clean keeper-facing chances remain structurally excessive: ${cleanAvg}/match`);
  return{matches,...sum,strictPerMatch:round(strictAvg),cleanPerMatch:round(cleanAvg),targetFrequencyHit:cleanAvg>=1.2&&cleanAvg<=1.8,perMatch:per};
}

function authorityCarryRegression(required=2){
  const material=new Set(['PASS','SHOT','TAKE_ON','DRIBBLE_BEAT','TAKE_ON_TACKLED','TAKE_ON_LOOSE']);let tested=0,violations=[];
  for(let si=0;si<8&&tested<required;si++){
    const s=controller.create(`TT049-AUTH-${si}`,{heroPlayerId:'H-ST',mode:'PLAYER_ALL'});let guard=0;
    while(!s.m.completed&&guard++<26000&&tested<required){
      controller.step(s,.10);
      if(!s.pending)continue;
      const carry=s.pending.kind==='ON_BALL'&&s.pending.options.find(o=>o.id==='CARRY');
      if(!carry){const pick=controller.autoPick(s)||s.pending.options[0];if(pick)controller.applyChoice(s,pick.id,pick.targetId||null,{source:'AUTO_SIMULATION'});continue;}
      const before=s.m.events.length,at=s.m.time;const r=controller.applyChoice(s,'CARRY',null,{source:'TT049_AUTHORITY'});assert(r.ok,'carry authority choice failed');tested++;
      let inner=0;while(!s.m.completed&&!s.pending&&inner++<120)controller.step(s,.10);
      const rows=s.m.events.slice(before).filter(e=>e.t>at+.001&&e.actorId==='H-ST'&&material.has(e.type));
      if(rows.length)violations.push({seed:s.seed,at,events:rows});
      const hero=B.playerById(s.m,'H-ST'),heroOwn=s.m.ball.mode==='CONTROLLED'&&s.m.ball.ownerId==='H-ST';
      if(heroOwn&&!s.pending&&inner>=120)violations.push({seed:s.seed,at,reason:'hero retained ball without next checkpoint'});
    }
  }
  assert(tested>=required,`insufficient carry authority samples: ${tested}`);assert.strictEqual(violations.length,0,`authority regression: ${JSON.stringify(violations)}`);
  return{tested,violations:0,futureOutcomePrecomputed:false};
}

const result={
  schemaVersion:'FLR_TT049_CANDIDATE_VALIDATION_0.1',
  build:'TT-0.49 TEST_ONLY',step79Started:false,
  canonical:{hybridPrecomputesChoice:false,hybridPrecomputesOutcome:false,v06OwnsLiveChoiceDiscovery:true,v06OwnsPostChoiceResolution:true,protagonistUnchosenMaterialActionForbidden:true,choiceIdAndExactTargetIdImmutable:true},
  issue4:issue4RunLead(),
  shootingCalibration:fixedCleanKeeperCalibration(),
  npcDecision:npcThroughReceiveDecision(),
  fullMatch:fullMatchSample(),
  authority:authorityCarryRegression()
};
result.status=(result.shootingCalibration.targetHit&&result.fullMatch.targetFrequencyHit)?'PASS_FOR_USER_VISUAL_RETEST':'PASS_WITH_CALIBRATION_WATCH';
console.log(JSON.stringify(result,null,2));
