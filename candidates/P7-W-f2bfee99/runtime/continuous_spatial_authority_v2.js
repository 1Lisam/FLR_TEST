(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FLRPG_CONTINUOUS_SPATIAL_AUTHORITY_V2=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

// Step 1 is observation infrastructure only.  This module deliberately owns no
// mutable match state and never resolves a write conflict on the game's behalf.
const SCHEMA_VERSION='CONTINUOUS_SPATIAL_AUTHORITY_V2_OBSERVATION_1.0';
const TRACE_VERSION='CONTINUOUS_SPATIAL_AUTHORITY_V2_ROOT_TRACE_1.0';
const FEATURE_FLAG='continuousSpatialAuthorityV2Trace';
const COARSE_FEATURE_FLAG='continuousSpatialAuthorityV2Coarse';
const DEFAULT_LIMITS={events:6000,conflicts:800,movementNullIntervals:400,lineage:500,changeSamples:96,spatialSamples:2000};
const registry=new Map();
const tacticsRuntime=()=>((typeof globalThis!=='undefined'&&globalThis.FLRPG_TACTICS)||(typeof require==='function'?require('./tactical_movement.js'):null));
const coreRuntime=()=>((typeof globalThis!=='undefined'&&globalThis.FLRPG_CONTINUOUS_CORE)||(typeof require==='function'?require('./continuous_match_core.js'):null));
let observerSequence=0;

const deep=v=>v==null?v:JSON.parse(JSON.stringify(v));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,fallback=null)=>Number.isFinite(Number(v))?Number(v):fallback;
const rounded=v=>Number.isFinite(Number(v))?Number(Number(v).toFixed(6)):null;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function enabled(opts){return opts?.[FEATURE_FLAG]===true||opts?.[FEATURE_FLAG]?.enabled===true;}
function coarseEnabled(opts){return opts?.[COARSE_FEATURE_FLAG]===true||opts?.[COARSE_FEATURE_FLAG]?.enabled===true;}
function boundedPush(list,value,limit){list.push(value);if(list.length>limit)list.splice(0,list.length-limit);}
function playerTeam(p){return p?.team||(String(p?.id||'').startsWith('H-')?'HOME':String(p?.id||'').startsWith('A-')?'AWAY':null);}
function playerRole(p){if(p?.role)return p.role;const slot=String(p?.id||'').split('-').slice(1).join('-');return{GK:'GK',LB:'FB',LCB:'CB',RCB:'CB',RB:'FB',LCM:'CM',CM:'CM',RCM:'CM',LW:'WF',ST:'ST',RW:'WF'}[slot]||null;}

function sourceKind(source){
  if(source?.state?.spatial&&Array.isArray(source.state.spatial.players))return'HYBRID_SESSION';
  if(source?.spatial&&Array.isArray(source.spatial.players))return'HYBRID_STATE';
  if(source?.m?.players&&source.m?.ball)return'CONTROLLER';
  if(Array.isArray(source?.players)&&source?.ball)return'CORE';
  return'UNKNOWN';
}
function canonicalPlayer(p,writerProvenance={}){
  const id=p?.id||null,actualWriter=writerProvenance[`players.${id}.actual`]||null,targetWriter=writerProvenance[`players.${id}.target`]||null;
  return{id,team:playerTeam(p),role:playerRole(p),slot:p?.slot||String(id||'').split('-').slice(1).join('-')||null,
    actual:{x:rounded(p?.x),y:rounded(p?.y),vx:rounded(p?.vx||0),vy:rounded(p?.vy||0),bodyAngle:rounded(p?.bodyAngle),writer:actualWriter},
    proposed:{tx:rounded(p?.proposedTx??p?.tx),ty:rounded(p?.proposedTy??p?.ty),facing:rounded(p?.proposedFacing??p?.faceTargetAngle),writer:p?.proposalWriter||null},
    final:{tx:rounded(p?.finalMovementIntent?.targetPoint?.x??p?.tx),ty:rounded(p?.finalMovementIntent?.targetPoint?.y??p?.ty),facing:rounded(p?.faceTargetAngle),writer:p?.finalMovementIntent?.writer||targetWriter,stepId:p?.finalMovementIntent?.stepId||null},
    intent:{type:p?.intent?.type||p?.tacticalTask||p?.action||null,targetId:p?.intent?.targetId||p?.targetId||p?.markTargetId||null,targetPoint:p?.intent?.targetPoint?deep(p.intent.targetPoint):(Number.isFinite(p?.tx)&&Number.isFinite(p?.ty)?{x:rounded(p.tx),y:rounded(p.ty)}:null),reasonCode:p?.intent?.reasonCode||p?.responsibilityReason||null,source:p?.intent?.source||null,epoch:finite(p?.intent?.epoch??p?.responsibilityEpoch),createdAt:finite(p?.intent?.createdAt),expiresAt:finite(p?.intent?.expiresAt??p?.lockTargetUntil),stationaryAllowed:p?.intent?.stationaryAllowed===true},
    responsibility:{type:p?.responsibility?.type||p?.responsibilityType||null,targetId:p?.responsibility?.targetId||p?.responsibilityTargetId||p?.markTargetId||null,zone:p?.responsibility?.zone||null,goalSideReference:p?.responsibility?.goalSideReference||null,distanceBand:p?.responsibility?.distanceBand||null,lineConnectivity:p?.responsibility?.lineConnectivity?deep(p.responsibility.lineConnectivity):null,epoch:finite(p?.responsibility?.epoch??p?.responsibilityEpoch),reasonCode:p?.responsibility?.reasonCode||p?.responsibilityReason||null},
    action:{type:p?.action||null,tacticalTask:p?.tacticalTask||null,targetId:p?.targetId||p?.markTargetId||null,provenance:p?.actionProvenance||null},
    cooldowns:{nextThink:finite(p?.nextThink),lockTargetUntil:finite(p?.lockTargetUntil),nextChallengeAt:finite(p?.nextChallengeAt),runUntil:finite(p?.runUntil)},contact:p?.contactState?deep(p.contactState):null};
}
function canonicalBall(ball,writer=null){
  ball=ball||{};return{x:rounded(ball.x),y:rounded(ball.y),z:rounded(ball.z),vx:rounded(ball.vx||0),vy:rounded(ball.vy||0),vz:rounded(ball.vz||0),mode:ball.mode||null,kind:ball.kind||null,ownerId:ball.ownerId||null,intendedReceiverId:ball.intendedReceiverId||null,lastTouchTeam:ball.lastTouchTeam||null,lastTouchPlayerId:ball.lastTouchPlayerId||ball.lastTouchPlayer||null,flight:ball.flight?deep(ball.flight):(ball.mode==='FLIGHT'?{originX:finite(ball.originX),originY:finite(ball.originY),targetX:finite(ball.targetX),targetY:finite(ball.targetY),age:finite(ball.age)}:null),velocityProvenance:ball.velocityProvenance||writer,outcomePending:ball.outcomePending??null,writer};
}
function createCanonicalObservation(source,meta={}){
  const kind=sourceKind(source),session=kind==='HYBRID_SESSION'?source:null,state=kind==='HYBRID_SESSION'?source.state:kind==='HYBRID_STATE'?source:null,controller=kind==='CONTROLLER'?source:null,core=kind==='CONTROLLER'?source.m:kind==='CORE'?source:null;
  const sp=state?.spatial||null,players=sp?.players||core?.players||[],physicalBall=sp?.ball||core?.ball||{},abstractBall=state?.ball||null,time=finite(meta.time??state?.second??core?.time,0),phase=state?.phase||(core?.completed?'FULL_TIME':core?.setPieceLive?'SET_PIECE_LIVE':core?.phase)||null,score=deep(state?.score||core?.score||{HOME:0,AWAY:0}),possessionTeam=state?.possession||core?.possession||abstractBall?.team||null;
  const matchId=meta.matchId||session?._continuousSpatialAuthorityV2MatchId||core?._continuousSpatialAuthorityV2MatchId||null;
  const revision=meta.revision||sp?.stateId||(core?`CORE@${rounded(time)}`:null),parentRevision=meta.parentRevision||sp?.parentStateId||null,resolutionMode=meta.resolutionMode||(sp?'COARSE_LEGACY':'HIGH_RES_LEGACY');
  const provenance=meta.writerProvenance||{};
  const observed={schemaVersion:SCHEMA_VERSION,observationOnly:true,matchId,revision,parentRevision,resolutionMode,time:rounded(time),phase,score,
    rng:deep(meta.rng||null),players:players.map(p=>canonicalPlayer(p,provenance)),ball:canonicalBall(physicalBall,provenance.ball||null),
    possession:{team:possessionTeam,ownerId:physicalBall?.ownerId||abstractBall?.ownerId||core?.ballOwner||null,since:finite(core?.stats?.currentPossessionStartedAt),lastTouchTeam:core?.lastTouchTeam||physicalBall?.lastTouchTeam||null,lastTouchPlayerId:core?.lastTouchPlayer||physicalBall?.lastTouchPlayer||null,writer:provenance.possession||null},
    ballTruths:{abstract:abstractBall?{team:abstractBall.team||possessionTeam,lane:abstractBall.lane||null,progress:finite(abstractBall.progress),ownerId:abstractBall.ownerId||null,writer:provenance.abstractBall||null}:null,spatial:sp?canonicalBall(sp.ball,provenance.spatialBall||null):null,core:core?canonicalBall(core.ball,provenance.coreBall||null):null},
    challenge:core?.lastChallenge?deep(core.lastChallenge):null,duel:core?.activeDuel?deep(core.activeDuel):null,contact:core?.contactState?deep(core.contactState):null,
    clockProvenance:{writer:provenance.clock||null},scoreProvenance:{writer:provenance.score||null},phaseProvenance:{writer:provenance.phase||null},
    replayFreeze:{coarseHistoryLength:session?.coarseHistory?.length??null,controllerHistoryLength:controller?.history?.length??null,pendingChoice:controller?.pending?{id:controller.pending.id,at:controller.pending.at,episodeId:controller.pending.episodeId||null,futureOutcomePrecomputed:controller.pending.futureOutcomePrecomputed===true}:null,boundaryId:session?.boundary?.id||sp?.boundaryId||null,resumeCount:finite(session?.resumeCount),lineage:deep(meta.lineage||null)},
    restart:core?.restart?deep(core.restart):null,setPieceLive:core?.setPieceLive?deep(core.setPieceLive):null,movementIntentArbiter:deep(core?.movementIntentArbiter||sp?.movementIntentArbiter||null),teamReferences:state?.structure?deep(state.structure):(core?.tactical?deep(core.tactical):null)};
  return observed;
}

const FIELD_GROUPS={
  player_actual:['actual.x','actual.y','actual.vx','actual.vy','actual.bodyAngle'],
  player_targets:['proposed.tx','proposed.ty','proposed.facing','final.tx','final.ty','final.facing'],
  intent_responsibility:['intent','responsibility','action'],
  ball_physical:['ball'],ball_spatial:['ballTruths.spatial'],ball_abstract:['ballTruths.abstract'],possession:['possession'],
  clock_phase_score:['time','phase','score'],challenge_duel_contact:['challenge','duel','contact'],replay_freeze:['replayFreeze'],team_references:['teamReferences']
};
function getPath(value,path){return path.split('.').reduce((v,k)=>v==null?undefined:v[k],value);}
function collectChanges(before,after,families){
  const out=[],requested=families?.length?families:Object.keys(FIELD_GROUPS),seen=new Set();
  for(const family of requested){
    const paths=FIELD_GROUPS[family]||[];
    if(family==='player_actual'||family==='player_targets'||family==='intent_responsibility'){
      const bp=Object.fromEntries((before.players||[]).map(p=>[p.id,p])),ap=Object.fromEntries((after.players||[]).map(p=>[p.id,p]));
      for(const id of new Set([...Object.keys(bp),...Object.keys(ap)]))for(const path of paths){const a=getPath(bp[id],path),b=getPath(ap[id],path),key=`players.${id}.${path}`;if(!same(a,b)&&!seen.has(key)){seen.add(key);out.push({family,key,before:deep(a??null),after:deep(b??null)});}}
    }else for(const path of paths){const a=getPath(before,path),b=getPath(after,path),key=path;if(!same(a,b)&&!seen.has(key)){seen.add(key);out.push({family,key,before:deep(a??null),after:deep(b??null)});}}
  }
  return out;
}
function ownershipKey(change){
  if(change.family==='player_actual')return change.key.replace(/\.actual\.(x|y|vx|vy|bodyAngle)$/,'.actual');
  if(change.family==='player_targets'||change.family==='intent_responsibility')return change.key.replace(/\.(proposed|final|intent|responsibility|action).*$/,'.target');
  if(change.family.startsWith('ball_')||change.family==='possession')return'ball_or_possession';
  if(change.family==='clock_phase_score')return change.key==='score'?'score':change.key==='phase'?'phase':'clock';
  return change.key;
}

