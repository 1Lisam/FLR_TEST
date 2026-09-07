from pathlib import Path
import re, sys, hashlib, json
ROOT=Path(__file__).resolve().parents[1]
changed=[]

def replace_once(path, old, new, label):
    p=ROOT/path
    s=p.read_text(encoding='utf-8')
    n=s.count(old)
    if n!=1:
        raise RuntimeError(f'{label}: expected 1 occurrence in {path}, got {n}')
    p.write_text(s.replace(old,new,1),encoding='utf-8')
    changed.append(str(path))

def insert_before_once(path, marker, text, label):
    p=ROOT/path; s=p.read_text(encoding='utf-8'); n=s.count(marker)
    if n!=1: raise RuntimeError(f'{label}: expected 1 marker in {path}, got {n}')
    p.write_text(s.replace(marker,text+marker,1),encoding='utf-8'); changed.append(str(path))

# 1) Defensive layer depth + marking separation + GK stance/depth.
tac=Path('runtime/tactical_movement.js')
replace_once(tac,
"        if(ui.mode==='STEP_OUT')lx=clamp(lx+.55,4.8,9.4);\n        else if(ui.mode==='HOLD_DEPTH')lx=clamp(lx-.15,4.8,9.4);\n        task=ui.mode==='STEP_OUT'?'GK_SET_STEP_OUT_INTENT':'GK_SET_HOLD_DEPTH_INTENT';\n      }\n      applyTarget(p,lx,ly,task,sprint,m);continue;",
"        // HF2: make the two user intents visibly different without changing save odds.\n        // Roughly 1.45m is a real one-to-two-step angle close; HOLD stays near the base depth.\n        if(ui.mode==='STEP_OUT')lx=clamp(lx+1.45,4.8,10.2);\n        else if(ui.mode==='HOLD_DEPTH')lx=clamp(lx-.05,4.8,9.4);\n        task=ui.mode==='STEP_OUT'?'GK_SET_STEP_OUT_INTENT':'GK_SET_HOLD_DEPTH_INTENT';\n      }\n      applyTarget(p,lx,ly,task,sprint,m);\n      // A goalkeeper confronting an opponent must face the live ball before the shot as well\n      // as during updateGoalkeeperShotReaction(). This is posture only; it never changes odds.\n      p.faceTargetAngle=Math.atan2((m.ball.y||34)-p.y,(m.ball.x||52.5)-p.x);\n      if(Math.hypot(p.vx||0,p.vy||0)<0.70)p.bodyAngle=p.faceTargetAngle;\n      continue;",
'GK intent depth/facing')

replace_once(tac,
"  const lock=m._defenceRoleLocks?.[team]||{},primary=new Set([lock.pressId,lock.coverId].filter(Boolean)),o=worldToLocal(team,owner.x,owner.y);\n  const secondary=[];",
"  const lock=m._defenceRoleLocks?.[team]||{},primary=new Set([lock.pressId,lock.coverId].filter(Boolean)),o=worldToLocal(team,owner.x,owner.y);\n  // HF2: preserve a real midfield layer in front of the back four. The previous\n  // carrier-relative clamp could put the 8s/pivot on or even behind the CB line.\n  const cbTargetXs=outfield(m,team).filter(q=>q.role==='CB').map(q=>worldToLocal(team,q.tx,q.ty).x).filter(Number.isFinite);\n  const backLineTargetX=cbTargetXs.length?cbTargetXs.reduce((a,b)=>a+b,0)/cbTargetXs.length:null;\n  const secondary=[];",
'Defensive back-line reference')

replace_once(tac,
"    if(p.role==='CM')tx=Math.min(tx,ball.x-1.8);",
"    if(p.role==='CM'&&Number.isFinite(backLineTargetX)){\n      const screenGap=ball.x<25?5.4:6.2;\n      tx=Math.max(tx,backLineTargetX+screenGap);\n      // Do not launch the midfield beyond the live carrier; this is a layer guard, not a press.\n      tx=Math.min(tx,ball.x+5.0);\n    }",
'CM layer direction')

