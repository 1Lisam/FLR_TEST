(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_MATCH_CHOICE_TELEMETRY=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const VERSION='STEP37-CHOICE-TELEMETRY-0.2';
const LEVELS={ROUTINE:0,MEANINGFUL:1,IMPORTANT:2,DECISIVE:3};
const LEVEL_NAMES=['ROUTINE','MEANINGFUL','IMPORTANT','DECISIVE'];
const CHECKPOINTS=[1,3,5];
const MAX_DECISIONS=160,MAX_CHAINS=60,MAX_EVENTS=100;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function other(t){return t==='HOME'?'AWAY':'HOME';}
function blankTeam(){return{HOME:0,AWAY:0};}
function createState(opts={}){
  return{
    version:VERSION,
    futureOutcomePrecomputed:false,
    focusPlayerId:opts.focusPlayerId||'H-ST',
    focusThreshold:opts.focusThreshold||'IMPORTANT',
    decisions:[],chains:[],activeChain:null,linkedEvents:[],lastDecision:null,lastFocusDecision:null,lastWindowByPlayer:{},lastDisplayedChainAt:-999,
    counters:{
      rawDecisions:0,decisions:0,focusDecisions:0,focusVisibleDecisions:0,suppressedFocusWindows:0,defensiveWindows:0,chainsStarted:0,chainsCompleted:0,
      directReinvolvement:0,resultLinked:0,turnoverEnded:0,restartEnded:0,timeoutEnded:0,
      byImportance:{ROUTINE:0,MEANINGFUL:0,IMPORTANT:0,DECISIVE:0},
      byRole:{GK:0,FB:0,CB:0,CM:0,WF:0,ST:0},byAction:{},
      shotsByTeam:blankTeam(),outsideBoxShotsByTeam:blankTeam(),longShotsByTeam:blankTeam(),midfieldLongShotsByTeam:blankTeam(),
      tacklesByTeam:blankTeam(),foulsByTeam:blankTeam(),interceptionsByTeam:blankTeam(),
    }
  };
}
function configure(state,opts={}){
  if(!state)return;
  if(opts.focusPlayerId)state.focusPlayerId=opts.focusPlayerId;
  if(opts.focusThreshold&&LEVELS[opts.focusThreshold]!=null)state.focusThreshold=opts.focusThreshold;
}
function stateSummary(m,focusPlayerId){
  const p=m.playersById?.[focusPlayerId]||m.players?.find(x=>x.id===focusPlayerId)||null;
  return{
    capturedAt:Number(m.time.toFixed(3)),phase:m.phase||null,possession:m.possession||null,
    ball:{mode:m.ball?.mode||null,kind:m.ball?.kind||null,x:Number((m.ball?.x||0).toFixed(2)),y:Number((m.ball?.y||0).toFixed(2)),ownerId:m.ball?.ownerId||null},
    score:{HOME:m.score?.HOME||0,AWAY:m.score?.AWAY||0},
    focus:p?{id:p.id,x:Number(p.x.toFixed(2)),y:Number(p.y.toFixed(2)),hasBall:!!p.hasBall,action:p.action||null}:null
  };
}
function offensiveCandidates(ctx){
  const c=[];
  if(ctx.shot&&(ctx.shot.oneVOne||ctx.shot.inBox||ctx.shot.dGoal<=30))c.push('SHOT');
  if((ctx.space??0)>1.25)c.push('CARRY');
  if((ctx.passCount||0)>0)c.push('PASS');
  if(ctx.deliveryAvailable)c.push('CROSS');
  if(ctx.role==='GK'){c.length=0;c.push('SHORT_DISTRIBUTION','LONG_DISTRIBUTION');}
  if(!c.length)c.push('HOLD');
  return Array.from(new Set(c));
}
function classifyOffensive(ctx){
  const s=ctx.shot||{},x=ctx.localX||0,role=ctx.role;
  if(role==='GK')return'MEANINGFUL';
  if(s.oneVOne||(s.inBox&&s.dGoal<=11.5&&s.blockers===0))return'DECISIVE';
  if(s.inBox||((role==='ST'||role==='WF')&&x>=82&&s.dGoal<=24)||ctx.phase==='CHANCE')return'IMPORTANT';
  if(x>=66||ctx.phase==='FINAL_THIRD'||ctx.phase==='TRANSITION'||(ctx.pressure??99)<2.2)return'MEANINGFUL';
  return'ROUTINE';
}
function classifyDefensive(ctx){
  if(ctx.dangerBox||ctx.ownerLocalX>=86)return'DECISIVE';
  if(ctx.ownerLocalX>=74||ctx.distance<=1.05)return'IMPORTANT';
  return'MEANINGFUL';
}
function shouldOpenFocus(state,playerId,importance){
  return playerId===state.focusPlayerId&&LEVELS[importance]>=LEVELS[state.focusThreshold];
}
function pushLimited(arr,item,max){arr.push(item);if(arr.length>max)arr.splice(0,arr.length-max);}
function presentationGap(state,importance){
  // This is a display filter only. It never changes simulation or the decision record.
  // '내 플레이 전체' may open more often; '중요한 플레이' is intentionally sparse enough
  // to fit a short viewing session. Decisive windows always bypass the spacing gate.
  if(importance==='DECISIVE'){
    if(state.focusThreshold==='DECISIVE')return 45;
    if(state.focusThreshold==='IMPORTANT')return 90;
    return 35;
  }
  if(state.focusThreshold==='MEANINGFUL')return importance==='IMPORTANT'?55:85;
  if(state.focusThreshold==='IMPORTANT')return 210;
  return 0;
}
function presentationEligible(m,state,decision){
  const gap=presentationGap(state,decision.importance);
  return gap<=0||(m.time-(state.lastDisplayedChainAt??-999))>=gap;
}
function openOrExtendChain(m,state,decision){
  if(!shouldOpenFocus(state,decision.playerId,decision.importance))return;
  let ch=state.activeChain;
  const compatible=ch&&ch.team===decision.team&&(m.time-ch.lastMeaningfulAt)<=9.0&&!ch.endedAt;
  if(!compatible){
    if(!presentationEligible(m,state,decision)){state.counters.suppressedFocusWindows++;return;}
    if(ch&&!ch.endedAt)endChain(m,state,'REPLACED');
    ch={
      id:`PC-${String(state.counters.chainsStarted+1).padStart(4,'0')}`,focusPlayerId:state.focusPlayerId,team:decision.team,
      startTime:m.time,lastMeaningfulAt:m.time,importance:decision.importance,decisions:[],events:[],checkpoints:{},
      flags:{directReinvolvement:false,resultLinked:false,shot:false,goal:false,turnover:false,restart:false},
      startState:stateSummary(m,state.focusPlayerId),futureOutcomePrecomputed:false,endedAt:null,endReason:null,endState:null
    };
    state.counters.chainsStarted++;state.counters.focusVisibleDecisions++;state.lastDisplayedChainAt=m.time;state.activeChain=ch;
  }else if(ch.decisions.length){
    ch.flags.directReinvolvement=true;state.counters.directReinvolvement++;state.counters.focusVisibleDecisions++;
  }
  ch.lastMeaningfulAt=m.time;ch.decisions.push({decisionId:decision.id,at:decision.at,action:decision.action,importance:decision.importance});
  if(LEVELS[decision.importance]>LEVELS[ch.importance])ch.importance=decision.importance;
}
function isNewWindow(state,payload,importance,kind='ON_BALL'){
  const prev=state.lastWindowByPlayer[payload.playerId],now=payload.at??0;
  if(!prev)return true;
  if(payload.action==='SHOT'||importance==='DECISIVE'||kind!==prev.kind)return true;
  const dt=now-prev.at,dx=Math.abs((payload.localX??prev.x)-prev.x),dy=Math.abs((payload.localY??prev.y)-prev.y);
  if(payload.phase!==prev.phase||dt>=3.4||Math.hypot(dx,dy)>=4.0)return true;
  if(payload.action!==prev.action&&dt>=1.6)return true;
  return false;
}
function onDecision(m,payload){
  const state=m.telemetry;if(!state)return;
  state.counters.rawDecisions++;
  const importance=classifyOffensive(payload),candidates=offensiveCandidates(payload);
  const probe={...payload,at:Number(m.time.toFixed(3))};
  if(!isNewWindow(state,probe,importance,'ON_BALL'))return;
  state.lastWindowByPlayer[payload.playerId]={kind:'ON_BALL',at:probe.at,x:payload.localX,y:payload.localY,phase:payload.phase,action:payload.action};
  const d={
    id:`D-${String(state.counters.decisions+1).padStart(6,'0')}`,kind:'ON_BALL',at:Number(m.time.toFixed(3)),
    playerId:payload.playerId,name:payload.name,team:payload.team,role:payload.role,slot:payload.slot,
    phase:payload.phase,importance,candidates,action:payload.action,reason:payload.reason||null,
    context:{localX:payload.localX,localY:payload.localY,pressure:payload.pressure,held:payload.held,space:payload.space,passCount:payload.passCount,
      shot:payload.shot?{dGoal:payload.shot.dGoal,inBox:payload.shot.inBox,oneVOne:payload.shot.oneVOne,openWindow:payload.shot.openWindow,blockers:payload.shot.blockers}:null},
    futureOutcomePrecomputed:false
  };
  state.counters.decisions++;state.counters.byImportance[importance]++;state.counters.byRole[payload.role]=(state.counters.byRole[payload.role]||0)+1;state.counters.byAction[payload.action]=(state.counters.byAction[payload.action]||0)+1;
  if(payload.playerId===state.focusPlayerId){state.counters.focusDecisions++;state.lastFocusDecision=d;}
  state.lastDecision=d;pushLimited(state.decisions,d,MAX_DECISIONS);openOrExtendChain(m,state,d);
}
function onDefensiveDecision(m,payload){
  const state=m.telemetry;if(!state)return;
  state.counters.rawDecisions++;
  const importance=classifyDefensive(payload);
  state.lastWindowByPlayer[payload.playerId]={kind:'DEFENSIVE',at:Number(m.time.toFixed(3)),x:payload.ownerLocalX,y:0,phase:payload.phase,action:'CHALLENGE'};
  const d={
    id:`D-${String(state.counters.decisions+1).padStart(6,'0')}`,kind:'DEFENSIVE',at:Number(m.time.toFixed(3)),
    playerId:payload.playerId,name:payload.name,team:payload.team,role:payload.role,slot:payload.slot,
    phase:payload.phase,importance,candidates:['TACKLE','DELAY','BLOCK_LANE','MARK_RUNNER'],action:'CHALLENGE',reason:'ENGAGE_WINDOW',
    context:{distance:payload.distance,ownerId:payload.ownerId,ownerRole:payload.ownerRole,ownerLocalX:payload.ownerLocalX,dangerBox:payload.dangerBox,relativeSpeed:payload.relativeSpeed},
    futureOutcomePrecomputed:false
  };
  state.counters.decisions++;state.counters.defensiveWindows++;state.counters.byImportance[importance]++;state.counters.byRole[payload.role]=(state.counters.byRole[payload.role]||0)+1;state.counters.byAction.CHALLENGE=(state.counters.byAction.CHALLENGE||0)+1;
  if(payload.playerId===state.focusPlayerId){state.counters.focusDecisions++;state.lastFocusDecision=d;}
  state.lastDecision=d;pushLimited(state.decisions,d,MAX_DECISIONS);openOrExtendChain(m,state,d);
}
function onChallengeOutcome(m,payload){
  const state=m.telemetry;if(!state)return;
  if(payload.outcome==='TACKLE_WON')state.counters.tacklesByTeam[payload.team]++;
  if(payload.outcome==='FOUL')state.counters.foulsByTeam[payload.team]++;
}
function onInterception(m,payload){const state=m.telemetry;if(state)state.counters.interceptionsByTeam[payload.team]++;}
function onShot(m,payload){
  const state=m.telemetry;if(!state)return;
  state.counters.shotsByTeam[payload.team]++;
  if(!payload.inBox)state.counters.outsideBoxShotsByTeam[payload.team]++;
  if(!payload.inBox&&payload.dGoal>=18&&payload.dGoal<=30)state.counters.longShotsByTeam[payload.team]++;
  if(!payload.inBox&&payload.role==='CM')state.counters.midfieldLongShotsByTeam[payload.team]++;
  const ch=state.activeChain;if(ch&&ch.team===payload.team&&!ch.endedAt){ch.flags.shot=true;ch.flags.resultLinked=true;ch.lastMeaningfulAt=m.time;state.counters.resultLinked++;}
}
function onEvent(m,type,text){
  const state=m.telemetry;if(!state)return;
  const item={at:Number(m.time.toFixed(3)),type,text};pushLimited(state.linkedEvents,item,MAX_EVENTS);
  const ch=state.activeChain;if(!ch||ch.endedAt)return;
  if(['SHOT','GOAL','CORNER','FOUL','SAVE','BLOCK','TACKLE','INTERCEPT','CLEARANCE','CROSS_RECEIVE'].includes(type)){
    ch.events.push(item);ch.lastMeaningfulAt=m.time;
  }
  if(type==='GOAL'){ch.flags.goal=true;ch.flags.resultLinked=true;}
  if(['CORNER','FOUL'].includes(type)&&m.possession===ch.team)ch.flags.resultLinked=true;
}
function captureCheckpoints(m,state,ch){
  const elapsed=m.time-ch.startTime;
  for(const sec of CHECKPOINTS){
    if(!ch.checkpoints[sec]&&elapsed>=sec)ch.checkpoints[sec]=stateSummary(m,state.focusPlayerId);
  }
}
function endChain(m,state,reason){
  const ch=state.activeChain;if(!ch||ch.endedAt)return;
  ch.endedAt=Number(m.time.toFixed(3));ch.endReason=reason;ch.endState=stateSummary(m,state.focusPlayerId);
  if(reason==='TURNOVER'){ch.flags.turnover=true;state.counters.turnoverEnded++;}
  if(reason==='RESTART'){ch.flags.restart=true;state.counters.restartEnded++;}
  if(reason==='TIMEOUT')state.counters.timeoutEnded++;
  state.counters.chainsCompleted++;pushLimited(state.chains,ch,MAX_CHAINS);state.activeChain=null;
}
function tick(m){
  const state=m.telemetry;if(!state)return;
  const ch=state.activeChain;if(!ch)return;
  captureCheckpoints(m,state,ch);
  const elapsed=m.time-ch.startTime;
  if(m.completed){endChain(m,state,'FULL_TIME');return;}
  if(elapsed>0.35&&m.possession&&m.possession!==ch.team){endChain(m,state,'TURNOVER');return;}
  if(elapsed>0.35&&(m.ball?.mode==='DEAD'||m.restart)){endChain(m,state,'RESTART');return;}
  if(ch.flags.shot&&m.time-ch.lastMeaningfulAt>1.15){endChain(m,state,'SHOT_RESOLVED');return;}
  if(elapsed>=12.0||m.time-ch.lastMeaningfulAt>=6.0){endChain(m,state,'TIMEOUT');return;}
}
function currentPresentation(state,requestedSpeed,autoSlowdown=true){
  const req=Math.max(1,Number(requestedSpeed)||1),ch=state?.activeChain;
  const slow=!!(autoSlowdown&&ch&&LEVELS[ch.importance]>=LEVELS.MEANINGFUL&&req>2);
  return{requestedSpeed:req,effectiveSpeed:slow?2:req,autoSlowdownActive:slow,activeChainId:ch?.id||null};
}
function summary(state){
  if(!state)return null;
  const c=state.counters,ch=state.activeChain,last=state.lastFocusDecision;
  return{
    version:state.version,futureOutcomePrecomputed:state.futureOutcomePrecomputed,focusPlayerId:state.focusPlayerId,focusThreshold:state.focusThreshold,
    rawDecisions:c.rawDecisions,totalDecisions:c.decisions,focusDecisions:c.focusDecisions,focusVisibleDecisions:c.focusVisibleDecisions,suppressedFocusWindows:c.suppressedFocusWindows,chainsStarted:c.chainsStarted,chainsCompleted:c.chainsCompleted,
    directReinvolvement:c.directReinvolvement,resultLinked:c.resultLinked,activeChain:ch?{id:ch.id,importance:ch.importance,startTime:ch.startTime,decisions:ch.decisions.length,flags:{...ch.flags}}:null,
    lastFocusDecision:last?{id:last.id,kind:last.kind,at:last.at,role:last.role,importance:last.importance,candidates:[...last.candidates],action:last.action,reason:last.reason,context:last.context}:null,
    byImportance:{...c.byImportance},byRole:{...c.byRole},byAction:{...c.byAction},
    shotsByTeam:{...c.shotsByTeam},outsideBoxShotsByTeam:{...c.outsideBoxShotsByTeam},longShotsByTeam:{...c.longShotsByTeam},midfieldLongShotsByTeam:{...c.midfieldLongShotsByTeam},
    tacklesByTeam:{...c.tacklesByTeam},foulsByTeam:{...c.foulsByTeam},interceptionsByTeam:{...c.interceptionsByTeam}
  };
}
return{VERSION,LEVELS,createState,configure,onDecision,onDefensiveDecision,onChallengeOutcome,onInterception,onShot,onEvent,tick,currentPresentation,summary};
});