function createObserver(opts={}){
  const limits={...DEFAULT_LIMITS,...(opts.limits||{})},seed=String(opts.seed||'unknown'),matchId=String(opts.matchId||`V44-${seed}-${++observerSequence}`),traceId=String(opts.traceId||`${matchId}-TRACE`);
  const state={traceVersion:TRACE_VERSION,schemaVersion:SCHEMA_VERSION,observationOnly:true,traceId,matchId,seed,enabled:true,createdAt:opts.createdAt||null,events:[],conflicts:[],violations:[],lineage:[],rngDomains:{},writerCounts:{},writerFields:{},latestWriter:{},movementNullIntervals:[],spatialSamples:[],samples:0,truncated:{events:0,conflicts:0,movementNullIntervals:0,spatialSamples:0},currentEpoch:null,epochSequence:0,lastSample:null,nullTrack:{},rootCoverage:{hybrid:false,core:false,promotion:false,handback:false,replayHistory:false,choiceFreeze:false,choiceApply:false}};
  const observer={
    traceId,matchId,
    capture(source,meta={}){return createCanonicalObservation(source,{...meta,matchId,writerProvenance:state.latestWriter});},
    beginEpoch(label,meta={}){state.currentEpoch={id:String(meta.id||`${label}:${++state.epochSequence}`),label,meta:deep(meta),writers:{}};return state.currentEpoch.id;},
    endEpoch(){const id=state.currentEpoch?.id||null;state.currentEpoch=null;return id;},
    observeMutation({writer,before,after,families,epoch,meta={}}){
      if(!writer||!before||!after)return null;const a=after.schemaVersion===SCHEMA_VERSION?after:observer.capture(after),b=before.schemaVersion===SCHEMA_VERSION?before:observer.capture(before),changes=collectChanges(b,a,families);if(!changes.length)return null;
      const epochId=String(epoch||state.currentEpoch?.id||`${a.resolutionMode}:${a.time}`),event={sequence:state.events.length+state.truncated.events+1,epoch:epochId,time:a.time,resolutionMode:a.resolutionMode,writer,meta:deep(meta),changeCount:changes.length,changes:changes.slice(0,limits.changeSamples)};
      if(changes.length>limits.changeSamples)event.omittedChanges=changes.length-limits.changeSamples;
      state.writerCounts[writer]=(state.writerCounts[writer]||0)+1;const fields=state.writerFields[writer]||(state.writerFields[writer]={});
      for(const change of changes){fields[change.family]=(fields[change.family]||0)+1;const ownerKey=ownershipKey(change),prior=state.currentEpoch?.writers?.[ownerKey];if(prior&&prior.writer!==writer&&!same(prior.value,change.after)){const conflict={epoch:epochId,time:a.time,resolutionMode:a.resolutionMode,key:ownerKey,firstWriter:prior.writer,secondWriter:writer,firstValue:deep(prior.value),secondValue:deep(change.after),classification:'DUPLICATE_CONFLICT_DETECTED_NOT_RESOLVED'};if(state.conflicts.length>=limits.conflicts)state.truncated.conflicts++;boundedPush(state.conflicts,conflict,limits.conflicts);}if(state.currentEpoch)state.currentEpoch.writers[ownerKey]={writer,value:deep(change.after)};
        if(change.family==='player_actual'){const id=change.key.split('.')[1];state.latestWriter[`players.${id}.actual`]=writer;}else if(change.family==='player_targets'||change.family==='intent_responsibility'){const id=change.key.split('.')[1];state.latestWriter[`players.${id}.target`]=writer;}else if(change.family==='ball_abstract')state.latestWriter.abstractBall=writer;else if(change.family==='ball_spatial')state.latestWriter.spatialBall=writer;else if(change.family==='ball_physical')state.latestWriter.coreBall=writer;else if(change.family==='possession')state.latestWriter.possession=writer;else if(change.family==='clock_phase_score'){if(change.key==='score')state.latestWriter.score=writer;else if(change.key==='phase')state.latestWriter.phase=writer;else state.latestWriter.clock=writer;}}
      if(String(a.resolutionMode).startsWith('COARSE'))state.rootCoverage.hybrid=true;if(a.resolutionMode==='HIGH_RES_LEGACY')state.rootCoverage.core=true;
      if(state.events.length>=limits.events)state.truncated.events++;boundedPush(state.events,event,limits.events);observer.checkBallTruths(a,writer,epochId);return event;
    },
    checkBallTruths(observation,writer=null,epoch=null){const a=observation?.ballTruths?.abstract,s=observation?.ballTruths?.spatial,c=observation?.ballTruths?.core;const physical=s||c;if(a&&physical&&a.ownerId!==physical.ownerId){const signature=`${observation.time}|${a.ownerId}|${physical.ownerId}`;if(state._lastBallConflict!==signature){state._lastBallConflict=signature;boundedPush(state.violations,{kind:'BALL_TRUTH_OWNER_CONFLICT',epoch,time:observation.time,abstractOwnerId:a.ownerId,physicalOwnerId:physical.ownerId,observedBy:writer,classification:'DETECTED_NOT_RESOLVED'},limits.conflicts);}}},
    recordRng(row){if(!row?.domain)return;const id=String(row.domain),d=state.rngDomains[id]||(state.rngDomains[id]={domain:id,algorithm:row.algorithm||'unknown',source:row.source||null,identity:row.identity||null,serializableStateAvailable:row.state!=null,firstState:row.beforeState??row.state??null,lastState:row.state??null,drawCount:0,firstValue:row.value??null,lastValue:null});d.algorithm=row.algorithm||d.algorithm;d.source=row.source||d.source;d.identity=row.identity||d.identity;d.serializableStateAvailable=d.serializableStateAvailable||row.state!=null;d.lastState=row.state??d.lastState;d.drawCount=Math.max(d.drawCount,finite(row.drawCount,d.drawCount+1));d.lastValue=row.value??d.lastValue;if(row.gap)d.gap=row.gap;},
    recordLineage(row){if(!row)return;boundedPush(state.lineage,{...deep(row),sequence:state.lineage.length+1},limits.lineage);if(row.kind==='HISTORY_APPEND')state.rootCoverage.replayHistory=true;if(row.kind==='CHOICE_FREEZE')state.rootCoverage.choiceFreeze=true;if(row.kind==='CHOICE_APPLY')state.rootCoverage.choiceApply=true;},
    recordHandoff({kind,writer,before,after,meta={}}){const b=before?.schemaVersion===SCHEMA_VERSION?before:observer.capture(before,{resolutionMode:kind==='PROMOTION'?'COARSE_LEGACY':'HIGH_RES_LEGACY'}),a=after?.schemaVersion===SCHEMA_VERSION?after:observer.capture(after,{resolutionMode:kind==='PROMOTION'?'HIGH_RES_LEGACY':'COARSE_LEGACY'});observer.beginEpoch(`${kind}:${meta.boundaryId||a.time}`,{id:`${kind}:${meta.boundaryId||a.time}`,kind});const ev=observer.observeMutation({writer,before:b,after:a,families:['player_actual','player_targets','intent_responsibility','ball_physical','ball_spatial','ball_abstract','possession','clock_phase_score','challenge_duel_contact','replay_freeze'],meta:{...meta,handoff:kind}});observer.endEpoch();state.rootCoverage[kind==='PROMOTION'?'promotion':'handback']=true;observer.recordLineage({kind,writer,at:a.time,boundaryId:meta.boundaryId||null,sourceRevision:b.revision,targetRevision:a.revision,sourceMode:b.resolutionMode,targetMode:a.resolutionMode});return ev;},
    sample(source,meta={}){const now=observer.capture(source,meta),prior=state.lastSample;state.samples++;if(String(now.resolutionMode).startsWith('COARSE')){const row={time:now.time,resolutionMode:now.resolutionMode,phase:now.phase,possession:deep(now.possession),ball:deep(now.ball),ballTruths:deep(now.ballTruths),players:now.players.map(p=>({id:p.id,team:p.team,role:p.role,slot:p.slot,actual:deep(p.actual),final:deep(p.final),intent:deep(p.intent),responsibility:deep(p.responsibility)}))};if(state.spatialSamples.length>=limits.spatialSamples)state.truncated.spatialSamples++;boundedPush(state.spatialSamples,row,limits.spatialSamples);}if(prior&&Number.isFinite(now.time)&&now.time>prior.time){const dt=now.time-prior.time,priorBy=Object.fromEntries(prior.players.map(p=>[p.id,p]));for(const p of now.players){const q=priorBy[p.id];if(!q)continue;const displacement=Math.hypot((p.actual.x??0)-(q.actual.x??0),(p.actual.y??0)-(q.actual.y??0)),speed=Math.hypot(p.actual.vx||0,p.actual.vy||0),key=p.id,track=state.nullTrack[key];if(displacement<=0.015&&speed<=0.04){const t=track||(state.nullTrack[key]={start:prior.time,last:now.time,role:p.role,slot:p.slot,stimuli:new Set(),reason:p.intent.reasonCode||null,stationaryAllowed:p.intent.stationaryAllowed===true});t.last=now.time;if(now.phase!==prior.phase)t.stimuli.add('phase');if(now.possession.ownerId!==prior.possession.ownerId)t.stimuli.add('owner');if(!same(now.ballTruths,prior.ballTruths))t.stimuli.add('ball');if(!same(p.responsibility,q.responsibility))t.stimuli.add('responsibility');}else if(track){const duration=prior.time-track.start;if(duration>=1){const row={playerId:key,role:track.role,slot:track.slot,start:track.start,end:prior.time,duration:rounded(duration),stimuli:[...track.stimuli],stationaryAllowed:track.stationaryAllowed,reasonCode:track.reason||null,resolutionMode:prior.resolutionMode};if(state.movementNullIntervals.length>=limits.movementNullIntervals)state.truncated.movementNullIntervals++;boundedPush(state.movementNullIntervals,row,limits.movementNullIntervals);}delete state.nullTrack[key];}}
      }state.lastSample=now;return now;},
    flushMovementNull(at=null){const end=finite(at,state.lastSample?.time);for(const [key,track] of Object.entries(state.nullTrack)){const duration=end-track.start;if(duration>=1)boundedPush(state.movementNullIntervals,{playerId:key,role:track.role,slot:track.slot,start:track.start,end,duration:rounded(duration),stimuli:[...track.stimuli],stationaryAllowed:track.stationaryAllowed,reasonCode:track.reason||null,resolutionMode:state.lastSample?.resolutionMode||null},limits.movementNullIntervals);}state.nullTrack={};},
    summary(){const rngDomains=Object.values(state.rngDomains).map(deep),duplicateRngDomains=rngDomains.length>1,raw={...state,rngDomains,duplicateRngDomains,rngDomainFinding:duplicateRngDomains?'DUPLICATE_HYBRID_CORE_RNG_DOMAINS_CONFIRMED':'SINGLE_OR_UNOBSERVED_RNG_DOMAIN'};delete raw._lastBallConflict;delete raw.lastSample;delete raw.nullTrack;return deep(raw);},
    canonical(source,meta={}){return observer.capture(source,meta);}
  };
  registry.set(traceId,observer);while(registry.size>16)registry.delete(registry.keys().next().value);return observer;
}
function getObserver(traceId){return traceId?registry.get(String(traceId))||null:null;}
function observerForBoundary(boundary,opts={}){if(opts.authorityV2Observer)return opts.authorityV2Observer;const traceId=boundary?.stateSnapshot?.authorityV2Trace?.traceId||boundary?.authorityV2Trace?.traceId;return getObserver(traceId);}
function attachBoundary(observer,boundary){if(!observer||!boundary)return boundary;boundary.stateSnapshot=boundary.stateSnapshot||{};boundary.stateSnapshot.authorityV2Trace={schemaVersion:TRACE_VERSION,traceId:observer.traceId,matchId:observer.matchId,observationOnly:true,featureFlag:FEATURE_FLAG};return boundary;}