replace_once(tac,
"      if(td>4.6)continue;",
"      if(td>5.2)continue;",
'Off-ball near ring')
replace_once(tac,
"    if(near.length<=2)continue;\n    near.sort((x,y)=>y.priority-x.priority||x.td-y.td);\n    for(const z of near.slice(2)){",
"    if(near.length<=1)continue;\n    near.sort((x,y)=>y.priority-x.priority||x.td-y.td);\n    // HF2: only one defender may occupy the tight body-mark ring. A second CB/FB/CM\n    // becomes cover/second-ball support instead of starting glued to the same attacker.\n    for(const z of near.slice(1)){",
'One tight marker')
replace_once(tac,
"      const need=p.role==='CM'?6.2:5.6,k=Math.max(0,(need-d)/d);",
"      const need=p.role==='CM'?6.4:p.role==='CB'?5.2:5.6,k=Math.max(0,(need-d)/d);",
'Cover ring spacing')
replace_once(tac,
"const inBox=inOpponentBoxTarget(team,a.tx,a.ty)&&inOpponentBoxTarget(team,b.tx,b.ty),min=inBox?3.15:2.25;",
"const inBox=inOpponentBoxTarget(team,a.tx,a.ty)&&inOpponentBoxTarget(team,b.tx,b.ty),min=inBox?3.60:2.80;",
'Same-team target spacing')
replace_once(tac,
"aDuel=owner&&a.id===owner.id&&['ENGAGE','PRESS_CONTAIN'].includes(b.tacticalTask),bDuel=owner&&b.id===owner.id&&['ENGAGE','PRESS_CONTAIN'].includes(a.tacticalTask),duel=aDuel||bDuel,min=duel?1.05:1.45;",
"aDuel=owner&&a.id===owner.id&&['ENGAGE','PRESS_CONTAIN'].includes(b.tacticalTask),bDuel=owner&&b.id===owner.id&&['ENGAGE','PRESS_CONTAIN'].includes(a.tacticalTask),duel=aDuel||bDuel,min=duel?1.08:2.05;",
'Opponent non-duel spacing')
# Broaden same-side fullback ownership modestly in current production family when exact strings exist.
p=ROOT/tac; s=p.read_text(encoding='utf-8')
if "const attackers=allAttackers.filter(o=>o.l.x<=34);" in s:
    s=s.replace("const attackers=allAttackers.filter(o=>o.l.x<=34);","const attackers=allAttackers.filter(o=>o.l.x<=36.5);",1)
    s=s.replace("(fullDeep||(owner?.role==='ST'&&o.l.x<=31.5))","(fullDeep||(owner?.role==='ST'&&o.l.x<=36.0))",1)
    p.write_text(s,encoding='utf-8'); changed.append(str(tac))

# Force same-flank fullback responsibility for a dangerous deep winger after generic crowd exits.
p=ROOT/tac; s=p.read_text(encoding='utf-8')
marker="function separateRecoveringMidfieldFromStriker(m,team){"
if s.count(marker)!=1: raise RuntimeError('Fullback responsibility insertion marker missing')
helper="""function enforceFullbackWideRunnerResponsibility(m,team,owner){
  if(!owner||owner.team===team||m.ball.mode!=='CONTROLLED')return;
  const lock=m._defenceRoleLocks?.[team]||{},attackers=outfield(m,other(team)).filter(a=>a.role==='WF');
  for(const fb of outfield(m,team).filter(p=>p.role==='FB')){
    if(fb.id===lock.pressId)continue;
    const sg=sideSign(fb.slot),wf=attackers.map(a=>({a,l:worldToLocal(team,a.x,a.y)})).filter(o=>(o.l.y<34?-1:1)===sg&&o.l.x<=40).sort((a,b)=>a.l.x-b.l.x)[0];
    if(!wf)continue;
    const wl=wf.l,tx=clamp(wl.x-2.5,6,42),ty=clamp(lerp(wl.y,34,.10),5,63),w=localToWorld(team,tx,ty);
    fb.tx=w.x;fb.ty=w.y;fb.markTargetId=wf.a.id;fb.action=fb.tacticalTask='WIDE_RUN_TRACK';fb.sprint=dist(fb,wf.a)>4.2||dist(fb,w)>2.8;
    if(lock.coverId===fb.id)lock.coverId=null;
  }
}

"""
s=s.replace(marker,helper+marker,1)
call="enforceActualDefenderCrowdExit(m,defTeam,owner);enforceWideLaneHierarchy(m,poss);"
if s.count(call)!=1: raise RuntimeError('Fullback responsibility call marker missing')
s=s.replace(call,"enforceActualDefenderCrowdExit(m,defTeam,owner);enforceFullbackWideRunnerResponsibility(m,defTeam,owner);enforceWideLaneHierarchy(m,poss);",1)
p.write_text(s,encoding='utf-8'); changed.append(str(tac))

