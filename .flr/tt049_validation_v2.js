'use strict';
const path=require('path');
const ROOT=path.resolve(process.argv[2]||'.');
const req=p=>require(path.join(ROOT,p));
const core=req('runtime/continuous_match_core.js');
const controller=req('runtime/protagonist_match_controller.js');
const B=core.choiceActionBridge(),C=core.choiceStateBridge();
const round=(v,n=4)=>Number(v.toFixed(n));
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg);return ok;};

function prep(seed){const m=core.createMatch(seed);m.restart=null;m.phase='OPEN_PLAY';m.time=100;m.transitionUntil=0;m.lastChallengeAt=100;return m;}
function place(p,x,y,vx=0,vy=0,tx=x,ty=y,task='HOLD_SHAPE'){p.x=x;p.y=y;p.vx=vx;p.vy=vy;p.tx=tx;p.ty=ty;p.action=task;p.tacticalTask=task;p.sprint=Math.hypot(vx,vy)>1.15;}
function clearDefenders(m){let i=0;const ys=[5,12,20,28,40,48,56,63];for(const p of m.players.filter(p=>p.team==='AWAY'&&p.role!=='GK')){place(p,66-(i%3)*2,ys[i%ys.length]);i++;}const g=B.playerById(m,'A-GK');place(g,101.4,34,0,0,101.4,34,'GK_SET');}

function issue4(){
  const m=prep('TT049-I4');clearDefenders(m);const st=B.playerById(m,'H-ST'),lw=B.playerById(m,'H-LW'),rw=B.playerById(m,'H-RW');
  place(st,76.4,34.4,0,0,76.4,34.4,'HOLD_BALL');place(lw,76.8,18,1.9,.2,78.7,18.2,'FAR_SIDE_RUN');place(rw,76.8,50,2,0,78.75,50,'FAR_SIDE_RUN');
  B.setControlled(m,st);st.bodyAngle=0;st.controlledSince=m.time-.7;m.nextShape=1e9;
  const f=C.inspect(m,'H-ST'),through=f.candidates.filter(x=>x.id==='THROUGH_PASS').map(x=>x.targetId),safe=f.candidates.filter(x=>x.id==='SAFE_PASS').map(x=>x.targetId);
  check(through.includes('H-LW'),'Issue4 H-LW THROUGH_PASS missing');check(through.includes('H-RW'),'Issue4 H-RW THROUGH_PASS missing');check(safe.includes('H-LW')||safe.includes('H-RW'),'Issue4 SAFE_PASS floor missing');
  const r=C.applyCandidate(m,'H-ST','THROUGH_PASS','H-RW','TT049_VALIDATION');check(r.ok,'Issue4 THROUGH_PASS apply failed');check(r.targetId==='H-RW','Issue4 resolved target changed');check(m.ball.intendedReceiverId==='H-RW','Issue4 intended receiver changed');
  let g=0;while(m.lastUserDirectedPassTrace?.outcome==='IN_FLIGHT'&&g++<450)core.step(m,.02);const trace=m.lastUserDirectedPassTrace||null;
  check(!!trace,'Issue2/4 directed pass trace missing');if(trace?.outcome==='SELECTED_TARGET_CONTROL')check(trace.firstControllerId==='H-RW','Issue2 trace first controller mismatch');
  const m2=prep('TT049-I4-STILL');clearDefenders(m2);const s2=B.playerById(m2,'H-ST'),l2=B.playerById(m2,'H-LW'),r2=B.playerById(m2,'H-RW');place(s2,76.4,34.4);place(l2,76.8,18);place(r2,76.8,50);B.setControlled(m2,s2);s2.bodyAngle=0;s2.controlledSince=m2.time-.7;m2.nextShape=1e9;const f2=C.inspect(m2,'H-ST');const falseLead=f2.candidates.filter(x=>x.id==='THROUGH_PASS'&&['H-LW','H-RW'].includes(x.targetId)).length;check(falseLead===0,'stationary winger received synthetic THROUGH_PASS');
  return{through,safe,trace,falseLead};
}