// Step 2 coarse authority.  Formation and role values are inputs to an intent
// proposal only.  They never write player actual coordinates after kickoff.
const COARSE_SCHEMA_VERSION='CONTINUOUS_SPATIAL_AUTHORITY_V2_COARSE_1.0';
const COARSE_SLOTS=['GK','LB','LCB','RCB','RB','LCM','CM','RCM','LW','ST','RW'];
const COARSE_ROLE={GK:'GK',LB:'FB',LCB:'CB',RCB:'CB',RB:'FB',LCM:'CM',CM:'CM',RCM:'CM',LW:'WF',ST:'ST',RW:'WF'};
const COARSE_SLOT_Y={GK:34,LB:9,LCB:25,RCB:43,RB:59,LCM:20,CM:34,RCM:48,LW:8,ST:34,RW:60};
const COARSE_BASE_X={GK:6,FB:23,CB:21,CM:43,WF:61,ST:68};
function coarseSlot(id){return String(id||'').split('-').slice(1).join('-');}
function coarseTeam(id){return String(id||'').startsWith('H-')?'HOME':'AWAY';}
function coarseOther(team){return team==='HOME'?'AWAY':'HOME';}
function localPoint(team,x,y){return team==='HOME'?{x,y}:{x:105-x,y:68-y};}
function worldPoint(team,x,y){return team==='HOME'?{x,y}:{x:105-x,y:68-y};}
function idPhase(id){let h=2166136261>>>0;for(const ch of String(id)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0)/4294967296;}
function boundedHistory(list,row,limit=96){list.push(row);if(list.length>limit)list.splice(0,list.length-limit);}
function createInitialIntent(player){return{type:'REEVALUATE',targetId:null,targetPoint:{x:player.x,y:player.y},reasonCode:'MATCH_START_REEVALUATE',source:'CONTINUOUS_SPATIAL_AUTHORITY_V2',epoch:0,createdAt:0,expiresAt:0,stationaryAllowed:player.role==='GK',transitionCause:'MATCH_START'};}
function createCoarseSpatial(){
  const players=[];
  for(const team of['HOME','AWAY'])for(const slot of COARSE_SLOTS){
    const role=COARSE_ROLE[slot],baseX=COARSE_BASE_X[role],
      kickoffX=role==='WF'?47:role==='ST'?48:Math.min(baseX,48),
      w=worldPoint(team,kickoffX,COARSE_SLOT_Y[slot]);
    const p={id:`${team==='HOME'?'H':'A'}-${slot}`,team,slot,role,x:w.x,y:w.y,vx:0,vy:0,tx:w.x,ty:w.y,hasBall:false,controlledSince:-1,bodyAngle:team==='HOME'?0:Math.PI,faceTargetAngle:team==='HOME'?0:Math.PI,action:'MATCH_START_LIVE',tacticalTask:'MATCH_START_LIVE',markTargetId:null,responsibilityReason:'MATCH_START_LIVE',responsibilityEpoch:0,responsibilityOwnerId:null,responsibilityTargetId:null};
    // Do not give attackers a pre-drawn formation destination. The first live integrator
    // reevaluation derives movement from the current ball/opponent/responsibility state.
    p.intent=createInitialIntent(p);p.intent.expiresAt=0;p.intent.transitionCause='MATCH_START_LIVE';players.push(p);
  }
  const owner=players.find(p=>p.id==='H-CM');owner.x=owner.tx=50.4;owner.y=owner.ty=34;owner.hasBall=true;owner.controlledSince=0;
  const ball={mode:'CONTROLLED',kind:'CONTROL',x:owner.x,y:owner.y,z:0,vx:0,vy:0,vz:0,ownerId:owner.id,intendedReceiverId:null,lastTouchTeam:'HOME',lastTouchPlayerId:owner.id,team:'HOME',lane:'CENTER',progress:.48,causalHistory:[{at:0,kind:'KICKOFF_CONTROL',playerId:owner.id,team:'HOME',x:owner.x,y:owner.y}]};
  return{schemaVersion:COARSE_SCHEMA_VERSION,authorityMode:'V2_CONTINUOUS_COARSE',time:0,stateId:'CV2000000',parentStateId:null,boundaryId:null,players,ball,futureOutcomePrecomputed:false,intentSequence:0,stimulusRevision:0,touchSequence:1,writerStats:{actualIntegratorWrites:0,intentTransitions:0,roleTemplateActualWrites:0,roleTemplateTargetRematerializations:0,causalOwnerChanges:0,coordinateResets:0}};
}
function syncBallDerived(state){
  const sp=state.spatial,ball=sp.ball,owner=sp.players.find(p=>p.id===ball.ownerId)||null;
  for(const p of sp.players)p.hasBall=ball.mode==='CONTROLLED'&&p===owner;
  if(ball.mode==='CONTROLLED'&&owner){ball.team=owner.team;noteCoarseWidePossession(state,owner.team);state.possession=owner.team;tacticsRuntime()?.noteCentralSupportPossession(sp.commonSupportMemory,owner.team,sp.time);}
  else if(ball.lastTouchTeam)ball.team=ball.lastTouchTeam;
  const referenceTeam=ball.team||state.possession||'HOME',local=localPoint(referenceTeam,Number(ball.x)||0,Number(ball.y)||34);
  ball.progress=clamp(local.x/105,.02,.98);ball.lane=local.y<25?'LEFT':local.y>43?'RIGHT':'CENTER';state.ball=ball;
  state.zone=ball.progress<.28?'OWN_THIRD':ball.progress<.62?'MIDFIELD':ball.progress<.88?'FINAL_THIRD':'BOX';
  state.phase=Number(state._v2TransitionUntil||0)>Number(sp.time)?'TRANSITION':ball.progress<.32?'BUILD_UP':ball.progress<.62?'PROGRESSION':ball.progress<.82?'FINAL_THIRD':'CHANCE';
  return ball;
}
function activateCoarseState(state,at=0){
  const oldSpatial=state.spatial||{},oldAbstract=state.ball||{},sourcePlayers=Array.isArray(oldSpatial.players)?oldSpatial.players:[];
  if(oldSpatial.schemaVersion===COARSE_SCHEMA_VERSION){oldSpatial.wideTransitionMemory||={possession:null,epoch:0,vacancies:{HOME:{},AWAY:{}}};oldSpatial.commonSupportMemory||={schemaVersion:'COMMON_CENTRAL_SUPPORT_MEMORY_1',records:{},possession:null,epoch:0};state.ball=oldSpatial.ball;syncBallDerived(state);return oldSpatial;}
  const players=sourcePlayers.map(row=>{
    const slot=row.slot||coarseSlot(row.id),team=row.team||coarseTeam(row.id),role=row.role||COARSE_ROLE[slot]||'CM';
    const p={...row,team,slot,role,x:Number(row.x),y:Number(row.y),vx:Number(row.vx)||0,vy:Number(row.vy)||0,tx:Number.isFinite(row.tx)?Number(row.tx):Number(row.x),ty:Number.isFinite(row.ty)?Number(row.ty):Number(row.y),bodyAngle:Number.isFinite(row.bodyAngle)?row.bodyAngle:(team==='HOME'?0:Math.PI),faceTargetAngle:Number.isFinite(row.faceTargetAngle)?row.faceTargetAngle:(team==='HOME'?0:Math.PI)};
    p.intent=row.intent?deep(row.intent):createInitialIntent(p);p.intent.expiresAt=Math.min(Number(p.intent.expiresAt)||at,at);return p;
  });
  const physical=oldSpatial.ball||{},ball={...oldAbstract,...physical,z:Number(physical.z)||0,vz:Number(physical.vz)||0,kind:physical.kind||(physical.mode==='FLIGHT'?'PASS':'CONTROL'),intendedReceiverId:physical.intendedReceiverId||null,lastTouchTeam:physical.lastTouchTeam||state.possession||oldAbstract.team||null,lastTouchPlayerId:physical.lastTouchPlayerId||physical.lastTouchPlayer||physical.ownerId||null,causalHistory:deep(physical.causalHistory||[])};
  state.spatial={...oldSpatial,schemaVersion:COARSE_SCHEMA_VERSION,authorityMode:'V2_CONTINUOUS_COARSE',time:Number(oldSpatial.time??at),stateId:oldSpatial.stateId&&String(oldSpatial.stateId).startsWith('CV2')?oldSpatial.stateId:'CV2000000',parentStateId:oldSpatial.parentStateId||null,boundaryId:null,players,ball,futureOutcomePrecomputed:false,intentSequence:Number(oldSpatial.intentSequence)||0,stimulusRevision:Number(oldSpatial.stimulusRevision)||0,touchSequence:Number(oldSpatial.touchSequence)||0,writerStats:{actualIntegratorWrites:0,intentTransitions:0,roleTemplateActualWrites:0,roleTemplateTargetRematerializations:0,causalOwnerChanges:0,coordinateResets:0,...(oldSpatial.writerStats||{})}};
  state.spatial.wideTransitionMemory=oldSpatial.wideTransitionMemory||{possession:null,epoch:0,vacancies:{HOME:{},AWAY:{}}};state.spatial.commonSupportMemory=oldSpatial.commonSupportMemory||{schemaVersion:'COMMON_CENTRAL_SUPPORT_MEMORY_1',records:{},possession:null,epoch:0};state.ball=ball;syncBallDerived(state);return state.spatial;
}
function ballStimulus(state){const b=state.spatial.ball;return{ownerId:b.ownerId||null,x:Number(b.x)||0,y:Number(b.y)||0,mode:b.mode||null,possession:state.possession||null,phase:state.phase||null,revision:Number(state.spatial.stimulusRevision)||0};}
function stimulusChanged(a,b){return!a||a.ownerId!==b.ownerId||a.mode!==b.mode||a.possession!==b.possession||a.phase!==b.phase||a.revision!==b.revision||Math.hypot((a.x||0)-b.x,(a.y||0)-b.y)>3.25;}
function clampTargetFromCurrent(player,target,maxDistance=11,edgeRecovery=false){const dx=target.x-player.x,dy=target.y-player.y,d=Math.hypot(dx,dy),xmin=edgeRecovery?.8:3.5,xmax=edgeRecovery?104.2:101.5,ymin=edgeRecovery?.8:3.5,ymax=edgeRecovery?67.2:64.5;if(d<=maxDistance)return{x:clamp(target.x,xmin,xmax),y:clamp(target.y,ymin,ymax)};return{x:clamp(player.x+dx*maxDistance/d,xmin,xmax),y:clamp(player.y+dy*maxDistance/d,ymin,ymax)};}
function coarseDefensiveLineGuide(state,team,owner){
  // These are live carrier-relative connection points, not formation rails.  A
  // line is allowed to flex for PRESS/COVER/MARK; the guide only gives released
  // players a connected route back into the defensive block.
  const ball=state.spatial.ball,shape=state.structure?.[team]||{},carrier=owner||state.spatial.players.find(p=>p.id===ball.ownerId&&p.team!==team);
  // Releasing a pass does not move the recovery block to the centre spot.
  // Keep the actual releasing player as its flight reference; the existing
  // live-ball pull below still follows the flight. A loose ball uses itself.
  const source=ball.mode==='FLIGHT'?state.spatial.players.find(p=>p.id===(ball.lastTouchPlayerId||ball.lastTouchPlayer)&&p.team!==team):null;
  const reference=carrier||source||ball,local=localPoint(team,reference.x,reference.y),lineBias=clamp((Number(shape.lineHeight||50)-50)*.05,-2.5,2.5),transitionDebt=clamp(Number(shape.transitionDebt)||0,0,1),back=clamp(15.5+local.x*.215+lineBias-transitionDebt*2.4,12,39),mid=clamp(back+10.8+local.x*.035-transitionDebt*.8,24,53),front=clamp(mid+11.8+local.x*.025-transitionDebt*.7,38,68);
  return{schemaVersion:'LIVE_DEFENSIVE_LINE_CONNECTIVITY_1.0',source:'CURRENT_CARRIER_AND_TEAM_STATE',carrierId:carrier?.id||null,carrierLocal:{x:rounded(local.x),y:rounded(local.y)},transitionDebt:rounded(transitionDebt),anchors:{BACK:rounded(back),MID:rounded(mid),FRONT:rounded(front)},gaps:{backToMid:rounded(mid-back),midToFront:rounded(front-mid)},futureOutcomePrecomputed:false};
}
function coarseLoosePrimaryIds(state){
  const sp=state.spatial,b=sp.ball;if(b.mode!=='LOOSE')return[];
  return['HOME','AWAY'].map(team=>sp.players.filter(p=>p.team===team&&p.role!=='GK').sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y)||a.id.localeCompare(c.id))[0]?.id).filter(Boolean);
}
function coarseDefensivePlan(state,team){
  const sp=state.spatial,owner=sp.ball.mode==='CONTROLLED'?sp.players.find(p=>p.id===sp.ball.ownerId&&p.team!==team):null,field=sp.players.filter(p=>p.team===team&&p.role!=='GK'),marks=new Map(),contain=new Map(),T=tacticsRuntime(),view=coarseTacticalView(state);
  const point=owner||sp.ball;
  const ranked=field.map(p=>({p,d:Math.hypot(p.x-point.x,p.y-point.y)})).sort((a,b)=>a.d-b.d||a.p.id.localeCompare(b.p.id));
  const ol=localPoint(team,point.x,point.y),central=owner?.role==='ST'&&Math.abs(ol.y-34)<13&&ol.x<45,wide=Math.abs(ol.y-34)>14;
  // Use the same present-body pressure/cover preferences as detailed play.
  // A wide ball alone cannot summon a distant FB past the nearby defender.
  const preferred=owner?T.preferredDefenceRoles(view,team,owner,ol,field,ranked):null;
  let press=preferred?.press||null;
  // Keep an actual close engagement stable using the existing2.6m pressure
  // envelope and detailed play's0.70m meaningful approach advantage. A distant
  // nominal owner cannot reserve the job while a new body is able to arrive.
  if(preferred?.mode==='GENERIC'&&press){
    const live=field.filter(p=>p.intent?.type==='PRESS'&&p.intent.targetId===owner.id&&Number(p.intent.expiresAt)>Number(sp.time));
    if(live.length===1&&live[0].id!==press.id){const prior=live[0],d=Math.hypot(prior.x-owner.x,prior.y-owner.y),next=Math.hypot(press.x-owner.x,press.y-owner.y);if(d<=2.6&&next+.70>=d)press=prior;}
  }
  // A close presser already contests the pass. Only a *sustained* open outlet
  // warrants replacing that pressure; a one-frame free lane is normal football.
  // This memory observes elapsed current states and never predicts a pass.
  const watch=sp.wideOpenPassWatch||(sp.wideOpenPassWatch={HOME:null,AWAY:null});
  let wideGuard=null,exposedWinger=null;
  if(owner&&wide&&press?.role==='FB'){
    const core=(typeof globalThis!=='undefined'&&globalThis.FLRPG_CONTINUOUS_CORE)||(typeof require==='function'?require('./continuous_match_core.js'):null),bridge=core?.choiceActionBridge(),side=Math.sign(ol.y-34),local=p=>localPoint(team,p.x,p.y);
    const covers=(p,a)=>{const q=local(p),t=local(a);return q.x<=t.x+1.5&&Math.abs(q.y-t.y)<=8.5&&Math.hypot(p.x-a.x,p.y-a.y)<=16.5;};
    const exposed=bridge?.laneBlockers&&Math.hypot(press.x-owner.x,press.y-owner.y)>2?
      sp.players.filter(p=>p.team!==team&&p.role==='WF').find(a=>{
        const t=local(a),d=Math.hypot(owner.x-a.x,owner.y-a.y);
        if(Math.sign(t.y-34)!==side||Math.abs(t.y-34)<15||t.x<49||t.x>80||ol.x-t.x<8||d>31)return false;
        if(field.some(p=>p.id!==press.id&&covers(p,a)&&covers(p.finalMovementIntent?.targetPoint||p.intent?.targetPoint||p,a)))return false;
        return bridge.laneBlockers({players:sp.players},owner,a,team).length===0;
      }):null;
    if(exposed){
      const key=`${owner.id}>${exposed.id}:${press.id}`,prior=watch[team],now=Number(sp.time),firstAt=prior?.key===key&&now-prior.lastAt<=.75?prior.firstAt:now;
      watch[team]={key,firstAt,lastAt:now};
      if(now-firstAt>=3){wideGuard=press;exposedWinger=exposed;press=ranked.find(x=>x.p.id!==wideGuard.id)?.p||press;}
    }else watch[team]=null;
  }else watch[team]=null;
  const preferredCover=preferred?.cover;
  const cover=owner?(preferredCover&&preferredCover.id!==press?.id&&preferredCover.id!==wideGuard?.id?preferredCover:field.filter(p=>p.id!==press?.id&&p.id!==wideGuard?.id).map(p=>{const l=localPoint(team,p.x,p.y),lane=Math.abs(l.y-ol.y),goalSidePenalty=l.x>ol.x?7:0,roleBonus=central&&p.role==='CB'?-3:0;return{p,score:Math.hypot(p.x-point.x,p.y-point.y)+lane*.10+goalSidePenalty+roleBonus};}).sort((a,b)=>a.score-b.score||a.p.id.localeCompare(b.p.id))[0]?.p||null):null;
  const used=new Set([press?.id,cover?.id,wideGuard?.id,...coarseLoosePrimaryIds(state)].filter(Boolean));
  if(wideGuard)marks.set(wideGuard.id,exposedWinger.id);
  for(const threat of T.currentDefensiveThreats(view,team,owner).filter(t=>t.material&&t.kind!=='BALL')){
    const a=view.playersById[threat.id];let d=null;
    if(threat.kind==='WIDE'){
      const slot=threat.localY<34?'LB':'RB',fb=field.find(p=>p.slot===slot&&!used.has(p.id)),vacancy=T.activeTransitionWideVacancy(view,team,slot),handoff=vacancy&&field.find(p=>p.id===vacancy.handoffOwnerId&&!used.has(p.id));
      // A handoff ends on the existing actual FB arrival envelope, never a proposal.
      if(vacancy&&fb&&Math.hypot(fb.x-a.x,fb.y-a.y)<=8.5){T.endWideVacancy(view,team,slot,'FB_ACTUAL_TAKEOVER');d=fb;}else d=handoff||fb;
      if(!d&&sp.ball.mode==='LOOSE')d=field.filter(p=>!used.has(p.id)&&['CB','CM'].includes(p.role)).sort((x,y)=>(Math.hypot(x.x-a.x,x.y-a.y)+(x.role==='CB'?2.8:0))-(Math.hypot(y.x-a.x,y.y-a.y)+(y.role==='CB'?2.8:0))||x.id.localeCompare(y.id))[0];
    }else{const role=threat.kind==='CENTRAL'?'CB':'CM';d=field.filter(p=>p.role===role&&!used.has(p.id)).sort((x,y)=>Math.hypot(x.x-a.x,x.y-a.y)-Math.hypot(y.x-a.x,y.y-a.y)||x.id.localeCompare(y.id))[0];}
    if(!d)continue;marks.set(d.id,a.id);used.add(d.id);
    if(d.role==='FB'&&threat.kind==='WIDE'&&!T.fullbackWideUrgency(view,d,a))contain.set(d.id,T.fullbackWideZone(view,d,a));
  }
  return{owner,pressId:press?.id||null,coverId:cover?.id||null,marks,contain,lineGuide:coarseDefensiveLineGuide(state,team,owner)};
}
function coarseMarkBandPoint(team,player,target){
  const al=localPoint(team,target.x,target.y),pl=localPoint(team,player.x,player.y),band=player.role==='CB'?{min:1.4,ideal:2.0,max:3.0}:player.role==='FB'?{min:1.7,ideal:2.5,max:3.7}:{min:2.1,ideal:3.2,max:4.8},gx=-al.x,gy=34-al.y,gn=Math.hypot(gx,gy)||1,goalSide={x:al.x+gx/gn*band.ideal,y:al.y+gy/gn*band.ideal},laneWeight=player.role==='CB'?.78:player.role==='FB'?.68:.55,slotY=COARSE_SLOT_Y[player.slot]||34;
  const q={x:goalSide.x,y:goalSide.y*laneWeight+slotY*(1-laneWeight)},rx=goalSide.x-al.x,ry=q.y-al.y,rd=Math.hypot(rx,ry)||1,wanted=clamp(rd,band.min,band.max),local={x:al.x+rx/rd*wanted,y:al.y+ry/rd*wanted};
  return{targetPoint:worldPoint(team,local.x,local.y),distanceBand:band,goalSideReference:{x:team==='HOME'?0:105,y:34},laneReference:slotY};
}
function coarseManagerProfiles(state){
  const core=state._supportLease?.coreMatch;if(core?.managerProfiles)return core.managerProfiles;const M=(typeof globalThis!=='undefined'&&globalThis.FLRPG_MANAGER_TENDENCY_ADAPTER)||(typeof require==='function'?require('./manager_tendency_adapter.js'):null),ids=state._supportLease?.canonicalRoot?.opts?.managerProfiles||{},out={};for(const team of['HOME','AWAY'])out[team]=M?.PROFILES[ids[team]||'BALANCED'];return out;
}
function coarseTacticalView(state){
  const sp=state.spatial,core=state._supportLease?.coreMatch;return{time:Number(sp.time),players:sp.players,playersById:Object.fromEntries(sp.players.map(p=>[p.id,p])),ball:sp.ball,possession:state.possession,phase:state.phase,restart:core?.restart,setPieceLive:core?.setPieceLive,managerProfiles:coarseManagerProfiles(state),_defensiveResponsibility:core?._defensiveResponsibility,wideTransitionMemory:sp.wideTransitionMemory,_transitionWideVacancies:sp.wideTransitionMemory?.vacancies};
}
function noteCoarseWidePossession(state,team){tacticsRuntime()?.noteWidePossession(coarseTacticalView(state),team);}
function coarseCentralSupportInput(state){
  const lease=state._supportLease,core=lease?.coreMatch,sp=state.spatial,T=tacticsRuntime();
  let managerProfiles=core?.managerProfiles;
  if(!managerProfiles){const M=(typeof globalThis!=='undefined'&&globalThis.FLRPG_MANAGER_TENDENCY_ADAPTER)||(typeof require==='function'?require('./manager_tendency_adapter.js'):null),ids=lease?.canonicalRoot?.opts?.managerProfiles||{};managerProfiles={};for(const team of['HOME','AWAY']){const id=ids[team]||'BALANCED';if(!M?.PROFILES[id])throw new Error('W2_UNKNOWN_MANAGER_PROFILE:'+id);managerProfiles[team]=M.PROFILES[id];}}
  return T.captureCentralSupportInput({_resolutionLease:lease,commonSupportMemory:sp.commonSupportMemory,time:Number(sp.time),players:sp.players,ball:sp.ball,possession:state.possession,managerProfiles,playerAbilityProfiles:core?.playerAbilityProfiles,transitionUntil:state._v2TransitionUntil||0,transitionEvent:state._v2TransitionEvent||null,restart:core?.restart,setPieceLive:core?.setPieceLive,setPieceWallRecovery:core?.setPieceWallRecovery,attackingSetPieceRestDefence:core?.attackingSetPieceRestDefence,_tacticalRuntime:core?._tacticalRuntime,protagonistControllerId:core?.protagonistControllerId,userChoiceControl:core?.userChoiceControl,protagonistDeferredChoice:core?.protagonistDeferredChoice,activeDuel:core?.activeDuel},{pending:lease?.owner==='HIGH_RES'?lease.controller?.pending:null,loosePrimaryIds:coarseLoosePrimaryIds(state)});
}
function retireResolvedDeferredChoice(state){
  const core=state._supportLease?.coreMatch,deferred=core?.protagonistDeferredChoice;
  if(!deferred)return;
  const ball=state.spatial.ball,hero=state.spatial.players.find(p=>p.id===deferred.playerId),owner=state.spatial.players.find(p=>p.id===ball.ownerId);
  if(!hero)return;
  let current=true;
  if(deferred.kind==='DEFENDING')current=ball.mode==='CONTROLLED'&&!!owner&&owner.team!==hero.team&&Math.hypot(hero.x-owner.x,hero.y-owner.y)<=5.6;
  else if(deferred.kind==='ON_BALL')current=ball.mode==='CONTROLLED'&&ball.ownerId===hero.id;
  else if(deferred.kind==='INCOMING_BALL')current=ball.mode==='FLIGHT'&&ball.intendedReceiverId===hero.id;
  if(current)return;
  core.protagonistDeferredChoice=null;
  if(core.protagonistInteractiveEpisode?.deferredMeaningfulChoice&&core.protagonistInteractiveEpisode.playerId===hero.id)core.protagonistInteractiveEpisode=null;
}
function coarseCentralSupportPlan(state,forceRefresh=false){
  retireResolvedDeferredChoice(state);
  const T=tacticsRuntime(),input=coarseCentralSupportInput(state),plan=T.planCentralSupport(input),byId=new Map(plan.proposals.map(p=>[p.id,p])),now=Number(state.spatial.time),defensive=coarseDefensivePlan(state,state.possession==='HOME'?'AWAY':'HOME');
  for(const d of plan.decisions)if(d.kind==='PROTECTED'&&!['BALL_OWNER','CURRENT_RECEIVER','CURRENT_LOOSE_RESPONDER'].includes(d.reason)){const v=input.roles.byActor[d.id].currentConsumed;byId.set(d.id,{id:d.id,task:v.task,targetPoint:v.targetPoint,reason:d.reason,stationaryAllowed:true,protected:true});}
  const forward=new Map(),forwardDecisions=[];
  for(const p of state.spatial.players.filter(p=>p.team===state.possession&&p.role==='WF')){
    let actual=byId.get(p.id);
    if(!actual&&(forceRefresh||shouldReevaluate(state,p,now))){const proposal=proposalFor(state,p,now,null,defensive);forward.set(p.id,proposal);actual={task:proposal.type,targetPoint:proposal.targetPoint};}
    // An unexpired WF intent is the decision actually consumed this step; its
    // body alone must not stand in for the current target. No new RNG is used.
    const v=input.roles.byActor[p.id].currentConsumed;
    forwardDecisions.push({id:p.id,task:actual?.task||v.task,targetPoint:actual?.targetPoint||v.targetPoint,source:actual?'CURRENT_COARSE_FORWARD':'CURRENT_ACTIVE_FORWARD_INTENT'});
  }
  const wide=T.planWideSupport(input,plan,forwardDecisions);
  for(const p of wide.proposals)byId.set(p.id,p);
  for(const d of [...plan.decisions,...wide.decisions])if(d.kind==='PROTECTED'&&!['BALL_OWNER','CURRENT_RECEIVER','CURRENT_LOOSE_RESPONDER'].includes(d.reason)){const v=input.roles.byActor[d.id].currentConsumed;byId.set(d.id,{id:d.id,task:v.task,targetPoint:v.targetPoint,reason:d.reason,stationaryAllowed:true,protected:true});}
  return{input,plan:T.mergeSupportPlan(plan,wide),byId,defensive,forward};
}
function proposalFor(state,player,now,common=null,defensive=null){
  if(common?.protected)return{type:common.task,targetId:player.responsibilityTargetId||null,targetPoint:{...common.targetPoint},reasonCode:common.reason,source:'EXISTING_CURRENT_ACTION_AUTHORITY',stationaryAllowed:true,responsibility:deep(player.responsibility),expiresAt:now+2};
  const team=player.team,inPoss=state.possession===team,slot=player.slot,role=player.role,sp=state.spatial,ball=sp.ball,local=localPoint(team,player.x,player.y),bl=localPoint(team,ball.x,ball.y),shape=state.structure?.[team]||{width:50,lineHeight:50,transitionDebt:0};
  const width=clamp(Number(shape.width||50)/50,.76,1.24),lineBias=clamp((Number(shape.lineHeight||50)-50)*.05,-2.5,2.5),wave=Math.sin(now*.71+idPhase(player.id)*Math.PI*2),attackStep=role==='ST'?5.4:role==='WF'?4.8:role==='FB'?3.8:3.2;
  let tx=local.x,ty=local.y,type='LIVE_SPACE',reason='LIVE_SPACE_OCCUPATION',targetId=null,stationaryAllowed=false,responsibility=null;
  const primaryIds=coarseLoosePrimaryIds(state),looseChaser=sp.players.find(p=>p.team===team&&primaryIds.includes(p.id));
  if(player===looseChaser){
    // An unowned ball needs a physical recovery, not possession support shape.
    // One nearest outfielder per team contests it; the others keep their roles.
    tx=bl.x;ty=bl.y;type='RECOVER_LOOSE';reason='CURRENT_LOOSE_BALL_CONTEST';
  }else if(ball.mode==='FLIGHT'&&ball.kind==='PASS'&&ball.intendedReceiverId===player.id){
    // Receive the actual incoming trajectory before resuming role support/run
    // duties. Otherwise the intended receiver runs away from his own pass.
    const speed2=ball.vx*ball.vx+ball.vy*ball.vy,
      along=speed2>0?Math.max(0,((player.x-ball.x)*ball.vx+(player.y-ball.y)*ball.vy)/speed2):0,
      intercept=localPoint(team,ball.x+ball.vx*along,ball.y+ball.vy*along);
    tx=intercept.x;ty=intercept.y;type='RECEIVE';reason='CURRENT_PASS_TRAJECTORY';targetId=ball.lastTouchPlayerId;
  }else if(role==='GK'){
    const set=tacticsRuntime().goalkeeperCoverPoint(coarseTacticalView(state),team,{x:clamp(5.5+bl.x*.025,5.2,9.2),y:34+(bl.y-34)*.10});tx=set.x;ty=set.y;type='GK_COVER';reason='GK_GOAL_COVER_REFERENCE';stationaryAllowed=Math.hypot(tx-local.x,ty-local.y)<.55;
  }else if(player.id===ball.ownerId){
    if(role==='CB'){
      const scan=tacticsRuntime().carryScanContext({players:sp.players},player);
      tx=clamp(local.x+scan.step,4,93);ty=clamp(local.y+scan.lateral+(34-local.y)*.006,4,64);type=scan.step>0?'CARRY_SCAN':'PROTECT_SCAN';reason='CURRENT_CARRIER_FORWARD_SPACE_SCAN';stationaryAllowed=scan.step===0;
    }else{
      const scan=tacticsRuntime().carryScanContext({players:sp.players},player),step=scan.space>5?attackStep:Math.min(attackStep,scan.step);
      // Preserve open role advance; present pressure, not elapsed time, changes a carry.
      tx=clamp(local.x+step,4,98);ty=clamp(local.y+scan.lateral+(34-local.y)*.006,5,63);type=step>0?'CARRY_SCAN':'PROTECT_SCAN';reason='CURRENT_CARRIER_FORWARD_SPACE_SCAN';stationaryAllowed=step===0;
    }
  }else if(!inPoss){
    const plan=defensive||coarseDefensivePlan(state,team),carrier=plan.owner;
    if(carrier&&player.id===plan.pressId){const al=localPoint(team,carrier.x,carrier.y),side=Math.sign(local.y-al.y)||((idPhase(player.id)>.5)?1:-1);tx=clamp(al.x-1.35,4,96);ty=clamp(al.y+side*.48,4,64);type='PRESS';reason='CURRENT_CARRIER_USEFUL_SPACE_CLOSE';targetId=carrier.id;responsibility={type:'PRESS',targetId,goalSideReference:{x:team==='HOME'?0:105,y:34}};}
    else if(carrier&&player.id===plan.coverId){const point=tacticsRuntime().goalSideCoverPoint(coarseTacticalView(state),team,carrier,4.4);tx=clamp(point.x,4,96);ty=clamp(point.y,4,64);type='COVER';reason='PRESS_SUPPORT_DANGEROUS_LANE_PROTECTION';targetId=carrier.id;responsibility={type:'COVER',targetId,goalSideReference:{x:team==='HOME'?0:105,y:34}};}
    else if(plan.contain.has(player.id)){const zone=plan.contain.get(player.id);tx=zone.targetLocal.x;ty=zone.targetLocal.y;type='CONTAIN';targetId=zone.threatId;reason='FULLBACK_WIDE_ZONAL_CONTROL';responsibility={type,targetId,wideZone:zone,goalSideReference:{x:team==='HOME'?0:105,y:34}};}
    else if(plan.marks.has(player.id)){const threat=sp.players.find(p=>p.id===plan.marks.get(player.id)),band=coarseMarkBandPoint(team,player,threat),q=localPoint(team,band.targetPoint.x,band.targetPoint.y);tx=q.x;ty=q.y;type='MARK';reason='GOAL_SIDE_LANE_DISTANCE_RESPONSIBILITY_BAND';targetId=threat.id;responsibility={type:'MARK',targetId,distanceBand:band.distanceBand,goalSideReference:band.goalSideReference,laneReference:band.laneReference};}
    else{const guide=plan.lineGuide,group=role==='CB'||role==='FB'?'BACK':role==='CM'?'MID':'FRONT',roleOffset=role==='FB'?.75:role==='CB'?-0.35:role==='WF'?.55:role==='ST'?.25:0,ballPull=group==='BACK'?.07:group==='MID'?.15:.22;tx=clamp(guide.anchors[group]+roleOffset+(bl.x-guide.carrierLocal.x)*ballPull+wave*.38,12,72);ty=clamp(34+(COARSE_SLOT_Y[slot]-34)*width+(bl.y-34)*(group==='BACK'?.10:group==='MID'?.17:.22)+wave*.35,6,62);type='RECOVERY';reason='LIVE_CARRIER_CONNECTED_LINE_RECOVERY';responsibility={type:'RECOVERY',targetId:null,goalSideReference:{x:team==='HOME'?0:105,y:34},lineConnectivity:{group,guideVersion:guide.schemaVersion,carrierId:guide.carrierId,anchors:guide.anchors}};}
  }else if(common){
    const q=localPoint(team,common.targetPoint.x,common.targetPoint.y);tx=q.x;ty=q.y;type=common.task;reason=common.reason;stationaryAllowed=common.stationaryAllowed;targetId=common.targetId||null;if(type==='REST_WIDE_COVER')responsibility={type:'COVER',targetId,coverageStatus:common.coverageStatus};
  }else if(role==='CB'&&inPoss){
    const T=tacticsRuntime(),sideSlot=slot==='LCB'?'LB':slot==='RCB'?'RB':null,fb=sp.players.find(p=>p.team===team&&p.slot===sideSlot),fl=fb?localPoint(team,fb.x,fb.y):null;
    // A live, forward fullback support intent supplies the existing cover relation.
    // No formation coordinates or next result are reconstructed at the handoff.
    const wideSupport=!!fb&&fb.intent?.type==='OVERLAP_SUPPORT'&&fl.x>local.x+5;
    const ref=T.cbRestDefenceReference(player,{progress:bl.x,ball:bl,phase:T.phaseFromProgress(bl.x,state.phase==='TRANSITION'),fullbackSurge:wideSupport,fullbackSurgeSlot:wideSupport?sideSlot:null,players:sp.players,ownerId:ball.ownerId});
    tx=ref.lx;ty=ref.ly;type=ref.task;reason='CURRENT_CB_BUILD_REST_COVER_REFERENCE';responsibility={type,targetId:null,reference:{x:tx,y:ty},coverPlayerId:wideSupport?fb.id:null};stationaryAllowed=Math.hypot(tx-local.x,ty-local.y)<.55;
  }else if(common){
    const q=localPoint(team,common.targetPoint.x,common.targetPoint.y);tx=q.x;ty=q.y;type=common.task;reason=common.reason;stationaryAllowed=common.stationaryAllowed;targetId=common.targetId||null;if(type==='REST_WIDE_COVER')responsibility={type:'COVER',targetId,coverageStatus:common.coverageStatus};
  }else if(role==='ST'&&inPoss){
    tx=clamp(Math.max(local.x+3.3,bl.x+5.8)+wave*1.1,45,94);ty=clamp(34+(bl.y-34)*.16+wave*1.3,19,49);type='FORWARD_RUN';reason='CENTRAL_FORWARD_CONTINUOUS_RUN';
  }else if(role==='WF'&&inPoss){
    tx=clamp(Math.max(local.x+2.8,bl.x+3.6)+wave*.9,38,94);ty=clamp(34+(COARSE_SLOT_Y[slot]-34)*width+(bl.y-COARSE_SLOT_Y[slot])*.12,4.5,63.5);type='WIDE_RUN';reason='WIDE_CHANNEL_CONTINUOUS_RUN';
  }else if(role==='FB'&&inPoss){
    const flank=slot==='RB'?bl.y>42:bl.y<26;if(flank){tx=clamp(Math.max(local.x+2.6,bl.x-5.5),20,84);ty=clamp(34+(COARSE_SLOT_Y[slot]-34)*width,4.5,63.5);type='OVERLAP_SUPPORT';reason='WIDE_SUPPORT_REFERENCE';}
    else{tx=clamp(31+lineBias+(bl.x-52)*.09,20,54);ty=34+(COARSE_SLOT_Y[slot]-34)*width;type='REST_BALANCE';reason='FULLBACK_REST_BALANCE_REFERENCE';}
  }else if(role==='CM'&&inPoss){
    const lateral=COARSE_SLOT_Y[slot]||34;tx=clamp(bl.x-(slot==='CM'?5.2:7.2)+wave*1.3,22,86);ty=clamp(lateral+(bl.y-lateral)*.24+wave*.8,7,61);type='SUPPORT';reason='LIVE_BALL_SUPPORT_TRIANGLE';
  }else if(inPoss){
    tx=clamp(local.x+2.8+wave,18,90);ty=clamp(34+(COARSE_SLOT_Y[slot]-34)*width,5,63);type='SUPPORT';reason='LIVE_POSSESSION_SUPPORT';
  }
  let world=worldPoint(team,tx,ty),distance=Math.hypot(world.x-player.x,world.y-player.y);
  // MARK already carries a current target's role-sensitive goal-side/lane/distance
  // relationship.  A generic self-offset at close range would discard that proposal
  // just before sealing, collapsing a wide marker onto its runner or carrying a CB
  // beyond a central target.  Other non-GK intents retain the normal reevaluation.
  world=clampTargetFromCurrent(player,world,11,type==='RECOVER_LOOSE');
  return{type,targetId,targetPoint:world,reasonCode:reason,source:'CONTINUOUS_SPATIAL_AUTHORITY_V2_INTENT_ARBITER',stationaryAllowed,responsibility,expiresAt:Number((now+2.0+idPhase(player.id)*1.15).toFixed(3))};
}
function commitIntent(state,player,proposal,now,cause){
  const sp=state.spatial,prior=player.intent||{},epoch=Number(prior.epoch||0)+1,intent={...proposal,epoch,createdAt:Number(now.toFixed(3)),transitionCause:cause||'EXPIRY_OR_STIMULUS',stimulus:ballStimulus(state)};
  player.intent=intent;player.tx=intent.targetPoint.x;player.ty=intent.targetPoint.y;player.faceTargetAngle=Math.atan2(player.ty-player.y,player.tx-player.x);player.action=intent.type;player.tacticalTask=intent.type;player.markTargetId=intent.type==='MARK'?intent.targetId||null:null;player.responsibility={...(intent.responsibility||{type:intent.type,targetId:intent.targetId||null}),epoch,reasonCode:intent.reasonCode};player.responsibilityType=player.responsibility.type;player.responsibilityTargetId=intent.targetId||null;player.responsibilityReason=intent.reasonCode;player.responsibilityEpoch=epoch;sp.intentSequence++;sp.writerStats.intentTransitions++;return intent;
}
function sealCoarseMovementIntents(state,now){
  const sp=state.spatial,stepId=`${Number(now).toFixed(3)}:${Number(sp.movementIntentEpoch||0)+1}`,fallbacks=sp._lastNonPressFinalMovementByActor||(sp._lastNonPressFinalMovementByActor={});
  sp.movementIntentEpoch=Number(sp.movementIntentEpoch||0)+1;
  const candidates=sp.players.map(p=>{const intent=p.intent||{},type=intent.type||p.tacticalTask||p.action,targetId=intent.targetId||null,responsibility={...(intent.responsibility||{type,targetId}),epoch:Number(intent.epoch||0),reasonCode:intent.reasonCode||null};return{p,type,targetId,targetPoint:{x:p.tx,y:p.ty},responsibility};});
  for(const c of candidates)if(['COVER','MARK','CONTAIN','RECOVERY'].includes(c.type))fallbacks[c.p.id]=deep({type:c.type,targetId:c.targetId,targetPoint:c.targetPoint,responsibility:c.responsibility});
  const carrier=sp.ball.mode==='CONTROLLED'?sp.players.find(p=>p.id===sp.ball.ownerId)||null:null,pressWinnerByTeam={},connectivity={};
  for(const team of['HOME','AWAY'])connectivity[team]=coarseDefensivePlan(state,team).lineGuide;
  if(carrier)for(const team of['HOME','AWAY']){
    const duplicate=candidates.filter(c=>c.p.team===team&&c.type==='PRESS'&&c.targetId===carrier.id);
    if(duplicate.length>1){const selectedId=coarseDefensivePlan(state,team).pressId;pressWinnerByTeam[team]=duplicate.some(c=>c.p.id===selectedId)?selectedId:duplicate.sort((a,b)=>Math.hypot(a.p.x-carrier.x,a.p.y-carrier.y)-Math.hypot(b.p.x-carrier.x,b.p.y-carrier.y)||a.p.id.localeCompare(b.p.id))[0].p.id;}
  }
  for(const c of candidates){
    const duplicateLoser=carrier&&c.type==='PRESS'&&c.targetId===carrier.id&&pressWinnerByTeam[c.p.team]&&pressWinnerByTeam[c.p.team]!==c.p.id,selected=duplicateLoser&&fallbacks[c.p.id]?fallbacks[c.p.id]:c;
    c.p.responsibility=deep(selected.responsibility);c.p.responsibilityType=selected.responsibility.type;c.p.responsibilityTargetId=selected.responsibility.targetId||null;c.p.responsibilityReason=selected.responsibility.reasonCode;c.p.responsibilityEpoch=selected.responsibility.epoch;c.p.markTargetId=selected.type==='MARK'?selected.targetId||null:null;
    c.p.finalMovementIntent={schemaVersion:'FINAL_MOVEMENT_INTENT_1.0',stepId,actorId:c.p.id,type:selected.type,targetId:selected.targetId||null,targetPoint:{x:selected.targetPoint.x,y:selected.targetPoint.y},source:'CONTINUOUS_SPATIAL_AUTHORITY_V2_FINAL_ARBITER',writer:'runtime/continuous_spatial_authority_v2.sealCoarseMovementIntents',futureOutcomePrecomputed:false};
  }
  sp.defensiveConnectivity=connectivity;sp.movementIntentArbiter={schemaVersion:'SINGLE_FINAL_MOVEMENT_ARBITER_1.0',stepId,at:Number(now.toFixed(3)),source:'COARSE_FINAL_ARBITER',finalWriterCountByActor:Object.fromEntries(sp.players.map(p=>[p.id,1])),postArbiterFinalWriterCount:0,defensiveConnectivity:deep(connectivity),futureOutcomePrecomputed:false};return sp.movementIntentArbiter;
}
// The shared role map is one current decision. Its old and new owners must
// consume a handoff together; independent intent expiry cannot leave two presses.
function defensiveAssignmentChanged(state,player,plan){
  if(state.spatial.ball.mode!=='CONTROLLED'||player.team===state.possession||player.role==='GK')return null;
  const i=player.intent;if(!i||i.source==='EXISTING_CURRENT_ACTION_AUTHORITY'||!['PRESS','COVER','MARK','CONTAIN','RECOVERY'].includes(i.type))return null;
  const type=player.id===plan.pressId?'PRESS':player.id===plan.coverId?'COVER':plan.contain.has(player.id)?'CONTAIN':plan.marks.has(player.id)?'MARK':'RECOVERY';
  const target=type==='PRESS'||type==='COVER'?plan.owner?.id:type==='CONTAIN'?plan.contain.get(player.id).threatId:type==='MARK'?plan.marks.get(player.id):null;
  return i.type!==type||(i.targetId||null)!==(target||null)?'CURRENT_DEFENSIVE_ROLE_HANDOFF':null;
}
function shouldReevaluate(state,player,now){if(state.spatial.ball.mode==='LOOSE')return'CURRENT_LOOSE_CONTEST';if(player.role!=='GK'&&player.id===state.spatial.ball.ownerId)return'CURRENT_CARRY_SPACE_SCAN';const i=player.intent;if(!i||now>=Number(i.expiresAt||0)-1e-6)return'INTENT_EXPIRED';if(stimulusChanged(i.stimulus,ballStimulus(state)))return'FOOTBALL_STIMULUS_CHANGED';if(Math.hypot((i.targetPoint?.x??player.tx)-player.x,(i.targetPoint?.y??player.ty)-player.y)<.78)return'TARGET_REACHED';return null;}
function recordTouch(state,kind,player,at,extra={}){const sp=state.spatial,ball=sp.ball,row={sequence:++sp.touchSequence,at:Number(at.toFixed(3)),kind,playerId:player?.id||null,team:player?.team||null,x:rounded(ball.x),y:rounded(ball.y),...extra,
  // Capture this already executed touch, not a future reception or outcome.
  // Integration history can have only the pre-action sample at this same clock.
  ballAtTouch:Object.fromEntries(['x','y','z','vx','vy','vz','mode','kind','ownerId','intendedReceiverId','lastTouchTeam','lastTouchPlayerId','lastTouchPlayer','lobBounceCount'].filter(k=>ball[k]!==undefined).map(k=>[k,ball[k]]))};
  // Old contact receipts remain; only the extra playback sample expires after
  // its physical interval has already been recorded. Replace the array/rows so
  // an earlier replay snapshot cannot lose its own factual contact evidence.
  const cutoff=Math.min(Number(sp.time),at);ball.causalHistory=(ball.causalHistory||[]).map(e=>{if(!e.ballAtTouch||e.at>=cutoff-1e-6)return e;const {ballAtTouch,...receipt}=e;return receipt;});
  boundedHistory(ball.causalHistory,row);return row;}