# 2) Offside: preserve the pass/call beat before compressed restart setup.
core=Path('runtime/continuous_match_core.js')
replace_once(core,
"function startDeadRestart(m,kind,team,x,y,cross=null){consumeCompressedDeadClock(m,kind);for(const p of m.players){p.hasBall=false;p.runUntil=0;p.runType=null;p.pressCommitUntil=0;p.markTargetId=null;p.faceTargetAngle=null;}",
"function startDeadRestart(m,kind,team,x,y,cross=null){const deferredOffside=kind==='OFFSIDE';if(!deferredOffside)consumeCompressedDeadClock(m,kind);for(const p of m.players){p.hasBall=false;p.runUntil=0;p.runType=null;p.pressCommitUntil=0;p.markTargetId=null;p.faceTargetAngle=null;}",
'Defer offside dead clock')
replace_once(core,
"  m.ball={mode:'DEAD',x:bx,y:by,z:0,vx:0,vy:0,vz:0,ownerId:null,kind,lastTouchTeam:m.lastTouchTeam,lastTouchPlayer:m.lastTouchPlayer};m.ballOwner=null;m.possession=team;m.phase=kind;m.restart={kind,team,x,y,until:m.time+(kind==='THROW_IN'?1.35:0.9),stage:'SETUP',setupStartedAt:m.time,ballReturn};m.nextShape=m.time;if(RESTARTS&&typeof RESTARTS.begin==='function'){const setup=RESTARTS.begin(m);if(kind==='THROW_IN'&&setup?.kickerId&&setup.targets?.[setup.kickerId]){const thrower=playerById(m,setup.kickerId),t=setup.targets[setup.kickerId];if(thrower&&t){thrower.x=t.x;thrower.y=t.y;thrower.vx=thrower.vy=0;thrower.tx=t.x;thrower.ty=t.y;m.ball.x=t.x;m.ball.y=t.y;}}}}",
"  m.ball={mode:'DEAD',x:bx,y:by,z:0,vx:0,vy:0,vz:0,ownerId:null,kind,lastTouchTeam:m.lastTouchTeam,lastTouchPlayer:m.lastTouchPlayer};m.ballOwner=null;m.possession=team;m.phase=kind;\n  m.restart={kind,team,x,y,until:m.time+(kind==='THROW_IN'?1.35:0.9),stage:deferredOffside?'CALL_REVIEW':'SETUP',setupStartedAt:m.time,ballReturn,deferredDeadClock:deferredOffside,callReviewUntil:deferredOffside?m.time+1.60:null};m.nextShape=m.time;\n  if(deferredOffside){\n    // Hold the actual positions briefly so the pass/run and referee call are readable before\n    // the dead-clock jump. This is presentation continuity, not delayed result computation.\n    for(const p of m.players){p.tx=p.x;p.ty=p.y;p.vx*=.25;p.vy*=.25;p.action='OFFSIDE_CALL_REVIEW';p.tacticalTask='OFFSIDE_CALL_REVIEW';p.sprint=false;if(Number.isFinite(m.ball.x)&&Number.isFinite(m.ball.y))p.faceTargetAngle=Math.atan2(m.ball.y-p.y,m.ball.x-p.x);}\n  }else if(RESTARTS&&typeof RESTARTS.begin==='function'){const setup=RESTARTS.begin(m);if(kind==='THROW_IN'&&setup?.kickerId&&setup.targets?.[setup.kickerId]){const thrower=playerById(m,setup.kickerId),t=setup.targets[setup.kickerId];if(thrower&&t){thrower.x=t.x;thrower.y=t.y;thrower.vx=thrower.vy=0;thrower.tx=t.x;thrower.ty=t.y;m.ball.x=t.x;m.ball.y=t.y;}}}}",
'Offside call-review stage')
replace_once(core,
"function performRestart(m){\n  const r=m.restart;if(!r)return false;\n  if(!updateDeadBallReturn(m,r))return false;",
"function performRestart(m){\n  const r=m.restart;if(!r)return false;\n  if(r.kind==='OFFSIDE'&&r.stage==='CALL_REVIEW'){\n    if(m.time<(r.callReviewUntil||m.time))return false;\n    if(r.deferredDeadClock){consumeCompressedDeadClock(m,'OFFSIDE');r.deferredDeadClock=false;}\n    r.stage='SETUP';r.setupStartedAt=m.time;r.until=m.time+.90;\n    r.ballReturn={phase:'OUT_HOLD',startedAt:m.time,holdUntil:m.time+.18,returnUntil:m.time+.92,from:{x:m.ball.x,y:m.ball.y},to:{x:r.x,y:r.y}};\n    if(RESTARTS&&typeof RESTARTS.begin==='function')RESTARTS.begin(m);\n  }\n  if(!updateDeadBallReturn(m,r))return false;",
'Offside review then restart')
replace_once(core,
"function maybeOffside(m,receiver){if(m.ball.kind==='SHOT'||!m.ball.offsideAtRelease||m.ball.age>.55)return false;",
"function maybeOffside(m,receiver){if(m.ball.kind==='SHOT'||!m.ball.offsideAtRelease||m.ball.offsideCalled||m.ball.age<.30||m.ball.age>1.20)return false;",
'Offside call after visible flight')
replace_once(core,
"  addEvent(m,'OFFSIDE',`${receiver.name} 오프사이드`,receiver.team,receiver.id,null);m.stats.offsides[receiver.team]++;startDeadRestart(m,'OFFSIDE',other(receiver.team),m.ball.x,m.ball.y);return true;}",
"  m.ball.offsideCalled=true;addEvent(m,'OFFSIDE',`${receiver.name} 오프사이드`,receiver.team,receiver.id,null);m.stats.offsides[receiver.team]++;startDeadRestart(m,'OFFSIDE',other(receiver.team),m.ball.x,m.ball.y);return true;}",
'Offside one-shot flag')
replace_once(core,
"    if(Math.abs(dx)>=1.18||Math.abs(dy)>=1.18)continue;",
"    if(Math.abs(dx)>=1.28||Math.abs(dy)>=1.28)continue;",
'Collision broad-phase for 1.24m non-duel floor')
replace_once(core,
"    const bothBox=insideBox(a)&&insideBox(b),min=a.role==='GK'||b.role==='GK'?0.82:same?(bothBox?1.18:0.88):(duel?1.02:1.05);if(d>=min)continue;",
"    const bothBox=insideBox(a)&&insideBox(b),min=a.role==='GK'||b.role==='GK'?0.82:same?(bothBox?1.18:0.88):(duel?1.02:1.24);if(d>=min)continue;",
'Non-duel body spacing floor')