function calibration(trials=600){
  let goal=0,save=0,miss=0,clean=0;
  for(let i=0;i<trials;i++){
    const m=prep(`TT049-CAL2-${i}`);clearDefenders(m);const st=B.playerById(m,'H-ST');place(st,88.5,34,0,0,88.5,34,'HOLD_BALL');B.setControlled(m,st);st.bodyAngle=0;st.controlledSince=m.time-.8;st.nextThink=1e9;
    // IMPORTANT: allow the normal 0.25s tactical tick during shot flight so the goalkeeper
    // can react/move toward shotTargetY. Freezing nextShape made the previous probe measure a static mannequin GK.
    m.nextShape=m.time;
    B.executeShot(m,st,'TT049_CALIBRATION',{releaseNow:true,decisionOrientation:{turningRequired:false,backToGoal:false,facingAlignment:1}});
    let guard=0;while(guard++<650&&!(m.stats.cleanKeeperChanceGoals||m.stats.cleanKeeperChanceSaves||m.stats.cleanKeeperChanceMisses))core.step(m,.02);
    clean+=m.stats.cleanKeeperChanceShots||0;goal+=m.stats.cleanKeeperChanceGoals||0;save+=m.stats.cleanKeeperChanceSaves||0;miss+=m.stats.cleanKeeperChanceMisses||0;
  }
  const total=goal+save+miss,dist={goal:goal/total,save:save/total,miss:miss/total};
  check(clean===trials,`calibration classification ${clean}/${trials}`);check(total===trials,`calibration resolution ${total}/${trials}`);
  const targetHit=dist.goal>=.35&&dist.goal<=.45&&dist.save>=.30&&dist.save<=.35&&dist.miss>=.25&&dist.miss<=.30;
  check(dist.goal>=.32&&dist.goal<=.48,`goal distribution guard ${dist.goal}`);check(dist.save>=.26&&dist.save<=.40,`save distribution guard ${dist.save}`);check(dist.miss>=.20&&dist.miss<=.34,`miss distribution guard ${dist.miss}`);
  return{trials,goal,save,miss,distribution:{goal:round(dist.goal),save:round(dist.save),miss:round(dist.miss)},targetHit};
}

function npc(trials=160){
  let shot=0,pass=0,carry=0,takeOn=0,other=0,distant=0;
  for(let i=0;i<trials;i++){
    const m=prep(`TT049-NPC2-${i}`);clearDefenders(m);const rw=B.playerById(m,'H-RW'),st=B.playerById(m,'H-ST'),cm=B.playerById(m,'H-RCM');
    place(rw,84,45.2,2.2,-.15,87,44.8,'FIRST_TOUCH_FLOW');place(st,89,34.2,1.2,0,91.5,34.2,'ATTACK_CENTRAL_CHANNEL');place(cm,76,39.5,.4,0,78,39.5,'SECOND_WAVE_8');B.setControlled(m,rw);rw.bodyAngle=0;rw.lastReceivedFlightKind='THROUGH';rw.lastReceivedPassAt=m.time-.45;rw.lastReceivedAt=m.time-.45;rw.controlledSince=m.time-.45;rw.nextThink=m.time;rw.lockTargetUntil=0;rw.receiveFlowUntil=0;m.nextShape=1e9;
    const start=m.events.length,startX=rw.x;let g=0;while(g++<80&&rw.lastDecision==='NONE')core.step(m,.05);const d=rw.lastDecision;if(d==='SHOT')shot++;else if(d==='PASS')pass++;else if(d==='CARRY')carry++;else if(d==='TAKE_ON')takeOn++;else other++;
    const pe=m.events.slice(start).find(e=>e.type==='PASS'&&e.actorId==='H-RW');if(pe){const t=B.playerById(m,pe.targetId);if(t&&t.x<startX-15)distant++;}
  }
  const decisive=(shot+pass)/trials,dist=distant/trials;check(decisive>=.50,`NPC decisive rate ${decisive}`);check(dist<=.12,`NPC distant recycle ${dist}`);return{trials,shot,pass,carry,takeOn,other,distantRecycle:distant,decisiveRate:round(decisive),distantRecycleRate:round(dist)};
}