function setControlled(state,player,at,kind='CAUSAL_TOUCH'){
  // The detailed controller reads this actual contact epoch and hasBall, too.
  // Retaining an earlier possession's metadata suppresses a later real choice.
  player.controlledSince=Number(at);
  player.faceTargetAngle=null;player.lockTargetUntil=0;delete player._defensiveFacingAuthority;
  player.action=player.tacticalTask=player.role==='GK'?'GK_HOLD':'HOLD_BALL';
  const sp=state.spatial,ball=sp.ball,prior=ball.ownerId||null;const wideView=coarseTacticalView(state);wideView.time=Number(at);tacticsRuntime()?.noteWidePossession(wideView,player.team);ball.mode='CONTROLLED';ball.kind='CONTROL';ball.ownerId=player.id;ball.intendedReceiverId=null;ball.coarseReleasePending=false;ball.vx=Number(player.vx)||0;ball.vy=Number(player.vy)||0;ball.vz=0;ball.z=0;ball.lastTouchTeam=player.team;ball.lastTouchPlayerId=player.id;state.possession=player.team;if(prior!==player.id)sp.writerStats.causalOwnerChanges++;recordTouch(state,kind,player,at,{previousOwnerId:prior});sp.stimulusRevision++;syncBallDerived(state);return player;
}
function beginPass(state,targetId,at){
  const sp=state.spatial,ball=sp.ball,owner=sp.players.find(p=>p.id===ball.ownerId),target=sp.players.find(p=>p.id===targetId);if(ball.mode!=='CONTROLLED'||!owner||!target||target===owner||target.team!==owner.team)return null;
  ball.x=owner.x;ball.y=owner.y;const aimX=clamp(target.x+(Number(target.vx)||0)*.65,1,104),aimY=clamp(target.y+(Number(target.vy)||0)*.65,1,67),dx=aimX-ball.x,dy=aimY-ball.y,d=Math.hypot(dx,dy);if(d<1.5)return null;
  const speed=clamp(12+d*.12,12,19);ball.mode='FLIGHT';ball.kind='PASS';ball.ownerId=null;ball.intendedReceiverId=target.id;ball.vx=dx/d*speed;ball.vy=dy/d*speed;ball.z=0;ball.vz=0;ball.lastTouchTeam=owner.team;ball.lastTouchPlayerId=owner.id;ball.coarseReleasePending=true;recordTouch(state,'PASS_RELEASE',owner,at,{targetId:target.id});sp.stimulusRevision++;syncBallDerived(state);return{owner,target,distance:d};
}
function tryCausalTurnover(state,at,maxDistance=3.0){
  const sp=state.spatial,ball=sp.ball,owner=sp.players.find(p=>p.id===ball.ownerId);if(!owner||ball.mode!=='CONTROLLED')return null;
  let best=null,bestD=Infinity;for(const p of sp.players){if(p.team===owner.team||p.role==='GK')continue;const d=Math.hypot(p.x-ball.x,p.y-ball.y);if(d<bestD){best=p;bestD=d;}}
  if(!best||bestD>maxDistance)return null;setControlled(state,best,at,'PRESSURE_TURNOVER_TOUCH');state.phase='TRANSITION';state._v2TransitionUntil=at+2.5;state._v2TransitionEvent={startedAt:at,until:at+2.5,source:'COARSE_CURRENT_TURNOVER'};return{player:best,wonFrom:owner,distance:bestD};
}
function pressContactCandidates(state){
  const sp=state.spatial,ball=sp.ball,owner=sp.players.find(p=>p.id===ball.ownerId);if(!owner||ball.mode!=='CONTROLLED')return{owner:null,candidate:null};
  const candidates=sp.players.filter(p=>p.team!==owner.team&&p.role!=='GK'&&(p.finalMovementIntent?.type==='PRESS'||p.responsibility?.type==='PRESS'||p.intent?.type==='PRESS')).map(p=>({p,d:Math.hypot(p.x-owner.x,p.y-owner.y),relativeSpeed:Math.hypot((p.vx||0)-(owner.vx||0),(p.vy||0)-(owner.vy||0))})).sort((a,b)=>a.d-b.d||a.p.id.localeCompare(b.p.id));
  return{owner,candidate:candidates[0]||null};
}
function pressContactCadence(state,at){
  const sp=state.spatial,{owner,candidate}=pressContactCandidates(state),now=Number(at),cadence=sp.pressContactCadence||(sp.pressContactCadence={schemaVersion:'CAUSAL_PRESS_CONTACT_CADENCE_1.0',pairKey:null,awaitingRelease:false,released:false,lastAttemptAt:null,nextEligibleAt:null,lastOutcome:null,futureOutcomePrecomputed:false});
  if(!owner)return{eligible:false,reason:'NO_CONTROLLED_CARRIER',candidate:null,cadence:deep(cadence)};
  const pairKey=candidate?`${candidate.p.id}>${owner.id}`:null;
  if(!candidate||candidate.d>1.55){if(cadence.awaitingRelease&&(!pairKey||pairKey===cadence.pairKey))cadence.released=true;return{eligible:false,reason:!candidate?'NO_CURRENT_PRESSER':'PRESS_OUTSIDE_CONTACT_RADIUS',candidate:candidate?{player:candidate.p,distance:candidate.d}:null,cadence:deep(cadence)};}
  if(cadence.pairKey!==pairKey)return{eligible:true,reason:'NEW_CURRENT_PRESS_PAIR',pairKey,candidate:{player:candidate.p,distance:candidate.d},cadence:deep(cadence)};
  if(cadence.awaitingRelease&&!cadence.released)return{eligible:false,reason:'SAME_ENGAGEMENT_AWAITING_SEPARATION',pairKey,candidate:{player:candidate.p,distance:candidate.d},cadence:deep(cadence)};
  if(now<Number(cadence.nextEligibleAt||-Infinity)-1e-6)return{eligible:false,reason:'CONTACT_CADENCE_COOLDOWN',pairKey,candidate:{player:candidate.p,distance:candidate.d},cadence:deep(cadence)};
  return{eligible:true,reason:cadence.released?'SEPARATED_REENGAGEMENT':'CONTACT_CADENCE_READY',pairKey,candidate:{player:candidate.p,distance:candidate.d},cadence:deep(cadence)};
}
function recordPressContactAttempt(state,at,gate,result){
  const sp=state.spatial,cadence=sp.pressContactCadence||(sp.pressContactCadence={schemaVersion:'CAUSAL_PRESS_CONTACT_CADENCE_1.0',futureOutcomePrecomputed:false}),pairKey=gate?.pairKey||`${result?.player?.id||'UNKNOWN'}>${result?.wonFrom?.id||sp.ball.ownerId||'UNKNOWN'}`;
  cadence.pairKey=pairKey;cadence.lastAttemptAt=Number(at);cadence.lastOutcome=result?.outcome||null;cadence.nextEligibleAt=Number((Number(at)+.9).toFixed(3));cadence.awaitingRelease=result?.attempted===true&&result.outcome==='RETAIN';cadence.released=!cadence.awaitingRelease;cadence.futureOutcomePrecomputed=false;sp.writerStats.challengeCadenceBlocks=Number(sp.writerStats.challengeCadenceBlocks||0);return cadence;
}
function resolveCausalContact(state,at,opts={}){
  const sp=state.spatial,ball=sp.ball,{owner,candidate:c}=pressContactCandidates(state);if(!owner||ball.mode!=='CONTROLLED')return{attempted:false,outcome:'NO_CONTROLLED_CARRIER'};
  if(!c||c.d>1.55)return{attempted:false,outcome:'LOW_PRESSURE_CONTROL',nearestPressureDistance:c?.d??null};
  const roll=clamp(Number(opts.roll),0,.999999),secondary=clamp(Number(opts.secondaryRoll??roll*.618+.173),0,.999999),edge=Math.min(owner.y,68-owner.y),control=Math.hypot(owner.vx||0,owner.vy||0),winChance=clamp(.28+(1.55-c.d)*.20+c.relativeSpeed*.018+(control<1.4?.035:0),.22,.58);
  sp.writerStats.challengeAttempts=Number(sp.writerStats.challengeAttempts||0)+1;
  if(roll<winChance){setControlled(state,c.p,at,'PRESS_TACKLE_WIN');state.phase='TRANSITION';state._v2TransitionUntil=at+2.5;state._v2TransitionEvent={startedAt:at,until:at+2.5,source:'COARSE_CURRENT_TURNOVER'};sp.writerStats.challengeWins=Number(sp.writerStats.challengeWins||0)+1;return{attempted:true,outcome:'TACKLE_WON',player:c.p,wonFrom:owner,distance:c.d,roll,winChance};}
  if(roll<winChance+.18){const dx=owner.x-c.p.x,dy=owner.y-c.p.y,n=Math.hypot(dx,dy)||1;ball.mode='LOOSE';ball.kind='CHALLENGE_LOOSE';ball.ownerId=null;ball.intendedReceiverId=null;ball.vx=dx/n*(2.2+secondary*2.4);ball.vy=dy/n*(2.2+secondary*2.4);ball.lastTouchTeam=owner.team;ball.lastTouchPlayerId=owner.id;recordTouch(state,'PRESS_CHALLENGE_LOOSE',c.p,at,{challengedOwnerId:owner.id});sp.stimulusRevision++;syncBallDerived(state);sp.writerStats.challengeLoose=Number(sp.writerStats.challengeLoose||0)+1;return{attempted:true,outcome:'LOOSE',player:c.p,wonFrom:owner,distance:c.d,roll,winChance};}
  if(edge<8&&roll<winChance+.30){const toward=owner.y<34?-1:1;ball.mode='FLIGHT';ball.kind='CHALLENGE_DEFLECTION_OUT';ball.ownerId=null;ball.intendedReceiverId=null;ball.vx=(owner.vx||0)*.25;ball.vy=toward*(8+secondary*4);ball.lastTouchTeam=c.p.team;ball.lastTouchPlayerId=c.p.id;recordTouch(state,'PRESS_DEFLECTION_OUT',c.p,at,{challengedOwnerId:owner.id});sp.stimulusRevision++;syncBallDerived(state);sp.writerStats.challengeDeflections=Number(sp.writerStats.challengeDeflections||0)+1;return{attempted:true,outcome:'DEFLECTION_OUT',player:c.p,wonFrom:owner,distance:c.d,roll,winChance};}
  if(opts.allowFoul!==false&&roll<winChance+.36){recordTouch(state,'PRESS_FOUL_CONTACT',c.p,at,{fouledPlayerId:owner.id});sp.writerStats.challengeFouls=Number(sp.writerStats.challengeFouls||0)+1;return{attempted:true,outcome:'FOUL',player:c.p,wonFrom:owner,distance:c.d,roll,winChance};}
  sp.writerStats.challengeRetains=Number(sp.writerStats.challengeRetains||0)+1;return{attempted:true,outcome:'RETAIN',player:c.p,wonFrom:owner,distance:c.d,roll,winChance};
}
function integrateBall(state,dt,now){
  const sp=state.spatial,ball=sp.ball;
  if(ball.mode==='CONTROLLED'){
    const owner=sp.players.find(p=>p.id===ball.ownerId);if(owner){ball.vx=owner.vx;ball.vy=owner.vy;ball.x=owner.x;ball.y=owner.y;ball.z=0;ball.vz=0;}else{ball.mode='LOOSE';ball.ownerId=null;ball.intendedReceiverId=null;}
  }else if(ball.mode==='FLIGHT'){
    // Ignore the releasing player's initial contact envelope until the ball
    // leaves it; this is separation, not a timed immunity or a pass outcome.
    const releaser=ball.coarseReleasePending?sp.players.find(p=>p.id===ball.lastTouchPlayerId):null;
    ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;ball.x=clamp(ball.x,.3,104.7);ball.y=clamp(ball.y,.3,67.7);const intended=sp.players.find(p=>p.id===ball.intendedReceiverId),candidates=sp.players.filter(p=>p!==releaser).map(p=>({p,d:Math.hypot(p.x-ball.x,p.y-ball.y)})).filter(x=>x.d<1.45||(x.p===intended&&x.d<2.15)).sort((a,b)=>a.d-b.d);if(releaser&&Math.hypot(releaser.x-ball.x,releaser.y-ball.y)>1.45)ball.coarseReleasePending=false;if(candidates.length)setControlled(state,candidates[0].p,now,candidates[0].p===intended?'PASS_RECEIVE_TOUCH':'PASS_INTERCEPTION_TOUCH');else{ball.vx*=Math.pow(.985,dt);ball.vy*=Math.pow(.985,dt);if((ball.x<=.31||ball.x>=104.69||ball.y<=.31||ball.y>=67.69)||Math.hypot(ball.vx,ball.vy)<2.2){ball.mode='LOOSE';ball.kind='LOOSE';ball.ownerId=null;ball.intendedReceiverId=null;sp.stimulusRevision++;}}
  }else{
    ball.x=clamp(ball.x+ball.vx*dt,.3,104.7);ball.y=clamp(ball.y+ball.vy*dt,.3,67.7);ball.vx*=Math.pow(.72,dt);ball.vy*=Math.pow(.72,dt);let best=null,bestD=1.25;for(const p of sp.players){const d=Math.hypot(p.x-ball.x,p.y-ball.y);if(d<bestD){best=p;bestD=d;}}if(best)setControlled(state,best,now,'LOOSE_BALL_RECOVERY_TOUCH');
  }
  syncBallDerived(state);
}
function protagonistDefensiveOpportunity(state,playerId){
  const sp=state?.spatial,ball=sp?.ball;if(!ball||ball.mode!=='CONTROLLED')return null;
  const player=sp.players.find(p=>p.id===playerId),carrier=sp.players.find(p=>p.id===ball.ownerId);
  if(!player||!carrier||player.team===carrier.team||!['CB','CM','GK'].includes(player.role))return null;
  const distance=Math.hypot(player.x-carrier.x,player.y-carrier.y);
  // Same actionable cover radius as the high-resolution defensive checkpoint.
  // Ask its read-only inspector whether this is already a meaningful decision;
  // a mere nearby carrier must not cause repeated empty high-resolution windows.
  if(distance>5.6)return null;
  if(Number(player.nextChallengeAt||0)>Number(sp.time)+.25)return null;
  const P=(typeof globalThis!=='undefined'&&globalThis.FLRPG_PROTAGONIST_MATCH_CONTROLLER)||(typeof require==='function'?require('./protagonist_match_controller.js'):null);
  if(!P?.inspect)return null;
  const current={time:Number(sp.time),players:sp.players,playersById:Object.fromEntries(sp.players.map(p=>[p.id,p])),ball,restart:null};
  const q=P.inspect({m:current,heroPlayerId:playerId});
  const minimum=player.role==='CB'?.18:player.role==='CM'?.22:0;
  if(q?.frame?.kind!=='DEFENDING'||q.options.length<2||q.importance<minimum)return null;
  return{playerId:player.id,carrierId:carrier.id,distance,kind:'CURRENT_DEFENSIVE_CONTACT',options:q.options.map(o=>({id:o.id,targetId:o.targetId??null}))};
}
function updateCoarseArrivalFacing(player,fromX,fromY,dt,now,throwReturning,state){
  const speed=Math.hypot(player.vx,player.vy),ball=state.spatial.ball,type=player.finalMovementIntent?.type,moved=Math.hypot(player.x-fromX,player.y-fromY)>.03*dt;
  const receiveFacing=type==='RECEIVE'&&!throwReturning&&!(Number(player.lockTargetUntil)>now)?tacticsRuntime().receivePreparationFacingTarget(coarseTacticalView(state),player,player.finalMovementIntent.targetPoint):null;
  if(Number.isFinite(receiveFacing)){
    player.faceTargetAngle=receiveFacing;player.receiveFacingUntil=Math.max(player.receiveFacingUntil||0,now+1.15);
    const before=Number.isFinite(player.bodyAngle)?player.bodyAngle:receiveFacing,delta=Math.atan2(Math.sin(receiveFacing-before),Math.cos(receiveFacing-before));
    player.bodyAngle=before+clamp(delta,-2.15*dt,2.15*dt);return;
  }
  const defending=state.possession!==player.team&&['CONTROLLED','FLIGHT','LOOSE'].includes(ball.mode);
  const nearGoalFacing=defending&&(type==='GK_COVER'||type==='COVER'&&speed<=3.2)&&tacticsRuntime().nearGoalCarrier(coarseTacticalView(state),player.team);
  if((nearGoalFacing||type==='GK_COVER'&&(speed>.03||moved))&&!throwReturning&&!(Number(player.receiveFacingUntil)>now)&&!(Number(player.lockTargetUntil)>now)){
    const wanted=Math.atan2(ball.y-player.y,ball.x-player.x),before=Number.isFinite(player.bodyAngle)?player.bodyAngle:wanted;
    // Reuse the detailed motor's minimum turn rate; orientation changes remain
    // bounded inside this existing integrator, independently of a backward step.
    const delta=Math.atan2(Math.sin(wanted-before),Math.cos(wanted-before));
    player.bodyAngle=before+clamp(delta,-2.15*dt,2.15*dt);return;
  }
  // Share the existing detailed turn operation; tiny waypoint corrections are
  // locomotion inputs, not permission to flip the body instantaneously.
  if(speed>.03){player.bodyAngle=coreRuntime().boundedBodyAngle(state._supportLease?.coreMatch,player,Math.atan2(player.vy,player.vx),dt);return;}
  // Arrival can clear velocity after real movement. Retain its factual direction,
  // while existing explicit/receive/restart facing and stationary poses keep authority.
  if(player.role==='GK'||player._defensiveFacingAuthority||Number(player.receiveFacingUntil)>now||Number(player.lockTargetUntil)>now||throwReturning)return;
  const dx=player.x-fromX,dy=player.y-fromY;
  if(Math.hypot(dx,dy)>.03*dt)player.bodyAngle=coreRuntime().boundedBodyAngle(state._supportLease?.coreMatch,player,Math.atan2(dy,dx),dt);
}
function advanceCoarseTo(session,end,opts={}){
  const state=session.state,sp=activateCoarseState(state,state.second),cadence=Number(session.coarseCadence)||.5,target=Number(end);if(target<Number(sp.time)-1e-6)throw new Error('V2_COARSE_TIME_REVERSAL');
  // A 12-19 m/s pass moves 6-9.5 m in the ordinary .5 s step, skipping
  // receiver/interceptor contact envelopes. Substep only live ball flight.
  // Limit approach speed to the remaining step distance. Arrival must lie on
  // the actual forward segment and permit braking within the existing acceleration;
  // step length alone cannot justify a backward/sideways snap or erase momentum.
  // Reaching a short, moving waypoint is not itself a stop. A zero-speed
  // endpoint must also fit the distance possible under this same acceleration.
  while(Number(sp.time)<target-1e-6){if(opts.heroPlayerId&&sp.ball.mode==='CONTROLLED'&&(sp.ball.ownerId===opts.heroPlayerId||protagonistDefensiveOpportunity(state,opts.heroPlayerId)))break;const dt=Math.min(cadence,sp.ball.mode==='FLIGHT'?.1:cadence,target-Number(sp.time)),now=Number(sp.time);const shared=coarseCentralSupportPlan(state),byId=shared.byId,batch=sp.players.map(p=>({p,cause:byId.has(p.id)?'CURRENT_COMMON_SUPPORT':defensiveAssignmentChanged(state,p,shared.defensive)||shouldReevaluate(state,p,now)})).filter(r=>r.cause).map(r=>({...r,proposal:shared.forward.get(r.p.id)||proposalFor(state,r.p,now,byId.get(r.p.id),shared.defensive)}));for(const r of batch)commitIntent(state,r.p,r.proposal,now,r.cause);tacticsRuntime().commitCentralSupport(sp.commonSupportMemory,shared.plan,shared.input);sealCoarseMovementIntents(state,now);tacticsRuntime().recordCentralSupportConsumption(sp.commonSupportMemory,sp.players,now);for(const p of sp.players){const fromX=p.x,fromY=p.y,priorVx=p.vx,priorVy=p.vy,priorSpeed=Math.hypot(priorVx,priorVy),targetPoint=p.finalMovementIntent.targetPoint,dx=targetPoint.x-p.x,dy=targetPoint.y-p.y,d=Math.hypot(dx,dy),maxSpeed=p.role==='GK'?4.8:p.role==='CB'?6.2:p.role==='FB'?7.2:p.role==='ST'||p.role==='WF'?7.8:7.0,accel=p.role==='GK'?5.0:7.2,desired=Math.min(maxSpeed,d/dt,Math.sqrt(Math.max(0,2*accel*d))),dvx=d?dx/d*desired-p.vx:-p.vx,dvy=d?dy/d*desired-p.vy:-p.vy,change=Math.hypot(dvx,dvy),limit=accel*dt;if(change>limit){p.vx+=dvx/change*limit;p.vy+=dvy/change*limit;}else{p.vx+=dvx;p.vy+=dvy;}let nx=p.x+p.vx*dt,ny=p.y+p.vy*dt;const stepX=nx-p.x,stepY=ny-p.y,stepSq=stepX*stepX+stepY*stepY,arrivalFraction=stepSq?(dx*stepX+dy*stepY)/stepSq:-1,arrivalMiss=Math.hypot(dx-stepX*arrivalFraction,dy-stepY*arrivalFraction),arrivalStartSpeed=d?(priorVx*dx+priorVy*dy)/d:0,arrivalStopDistance=arrivalStartSpeed*dt/2+accel*dt*dt/4-arrivalStartSpeed*arrivalStartSpeed/(4*accel);if(d>0&&priorSpeed<=limit+1e-9&&d<=arrivalStopDistance+1e-9&&arrivalFraction>=0&&arrivalFraction<=1&&arrivalMiss<=1e-7){nx=targetPoint.x;ny=targetPoint.y;p.vx=0;p.vy=0;}const recovering=p.finalMovementIntent.type==='RECOVER_LOOSE'||p.x<2.5||p.x>102.5||p.y<2.5||p.y>65.5,throwReturning=p.restartReentry?.kind==='THROW_IN';p.x=clamp(nx,recovering?.8:2.5,recovering?104.2:102.5);p.y=clamp(ny,throwReturning?-1.2:recovering?.8:2.5,throwReturning?69.2:recovering?67.2:65.5);if(throwReturning&&p.y>=.8&&p.y<=67.2)delete p.restartReentry;updateCoarseArrivalFacing(p,fromX,fromY,dt,now,throwReturning,state);sp.writerStats.actualIntegratorWrites++;}
    const next=Number((Number(sp.time)+dt).toFixed(3));integrateBall(state,dt,next);sp.parentStateId=sp.stateId;sp.stateId=`CV2${String(++session.coarseStateCounter).padStart(7,'0')}`;sp.time=next;state.second=next;state.minute=next/60;state._v2LastIntegratedPriorState=opts.priorStateLabel||null;if(typeof opts.record==='function')opts.record(opts.eventId||null);
    // Yield only after the complete physical tick/record. The owning hybrid
    // may reconsider an NPC action from this factual state, never a future one.
    if(opts.shouldReviewDecision?.())break;
  }
  return sp;
}
function refreshIntents(state,event=null){const sp=activateCoarseState(state,state.second),now=Number(sp.time);sp.stimulusRevision++;const shared=coarseCentralSupportPlan(state,true),byId=shared.byId,batch=sp.players.map(p=>({p,proposal:shared.forward.get(p.id)||proposalFor(state,p,now,byId.get(p.id),shared.defensive)}));for(const r of batch)commitIntent(state,r.p,r.proposal,now,event?.id?`EVENT:${event.id}`:'EXPLICIT_REEVALUATION');tacticsRuntime().commitCentralSupport(sp.commonSupportMemory,shared.plan,shared.input);return sp;}
const LEASE_SCHEMA_VERSION='CONTINUOUS_SPATIAL_AUTHORITY_V2_RESOLUTION_LEASE_1.0';
const ACTUAL_HISTORY_SCHEMA_VERSION='CONTINUOUS_ACTUAL_HISTORY_1.0';
const leaseRegistry=new Map();
function hash32(s){let h=2166136261>>>0;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
function createResolutionRandom(){
  let seed=null,state=0,drawCount=0,initializations=0,reseedAttempts=0;
  const next=function(){
    if(seed==null)throw new Error('V2_RESOLUTION_RNG_NOT_INITIALIZED');
    state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);const value=((t^t>>>14)>>>0)/4294967296;drawCount++;
    next.onDraw?.({algorithm:'mulberry32',identity:seed,state:state>>>0,drawCount,value});return value;
  };
  next.initialize=identity=>{const wanted=String(identity);if(seed!=null){if(seed!==wanted){reseedAttempts++;throw new Error('V2_RESOLUTION_RNG_RESEED_FORBIDDEN');}return next;}seed=wanted;state=hash32(wanted)||1;drawCount=0;initializations++;return next;};
  next.observe=()=>({algorithm:'mulberry32',identity:seed,state:seed==null?null:state>>>0,drawCount,initialized:seed!=null,initializations,reseedAttempts});
  return next;
}
function historyTime(frame){return Number(frame?.time??frame?.at??NaN);}
function appendActualHistory(history,frame,origin,historySeconds=12){
  if(!Array.isArray(history)||!frame)throw new Error('V2_ACTUAL_HISTORY_REQUIRED');
  const time=historyTime(frame);if(!Number.isFinite(time))throw new Error('V2_ACTUAL_HISTORY_TIME_REQUIRED');
  const last=history.at(-1),lastTime=historyTime(last);
  if(last&&time<lastTime-1e-6)throw new Error('V2_ACTUAL_HISTORY_TIME_REVERSAL');
  if(last&&Math.abs(time-lastTime)<=1e-6)return last;
  const row=deep(frame);row.compressedDeadClock=Number(frame.compressedDeadClock??frame.stats?.compressedDeadClock??last?.compressedDeadClock??last?.stats?.compressedDeadClock??0);row.actualOrigin=true;row.historySchemaVersion=ACTUAL_HISTORY_SCHEMA_VERSION;row.historyOrigin=origin;row.synthetic=false;row.resimulated=false;row.reconstructed=false;history.push(row);
  const cutoff=time-Math.max(10,Number(historySeconds)||12);while(history.length>1&&historyTime(history[0])<cutoff-1e-6)history.shift();return row;
}
function createResolutionLease(session){
  const sp=session?.state?.spatial;if(!sp||!Array.isArray(sp.players)||sp.players.length!==22)throw new Error('V2_LEASE_CANONICAL_SPATIAL_REQUIRED');
  const history=session.actualHistory||session.coarseHistory||[];
  const lease={schemaVersion:LEASE_SCHEMA_VERSION,authorityId:session.opts?.matchId||session._continuousSpatialAuthorityV2MatchId||`HYBRID:${session.opts?.seed||'FLR-LIVE-HYBRID-02'}`,owner:'COARSE',writableAuthorityCount:1,canonicalRoot:session,canonicalSpatial:sp,canonicalPlayers:sp.players,canonicalBall:sp.ball,history,historySeconds:Number(session.coarseHistorySeconds)||45,resolutionRandom:createResolutionRandom(),coreMatch:null,controller:null,currentBoundaryId:null,acquisitions:0,releases:0,initialPlayerRefs:[...sp.players],initialBallRef:sp.ball,initialSpatialRef:sp};lease.commonSupportMemory=sp.commonSupportMemory;lease.wideTransitionMemory=sp.wideTransitionMemory;Object.defineProperty(session.state,'_supportLease',{value:lease,configurable:true});leaseRegistry.set(lease.authorityId,lease);return lease;
}
function resolutionLeaseForContext(ctx){
  const id=ctx?.matchId||ctx?.authorityV2Trace?.matchId||null,lease=id?leaseRegistry.get(id):null;if(!lease)return null;
  const current=lease.canonicalRoot?.state?.spatial;if(current&&current!==lease.canonicalSpatial){if(lease.owner!=='COARSE'||current.stateId!==ctx?.spatial?.stateId||current.players?.length!==22)throw new Error('V2_REGISTERED_LEASE_CANONICAL_MISMATCH');lease.canonicalSpatial=current;lease.canonicalPlayers=current.players;lease.canonicalBall=current.ball;lease.initialSpatialRef=current;lease.initialPlayerRefs=[...current.players];lease.initialBallRef=current.ball;}
  return lease;
}
function prepareResolutionLease(lease,rngIdentity){if(!lease?.resolutionRandom)throw new Error('V2_RESOLUTION_LEASE_REQUIRED');if(!lease.resolutionRandom.observe().initialized)lease.resolutionRandom.initialize(rngIdentity);return lease;}
function acquireResolutionLease(lease,boundaryId){
  if(!lease||lease.owner!=='COARSE')throw new Error('V2_RESOLUTION_LEASE_NOT_AVAILABLE');
  lease.owner='HIGH_RES';lease.currentBoundaryId=boundaryId;lease.acquisitions++;lease.canonicalSpatial.boundaryId=boundaryId;lease.canonicalSpatial.authorityMode='V2_CONTINUOUS_HIGH_RES';return lease;
}
function bindResolutionAdapter(lease,m,controller,ctx,defaults){
  if(lease.owner!=='HIGH_RES')throw new Error('V2_RESOLUTION_LEASE_NOT_ACQUIRED');
  const sp=lease.canonicalSpatial,byDefault=new Map((defaults||[]).map(p=>[p.id,p]));
  if(sp.players.length!==22||new Set(sp.players.map(p=>p.id)).size!==22)throw new Error('V2_LEASE_PLAYER_IDENTITY_MISMATCH');
  // Carry the actual last coarse movement duty into this one scene. The
  // nominal task can already differ from the sealed movement at promotion.
  // A released FB pass must not erase an arrived teammate's wide cover while
  // its physical flight is still being resolved.
  const kicker=sp.ball.mode==='FLIGHT'&&sp.ball.kind==='PASS'?sp.players.find(p=>p.id===sp.ball.lastTouchPlayerId&&p.role==='FB'&&p.team===ctx.possession):null;
  const inheritedDuties=kicker?sp.players.filter(p=>p.team===ctx.possession&&p.id!==kicker.id&&p.finalMovementIntent?.type==='REST_WIDE_COVER'&&p.finalMovementIntent.targetId).map(p=>({playerId:p.id,threatId:p.finalMovementIntent.targetId})):[];
  lease.inheritedWideCover=inheritedDuties.length?{at:Number(ctx.second),lastTouchId:kicker.id,duties:inheritedDuties}:null;
  for(const p of sp.players){const base=byDefault.get(p.id);if(!base)throw new Error(`V2_PLAYER_IDENTITY_MISMATCH:${p.id}`);const carried=deep(p);replaceFields(p,{...base,nextThink:Number(ctx.second)+.12,runUntil:Number(ctx.second)+.25,...carried});p.hasBall=sp.ball.mode==='CONTROLLED'&&p.id===sp.ball.ownerId;}
  const initialBall={z:0,vx:0,vy:0,vz:0,intendedReceiverId:null,age:0,...sp.ball};replaceFields(sp.ball,initialBall);if(!Object.hasOwn(sp.ball,'lastTouchPlayer'))sp.ball.lastTouchPlayer=sp.ball.lastTouchPlayerId??null;
  Object.defineProperty(sp.ball,'lastTouchPlayerId',{get(){return this.lastTouchPlayer;},set(value){this.lastTouchPlayer=value;},enumerable:true,configurable:true});
  m.players=sp.players;m.playersById=Object.fromEntries(sp.players.map(p=>[p.id,p]));m.ball=sp.ball;m.ballOwner=sp.ball.ownerId||null;m.lastTouchTeam=sp.ball.lastTouchTeam||ctx.possession||null;m.lastTouchPlayer=sp.ball.lastTouchPlayer??null;
  m.time=Number(ctx.second);m.score=lease.canonicalRoot?.state?.score||ctx.score;m.possession=ctx.possession;m.phase=ctx.phase;m.restart=lease.coreMatch?m.restart:null;m.completed=false;m.nextShape=m.time+.25;m.transitionUntil=Number(lease.canonicalRoot?.state?._v2TransitionUntil)||0;m.transitionEvent=deep(lease.canonicalRoot?.state?._v2TransitionEvent)||null;if(!lease.coreMatch)m.events=[];
  m.stats.currentPossessionTeam=ctx.possession;m.stats.currentPossessionStartedAt=m.time;m.r=lease.resolutionRandom;
  Object.defineProperty(m,'_resolutionLease',{value:lease,writable:false,configurable:true,enumerable:false});
  m._transitionWideVacancies=lease.wideTransitionMemory.vacancies;lease.coreMatch=m;lease.controller=controller;controller.history=lease.history;controller.actualHistory=lease.history;controller.actualHistoryLineageId=lease.authorityId;controller.actualHistoryRetentionSeconds=lease.historySeconds;return m;
}
function assertLobHandbackSafe(m){
  const core=(typeof globalThis!=='undefined'&&globalThis.FLRPG_CONTINUOUS_CORE)||(typeof require==='function'?require('./continuous_match_core.js'):null);
  if(core?.lobContinuationRequired(m))throw new Error('OPEN_PLAY_LOB_CONTINUATION_REQUIRES_HIGH_RES');
}
// Shared read-only preflight before session writes and direct/alternate releases.
function assertResolutionHandbackSafe(session,handback){
  const lease=session?._v2ResolutionLease||handback?.state?.m?._resolutionLease;if(!lease||lease.owner!=='HIGH_RES')throw new Error('V2_RESOLUTION_LEASE_NOT_ACTIVE');
  const m=handback?.state?.m;if(m!==lease.coreMatch||m.players!==lease.canonicalPlayers||m.ball!==lease.canonicalBall)throw new Error('V2_RESOLUTION_ADAPTER_IDENTITY_LOST');
  if(lease.controller?.pending||handback.state?.pending||handback.nextPending||handback.pending)throw new Error('V2_PENDING_CHOICE_REQUIRES_RESOLUTION');
  assertLobHandbackSafe(m);
  // H.resume preflights twice, before and after clearing session.boundary.
  // The acquired canonical boundary stays on the lease until release completes.
  const terminalWindow=lease.currentBoundaryId==='FINAL-WINDOW'&&Number(handback.snapshot?.time)>=Number(session.durationSeconds);
  if(!m.completed&&!terminalWindow&&(m.restart||['DEAD','FLIGHT'].includes(m.ball.mode)||(m.ball.mode==='LOOSE'&&((m.ball.z||0)>0||Math.abs(m.ball.vz||0)>.001))))throw new Error('V2_UNSETTLED_PHYSICS_REQUIRES_HIGH_RES');
  const sp=lease.canonicalSpatial,snap=handback.snapshot;if(!snap||Number(snap.time)<Number(sp.time)-1e-6)throw new Error('V2_RESOLUTION_HANDBACK_TIME_REVERSAL');
  return lease;
}
function releaseResolutionLease(session,handback){
  const lease=assertResolutionHandbackSafe(session,handback),sp=lease.canonicalSpatial,snap=handback.snapshot;
  appendActualHistory(lease.history,snap,'ACTUAL_HIGH_RES_HANDOFF',lease.historySeconds);sp.parentStateId=sp.stateId;sp.stateId=snap.stateId||`${sp.stateId}:HR:${Number(snap.time).toFixed(6)}`;sp.time=Number(snap.time);sp.boundaryId=null;sp.authorityMode='V2_CONTINUOUS_COARSE';sp.futureOutcomePrecomputed=false;
  if(session?.state){session.state.spatial=sp;session.state.ball=sp.ball;session.state.second=Number(snap.time);session.state.minute=Number(snap.time)/60;session.state._v2TransitionUntil=Number(lease.coreMatch.transitionUntil)||0;session.state._v2TransitionEvent=deep(lease.coreMatch.transitionEvent)||null;session.actualHistory=lease.history;session.coarseHistory=lease.history;}
  syncBallDerived(session.state);lease.owner='COARSE';lease.currentBoundaryId=null;lease.inheritedWideCover=null;lease.releases++;return lease;
}
function leaseAudit(lease){return{schemaVersion:lease?.schemaVersion||null,authorityId:lease?.authorityId||null,owner:lease?.owner||null,writableAuthorityCount:lease?.writableAuthorityCount??null,acquisitions:lease?.acquisitions||0,releases:lease?.releases||0,spatialIdentity:!!lease&&lease.canonicalSpatial===lease.initialSpatialRef,playerIdentities:!!lease&&lease.initialPlayerRefs.every((p,i)=>lease.canonicalPlayers[i]===p),ballIdentity:!!lease&&lease.canonicalBall===lease.initialBallRef,adapterDirectBacked:!!lease?.coreMatch&&lease.coreMatch.players===lease.canonicalPlayers&&lease.coreMatch.ball===lease.canonicalBall,historyIdentity:!!lease&&lease.controller?.history===lease.history,rng:lease?.resolutionRandom?.observe?.()||null};}
// Step2 copy helpers remain for the reversible legacy path. Step3 V2 root uses
// the lease functions above and never reconstructs canonical spatial objects.
function replaceFields(target,source){for(const key of Object.keys(target))delete target[key];Object.assign(target,deep(source));return target;}
function adoptHandback(state,at,snapshot=null){
  if(!snapshot)return activateCoarseState(state,at);
  const sp=state.spatial,byId=new Map(sp.players.map(p=>[p.id,p]));
  if(snapshot.players.length!==22||new Set(snapshot.players.map(p=>p.id)).size!==22||snapshot.players.some(p=>!byId.has(p.id)))throw new Error('V2_HANDBACK_PLAYER_IDENTITY_MISMATCH');
  for(const p of snapshot.players)replaceFields(byId.get(p.id),p);
  replaceFields(sp.ball,snapshot.ball);state.ball=sp.ball;
  sp.time=Number(at);sp.stateId=snapshot.stateId;sp.parentStateId=snapshot.parentStateId;sp.boundaryId=null;
  sp.authorityMode='V2_CONTINUOUS_COARSE';sp.futureOutcomePrecomputed=false;
  state.possession=snapshot.possession;state.second=Number(at);state.minute=Number(at)/60;
  return sp;
}
function resolutionSnapshot(base,m,carry){
  const out=deep(base),entry=Number(m.time)===Number(carry.second);
  out.players=deep(m.players);out.ball=deep(m.ball);
  if(!Object.prototype.hasOwnProperty.call(out.ball,'lastTouchPlayerId')&&Object.prototype.hasOwnProperty.call(out.ball,'lastTouchPlayer'))out.ball.lastTouchPlayerId=out.ball.lastTouchPlayer;
  // Core replaces its ball on release. These are historical coarse touches,
  // not invented high-resolution touches or predicted results.
  if(!out.ball.causalHistory)out.ball.causalHistory=deep(carry.spatial.ball.causalHistory||[]);
  out.stateId=entry?carry.spatial.stateId:`${carry.spatial.stateId}:HR:${Number(m.time).toFixed(6)}`;
  out.parentStateId=entry?carry.spatial.parentStateId:carry.spatial.stateId;
  out.coreCurrent={};
  for(const key of ['restart','setPieceLive','activeDuel','ballOwner','lastTouchTeam','lastTouchPlayer','userChoiceControl','userChoiceLog','protagonistInteractiveEpisode','protagonistExplicitActionRequired','protagonistControllerId'])if(Object.prototype.hasOwnProperty.call(m,key))out.coreCurrent[key]=deep(m[key]);
  out.spatialAuthorityV2={matchId:carry.authorityV2Trace?.matchId||carry.matchId||null,hybridRng:deep(carry.hybridRng),coreRng:m.r?.observe?deep(m.r.observe()):'NOT_EXPOSED',futureOutcomePrecomputed:false};
  return out;
}
const RESOLUTION_CONTEXT_FIELDS=['history','pending','pauses','scenes','currentScene','resultTracker','lastResult','choiceHistory','lastChoice','lastChoiceAt','lastPauseAt','lastPauseControlledSince','forceNextChoice','forceFromSceneId','activeEpisode','episodeSeq','passReleases','lastPassReleaseSig','futureOutcomePrecomputed'];
const COMPACT_ARCHIVES='COMPACT_REFERENCES_V1';
// These are diagnostic references, never inputs used to restore live authority.
// The lease retains the real controller/history; episode owners retain frames.
function archiveReference(owner,rows){return{recordingMode:COMPACT_ARCHIVES,owner,restorable:false,count:Array.isArray(rows)?rows.length:0,firstSecond:rows?.[0]?.time??null,lastSecond:rows?.at?.(-1)?.time??null};}
function sceneArchiveSummary(scene){if(!scene)return scene;const out={};for(const key of Object.keys(scene)){
 if(key==='preFrames'||key==='postFrames')out[key]=archiveReference('RESOLUTION_LEASE.controller.scenes:'+scene.sceneId+':'+key,scene[key]);
 else if(key==='choiceBoundarySpatial')out[key]={recordingMode:COMPACT_ARCHIVES,owner:'RESOLUTION_LEASE.controller.scenes:'+scene.sceneId+':choiceBoundarySpatial',sceneId:scene.sceneId};
 else if(key==='choicePendingSnapshot'&&scene[key]){out[key]={};for(const field of Object.keys(scene[key]))out[key][field]=field==='replayFrames'?archiveReference('RESOLUTION_LEASE.controller.scenes:'+scene.sceneId+':preFrames',scene[key][field]):deep(scene[key][field]);}
 else out[key]=deep(scene[key]);
 }return out;}
