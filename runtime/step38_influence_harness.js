(function(root,factory){
  const api=factory(
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_CONTINUOUS_CORE)||((typeof require==='function')?require('./continuous_match_core.js'):null),
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_CHOICE_RESOLUTION_HARNESS)||((typeof require==='function')?require('./choice_resolution_harness.js'):null),
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_CHOICE_ACTION_RESOLVER_STEP38)||((typeof require==='function')?require('./choice_action_resolver_step38.js'):null),
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_ATTRIBUTE_MATCH_ADAPTER)||((typeof require==='function')?require('./attribute_match_adapter.js'):null),
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_MANAGER_TENDENCY_ADAPTER)||((typeof require==='function')?require('./manager_tendency_adapter.js'):null)
  );
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_STEP38_INFLUENCE_HARNESS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(E,H37,R38,A,M){
'use strict';
const VERSION='STEP38-INFLUENCE-HARNESS-0.4',DT=.05;
const SCENARIOS=H37.SCENARIOS;
function clone(o){return JSON.parse(JSON.stringify(o));}
function p(m,id){return m.playersById[id];}
function assignAbilitySet(m,scenarioId,tier='BASE'){
  const sc=SCENARIOS[scenarioId],role=sc.focusRole,profiles=A.testProfiles(role),base=A.baseProfile(60);for(const q of m.players)A.assign(m,q.id,base);A.assign(m,sc.focusPlayerId,profiles[tier]||profiles.BASE);return{tier,focusPlayerId:sc.focusPlayerId,profile:clone(A.get(m,sc.focusPlayerId))};
}
function createScenario(id,trial=0,tier='BASE'){
  const m=H37.createScenario(id,trial);m.seed=`step38|${id}|trial-${trial}`;
  // Re-seed the current-state RNG while preserving the STEP37 spatial setup.
  const fresh=E.createMatch(m.seed,{});m.r=fresh.r;
  const ability=assignAbilitySet(m,id,tier);return{m,ability};
}
function compact(m,sc,start){const s=E.snapshot(m),fp=s.players.find(x=>x.id===sc.focusPlayerId);return{at:Number((s.time-1800).toFixed(2)),phase:s.phase,possession:s.possession,ball:{mode:s.ball.mode,kind:s.ball.kind,ownerId:s.ball.ownerId,x:Number(s.ball.x.toFixed(1)),y:Number(s.ball.y.toFixed(1))},focus:fp?{id:fp.id,x:Number(fp.x.toFixed(1)),y:Number(fp.y.toFixed(1)),action:fp.action,hasBall:fp.hasBall}:null,delta:{shots:s.stats.shots-start.shots,goals:s.stats.goals-start.goals,passes:s.stats.passes-start.passes,completedPasses:s.stats.completedPasses-start.completedPasses,carries:s.stats.carries-start.carries,turnovers:s.stats.turnovers-start.turnovers,tacklesWon:s.stats.tacklesWon-start.tacklesWon,fouls:s.stats.fouls-start.fouls,looseBalls:s.stats.looseBalls-start.looseBalls}};}
function startChoice(id,choiceId,trial=0,tier='BASE'){
  const sc=SCENARIOS[id],spec=sc.choices.find(c=>c.id===choiceId);if(!sc||!spec)throw new Error('Unknown STEP38 scenario/choice');const built=createScenario(id,trial,tier),m=built.m,start={...m.stats};const before=compact(m,sc,start),applied=R38.apply(m,{playerId:sc.focusPlayerId,choice:spec.id,targetId:spec.targetId});return{scenario:sc,spec,m,start,before,ability:built.ability,applied,tier,lastChoiceAt:m.time,pendingChoice:null,presentationStop:null,chainChoices:[{at:0,choice:spec.id,targetId:spec.targetId||null,futureOutcomePrecomputed:false}]};
}
function followChoices(s){return s.id==='ST_FINISH'?[{id:'SHOT',label:'슈팅',hint:'새로 열린 각도에서 슈팅'},{id:'CARRY',label:'한 번 더 운반',hint:'공간이 남아 있으면 추가 전진'},{id:'PASS',label:'전진 패스',hint:'오른쪽 공격수에게 연결',targetId:'H-RW'}]:s.id==='CM_EDGE'?[{id:'LONG_SHOT',label:'슈팅',hint:'현재 위치에서 직접 마무리'},{id:'THROUGH',label:'침투 패스',hint:'ST 움직임으로 다시 연결',targetId:'H-ST'},{id:'CARRY',label:'추가 전진',hint:'공간이 남아 있으면 한 번 더 운반'}]:[];}
function maybeFollow(session){if(session.pendingChoice||session.presentationStop)return null;const fp=p(session.m,session.scenario.focusPlayerId),ctrl=session.m.userChoiceControl;if(!ctrl||ctrl.playerId!==fp?.id||!fp.hasBall||session.m.ball.ownerId!==fp.id)return null;const age=session.m.time-session.lastChoiceAt;if(age<.62||(fp.lockTargetUntil||0)>session.m.time+.03||!['ST_FINISH','CM_EDGE'].includes(session.scenario.id))return null;const dangerous=fp.team==='HOME'?fp.x>=82:fp.x<=23;if(!dangerous)return null;session.pendingChoice={at:Number((session.m.time-1800).toFixed(2)),reason:'FOLLOW_UP_AFTER_CARRY',choices:followChoices(session.scenario),futureOutcomePrecomputed:false};return session.pendingChoice;}
function applyPendingChoice(session,choiceId){if(!session?.pendingChoice)return{ok:false,reason:'NO_PENDING_CHOICE'};const spec=session.pendingChoice.choices.find(c=>c.id===choiceId);if(!spec)return{ok:false,reason:'UNKNOWN_PENDING_CHOICE'};const res=R38.apply(session.m,{playerId:session.scenario.focusPlayerId,choice:spec.id,targetId:spec.targetId});if(res.ok){session.chainChoices.push({at:Number((session.m.time-1800).toFixed(2)),choice:spec.id,targetId:spec.targetId||null,futureOutcomePrecomputed:false});session.lastChoiceAt=session.m.time;session.pendingChoice=null;}return res;}
function stepSession(s,dt=DT){E.step(s.m,dt);R38.resolveCarryChecks(s.m);if(!s.presentationStop&&s.m.restart?.kind==='GOAL_KICK')s.presentationStop={at:Number((s.m.time-1800).toFixed(2)),reason:'ROUTINE_GOAL_KICK',futureOutcomePrecomputed:false};if(s.m.userChoiceControl){const fp=p(s.m,s.scenario.focusPlayerId);if(!fp?.hasBall||s.m.ball.ownerId!==fp.id)s.m.userChoiceControl=null;}maybeFollow(s);return s.m;}
function advanceSession(s,seconds){const target=1800+seconds;let g=0;while(!s.m.completed&&s.m.time<target-1e-9&&g++<200000)stepSession(s,DT);return compact(s.m,s.scenario,s.start);}
function runBranch(id,choiceId,trial=0,tier='BASE'){const s=startChoice(id,choiceId,trial,tier),checkpoints={};for(const sec of[1,3,5])checkpoints[sec]=advanceSession(s,sec);const snap=E.snapshot(s.m);return{version:VERSION,scenarioId:id,choice:choiceId,trial,tier,abilityComposite:Number(A.composite(s.m,s.scenario.focusPlayerId,choiceId).toFixed(2)),relatedAttributes:A.relevant(choiceId),before:s.before,applied:s.applied,checkpoints,final:compact(s.m,s.scenario,s.start),abilityResolutionLog:clone(s.m.abilityResolutionLog||[]),futureOutcomePrecomputed:false};}
function primaryChoice(id){return({ST_FINISH:{id:'ST_FINISH',choice:'SHOT',metric:'shot'},CM_EDGE:{id:'CM_EDGE',choice:'LONG_SHOT',metric:'shot'},CB_DEFEND:{id:'CB_DEFEND',choice:'TACKLE',metric:'tackle'},GK_DISTRIBUTION:{id:'GK_DISTRIBUTION',choice:'LONG_DISTRIBUTION',metric:'pass'}})[id]||null;}
function abilityDistribution(id,trials=120){const pc=primaryChoice(id);if(!pc)throw new Error('No primary choice');const rows={};for(const tier of['LOW','BASE','HIGH']){const r=rows[tier]={tier,trials,composite:0,goals:0,onTarget:0,tackleWon:0,tackleFoul:0,tackleLoose:0,passMiscontrol:0,retained:0,turnovers:0,avgFocusX:0};for(let t=0;t<trials;t++){const b=runBranch(id,pc.choice,t,tier),log=b.abilityResolutionLog.find(x=>['SHOT_ACCURACY','TACKLE_DUEL','PASS_EXECUTION'].includes(x.test));r.composite+=b.abilityComposite;r.goals+=b.final.delta.goals;r.turnovers+=b.final.delta.turnovers;r.retained+=b.final.possession===SCENARIOS[id].team?1:0;r.avgFocusX+=b.final.focus?.x||0;if(log?.test==='SHOT_ACCURACY'&&log.onTarget)r.onTarget++;if(log?.test==='TACKLE_DUEL'){if(log.result==='TACKLE_WON')r.tackleWon++;else if(log.result==='FOUL')r.tackleFoul++;else r.tackleLoose++;}if(log?.test==='PASS_EXECUTION'&&log.miscontrol)r.passMiscontrol++;}for(const k of['composite','avgFocusX'])r[k]=Number((r[k]/trials).toFixed(2));r.goalRate=Number((r.goals/trials).toFixed(3));r.onTargetRate=Number((r.onTarget/trials).toFixed(3));r.tackleWinRate=Number((r.tackleWon/trials).toFixed(3));r.tackleFoulRate=Number((r.tackleFoul/trials).toFixed(3));r.passMiscontrolRate=Number((r.passMiscontrol/trials).toFixed(3));r.retainedRate=Number((r.retained/trials).toFixed(3));}return{scenarioId:id,choice:pc.choice,trials,rows,futureOutcomePrecomputed:false,sameSeedAcrossAbilityTiers:true,productionCalibrationLocked:false};}

function createManagerSession(profileId='DEFENSIVE_COUNTER',trial=0){const seed=`step38|manager-live|trial-${trial}`,m=E.createMatch(seed,{telemetry:{}});M.init(m,{HOME:profileId,AWAY:'BALANCED'});return{m,profileId,trial,seed,futureOutcomePrecomputed:false};}
function technicalOpenPlayReset(session){
  const m=session.m;m.completed=false;m.restart=null;m.phase='OPEN_PLAY';m.goalCelebration=null;m.activeDuel=null;m.transitionUntil=0;m.nextShape=m.time+1.4;
  for(const q of m.players){q.hasBall=false;q.vx=q.vy=0;q.tx=q.x;q.ty=q.y;q.lockTargetUntil=0;q.nextThink=m.time+99;q.sprint=false;}
  m.ballOwner=null;m.ball.mode='DEAD';m.ball.ownerId=null;m.ball.vx=m.ball.vy=m.ball.vz=0;return m;
}
function forceManagerGoalCelebration(session,scoringTeam='HOME'){
  const m=technicalOpenPlayReset(session),B=E.choiceActionBridge(),home=scoringTeam==='HOME',scorer=B.playerById(m,home?'H-ST':'A-ST');
  const pos=home?{'H-ST':[96,34],'H-RW':[92,39],'H-CM':[89,31],'H-RCM':[82,44],'H-LW':[72,12],'H-LCM':[64,22]}:{'A-ST':[9,34],'A-RW':[13,29],'A-CM':[16,37],'A-RCM':[23,24],'A-LW':[33,56],'A-LCM':[41,46]};
  for(const [id,xy] of Object.entries(pos)){const q=B.playerById(m,id);if(!q)continue;q.x=xy[0];q.y=xy[1];q.tx=q.x;q.ty=q.y;q.vx=q.vy=0;}
  const x=home?104.86:.14,vx=home?18:-18;m.possession=scoringTeam;m.lastTouchTeam=scoringTeam;m.lastTouchPlayer=scorer.id;
  m.ball={mode:'FLIGHT',x,y:34,z:0,vx,vy:0,vz:0,ownerId:null,intendedReceiverId:null,kind:'SHOT',deliveryMode:'GROUND',lastTouchTeam:scoringTeam,lastTouchPlayer:scorer.id,age:.2,originX:scorer.x,originY:scorer.y,targetX:home?106:-1,targetY:34,airborne:false,shotTeam:scoringTeam,shotTargetY:34};
  E.step(m,.05);session.technicalHarness={kind:'FORCED_GOAL_CELEBRATION',at:m.time,scoringTeam,futureOutcomePrecomputed:false,productionGoalProbabilityChanged:false};return session;
}
function forceManagerRestart(session,kind='GOAL_KICK',team='HOME'){
  const m=technicalOpenPlayReset(session),B=E.choiceActionBridge();
  const specs={GOAL_KICK:{x:team==='HOME'?6:99,y:34},CORNER:{x:team==='HOME'?103.8:1.2,y:1.2},FREE_KICK:{x:team==='HOME'?72:33,y:30},THROW_IN:{x:58,y:1.2}};
  const q=specs[kind];if(!q)throw new Error('Unknown forced restart '+kind);
  B.startDeadRestart(m,kind,team,q.x,q.y);session.technicalHarness={kind:`FORCED_${kind}_SETUP`,at:m.time,team,futureOutcomePrecomputed:false,productionRestartProbabilityChanged:false};return session;
}
function forceManagerBoxCarry(session){
  const m=technicalOpenPlayReset(session),B=E.choiceActionBridge(),st=B.playerById(m,'H-ST');
  const pos={'H-ST':[91.0,34.0],'H-RW':[86.5,45.0],'H-LW':[86.5,20.0],'H-CM':[80.0,34.0],'A-LCB':[96.0,34.0],'A-RCB':[96.0,39.0],'A-CM':[84.0,34.0],'A-GK':[102.0,34.0]};
  for(const [id,xy] of Object.entries(pos)){const q=B.playerById(m,id);if(!q)continue;q.x=xy[0];q.y=xy[1];q.tx=q.x;q.ty=q.y;q.vx=q.vy=0;q.nextThink=m.time+99;}
  B.setControlled(m,st);st.nextThink=m.time+99;B.executeCarry(m,st);m.nextShape=m.time+1.4;
  session.technicalHarness={kind:'FORCED_BOX_CARRY',at:m.time,playerId:st.id,futureOutcomePrecomputed:false,productionDecisionProbabilityChanged:false};return session;
}
function stepManagerSession(session,dt=.10){M.preStep(session.m);E.step(session.m,dt);M.postStep(session.m);return session.m;}
function managerSessionMetrics(session){const s=E.snapshot(session.m),t=s.telemetry||{},ms=M.summary(session.m).HOME;return{time:Number(s.time.toFixed(1)),score:s.score,possessionPct:Number(s.stats.possessionPct.HOME.toFixed(1)),shots:t.shotsByTeam?.HOME||0,longShots:t.longShotsByTeam?.HOME||0,tackles:t.tacklesByTeam?.HOME||0,fouls:t.foulsByTeam?.HOME||0,interceptions:t.interceptionsByTeam?.HOME||0,passes:ms.passes,progressivePasses:ms.progressivePasses,boxEntries:ms.boxEntries,highRegains:ms.highRegains,avgOppBoxOccupancy:ms.avgOppBoxOccupancy,...ms};}
function managerRun(profileId,seedIndex=0,seconds=720){const seed=`step38|manager|seed-${seedIndex}`,m=E.createMatch(seed,{telemetry:{}});M.init(m,{HOME:profileId,AWAY:'BALANCED'});const until=Math.min(5400,seconds);let g=0;while(!m.completed&&m.time<until&&g++<250000){M.preStep(m);E.step(m,0.10);M.postStep(m);}const s=E.snapshot(m),t=s.telemetry||{},ms=M.summary(m).HOME;return{profileId,seedIndex,seconds:Number(m.time.toFixed(1)),score:s.score,possessionPct:s.stats.possessionPct.HOME,shots:t.shotsByTeam?.HOME||0,longShots:t.longShotsByTeam?.HOME||0,tackles:t.tacklesByTeam?.HOME||0,fouls:t.foulsByTeam?.HOME||0,interceptions:t.interceptionsByTeam?.HOME||0,passes:ms.passes,progressivePasses:ms.progressivePasses,boxEntries:ms.boxEntries,highRegains:ms.highRegains,avgOppBoxOccupancy:ms.avgOppBoxOccupancy,manager:ms};}
function managerComparison(seeds=6,seconds=720){const profiles=['DEFENSIVE_COUNTER','ATTACKING_PRESS'],rows={};for(const id of profiles){const a=rows[id]={profile:M.PROFILES[id],samples:[],avg:{}};for(let i=0;i<seeds;i++)a.samples.push(managerRun(id,i,seconds));for(const k of['possessionPct','shots','longShots','tackles','fouls','interceptions','passes','progressivePasses','boxEntries','highRegains','avgOppBoxOccupancy'])a.avg[k]=Number((a.samples.reduce((s,x)=>s+(x[k]||0),0)/seeds).toFixed(2));for(const k of['forcedDirectPasses','forcedSafePasses','pressEngagements','laneScreens','avgDefLine','avgMidLine'])a.avg[k]=Number((a.samples.reduce((s,x)=>s+(x.manager[k]||0),0)/seeds).toFixed(2));}return{seeds,seconds,rows,samePlayerAbilities:true,managerDoesNotBoostAbilities:true,productionCalibrationLocked:false};}
return{VERSION,SCENARIOS,createScenario,startChoice,stepSession,advanceSession,applyPendingChoice,runBranch,abilityDistribution,createManagerSession,stepManagerSession,managerSessionMetrics,managerRun,managerComparison,forceManagerGoalCelebration,forceManagerBoxCarry,forceManagerRestart,managerProfiles:M.PROFILES,abilityProfiles:A.testProfiles};
});