# 3) Hybrid low-res cover spacing: fix the state before 2D handoff, preserving exact continuity.
hybrid=Path('runtime/hybrid_spatial_intent_v2.js')
replace_once(hybrid,
"    if(markerEntry){const marker=players[markerEntry[0]],goalX=p.team==='HOME'?0:105,raw={x:marker.x+(goalX-marker.x)*.10,y:marker.y+(34-marker.y)*.28};return{kind:'COVER',target:capAround(base,raw,9),targetId:marker.id,score:.87};}",
"    if(markerEntry){const marker=players[markerEntry[0]],threat=players[marker?.intentTargetId],goalX=p.team==='HOME'?0:105;if(threat){const dx=goalX-threat.x,dy=34-threat.y,dg=Math.max(.01,Math.hypot(dx,dy)),side=p.slot==='LCB'?-1:p.slot==='RCB'?1:0,raw={x:threat.x+dx/dg*4.8,y:threat.y+dy/dg*4.8+side*1.25};return{kind:'COVER',target:capAround(base,raw,10),targetId:marker.id,score:.87};}const raw={x:marker.x+(goalX-marker.x)*.16,y:marker.y+(34-marker.y)*.32};return{kind:'COVER',target:capAround(base,raw,10),targetId:marker.id,score:.87};}",
'Hybrid cover cannot body-glue marker target')