function full(matches=24){
  let strict=0,clean=0,shots=0,goals=0;const per=[];
  for(let i=0;i<matches;i++){const r=core.runToEnd(`TT049-FULL2-${i}`,{dt:.10}),s=r.match.stats,row={strict:s.strictOneVOneShots||0,clean:s.cleanKeeperChanceShots||0,shots:s.shots||0,goals:s.goals||0};per.push(row);strict+=row.strict;clean+=row.clean;shots+=row.shots;goals+=row.goals;}
  const strictAvg=strict/matches,cleanAvg=clean/matches;check(cleanAvg<3.0,`clean chance structural rate ${cleanAvg}/match`);return{matches,strict,clean,shots,goals,strictPerMatch:round(strictAvg),cleanPerMatch:round(cleanAvg),targetFrequencyHit:cleanAvg>=1.2&&cleanAvg<=1.8,per};
}

function authority(required=2){
  const material=new Set(['PASS','SHOT','TAKE_ON','DRIBBLE_BEAT','TAKE_ON_TACKLED','TAKE_ON_LOOSE']);let tested=0;const v=[];
  for(let si=0;si<8&&tested<required;si++){
    const s=controller.create(`TT049-AUTH2-${si}`,{heroPlayerId:'H-ST',mode:'PLAYER_ALL'});let guard=0;
    while(!s.m.completed&&guard++<26000&&tested<required){controller.step(s,.10);if(!s.pending)continue;const carry=s.pending.kind==='ON_BALL'&&s.pending.options.find(o=>o.id==='CARRY');if(!carry){const p=controller.autoPick(s)||s.pending.options[0];if(p)controller.applyChoice(s,p.id,p.targetId||null,{source:'AUTO_SIMULATION'});continue;}const before=s.m.events.length,at=s.m.time,r=controller.applyChoice(s,'CARRY',null,{source:'TT049_AUTHORITY'});if(!r.ok){v.push({seed:s.seed,reason:'carry apply failed'});break;}tested++;let inner=0;while(!s.m.completed&&!s.pending&&inner++<120)controller.step(s,.10);const rows=s.m.events.slice(before).filter(e=>e.t>at+.001&&e.actorId==='H-ST'&&material.has(e.type));if(rows.length)v.push({seed:s.seed,at,events:rows});const heroOwn=s.m.ball.mode==='CONTROLLED'&&s.m.ball.ownerId==='H-ST';if(heroOwn&&!s.pending&&inner>=120)v.push({seed:s.seed,at,reason:'retained ball without next checkpoint'});}
  }
  check(tested>=required,`authority samples ${tested}/${required}`);check(v.length===0,`authority violations ${JSON.stringify(v)}`);return{tested,violations:v,futureOutcomePrecomputed:false};
}

const result={schemaVersion:'FLR_TT049_CANDIDATE_VALIDATION_0.2',build:'TT-0.49 TEST_ONLY',step79Started:false,canonical:{hybridPrecomputesChoice:false,hybridPrecomputesOutcome:false,v06OwnsLiveChoiceDiscovery:true,v06OwnsPostChoiceResolution:true,protagonistUnchosenMaterialActionForbidden:true,choiceIdAndExactTargetIdImmutable:true}};
result.issue4=issue4();result.shootingCalibration=calibration();result.npcDecision=npc();result.fullMatch=full();result.authority=authority();result.failures=failures;result.status=failures.length?'FAIL':((result.shootingCalibration.targetHit&&result.fullMatch.targetFrequencyHit)?'PASS_FOR_USER_VISUAL_RETEST':'PASS_WITH_CALIBRATION_WATCH');
console.log(JSON.stringify(result,null,2));if(failures.length)process.exitCode=1;
