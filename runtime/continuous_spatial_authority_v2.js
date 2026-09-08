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
    final:{tx:rounded(p?.tx),ty:rounded(p?.ty),facing:rounded(p?.faceTargetAngle),writer:targetWriter},
    intent:{type:p?.intent?.type||p?.tacticalTask||p?.action||null,targetId:p?.intent?.targetId||p?.targetId||p?.markTargetId||null,targetPoint:p?.intent?.targetPoint?deep(p.intent.targetPoint):(Number.isFinite(p?.tx)&&Number.isFinite(p?.ty)?{x:rounded(p.tx),y:rounded(p.ty)}:null),reasonCode:p?.intent?.reasonCode||p?.responsibilityReason||null,source:p?.intent?.source||null,epoch:finite(p?.intent?.epoch??p?.responsibilityEpoch),createdAt:finite(p?.intent?.createdAt),expiresAt:finite(p?.intent?.expiresAt??p?.lockTargetUntil),stationaryAllowed:p?.intent?.stationaryAllowed===true},
    responsibility:{type:p?.responsibility?.type||p?.responsibilityType||null,targetId:p?.responsibility?.targetId||p?.responsibilityTargetId||p?.markTargetId||null,zone:p?.responsibility?.zone||null,goalSideReference:p?.responsibility?.goalSideReference||null,distanceBand:p?.responsibility?.distanceBand||null,epoch:finite(p?.responsibility?.epoch??p?.responsibilityEpoch),reasonCode:p?.responsibility?.reasonCode||p?.responsibilityReason||null},
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
    restart:core?.restart?deep(core.restart):null,setPieceLive:core?.setPieceLive?deep(core.setPieceLive):null,teamReferences:state?.structure?deep(state.structure):(core?.tactical?deep(core.tactical):null)};
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
    const role=COARSE_ROLE[slot],w=worldPoint(team,COARSE_BASE_X[role],COARSE_SLOT_Y[slot]);
    const p={id:`${team==='HOME'?'H':'A'}-${slot}`,team,slot,role,x:w.x,y:w.y,vx:0,vy:0,tx:w.x,ty:w.y,bodyAngle:team==='HOME'?0:Math.PI,faceTargetAngle:team==='HOME'?0:Math.PI,action:'MATCH_START_SHAPE',tacticalTask:'MATCH_START_SHAPE',markTargetId:null,responsibilityReason:'MATCH_START',responsibilityEpoch:0,responsibilityOwnerId:null,responsibilityTargetId:null};
    p.intent=createInitialIntent(p);players.push(p);
  }
  const owner=players.find(p=>p.id==='H-CM');owner.x=owner.tx=50.4;owner.y=owner.ty=34;
  const ball={mode:'CONTROLLED',kind:'CONTROL',x:owner.x,y:owner.y,z:0,vx:0,vy:0,vz:0,ownerId:owner.id,intendedReceiverId:null,lastTouchTeam:'HOME',lastTouchPlayerId:owner.id,team:'HOME',lane:'CENTER',progress:.48,causalHistory:[{at:0,kind:'KICKOFF_CONTROL',playerId:owner.id,team:'HOME',x:owner.x,y:owner.y}]};
  return{schemaVersion:COARSE_SCHEMA_VERSION,authorityMode:'V2_CONTINUOUS_COARSE',time:0,stateId:'CV2000000',parentStateId:null,boundaryId:null,players,ball,futureOutcomePrecomputed:false,intentSequence:0,stimulusRevision:0,touchSequence:1,writerStats:{actualIntegratorWrites:0,intentTransitions:0,roleTemplateActualWrites:0,roleTemplateTargetRematerializations:0,causalOwnerChanges:0,coordinateResets:0}};
}
function syncBallDerived(state){
  const sp=state.spatial,ball=sp.ball,owner=sp.players.find(p=>p.id===ball.ownerId)||null;
  if(ball.mode==='CONTROLLED'&&owner){ball.team=owner.team;state.possession=owner.team;}
  else if(ball.lastTouchTeam)ball.team=ball.lastTouchTeam;
  const referenceTeam=ball.team||state.possession||'HOME',local=localPoint(referenceTeam,Number(ball.x)||0,Number(ball.y)||34);
  ball.progress=clamp(local.x/105,.02,.98);ball.lane=local.y<25?'LEFT':local.y>43?'RIGHT':'CENTER';state.ball=ball;
  state.zone=ball.progress<.28?'OWN_THIRD':ball.progress<.62?'MIDFIELD':ball.progress<.88?'FINAL_THIRD':'BOX';
  state.phase=state.phase==='TRANSITION'&&Number(state._v2TransitionUntil||0)>Number(sp.time)?'TRANSITION':ball.progress<.32?'BUILD_UP':ball.progress<.62?'PROGRESSION':ball.progress<.82?'FINAL_THIRD':'CHANCE';
  return ball;
}
function activateCoarseState(state,at=0){
  const oldSpatial=state.spatial||{},oldAbstract=state.ball||{},sourcePlayers=Array.isArray(oldSpatial.players)?oldSpatial.players:[];
  if(oldSpatial.schemaVersion===COARSE_SCHEMA_VERSION){state.ball=oldSpatial.ball;syncBallDerived(state);return oldSpatial;}
  const players=sourcePlayers.map(row=>{
    const slot=row.slot||coarseSlot(row.id),team=row.team||coarseTeam(row.id),role=row.role||COARSE_ROLE[slot]||'CM';
    const p={...row,team,slot,role,x:Number(row.x),y:Number(row.y),vx:Number(row.vx)||0,vy:Number(row.vy)||0,tx:Number.isFinite(row.tx)?Number(row.tx):Number(row.x),ty:Number.isFinite(row.ty)?Number(row.ty):Number(row.y),bodyAngle:Number.isFinite(row.bodyAngle)?row.bodyAngle:(team==='HOME'?0:Math.PI),faceTargetAngle:Number.isFinite(row.faceTargetAngle)?row.faceTargetAngle:(team==='HOME'?0:Math.PI)};
    p.intent=row.intent?deep(row.intent):createInitialIntent(p);p.intent.expiresAt=Math.min(Number(p.intent.expiresAt)||at,at);return p;
  });
  const physical=oldSpatial.ball||{},ball={...oldAbstract,...physical,z:Number(physical.z)||0,vz:Number(physical.vz)||0,kind:physical.kind||(physical.mode==='FLIGHT'?'PASS':'CONTROL'),intendedReceiverId:physical.intendedReceiverId||null,lastTouchTeam:physical.lastTouchTeam||state.possession||oldAbstract.team||null,lastTouchPlayerId:physical.lastTouchPlayerId||physical.lastTouchPlayer||physical.ownerId||null,causalHistory:deep(physical.causalHistory||[])};
  state.spatial={...oldSpatial,schemaVersion:COARSE_SCHEMA_VERSION,authorityMode:'V2_CONTINUOUS_COARSE',time:Number(oldSpatial.time??at),stateId:oldSpatial.stateId&&String(oldSpatial.stateId).startsWith('CV2')?oldSpatial.stateId:'CV2000000',parentStateId:oldSpatial.parentStateId||null,boundaryId:null,players,ball,futureOutcomePrecomputed:false,intentSequence:Number(oldSpatial.intentSequence)||0,stimulusRevision:Number(oldSpatial.stimulusRevision)||0,touchSequence:Number(oldSpatial.touchSequence)||0,writerStats:{actualIntegratorWrites:0,intentTransitions:0,roleTemplateActualWrites:0,roleTemplateTargetRematerializations:0,causalOwnerChanges:0,coordinateResets:0,...(oldSpatial.writerStats||{})}};
  state.ball=ball;syncBallDerived(state);return state.spatial;
}
function ballStimulus(state){const b=state.spatial.ball;return{ownerId:b.ownerId||null,x:Number(b.x)||0,y:Number(b.y)||0,mode:b.mode||null,possession:state.possession||null,phase:state.phase||null,revision:Number(state.spatial.stimulusRevision)||0};}
function stimulusChanged(a,b){return!a||a.ownerId!==b.ownerId||a.mode!==b.mode||a.possession!==b.possession||a.phase!==b.phase||a.revision!==b.revision||Math.hypot((a.x||0)-b.x,(a.y||0)-b.y)>3.25;}
function clampTargetFromCurrent(player,target,maxDistance=11){const dx=target.x-player.x,dy=target.y-player.y,d=Math.hypot(dx,dy);if(d<=maxDistance)return{x:clamp(target.x,3.5,101.5),y:clamp(target.y,3.5,64.5)};return{x:clamp(player.x+dx*maxDistance/d,3.5,101.5),y:clamp(player.y+dy*maxDistance/d,3.5,64.5)};}
function proposalFor(state,player,now){
  const team=player.team,inPoss=state.possession===team,slot=player.slot,role=player.role,sp=state.spatial,ball=sp.ball,local=localPoint(team,player.x,player.y),bl=localPoint(team,ball.x,ball.y),shape=state.structure?.[team]||{width:50,lineHeight:50,transitionDebt:0};
  const width=clamp(Number(shape.width||50)/50,.76,1.24),lineBias=clamp((Number(shape.lineHeight||50)-50)*.05,-2.5,2.5),wave=Math.sin(now*.71+idPhase(player.id)*Math.PI*2),attackStep=role==='ST'?5.4:role==='WF'?4.8:role==='FB'?3.8:3.2;
  let tx=local.x,ty=local.y,type='LIVE_SPACE',reason='LIVE_SPACE_OCCUPATION',targetId=null,stationaryAllowed=false;
  if(role==='GK'){
    tx=clamp(5.5+bl.x*.025,5.2,9.2);ty=34+(bl.y-34)*.10;type='GK_COVER';reason='GK_GOAL_COVER_REFERENCE';stationaryAllowed=Math.hypot(tx-local.x,ty-local.y)<.55;
  }else if(player.id===ball.ownerId){
    tx=clamp(local.x+attackStep,4,98);ty=clamp(local.y+(34-local.y)*.10+wave*.9,5,63);type='BALL_CARRY';reason='PHYSICAL_CONTROLLED_BALL_ADVANCE';
  }else if(role==='FB'&&!inPoss){
    const threatSlot=slot==='RB'?'LW':'RW',threat=sp.players.find(p=>p.team===coarseOther(team)&&p.slot===threatSlot);
    if(threat){const tl=localPoint(team,threat.x,threat.y);tx=clamp(tl.x-2.8,12,82);ty=clamp(tl.y+(34-tl.y)*.14,5,63);type='WIDE_CONTAIN';reason='WIDE_THREAT_CONTAIN';targetId=threat.id;}
    else{tx=clamp(27+lineBias+(bl.x-52)*.08,16,48);ty=34+(COARSE_SLOT_Y[slot]-34)*width;type='REST_DEFENCE';reason='FULLBACK_REST_BALANCE_REFERENCE';}
  }else if(role==='CB'&&!inPoss){
    const threat=sp.players.find(p=>p.team===coarseOther(team)&&p.slot==='ST');if(threat){const tl=localPoint(team,threat.x,threat.y);tx=clamp(tl.x-3.4,13,82);ty=clamp(tl.y+(34-tl.y)*.22,15,53);targetId=threat.id;type='CENTRAL_COVER';reason='CENTRAL_THREAT_GOAL_SIDE_REFERENCE';}
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
  }else{
    tx=clamp(local.x-(2.6+Math.max(0,bl.x-local.x)*.08),12,86);ty=clamp(local.y+(bl.y-local.y)*.20+wave*.5,6,62);type='RECOVERY';reason='BALL_RELATIVE_DEFENSIVE_RECOVERY';
  }
  let world=worldPoint(team,tx,ty),distance=Math.hypot(world.x-player.x,world.y-player.y);
  if(role!=='GK'&&distance<1.2){const dir=team==='HOME'?1:-1,side=(idPhase(player.id)>.5?1:-1);world={x:clamp(player.x+dir*2.2,3.5,101.5),y:clamp(player.y+side*1.15,3.5,64.5)};reason=`${reason}_TARGET_REACHED_REEVALUATION`;}
  world=clampTargetFromCurrent(player,world,11);
  return{type,targetId,targetPoint:world,reasonCode:reason,source:'CONTINUOUS_SPATIAL_AUTHORITY_V2_INTENT_ARBITER',stationaryAllowed,expiresAt:Number((now+2.0+idPhase(player.id)*1.15).toFixed(3))};
}
function commitIntent(state,player,proposal,now,cause){
  const sp=state.spatial,prior=player.intent||{},epoch=Number(prior.epoch||0)+1,target=proposal.targetId&&sp.players.find(p=>p.id===proposal.targetId),intent={...proposal,epoch,createdAt:Number(now.toFixed(3)),transitionCause:cause||'EXPIRY_OR_STIMULUS',stimulus:ballStimulus(state),targetObserved:target?{x:Number(target.x),y:Number(target.y)}:null};
  player.intent=intent;player.tx=intent.targetPoint.x;player.ty=intent.targetPoint.y;player.faceTargetAngle=Math.atan2(player.ty-player.y,player.tx-player.x);player.action=intent.type;player.tacticalTask=intent.type;player.markTargetId=intent.targetId||null;player.responsibilityTargetId=intent.targetId||null;player.responsibilityReason=intent.reasonCode;player.responsibilityEpoch=epoch;sp.intentSequence++;sp.writerStats.intentTransitions++;return intent;
}
function shouldReevaluate(state,player,now){const i=player.intent;if(!i||now>=Number(i.expiresAt||0)-1e-6)return'INTENT_EXPIRED';if(stimulusChanged(i.stimulus,ballStimulus(state)))return'FOOTBALL_STIMULUS_CHANGED';const target=i.targetId&&state.spatial.players.find(p=>p.id===i.targetId);if(target&&Math.hypot(target.x-(i.targetObserved?.x??target.x),target.y-(i.targetObserved?.y??target.y))>3.25)return'RESPONSIBILITY_TARGET_MOVED';if(target&&Math.hypot(target.x-(i.targetPoint?.x??target.x),target.y-(i.targetPoint?.y??target.y))>8.0)return'RESPONSIBILITY_BAND_STALE';if(Math.hypot((i.targetPoint?.x??player.tx)-player.x,(i.targetPoint?.y??player.ty)-player.y)<.78)return'TARGET_REACHED';return null;}
function recordTouch(state,kind,player,at,extra={}){const sp=state.spatial,ball=sp.ball,row={sequence:++sp.touchSequence,at:Number(at.toFixed(3)),kind,playerId:player?.id||null,team:player?.team||null,x:rounded(ball.x),y:rounded(ball.y),...extra};boundedHistory(ball.causalHistory||(ball.causalHistory=[]),row);return row;}
function setControlled(state,player,at,kind='CAUSAL_TOUCH'){
  const sp=state.spatial,ball=sp.ball,prior=ball.ownerId||null;ball.mode='CONTROLLED';ball.kind='CONTROL';ball.ownerId=player.id;ball.intendedReceiverId=null;ball.vx=Number(player.vx)||0;ball.vy=Number(player.vy)||0;ball.vz=0;ball.z=0;ball.lastTouchTeam=player.team;ball.lastTouchPlayerId=player.id;state.possession=player.team;if(prior!==player.id)sp.writerStats.causalOwnerChanges++;recordTouch(state,kind,player,at,{previousOwnerId:prior});sp.stimulusRevision++;syncBallDerived(state);return player;
}
function beginPass(state,targetId,at){
  const sp=state.spatial,ball=sp.ball,owner=sp.players.find(p=>p.id===ball.ownerId),target=sp.players.find(p=>p.id===targetId);if(!owner||!target||target.team!==owner.team)return null;
  ball.x=owner.x;ball.y=owner.y;const aimX=clamp(target.x+(Number(target.vx)||0)*.65,1,104),aimY=clamp(target.y+(Number(target.vy)||0)*.65,1,67),dx=aimX-ball.x,dy=aimY-ball.y,d=Math.hypot(dx,dy);if(d<1.5)return null;
  const speed=clamp(12+d*.12,12,19);ball.mode='FLIGHT';ball.kind='PASS';ball.ownerId=null;ball.intendedReceiverId=target.id;ball.vx=dx/d*speed;ball.vy=dy/d*speed;ball.z=0;ball.vz=0;ball.lastTouchTeam=owner.team;ball.lastTouchPlayerId=owner.id;recordTouch(state,'PASS_RELEASE',owner,at,{targetId:target.id});sp.stimulusRevision++;syncBallDerived(state);return{owner,target,distance:d};
}
function tryCausalTurnover(state,at,maxDistance=3.0){
  const sp=state.spatial,ball=sp.ball,owner=sp.players.find(p=>p.id===ball.ownerId);if(!owner||ball.mode!=='CONTROLLED')return null;
  let best=null,bestD=Infinity;for(const p of sp.players){if(p.team===owner.team||p.role==='GK')continue;const d=Math.hypot(p.x-ball.x,p.y-ball.y);if(d<bestD){best=p;bestD=d;}}
  if(!best||bestD>maxDistance)return null;setControlled(state,best,at,'PRESSURE_TURNOVER_TOUCH');state.phase='TRANSITION';state._v2TransitionUntil=at+2.5;return{player:best,wonFrom:owner,distance:bestD};
}
function integrateBall(state,dt,now){
  const sp=state.spatial,ball=sp.ball;
  if(ball.mode==='CONTROLLED'){
    const owner=sp.players.find(p=>p.id===ball.ownerId);if(owner){ball.vx=owner.vx;ball.vy=owner.vy;ball.x=owner.x;ball.y=owner.y;ball.z=0;ball.vz=0;}else{ball.mode='LOOSE';ball.ownerId=null;ball.intendedReceiverId=null;}
  }else if(ball.mode==='FLIGHT'){
    ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;ball.x=clamp(ball.x,.3,104.7);ball.y=clamp(ball.y,.3,67.7);const intended=sp.players.find(p=>p.id===ball.intendedReceiverId),candidates=sp.players.map(p=>({p,d:Math.hypot(p.x-ball.x,p.y-ball.y)})).filter(x=>x.d<1.45||(x.p===intended&&x.d<2.15)).sort((a,b)=>a.d-b.d);if(candidates.length)setControlled(state,candidates[0].p,now,candidates[0].p===intended?'PASS_RECEIVE_TOUCH':'PASS_INTERCEPTION_TOUCH');else{ball.vx*=Math.pow(.985,dt);ball.vy*=Math.pow(.985,dt);if((ball.x<=.31||ball.x>=104.69||ball.y<=.31||ball.y>=67.69)||Math.hypot(ball.vx,ball.vy)<2.2){ball.mode='LOOSE';ball.kind='LOOSE';ball.ownerId=null;ball.intendedReceiverId=null;sp.stimulusRevision++;}}
  }else{
    ball.x=clamp(ball.x+ball.vx*dt,.3,104.7);ball.y=clamp(ball.y+ball.vy*dt,.3,67.7);ball.vx*=Math.pow(.72,dt);ball.vy*=Math.pow(.72,dt);let best=null,bestD=1.25;for(const p of sp.players){const d=Math.hypot(p.x-ball.x,p.y-ball.y);if(d<bestD){best=p;bestD=d;}}if(best)setControlled(state,best,now,'LOOSE_BALL_RECOVERY_TOUCH');
  }
  syncBallDerived(state);
}
function advanceCoarseTo(session,end,opts={}){
  const state=session.state,sp=activateCoarseState(state,state.second),cadence=Number(session.coarseCadence)||.5,target=Number(end);if(target<Number(sp.time)-1e-6)throw new Error('V2_COARSE_TIME_REVERSAL');
  while(Number(sp.time)<target-1e-6){if(opts.heroPlayerId&&sp.ball.mode==='CONTROLLED'&&sp.ball.ownerId===opts.heroPlayerId)break;const dt=Math.min(cadence,target-Number(sp.time)),now=Number(sp.time);for(const p of sp.players){const cause=shouldReevaluate(state,p,now);if(cause)commitIntent(state,p,proposalFor(state,p,now),now,cause);const dx=p.tx-p.x,dy=p.ty-p.y,d=Math.hypot(dx,dy),maxSpeed=p.role==='GK'?4.8:p.role==='CB'?6.2:p.role==='FB'?7.2:p.role==='ST'||p.role==='WF'?7.8:7.0,accel=p.role==='GK'?5.0:7.2,desired=Math.min(maxSpeed,Math.sqrt(Math.max(0,2*accel*d))),dvx=d?dx/d*desired-p.vx:-p.vx,dvy=d?dy/d*desired-p.vy:-p.vy,change=Math.hypot(dvx,dvy),limit=accel*dt;if(change>limit){p.vx+=dvx/change*limit;p.vy+=dvy/change*limit;}else{p.vx+=dvx;p.vy+=dvy;}let nx=p.x+p.vx*dt,ny=p.y+p.vy*dt;if(d>0&&Math.hypot(nx-p.x,ny-p.y)>=d){nx=p.tx;ny=p.ty;p.vx=0;p.vy=0;}p.x=clamp(nx,2.5,102.5);p.y=clamp(ny,2.5,65.5);if(Math.hypot(p.vx,p.vy)>.03)p.bodyAngle=Math.atan2(p.vy,p.vx);sp.writerStats.actualIntegratorWrites++;}
    const next=Number((Number(sp.time)+dt).toFixed(3));integrateBall(state,dt,next);sp.parentStateId=sp.stateId;sp.stateId=`CV2${String(++session.coarseStateCounter).padStart(7,'0')}`;sp.time=next;state.second=next;state.minute=next/60;state._v2LastIntegratedPriorState=opts.priorStateLabel||null;if(typeof opts.record==='function')opts.record(opts.eventId||null);
  }
  return sp;
}
function refreshIntents(state,event=null){const sp=activateCoarseState(state,state.second),now=Number(sp.time);sp.stimulusRevision++;for(const p of sp.players)commitIntent(state,p,proposalFor(state,p,now),now,event?.id?`EVENT:${event.id}`:'EXPLICIT_REEVALUATION');return sp;}
const LEASE_SCHEMA_VERSION='CONTINUOUS_SPATIAL_AUTHORITY_V2_RESOLUTION_LEASE_1.0';
const ACTUAL_HISTORY_SCHEMA_VERSION='CONTINUOUS_ACTUAL_HISTORY_1.0';
// Step4 consumes this same Step3 lease/history authority. Gameplay contact adds
// no parallel spatial state, RNG, ball truth, or writable authority.
const STEP4_CONTINUITY_CONTRACT='SPATIAL_AUTHORITY_V2_STEP4_REUSES_STEP3_LEASE';
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
  const row=deep(frame);row.actualOrigin=true;row.historySchemaVersion=ACTUAL_HISTORY_SCHEMA_VERSION;row.historyOrigin=origin;row.synthetic=false;row.resimulated=false;row.reconstructed=false;history.push(row);
  const cutoff=time-Math.max(10,Number(historySeconds)||12);while(history.length>1&&historyTime(history[0])<cutoff-1e-6)history.shift();return row;
}
function createResolutionLease(session){
  const sp=session?.state?.spatial;if(!sp||!Array.isArray(sp.players)||sp.players.length!==22)throw new Error('V2_LEASE_CANONICAL_SPATIAL_REQUIRED');
  const history=session.actualHistory||session.coarseHistory||[];
  const lease={schemaVersion:LEASE_SCHEMA_VERSION,authorityId:session.opts?.matchId||session._continuousSpatialAuthorityV2MatchId||`HYBRID:${session.opts?.seed||'FLR-LIVE-HYBRID-02'}`,owner:'COARSE',writableAuthorityCount:1,canonicalRoot:session,canonicalSpatial:sp,canonicalPlayers:sp.players,canonicalBall:sp.ball,history,historySeconds:Number(session.coarseHistorySeconds)||45,resolutionRandom:createResolutionRandom(),coreMatch:null,controller:null,currentBoundaryId:null,acquisitions:0,releases:0,initialPlayerRefs:[...sp.players],initialBallRef:sp.ball,initialSpatialRef:sp};leaseRegistry.set(lease.authorityId,lease);return lease;
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
  for(const p of sp.players){const base=byDefault.get(p.id);if(!base)throw new Error(`V2_PLAYER_IDENTITY_MISMATCH:${p.id}`);const carried=deep(p);replaceFields(p,{...base,nextThink:Number(ctx.second)+.12,runUntil:Number(ctx.second)+.25,...carried});p.hasBall=sp.ball.mode==='CONTROLLED'&&p.id===sp.ball.ownerId;}
  const initialBall={z:0,vx:0,vy:0,vz:0,intendedReceiverId:null,age:0,...sp.ball};replaceFields(sp.ball,initialBall);if(!Object.hasOwn(sp.ball,'lastTouchPlayer'))sp.ball.lastTouchPlayer=sp.ball.lastTouchPlayerId??null;
  Object.defineProperty(sp.ball,'lastTouchPlayerId',{get(){return this.lastTouchPlayer;},set(value){this.lastTouchPlayer=value;},enumerable:true,configurable:true});
  m.players=sp.players;m.playersById=Object.fromEntries(sp.players.map(p=>[p.id,p]));m.ball=sp.ball;m.ballOwner=sp.ball.ownerId||null;m.lastTouchTeam=sp.ball.lastTouchTeam||ctx.possession||null;m.lastTouchPlayer=sp.ball.lastTouchPlayer??null;
  m.time=Number(ctx.second);m.score=lease.canonicalRoot?.state?.score||ctx.score;m.possession=ctx.possession;m.phase=ctx.phase;m.restart=lease.coreMatch?m.restart:null;m.completed=false;m.nextShape=m.time+.25;m.transitionUntil=ctx.phase==='TRANSITION'?m.time+2.2:0;if(!lease.coreMatch)m.events=[];
  m.stats.currentPossessionTeam=ctx.possession;m.stats.currentPossessionStartedAt=m.time;m.r=lease.resolutionRandom;
  Object.defineProperty(m,'_resolutionLease',{value:lease,writable:false,configurable:true,enumerable:false});
  lease.coreMatch=m;lease.controller=controller;controller.history=lease.history;controller.actualHistory=lease.history;controller.actualHistoryLineageId=lease.authorityId;controller.actualHistoryRetentionSeconds=lease.historySeconds;return m;
}
function releaseResolutionLease(session,handback){
  const lease=session?._v2ResolutionLease||handback?.state?.m?._resolutionLease;if(!lease||lease.owner!=='HIGH_RES')throw new Error('V2_RESOLUTION_LEASE_NOT_ACTIVE');
  const m=handback?.state?.m;if(m!==lease.coreMatch||m.players!==lease.canonicalPlayers||m.ball!==lease.canonicalBall)throw new Error('V2_RESOLUTION_ADAPTER_IDENTITY_LOST');
  const sp=lease.canonicalSpatial,snap=handback.snapshot;if(!snap||Number(snap.time)<Number(sp.time)-1e-6)throw new Error('V2_RESOLUTION_HANDBACK_TIME_REVERSAL');
  appendActualHistory(lease.history,snap,'ACTUAL_HIGH_RES_HANDOFF',lease.historySeconds);sp.parentStateId=sp.stateId;sp.stateId=snap.stateId||`${sp.stateId}:HR:${Number(snap.time).toFixed(6)}`;sp.time=Number(snap.time);sp.boundaryId=null;sp.authorityMode='V2_CONTINUOUS_COARSE';sp.futureOutcomePrecomputed=false;
  if(session?.state){session.state.spatial=sp;session.state.ball=sp.ball;session.state.second=Number(snap.time);session.state.minute=Number(snap.time)/60;session.actualHistory=lease.history;session.coarseHistory=lease.history;}
  lease.owner='COARSE';lease.currentBoundaryId=null;lease.releases++;return lease;
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
function resolutionContext(controller){const out={};for(const key of RESOLUTION_CONTEXT_FIELDS)if(Object.prototype.hasOwnProperty.call(controller,key))out[key]=deep(controller[key]);return out;}
function physicalOwner(state){const sp=state?.spatial,ball=sp?.ball;return sp?.players?.find(p=>p.id===ball?.ownerId)||null;}
function coarseDiagnostics(state){const sp=state?.spatial||{};return{schemaVersion:sp.schemaVersion||null,authorityMode:sp.authorityMode||null,writerStats:deep(sp.writerStats||{}),touchHistory:deep(sp.ball?.causalHistory||[]),intentTransitions:(sp.players||[]).map(p=>({playerId:p.id,intent:deep(p.intent||null)}))};}
function roundTrip(observation){return JSON.parse(JSON.stringify(observation));}
function schemaRoundTripEqual(observation){return same(observation,roundTrip(observation));}

return{SCHEMA_VERSION,TRACE_VERSION,FEATURE_FLAG,COARSE_FEATURE_FLAG,COARSE_SCHEMA_VERSION,LEASE_SCHEMA_VERSION,ACTUAL_HISTORY_SCHEMA_VERSION,STEP4_CONTINUITY_CONTRACT,enabled,coarseEnabled,createObserver,getObserver,observerForBoundary,attachBoundary,createCanonicalObservation,createCoarseSpatial,activateCoarseState,syncBallDerived,advanceCoarseTo,refreshIntents,beginPass,tryCausalTurnover,physicalOwner,adoptHandback,resolutionSnapshot,resolutionContext,coarseDiagnostics,roundTrip,schemaRoundTripEqual,createResolutionRandom,appendActualHistory,createResolutionLease,resolutionLeaseForContext,prepareResolutionLease,acquireResolutionLease,bindResolutionAdapter,releaseResolutionLease,leaseAudit};
});