insert_before_once(hybrid,"function advanceV2(state,players,seconds,opts={}){",r'''function resolveOffBallThreatSeparation(state,players){
  const ownerId=state.ball?.ownerId||null,attackTeam=state.possession;
  const attackers=Object.values(players).filter(a=>a.team===attackTeam&&a.id!==ownerId&&['ST','WF'].includes(a.role));
  for(const a of attackers){
    const near=Object.values(players).filter(d=>d.team!==attackTeam&&d.role!=='GK').map(d=>({d,dist:Math.hypot(d.x-a.x,d.y-a.y),priority:(d.intentKind==='MARK'&&d.intentTargetId===a.id?5:0)+(d.role==='CB'?1.2:d.role==='FB'?.8:0)})).filter(x=>x.dist<5.7).sort((u,v)=>v.priority-u.priority||u.dist-v.dist);
    if(!near.length)continue;
    const place=(d,need,sideBias=0)=>{let dx=d.x-a.x,dy=d.y-a.y,dd=Math.hypot(dx,dy);if(dd<.01){const goalX=d.team==='HOME'?0:105;dx=goalX-a.x;dy=(d.slot?.startsWith('L')?-1:1)*2;dd=Math.hypot(dx,dy)||1;}const nx=dx/dd,ny=dy/dd;d.x=clamp(a.x+nx*need,3,102);d.y=clamp(a.y+ny*need+sideBias,3,65);d.intentTargetX=d.x;d.intentTargetY=d.y;d.vx*=.35;d.vy*=.35;};
    if(near[0].dist<1.30)place(near[0].d,1.35,0);
    for(let i=1;i<near.length;i++){
      const z=near[i];if(z.dist>=5.35)continue;const side=z.d.slot==='LCB'||z.d.slot==='LB'?-1:1;place(z.d,5.45,side*.55);
      if(z.d.intentKind==='MARK'&&z.d.intentTargetId===a.id){z.d.intentKind='COVER';z.d.intentTargetId=null;z.d.intentScore=Math.min(z.d.intentScore||.6,.72);}
    }
  }
}

''','Off-ball threat separation helper')
replace_once(hybrid,
"  if(state.ball)state.ball.progress=endProgress;",
"  resolveOffBallThreatSeparation(state,players);\n  resolveBodySeparation(players,.68);\n  if(state.ball)state.ball.progress=endProgress;",
'Apply off-ball threat separation')