function resolutionContext(controller,opts={}){const compact=opts.archiveMode===COMPACT_ARCHIVES,out={};for(const key of RESOLUTION_CONTEXT_FIELDS)if(Object.prototype.hasOwnProperty.call(controller,key)){
 if(compact&&key==='history')out[key]=archiveReference('RESOLUTION_LEASE.actualHistory',controller[key]);
 else if(compact&&key==='scenes')out[key]=controller[key].map(sceneArchiveSummary);
 else if(compact&&key==='currentScene')out[key]=sceneArchiveSummary(controller[key]);
 else out[key]=deep(controller[key]);
 }if(compact)out.diagnosticArchives={recordingMode:COMPACT_ARCHIVES,liveAuthorityOwner:'RESOLUTION_LEASE.controller',restorable:false};return out;}
function physicalOwner(state){const sp=state?.spatial,ball=sp?.ball;return sp?.players?.find(p=>p.id===ball?.ownerId)||null;}
function coarseDiagnostics(state){const sp=state?.spatial||{};return{schemaVersion:sp.schemaVersion||null,authorityMode:sp.authorityMode||null,writerStats:deep(sp.writerStats||{}),touchHistory:deep(sp.ball?.causalHistory||[]),intentTransitions:(sp.players||[]).map(p=>({playerId:p.id,intent:deep(p.intent||null)}))};}
function roundTrip(observation){return JSON.parse(JSON.stringify(observation));}
function schemaRoundTripEqual(observation){return same(observation,roundTrip(observation));}

return{SCHEMA_VERSION,TRACE_VERSION,FEATURE_FLAG,COARSE_FEATURE_FLAG,COARSE_SCHEMA_VERSION,LEASE_SCHEMA_VERSION,ACTUAL_HISTORY_SCHEMA_VERSION,enabled,coarseEnabled,createObserver,getObserver,observerForBoundary,attachBoundary,createCanonicalObservation,createCoarseSpatial,activateCoarseState,syncBallDerived,coarseCentralSupportInput,advanceCoarseTo,refreshIntents,beginPass,tryCausalTurnover,pressContactCadence,recordPressContactAttempt,resolveCausalContact,protagonistDefensiveOpportunity,physicalOwner,adoptHandback,resolutionSnapshot,resolutionContext,coarseDiagnostics,roundTrip,schemaRoundTripEqual,createResolutionRandom,appendActualHistory,createResolutionLease,resolutionLeaseForContext,prepareResolutionLease,acquireResolutionLease,bindResolutionAdapter,assertLobHandbackSafe,assertResolutionHandbackSafe,releaseResolutionLease,leaseAudit};
});
