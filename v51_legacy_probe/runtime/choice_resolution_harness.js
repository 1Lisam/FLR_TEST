(function(root,factory){
  const api=factory(
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_CONTINUOUS_CORE)||((typeof require==='function')?require('./continuous_match_core.js'):null),
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_CHOICE_ACTION_RESOLVER)||((typeof require==='function')?require('./choice_action_resolver.js'):null)
  );
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_CHOICE_RESOLUTION_HARNESS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(E,R){
'use strict';

const VERSION='STEP37-CHOICE-RESOLUTION-0.2';
const DT=0.05;
const CHECKPOINTS=[1,3,5];

const SCENARIOS={
  ST_FINISH:{
    id:'ST_FINISH',title:'ST · 박스 앞 마무리',focusPlayerId:'H-ST',focusRole:'ST',team:'HOME',kind:'ON_BALL',importance:'IMPORTANT',
    description:'중앙 공격수가 페널티박스 바로 앞에서 공을 잡았습니다. 슈팅, 한 번 더 운반, 전진 패스가 모두 가능한 실제 현재 상태입니다.',
    choices:[
      {id:'SHOT',label:'슈팅',hint:'현재 각도에서 바로 마무리'},
      {id:'CARRY',label:'한 번 더 운반',hint:'수비 사이 공간으로 한 터치 더 전진'},
      {id:'PASS',label:'전진 패스',hint:'오른쪽 공격수에게 연결',targetId:'H-RW'}
    ]
  },
  CM_EDGE:{
    id:'CM_EDGE',title:'CM · 중거리/침투 선택',focusPlayerId:'H-CM',focusRole:'CM',team:'HOME',kind:'ON_BALL',importance:'IMPORTANT',
    description:'중앙 미드필더가 약 24m 거리에서 전방을 바라봅니다. 중거리슛, ST 침투패스, 직접 전진이 가능한 상태입니다.',
    choices:[
      {id:'LONG_SHOT',label:'중거리슛',hint:'박스 밖에서 직접 슈팅'},
      {id:'THROUGH',label:'침투 패스',hint:'ST의 전방 움직임으로 공간 패스',targetId:'H-ST'},
      {id:'CARRY',label:'직접 전진',hint:'공을 가지고 박스 쪽으로 접근'}
    ]
  },
  CB_DEFEND:{
    id:'CB_DEFEND',title:'CB · 중앙 수비 대응',focusPlayerId:'H-RCB',focusRole:'CB',team:'HOME',kind:'DEFENSIVE',importance:'IMPORTANT',
    description:'상대 ST가 중앙에서 골문 방향으로 전진합니다. 바로 태클하거나, 지연하거나, 전진 패스 길을 먼저 막을 수 있습니다.',
    choices:[
      {id:'TACKLE',label:'태클',hint:'즉시 공 탈취를 시도'},
      {id:'DELAY',label:'지연',hint:'골문과 공격수 사이를 유지하며 시간을 벌기'},
      {id:'BLOCK_LANE',label:'패스 길 차단',hint:'상대 왼쪽 공격수로 향하는 길을 선점',targetId:'A-LW'}
    ]
  },
  GK_DISTRIBUTION:{
    id:'GK_DISTRIBUTION',title:'GK · 배급 선택',focusPlayerId:'H-GK',focusRole:'GK',team:'HOME',kind:'ON_BALL',importance:'MEANINGFUL',
    description:'골키퍼가 공을 잡고 있습니다. 가까운 센터백에게 짧게 시작하거나, 전방 ST에게 길게 전개할 수 있습니다.',
    choices:[
      {id:'SHORT_DISTRIBUTION',label:'짧게 배급',hint:'오른쪽 센터백에게 안전하게 시작',targetId:'H-RCB'},
      {id:'LONG_DISTRIBUTION',label:'길게 배급',hint:'ST 쪽으로 빠르게 전진',targetId:'H-ST'},
      {id:'HOLD',label:'잠시 보유',hint:'주변 움직임을 한 번 더 확인'}
    ]
  }
};

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function p(m,id){return m.playersById[id];}
function put(m,id,x,y){const q=p(m,id);if(!q)return;q.x=x;q.y=y;q.tx=x;q.ty=y;q.vx=q.vy=0;q.sprint=false;q.hasBall=false;q.action='HOLD_SHAPE';q.tacticalTask='HOLD_SHAPE';q.lockTargetUntil=0;q.runUntil=0;q.nextChallengeAt=0;q.pressCommitUntil=0;q.pressRecoverUntil=0;}
function control(m,id){for(const q of m.players)q.hasBall=false;const q=p(m,id);q.hasBall=true;q.controlledSince=m.time-0.82;q.lastReceivedAt=m.time-0.82;q.action=q.role==='GK'?'GK_HOLD':'HOLD_BALL';q.tacticalTask=q.action;q.nextThink=m.time+99;m.ball={mode:'CONTROLLED',x:q.x+0.42,y:q.y,z:0,vx:0,vy:0,vz:0,ownerId:q.id,intendedReceiverId:null,kind:'CONTROL',deliveryMode:'GROUND',lastTouchTeam:q.team,lastTouchPlayer:q.id,age:0};m.ballOwner=q.id;m.possession=q.team;m.lastTouchTeam=q.team;m.lastTouchPlayer=q.id;}
function baseReset(m){
  m.time=1800;m.phase='OPEN_PLAY';m.restart=null;m.completed=false;m.nextShape=m.time+0.55;m.transitionUntil=0;m.kickoffBuildUntil=0;m.events=[];m.activeDuel=null;m.userChoiceLog=[];
  m.score.HOME=0;m.score.AWAY=0;m.lastChallengeAt=-99;m.lastFoulAt=-99;m.lastShotAt.HOME=-99;m.lastShotAt.AWAY=-99;
  for(const q of m.players){q.hasBall=false;q.vx=q.vy=0;q.lockTargetUntil=0;q.runUntil=0;q.nextThink=m.time+1.0;q.nextChallengeAt=0;q.pressCommitUntil=0;q.pressRecoverUntil=0;q.markTargetId=null;}
}
function setupCommon(m){
  // HOME baseline shape
  put(m,'H-GK',6,34);put(m,'H-LB',23,10);put(m,'H-LCB',25,27);put(m,'H-RCB',25,41);put(m,'H-RB',23,58);
  put(m,'H-LCM',48,22);put(m,'H-CM',55,34);put(m,'H-RCM',49,47);put(m,'H-LW',72,12);put(m,'H-ST',74,34);put(m,'H-RW',72,56);
  // AWAY shape (attacks left)
  put(m,'A-GK',99,34);put(m,'A-LB',82,58);put(m,'A-LCB',82,41);put(m,'A-RCB',82,27);put(m,'A-RB',82,10);
  put(m,'A-LCM',61,47);put(m,'A-CM',60,34);put(m,'A-RCM',61,21);put(m,'A-LW',42,56);put(m,'A-ST',39,34);put(m,'A-RW',42,12);
}
function setupScenario(m,id){
  baseReset(m);setupCommon(m);
  if(id==='ST_FINISH'){
    put(m,'H-ST',82.3,34.0);put(m,'H-RW',85.0,47.0);put(m,'H-LW',84.0,20.0);put(m,'H-CM',73.5,35.0);
    put(m,'A-LCB',88.2,39.0);put(m,'A-RCB',88.0,29.5);put(m,'A-CM',78.7,36.0);put(m,'A-GK',101.0,34.0);control(m,'H-ST');
  }else if(id==='CM_EDGE'){
    put(m,'H-CM',80.3,31.5);put(m,'H-ST',86.0,35.0);put(m,'H-RW',83.0,50.0);put(m,'H-LW',82.0,17.0);
    put(m,'A-LCB',88.7,41.5);put(m,'A-RCB',89.1,28.0);put(m,'A-CM',76.0,38.0);put(m,'A-RCM',78.0,24.5);put(m,'A-GK',101.0,34.0);control(m,'H-CM');
  }else if(id==='CB_DEFEND'){
    put(m,'H-RCB',25.7,36.3);put(m,'H-LCB',23.8,27.5);put(m,'H-CM',31.5,31.0);put(m,'H-RB',27.5,51.5);put(m,'H-GK',5.8,34.0);
    put(m,'A-ST',27.0,34.7);put(m,'A-LW',30.0,48.5);put(m,'A-RW',34.0,19.0);put(m,'A-CM',39.0,35.0);control(m,'A-ST');p(m,'A-ST').nextThink=m.time+0.34;p(m,'H-RCB').nextChallengeAt=m.time+99;
  }else if(id==='GK_DISTRIBUTION'){
    put(m,'H-GK',7.0,34.0);put(m,'H-RCB',21.5,42.0);put(m,'H-LCB',21.0,26.0);put(m,'H-RB',25.0,57.0);put(m,'H-LB',25.0,11.0);put(m,'H-CM',39.0,34.0);put(m,'H-ST',66.0,34.0);
    put(m,'A-ST',45.0,34.0);put(m,'A-LW',50.0,50.0);put(m,'A-RW',50.0,18.0);put(m,'A-CM',55.0,34.0);control(m,'H-GK');
  }else throw new Error(`Unknown scenario ${id}`);
  m.nextShape=m.time+0.65;
  return m;
}
function createScenario(id,trial=0){
  const sc=SCENARIOS[id];if(!sc)throw new Error(`Unknown scenario ${id}`);
  const seed=`step37|${id}|trial-${trial}`;
  const m=E.createMatch(seed,{telemetry:{focusPlayerId:sc.focusPlayerId,focusThreshold:sc.importance}});
  setupScenario(m,id);
  return m;
}
function compactState(m,scenario,startStats){
  const s=E.snapshot(m),fp=s.players.find(x=>x.id===scenario.focusPlayerId),owner=s.players.find(x=>x.id===s.ball.ownerId);
  return{
    at:Number((s.time-1800).toFixed(2)),phase:s.phase,possession:s.possession,score:s.score,
    ball:{mode:s.ball.mode,kind:s.ball.kind,ownerId:s.ball.ownerId,x:Number(s.ball.x.toFixed(1)),y:Number(s.ball.y.toFixed(1))},
    focus:fp?{id:fp.id,x:Number(fp.x.toFixed(1)),y:Number(fp.y.toFixed(1)),action:fp.action,hasBall:fp.hasBall}:null,
    owner:owner?{id:owner.id,role:owner.role}:null,
    delta:{shots:s.stats.shots-startStats.shots,turnovers:s.stats.turnovers-startStats.turnovers,tacklesWon:s.stats.tacklesWon-startStats.tacklesWon,fouls:s.stats.fouls-startStats.fouls,passes:s.stats.passes-startStats.passes,carries:s.stats.carries-startStats.carries,goals:s.stats.goals-startStats.goals}
  };
}

function followUpChoices(session){
  const id=session.scenario.id;
  if(id==='ST_FINISH')return[
    {id:'SHOT',label:'슈팅',hint:'새로 열린 마무리 각도에서 슈팅'},
    {id:'CARRY',label:'한 번 더 운반',hint:'공간이 남아 있으면 한 번 더 전진'},
    {id:'PASS',label:'전진 패스',hint:'오른쪽 공격수에게 연결',targetId:'H-RW'}
  ];
  if(id==='CM_EDGE')return[
    {id:'LONG_SHOT',label:'슈팅',hint:'현재 위치에서 직접 마무리'},
    {id:'THROUGH',label:'침투 패스',hint:'ST 움직임으로 다시 연결',targetId:'H-ST'},
    {id:'CARRY',label:'추가 전진',hint:'공간이 남아 있으면 한 번 더 운반'}
  ];
  return[];
}
function maybeOpenFollowUp(session){
  if(session.pendingChoice||session.presentationStop)return null;
  const m=session.m,ctrl=m.userChoiceControl,fp=p(m,session.scenario.focusPlayerId);
  if(!ctrl||ctrl.playerId!==session.scenario.focusPlayerId||!fp||!fp.hasBall||m.ball.mode!=='CONTROLLED'||m.ball.ownerId!==fp.id)return null;
  const age=m.time-(session.lastChoiceAt??1800);
  if(age<0.62||(fp.lockTargetUntil||0)>m.time+0.03)return null;
  if(!['ST_FINISH','CM_EDGE'].includes(session.scenario.id))return null;
  // Current-state only: the user has completed the chosen carry and still owns the
  // ball in a dangerous forward zone. We now expose the NEXT decision; no future
  // branch is simulated to decide whether this window exists.
  const dangerous=fp.team==='HOME'?fp.x>=82.0:fp.x<=23.0;
  if(!dangerous)return null;
  const choices=followUpChoices(session);if(!choices.length)return null;
  session.pendingChoice={at:Number((m.time-1800).toFixed(2)),reason:'FOLLOW_UP_AFTER_CARRY',choices,futureOutcomePrecomputed:false};
  return session.pendingChoice;
}
function applyPendingChoice(session,choiceId){
  if(!session?.pendingChoice)return{ok:false,reason:'NO_PENDING_CHOICE'};
  const spec=session.pendingChoice.choices.find(c=>c.id===choiceId);if(!spec)return{ok:false,reason:'UNKNOWN_PENDING_CHOICE'};
  const applied=R.apply(session.m,{playerId:session.scenario.focusPlayerId,choice:spec.id,targetId:spec.targetId});
  if(applied.ok){session.chainChoices.push({at:Number((session.m.time-1800).toFixed(2)),choice:spec.id,targetId:spec.targetId||null,futureOutcomePrecomputed:false});session.lastChoiceAt=session.m.time;session.pendingChoice=null;session.presentationStop=null;}
  return applied;
}
function stepSession(session,dt=DT){
  if(!session||session.m.completed)return session?.m;
  E.step(session.m,dt);
  // Presentation-only chain termination. The match engine has created the restart,
  // but an IMPORTANT/DECISIVE player view does not need to watch a routine goal kick.
  if(!session.presentationStop&&session.m.restart?.kind==='GOAL_KICK')session.presentationStop={at:Number((session.m.time-1800).toFixed(2)),reason:'ROUTINE_GOAL_KICK',kind:'GOAL_KICK',futureOutcomePrecomputed:false};
  if(session.m.userChoiceControl){const fp=p(session.m,session.scenario.focusPlayerId);if(!fp?.hasBall||session.m.ball.ownerId!==fp.id)session.m.userChoiceControl=null;}
  maybeOpenFollowUp(session);
  return session.m;
}
function startChoice(id,choiceId,trial=0){
  const scenario=SCENARIOS[id];if(!scenario)throw new Error(`Unknown scenario ${id}`);
  const spec=scenario.choices.find(c=>c.id===choiceId);if(!spec)throw new Error(`Unknown choice ${choiceId}`);
  const m=createScenario(id,trial),startStats={...m.stats};
  const before=compactState(m,scenario,startStats),applied=R.apply(m,{playerId:scenario.focusPlayerId,choice:spec.id,targetId:spec.targetId});
  return{scenario,spec,m,startStats,before,applied,startEventIndex:m.events.length,chainChoices:[{at:0,choice:spec.id,targetId:spec.targetId||null,futureOutcomePrecomputed:false}],lastChoiceAt:m.time,pendingChoice:null,presentationStop:null};
}
function advanceSession(session,seconds){
  const target=1800+seconds;let guard=0;while(!session.m.completed&&session.m.time+1e-9<target&&guard++<200000)stepSession(session,DT);
  return compactState(session.m,session.scenario,session.startStats);
}
function runBranch(id,choiceId,trial=0){
  const session=startChoice(id,choiceId,trial),checkpoints={};
  for(const sec of CHECKPOINTS)checkpoints[sec]=advanceSession(session,sec);
  const snap=E.snapshot(session.m),events=snap.events.filter(e=>e.t>=1800).map(e=>({at:Number((e.t-1800).toFixed(2)),type:e.type,text:e.text}));
  return{version:VERSION,scenarioId:id,choice:choiceId,trial,before:session.before,applied:session.applied,checkpoints,events,pendingChoice:session.pendingChoice,presentationStop:session.presentationStop,chainChoices:session.chainChoices,futureOutcomePrecomputed:false,final:compactState(session.m,session.scenario,session.startStats)};
}
function outcomeClass(branch){
  const d=branch.final.delta,poss=branch.final.possession,team=SCENARIOS[branch.scenarioId].team;
  if(d.goals>0)return'GOAL';if(d.shots>0)return'SHOT';if(d.tacklesWon>0)return'TACKLE_WON';if(d.fouls>0)return'FOUL';if(d.turnovers>0&&poss===team)return'POSSESSION_WON';if(d.turnovers>0&&poss!==team)return'POSSESSION_LOST';if(poss===team)return'RETAINED';return'OPPONENT_POSSESSION';
}
function runDistribution(id,trials=48){
  const sc=SCENARIOS[id],rows={};for(const c of sc.choices)rows[c.id]={choice:c.id,outcomes:{},shots:0,turnovers:0,tacklesWon:0,fouls:0,retained:0,focusX:0,ballProgress:0};
  for(let t=0;t<trials;t++)for(const c of sc.choices){const b=runBranch(id,c.id,t),r=rows[c.id],oc=outcomeClass(b);r.outcomes[oc]=(r.outcomes[oc]||0)+1;r.shots+=b.final.delta.shots;r.turnovers+=b.final.delta.turnovers;r.tacklesWon+=b.final.delta.tacklesWon;r.fouls+=b.final.delta.fouls;r.retained+=b.final.possession===sc.team?1:0;r.focusX+=b.final.focus?.x||0;const bx=b.final.ball?.x??52.5;r.ballProgress+=sc.team==='HOME'?bx:(105-bx);}
  for(const r of Object.values(rows)){r.trials=trials;r.retainedRate=Number((r.retained/trials).toFixed(3));r.avgFocusX=Number((r.focusX/trials).toFixed(2));r.avgBallProgress5s=Number((r.ballProgress/trials).toFixed(2));delete r.retained;delete r.focusX;delete r.ballProgress;}
  return{scenarioId:id,trials,rows,futureOutcomePrecomputed:false,testOnlyBranchReplay:true};
}
function listScenarios(){return Object.values(SCENARIOS).map(s=>JSON.parse(JSON.stringify(s)));}
return{VERSION,SCENARIOS,listScenarios,createScenario,startChoice,stepSession,maybeOpenFollowUp,applyPendingChoice,advanceSession,runBranch,runDistribution,outcomeClass};
});