# 4) Developer validation becomes fully reportable/reproducible.
ui=Path('step71_hybrid_v06_ui.js')
replace_once(ui,
"function finishDeveloperVisual(){const done=developerScenarioActive;developerScenarioActive=null;phase='IDLE';clearOffsideReview();if(done){$('heroPlayback').textContent=`강제 검증 완료 · ${done.label}`;if($('heroRecentFixStatus'))$('heroRecentFixStatus').textContent=`검증 완료: ${done.label} · seed=${done.seed}`;if($('heroRecentFixReplay'))$('heroRecentFixReplay').disabled=!developerScenarioLast?.frames?.length;}}",
"function finishDeveloperVisual(){const done=developerScenarioActive;developerScenarioActive=null;phase='IDLE';clearOffsideReview();if(done){$('heroPlayback').textContent=`강제 검증 완료 · ${done.label}`;if($('heroRecentFixStatus'))$('heroRecentFixStatus').textContent=`검증 완료: ${done.label} · seed=${done.seed}`;if($('heroRecentFixReplay'))$('heroRecentFixReplay').disabled=!developerScenarioLast?.frames?.length;$('heroDownloadScene').disabled=!latestIntegratedDebug;$('heroBugReport').disabled=!latestIntegratedDebug;$('heroCopyDebug').disabled=!latestIntegratedDebug;}}",
'Dev visual buttons')
replace_once(ui,
" beforeHybrid=H.snapshot(d.session);activeBoundary=deep(d.boundary);const env=A.seedMatch(d.boundary,{seed:`${d.seed}-VISUAL`,explicitHeroChoiceRequired:true}),frames=[deep(env.entrySnapshot)];env.state.mode='FULL_SKIP';let guard=0;while(!env.state.m.completed&&guard++<90){P.step(env.state,.10);frames.push(deep(E.snapshot(env.state.m)));}\n developerScenarioLast={key:d.key,label:d.label,instruction:d.instruction,seed:d.seed,frames:deep(frames)};if($('heroRecentFixReplay'))$('heroRecentFixReplay').disabled=false;$('heroEventLog').innerHTML+=`<div class=\"major-match-event\"><strong>개발자 시각 검증 · ${d.label}</strong> · ${d.instruction}</div>`;startReplay(frames,'DEV_SCENARIO',`${d.label} · 강제 재현`);",
" beforeHybrid=H.snapshot(d.session);activeBoundary=deep(d.boundary);const env=A.seedMatch(d.boundary,{seed:d.seed,explicitHeroChoiceRequired:true}),frames=[deep(env.entrySnapshot)];env.state.mode='FULL_SKIP';let guard=0;while(!env.state.m.completed&&guard++<90){P.step(env.state,.10);frames.push(deep(E.snapshot(env.state.m)));}\n env.frames=frames;const devResolved={selectedChoice:null,choiceSteps:[],actualEvents:[],result:null,results:[],episodeFrames:frames};latestIntegratedDebug=X?.build?X.build(beforeHybrid,activeBoundary,env,devResolved,d.session):{schemaVersion:'FLR_HYBRID_LIVE_SCENE_DEBUG_0.3',hybridBefore:{status:beforeHybrid.status,boundary:deep(activeBoundary),state:deep(activeBoundary.stateSnapshot),preContext:deep(activeBoundary.preContext)},highResolution:{entrySnapshot:deep(env.entrySnapshot),decision:null,selectedChoice:null,choiceSteps:[],postActionFrames:[],actualEvents:[],actualResult:null,actualResults:[],episodeFrames:deep(frames)},hybridAfter:{status:d.session.status,state:deep(d.session.state),lastHighRes:deep(d.session.state.lastHighRes)},futureOutcomePrecomputed:false};rememberCompletedSituation(latestIntegratedDebug,'DEV_VISUAL');developerScenarioLast={key:d.key,label:d.label,instruction:d.instruction,seed:d.seed,highResSeed:d.seed,frames:deep(frames),debug:deep(latestIntegratedDebug)};$('heroDownloadScene').disabled=false;$('heroBugReport').disabled=false;$('heroCopyDebug').disabled=false;$('heroDebugSummary').textContent=`DEV ${d.key}\\nseed=${d.seed}\\nreportable=true\\nfuturePrecomputed=false`;if($('heroRecentFixReplay'))$('heroRecentFixReplay').disabled=false;$('heroEventLog').innerHTML+=`<div class=\"major-match-event\"><strong>개발자 시각 검증 · ${d.label}</strong> · ${d.instruction}</div>`;startReplay(frames,'DEV_SCENARIO',`${d.label} · 강제 재현`);",
'Dev visual debug bundle/repro seed')
replace_once(ui,
"  opened=A.runToChoice(r.boundary,{seed:`${seed()}-${r.boundary.sceneId}`,minPreSeconds:5,maxSearchSeconds:35});",
"  const authoritySeed=developerScenarioActive?.seed||`${seed()}-${r.boundary.sceneId}`;\n  opened=A.runToChoice(r.boundary,{seed:authoritySeed,minPreSeconds:5,maxSearchSeconds:35});\n  if(developerScenarioActive)developerScenarioActive.highResSeed=authoritySeed;",
'Dev interactive exact seed')
# Fix null replay order in handback.
old="session=null;opened=null;selectedStepResults=[];phase='SEARCHING';$('heroResultPanel').hidden=true;"
new="const developerReplayFrames=developerScenarioActive?deep(frames):null;session=null;opened=null;selectedStepResults=[];phase='SEARCHING';$('heroResultPanel').hidden=true;"
replace_once(ui,old,new,'Capture dev replay before session null')
replace_once(ui,
"if(developerScenarioActive){const done=developerScenarioActive,framesForReplay=ep?P.episodeReplay(session,ep):[];developerScenarioLast={...done,frames:deep(framesForReplay)};developerScenarioActive=null;phase='IDLE';",
"if(developerScenarioActive){const done=developerScenarioActive,framesForReplay=developerReplayFrames||[];developerScenarioLast={...done,highResSeed:done.highResSeed||done.seed,frames:deep(framesForReplay),debug:deep(latestIntegratedDebug)};developerScenarioActive=null;phase='IDLE';",
'Dev handback replay null fix')
replace_once(ui,
"if($('heroRecentFixStatus'))$('heroRecentFixStatus').textContent=`검증 완료: ${done.label} · seed=${done.seed}`;if($('heroRecentFixReplay'))$('heroRecentFixReplay').disabled=!developerScenarioLast.frames?.length;clearOffsideReview();return}",
"if($('heroRecentFixStatus'))$('heroRecentFixStatus').textContent=`검증 완료: ${done.label} · seed=${done.seed} · JSON/버그리포트 사용 가능`;if($('heroRecentFixReplay'))$('heroRecentFixReplay').disabled=!developerScenarioLast.frames?.length;$('heroDownloadScene').disabled=false;$('heroBugReport').disabled=false;$('heroCopyDebug').disabled=false;clearOffsideReview();return}",
'Dev interactive buttons')

# 5) Version identity for this candidate/test environment.
idx=Path('index.html')
p=ROOT/idx; s=p.read_text(encoding='utf-8');
s=s.replace('V0.5.3 HF1','V0.5.3 HF2 TEST').replace('USER MATCH TEST <strong>V0.5.3 HF1</strong>','USER MATCH TEST <strong>V0.5.3 HF2 TEST</strong>')
p.write_text(s,encoding='utf-8'); changed.append(str(idx))
p=ROOT/ui; s=p.read_text(encoding='utf-8');
s=s.replace('USER-MATCH-TEST-V0.5.3-HF1','USER-MATCH-TEST-V0.5.3-HF2').replace('umt053h1-fallback-','umt053h2-fallback-').replace('umt053h1-','umt053h2-').replace('V053_GK_RESULT_HOTFIX','V053_HF2_VISUAL_DEFENCE_FIX')
p.write_text(s,encoding='utf-8'); changed.append(str(ui))

# Write manifest
uniq=sorted(set(changed))
out={'schemaVersion':'FLR_V053_HF2_PATCH_1.0','files':[]}
for f in uniq:
    b=(ROOT/f).read_bytes(); out['files'].append({'path':f,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
(ROOT/'.flr/v053_hf2_patch_manifest.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
print(json.dumps(out,indent=2))
