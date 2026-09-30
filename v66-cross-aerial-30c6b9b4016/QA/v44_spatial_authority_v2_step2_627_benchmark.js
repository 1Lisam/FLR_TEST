#!/usr/bin/env node
'use strict';
// Bounded root gate plus exact copy-boundary checks. Does not auto-pick in production.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'evidence/v44');
const H=require('../live_hybrid_session_v02'),V=require('../live_v06_scene_authority_browser'),S=require('../runtime/continuous_spatial_authority_v2'),P=require('../runtime/protagonist_match_controller');
const {runRoot,summarize}=require('./v44_spatial_authority_v2_step2_root_gameplay');
const seed='V44-SPATIAL-AUTHORITY-619-STEP2-SMOKE',deep=x=>x==null?x:JSON.parse(JSON.stringify(x)),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b),rows=[];
function check(field,a,b){const status=a===undefined?'NOT_EXPOSED':eq(a,b)?'PASS':'FAIL';rows.push({field,status,...(status==='FAIL'?{before:a,after:b??'MISSING'}:{})});return status;}
function exposed(label,a,b){for(const key of Object.keys(a||{}))check(`${label}.${key}`,a[key],b?.[key]);}
const required=['id','x','y','vx','vy','tx','ty','bodyAngle','faceTargetAngle','action','intent','responsibility','responsibilityType','responsibilityEpoch','responsibilityReason','responsibilityOwnerId','responsibilityTargetId','markTargetId'];
function players(label,a,b){check(`${label}.identitySet`,a.map(p=>p.id).sort(),b.map(p=>p.id).sort());for(const p of a){const q=b.find(x=>x.id===p.id);exposed(`${label}.${p.id}`,p,q);for(const key of required)if(!Object.hasOwn(p,key))check(`${label}.${p.id}.${key}`,undefined,q?.[key]);}}
function frameAudit(frames){const unique=new Map();for(const f of frames)if(f?.players)unique.set(f.time,f);const ordered=[...unique.values()].sort((a,b)=>a.time-b.time),jumps=[];for(let i=1;i<ordered.length;i++){const a=ordered[i-1],b=ordered[i],dt=b.time-a.time;for(const p of b.players){const q=a.players.find(x=>x.id===p.id),d=Math.hypot(p.x-q.x,p.y-q.y);if(d/Math.max(dt,.001)>16)jumps.push({id:p.id,from:a.time,to:b.time,distance:d,speed:d/dt});}}return{frames:ordered.length,jumps};}
function makeProbe(){let refs,A;const seams=[],facts={legacyTemplateActualWrites:0,actualSetterObservations:0,ballAliases:[],futureEvents:[],heroActions:[],clockJumps:[]};
 function watch(session){for(const p of session.state.spatial.players)for(const key of ['x','y']){let value=p[key];Object.defineProperty(p,key,{configurable:true,enumerable:true,get(){return value},set(next){const stack=new Error().stack;facts.actualSetterObservations++;if(/advanceSpatialLegacy|updateStructureLegacy/.test(stack))facts.legacyTemplateActualWrites++;value=next;}});}}
 const probe={created(s){refs={sp:s.state.spatial,ball:s.state.ball,players:[...s.state.spatial.players],history:s.coarseHistory};watch(s);},promotion(s,b){A=deep(b.stateSnapshot);facts.ballAliases.push(s.state.ball===s.state.spatial.ball);facts.futureEvents.push(H.futureEventCount(s));check('A.rng.state',A.rngState,s.rngState);},resolved(s,b,out){
  const B=out.promotionSnapshot||out.state.choiceBoundarySpatial.B,C=out.snapshot,prefix=`${b.sceneId}`;
  players(`${prefix}.A_B.players`,A.spatial.players,B.players);exposed(`${prefix}.A_B.ball`,A.spatial.ball,B.ball);
  check(`${prefix}.A_B.possession`,A.possession,B.possession);check(`${prefix}.A_B.clock`,A.second,B.time);check(`${prefix}.A_B.revision`,A.spatial.stateId,B.stateId);check(`${prefix}.A_B.parentRevision`,A.spatial.parentStateId,B.parentStateId);check(`${prefix}.A_B.matchId`,A.authorityV2Trace.matchId,B.spatialAuthorityV2.matchId);
  check(`${prefix}.A_B.hybridRng`,A.hybridRng,B.spatialAuthorityV2.hybridRng);check(`${prefix}.A_B.coreRng`,A.spatialResolution?.snapshot?.spatialAuthorityV2?.coreRng,B.spatialAuthorityV2.coreRng);
  for(const key of ['coarseHistory','spatialResolution'])check(`${prefix}.A_B.retained.${key}`,A[key],out.state.spatialAuthorityV2Carry[key]);
  for(const key of ['history','pending','choiceHistory','pauses'])check(`${prefix}.A_B.controller.${key}`,A[key],undefined);
  players(`${prefix}.C_rawSnapshot.players`,deep(out.state.m.players),C.players);exposed(`${prefix}.C_rawSnapshot.ball`,deep(out.state.m.ball),C.ball);
  check(`${prefix}.C.coreRng`,out.state.m.r.observe(),C.spatialAuthorityV2.coreRng);
  check(`${prefix}.C.restartSettled`,false,!!out.state.m.restart);check(`${prefix}.C.pending`,null,out.state.pending);
  const frames=out.frames||[...(out.episodeFrames||[]),...(out.postFrames||[])];
  const events=out.state.m.events||[],commits=(out.state.m.userChoiceLog||[]);
  facts.heroActions.push(...events.filter(e=>e.actorId===b.heroPlayerId&&['SHOT','HEADER_SHOT','PASS','TAKE_ON','CARRY'].includes(e.type)&&!commits.some(c=>c.commitEventId&&c.commitEventId===e.commitEventId)));
  seams.push({boundary:{id:b.sceneId,type:b.type,at:b.atSecond},A,B,C,controllerC:S.resolutionContext(out.state),frameAudit:frameAudit(frames),coreRngReference:out.state.m.r,notes:{objectIdentityAtoB:'CURRENT_STATE_COPY; IDs preserved, not zero-copy',coarseHistory:'retained as predecessor context; no merged Step3 replay architecture'}});
 },handback(s,b,out){const seam=seams.at(-1),C=seam.C,D=deep(H.snapshot(s)),prefix=b.sceneId;seam.D=D;delete seam.A.coarseHistory; // Exact history already asserted, avoid duplicating it in evidence.
  players(`${prefix}.C_D.players`,C.players,D.state.spatial.players);exposed(`${prefix}.C_D.ball`,C.ball,D.state.spatial.ball);
  check(`${prefix}.C_D.possession`,C.possession,D.state.possession);check(`${prefix}.C_D.clock`,C.time,D.state.second);check(`${prefix}.C_D.revision`,C.stateId,D.state.spatial.stateId);check(`${prefix}.C_D.parentRevision`,C.parentStateId,D.state.spatial.parentStateId);
  check(`${prefix}.C_D.matchId`,C.spatialAuthorityV2.matchId,D.spatialResolution.snapshot.spatialAuthorityV2.matchId);
  check(`${prefix}.C_D.hybridRng`,C.spatialAuthorityV2.hybridRng,{algorithm:'xorshift32',identity:s.opts.seed,state:s.rngState,drawCount:s._continuousSpatialAuthorityV2HybridDrawCount});
  check(`${prefix}.C_D.coreRng`,C.spatialAuthorityV2.coreRng,s._v2CoreRandom.observe());check(`${prefix}.C_D.coreRngReference`,true,seam.coreRngReference===s._v2CoreRandom);delete seam.coreRngReference;
  exposed(`${prefix}.C_D.controller`,seam.controllerC,D.spatialResolution.controller);exposed(`${prefix}.C_D.fullSnapshot`,C,D.spatialResolution.snapshot);delete seam.controllerC;
  check(`${prefix}.persistentSpatialObject`,true,refs.sp===s.state.spatial);check(`${prefix}.persistentBallObject`,true,refs.ball===s.state.ball);check(`${prefix}.persistentPlayerObjects`,true,refs.players.every(p=>s.state.spatial.players.includes(p)));
  check(`${prefix}.coarseHistoryObject`,true,refs.history===s.coarseHistory);facts.ballAliases.push(s.state.ball===s.state.spatial.ball);watch(s);
 },finished(s){facts.ballAliases.push(s.state.ball===s.state.spatial.ball);}};
 return{probe,seams,facts};
}
function stationaryProvenance(){
 // Replay #620's exact A through the still-retained legacy seed writer. The
 // schema selector is the only changed input; it selects that existing writer.
 const retained=JSON.parse(fs.readFileSync(path.join(OUT,'spatial_authority_v2_step2_620_seam.json'))),A=deep(retained.checkpoints.A),observer=S.createObserver({seed,matchId:'V44-627-RETAINED-620-PROBE'});
 A.spatial.schemaVersion='HYBRID_AUTHORITATIVE_COARSE_SPATIAL_1.0';
 const b={...retained.checkpointBoundary,id:retained.checkpointBoundary.id,sceneId:retained.checkpointBoundary.id,heroPlayerId:'H-ST',heroRole:'ST',heroTeam:'HOME',stateSnapshot:A},orig=P.step,ticks=[];
 P.step=(s,dt)=>{const before=deep({time:s.m.time,p:s.m.playersById['A-RW'],dead:s.m.stats.compressedDeadClock||0}),r=orig(s,dt);ticks.push({from:before.time,to:s.m.time,deadAdded:(s.m.stats.compressedDeadClock||0)-before.dead,before:before.p,after:deep(s.m.playersById['A-RW']),restart:s.m.restart?.kind||null,compressedDeadClockByKind:deep(s.m.stats.compressedDeadClockByKind||{}),events:deep(s.m.events.slice(-3))});return r;};
 let opened;try{opened=V.runNonHeroShotWindow(b,{seed:`${seed}|${b.sceneId}|V44-STEP2`,runtimeDir:path.join(ROOT,'runtime'),authorityV2Observer:observer});}finally{P.step=orig;}
 observer.flushMovementNull(opened.state.m.time);const trace=observer.summary(),intervals=trace.movementNullIntervals.filter(x=>x.playerId==='A-RW'&&x.stationaryAllowed===false),target=intervals.find(x=>Math.abs(x.start-32.1)<.01),clockJumps=ticks.filter(x=>x.deadAdded>0),stationaryTicks=ticks.filter(x=>x.from>=32.1-1e-6&&x.to<=57.4+1e-6&&Math.hypot(x.after.x-x.before.x,x.after.y-x.before.y)<.015);
 return{method:'Retained #620 checkpoint A -> existing seedMatchLegacy -> production runNonHeroShotWindow, matching #619. Only schema selector changed to choose retained legacy promotion. #620 itself used runToChoice and fell back to #619 for its reported stationary interval.',intervals,target,clockJumps,stationaryTicks:stationaryTicks.map(x=>({from:x.from,to:x.to,deadAdded:x.deadAdded,x:x.after.x,y:x.after.y,tx:x.after.tx,ty:x.after.ty,action:x.after.action})),conclusion:'The retained A-RW reaches its carried target at 32.1. A GOAL adds 25 compressed dead-clock seconds on the 32.3 -> 57.4 step. Only 0.3 of the 25.3 match-clock seconds is visible simulation time. The carried target remains reached until goal restart setup writes RETURN_FOR_KICKOFF. This interval does not require a Step2 movement fix. The new V2 seam instead produces a GOAL_KICK with 24.3 compressed seconds; that separate observation must not be substituted for the original. Step4 MARK/HOLD is not proven fixed.',writers:['runtime/continuous_match_core.movePlayers: target arrival sets vx/vy=0','runtime/continuous_match_core.consumeCompressedDeadClock: GOAL 30.0 - 5.0 = 25.0','runtime/continuous_match_core.startGoalCelebration: restart setup after clock compression']};
}
function authorityControl(){
 const s=H.createSession({seed,heroTeam:'HOME',heroRole:'ST',heroPlayerId:'H-ST',durationSeconds:180,continuousSpatialAuthorityV2Coarse:true,matchId:'V44-627-HERO-CONTROL'}),p=s.state.spatial.players.find(p=>p.id==='H-ST');
 // Current-state fixture, no future result: protagonist has just obtained control.
 Object.assign(s.state.ball,{ownerId:p.id,lastTouchPlayerId:p.id,lastTouchTeam:p.team,x:p.x,y:p.y});
 const initial=deep(p),b=H.advanceUntilBoundary(s).boundary;
 check('H.heroControl.coarseClockFrozen',0,s.state.second);check('H.heroControl.noAutomaticCarry',initial,s.state.spatial.players.find(q=>q.id===p.id));
 check('H.heroControl.boundary','PROTAGONIST_2D_WINDOW',b.type);
 const opened=V.runToChoice(b,{seed:`${seed}|${b.sceneId}|V44-STEP2`,runtimeDir:path.join(ROOT,'runtime')}),before=hash({m:opened.E.snapshot(opened.state.m),pending:opened.state.pending,rng:opened.state.m.r.observe()}),option=opened.state.pending?.options[0];
 check('H.heroControl.pendingObserved',true,!!option);let rejected=false;try{V.applyChoiceAndAdvance(opened,option.id,'EXACT-TARGET-DOES-NOT-EXIST');}catch(e){rejected=e.message==='CHOICE_TARGET_NOT_AVAILABLE';}
 check('H.exactTarget.invalidRejected',true,rejected);check('H.exactTarget.rejectNoMutation',before,hash({m:opened.E.snapshot(opened.state.m),pending:opened.state.pending,rng:opened.state.m.r.observe()}));
 const choice=opened.state.pending.options.find(o=>o.targetId)||option,applied=V.applyChoiceAndAdvance(opened,choice.id,choice.targetId??null,{maxPostSeconds:1});
 check('H.explicitChoice.id',choice.id,applied.selectedChoice.id);check('H.explicitChoice.target',choice.targetId??null,applied.applyReceipt.targetId??null);check('H.explicitChoice.noPrecompute',false,applied.futureOutcomePrecomputed);
 return{fixture:'production root with current hero control only; no seeded future outcome',boundary:b.type,pendingKind:opened.pending?.kind,selected:{id:choice.id,targetId:choice.targetId??null},receipt:applied.applyReceipt};
}
function seamControls(){
 const root=JSON.parse(fs.readFileSync(path.join(OUT,'spatial_authority_v2_step2_627_root_gates.json'))),A=deep(root.seams[0].A),s=H.createSession({seed,heroTeam:'HOME',heroRole:'ST',heroPlayerId:'H-ST',durationSeconds:37,continuousSpatialAuthorityV2Coarse:true,matchId:A.authorityV2Trace.matchId});
 // Same observed root checkpoint, with a current airborne flight to exercise
 // the fields the naturally controlled promotion cannot cover.
 Object.assign(A.spatial.ball,{mode:'FLIGHT',kind:'PASS',ownerId:null,intendedReceiverId:'H-LW',z:1.2,vz:-.4,vx:9.5,vy:-2.5,originX:A.spatial.ball.x,originY:A.spatial.ball.y,age:.3});A.ball=A.spatial.ball;
 const b={id:A.spatial.boundaryId,sceneId:A.spatial.boundaryId,type:'PROTAGONIST_2D_WINDOW',atSecond:A.second,heroPlayerId:'H-ST',heroRole:'ST',heroTeam:'HOME',stateSnapshot:A};
 s.status='PAUSED';s.boundary=b;s.state.spatial=deep(A.spatial);s.state.ball=s.state.spatial.ball;s.state.second=A.second;s.rngState=A.rngState;
 const opts={seed:`${seed}|${b.sceneId}|V44-STEP2`,runtimeDir:path.join(ROOT,'runtime'),explicitHeroChoiceRequired:true},env=V.seedMatch(b,opts);
 exposed('control.flight.A_B.ball',A.spatial.ball,env.promotionSnapshot.ball);players('control.flight.A_B.players',A.spatial.players,env.promotionSnapshot.players);
 const C=env.E.snapshot(env.state.m),rngRef=env.state.m.r,rngState=rngRef.observe(),handback={state:env.state,snapshot:C,actualEvents:[],hadChoice:false};
 env.state.pending={id:'TEST_CURRENT_PENDING',futureOutcomePrecomputed:false};const before=hash(H.snapshot(s));let refused=false;try{H.resumeFromHighRes(s,handback);}catch(e){refused=e.message==='V2_PENDING_CHOICE_REQUIRES_RESOLUTION';}
 check('control.pending.handbackRejected',true,refused);check('control.pending.noMutation',before,hash(H.snapshot(s)));env.state.pending=null;
 H.resumeFromHighRes(s,handback);exposed('control.flight.C_D.ball',C.ball,s.state.ball);
 const next=H.advanceUntilBoundary(s).boundary,nextEnv=V.seedMatch(next,opts);
 check('control.secondPromotion.coreRngReference',true,nextEnv.state.m.r===rngRef);check('control.secondPromotion.coreRngStateAndDraws',rngState,nextEnv.state.m.r.observe());
 return{purpose:'Current flight full-field carrier and a second copy boundary; no multi-seed simulation',rows:deep(rows),PASS:!rows.some(x=>x.status==='FAIL')};
}
function main(){const start=Date.now(),probe=makeProbe(),legacy=runRoot(seed,false),v2=runRoot(seed,true,probe.probe),repeat=runRoot(seed,true),metrics={legacy:summarize(legacy),v2:summarize(v2)},provenance=stationaryProvenance(),control=authorityControl();
 const fails=rows.filter(x=>x.status==='FAIL'),seamPass=!fails.length&&probe.seams.length>0,noErrors=[legacy,v2,repeat].every(x=>!x.errors.length),v2Null=metrics.v2.movementNullIntervals.count,legacyNull=metrics.legacy.movementNullIntervals.count,coarseNull=(v2.trace.movementNullIntervals||[]).filter(x=>x.resolutionMode==='COARSE_V2'&&!x.stationaryAllowed&&['ST','LCM','LW','RW'].includes(x.slot));
 const frameJumps=probe.seams.flatMap(x=>x.frameAudit.jumps),gates={
 A:{status:metrics.v2.ballTruthConflicts.count===0&&probe.facts.ballAliases.every(Boolean)?'PASS':'FAIL',prePromotionConflicts:v2.trace.violations.filter(x=>x.kind==='BALL_TRUTH_OWNER_CONFLICT'&&x.time<=v2.boundaries[0].atSecond).length,allRootConflicts:metrics.v2.ballTruthConflicts.count,ballObjectAliasChecks:probe.facts.ballAliases},
 B:{status:probe.facts.legacyTemplateActualWrites===0&&!metrics.v2.writerCounts['live_hybrid_session_v02.advanceSpatial']?'PASS':'FAIL',...{legacyTemplateActualWrites:probe.facts.legacyTemplateActualWrites,actualSetterObservations:probe.facts.actualSetterObservations},legacyWriterObserved:metrics.legacy.writerCounts['live_hybrid_session_v02.advanceSpatial'],v2LegacyWriterObserved:metrics.v2.writerCounts['live_hybrid_session_v02.advanceSpatial']||0},
 C:{status:v2Null<legacyNull*.5?'PASS':'FAIL',legacy:legacyNull,v2:v2Null,decreasePercent:100*(1-v2Null/legacyNull),v2Coarse:coarseNull.length},
 D:{status:metrics.v2.consecutiveCoarseCoordinateJumps.count===0&&frameJumps.length===0&&metrics.v2.behindGKOrGoalLineControlledOwner.count===0&&seamPass?'PASS':'FAIL',consecutiveCoarseJumps:metrics.v2.consecutiveCoarseCoordinateJumps.count,rawGapCandidates:metrics.v2.consecutiveCoarseCoordinateJumps.highResGapCandidates,highResFrameJumps:frameJumps,outsideOwnerProxy:metrics.v2.behindGKOrGoalLineControlledOwner.count,fullBehindGKPathology:'NOT_OBSERVED; outside-field owner proxy only'},
 E:{status:hash(v2.semantic)===hash(repeat.semantic)?'PASS':'FAIL',signature:hash(v2.semantic),repeatSignature:hash(repeat.semantic)},
 F:{status:v2.promotions>0?'PASS':'NOT_OBSERVED',naturalPromotions:v2.promotions,handbacks:v2.handbacks,boundaries:v2.boundaries},
 G:{status:v2Null<legacyNull*.5&&metrics.v2.consecutiveCoarseCoordinateJumps.count<metrics.legacy.consecutiveCoarseCoordinateJumps.count?'PASS':'FAIL',scope:'Step2-owned movement-null and coarse coordinate reset symptoms only; no overall match ecology or MARK/HOLD claim',movementNull:{legacy:legacyNull,v2:v2Null,v2Coarse:coarseNull.length},coarseJumps:{legacy:metrics.legacy.consecutiveCoarseCoordinateJumps.count,v2:metrics.v2.consecutiveCoarseCoordinateJumps.count}},
 H:{status:probe.facts.heroActions.length===0&&probe.facts.futureEvents.every(x=>x===0)&&!fails.some(x=>x.field.startsWith('H.'))?'PASS':'FAIL',uncommittedRootHeroActions:probe.facts.heroActions,futureEventCounts:probe.facts.futureEvents,explicitControl:control}
 };
 const result={schemaVersion:'V44_SPATIAL_AUTHORITY_V2_STEP2_627_ROOT_GATES_1.0',seed,bound:'legacy once; V2 once with field probes; same-seed V2 repeat; retained #620 single-seam provenance; one current hero-control fixture',metrics,gates,rootErrors:{legacy:legacy.errors,v2:v2.errors,repeat:repeat.errors},fieldAssertions:{method:'Exact exposed field values, identity-keyed players, full exposed ball and final snapshot/controller copy. A/B and C/D are preservation boundaries; B/C executes real football and is not expected equal.',counts:{PASS:rows.filter(x=>x.status==='PASS').length,FAIL:fails.length,NOT_EXPOSED:rows.filter(x=>x.status==='NOT_EXPOSED').length},rows},seams:probe.seams,stationaryProvenance:provenance,remainingStep3Step4Issues:['Core/controller creation and active history timelines remain legacy. This change copies current state and retains history context; no zero-copy resolution lease or merged replay architecture.','Core and coarse RNG remain distinct deterministic domains; live core RNG reference and exposed checkpoint preserved. Serialization/restart of RNG closures is not implemented.','Legacy high-res short target dwell and MARK/HOLD behavior remain Step4 investigation; compressed dead-clock time must not be called live stationary time.'],GAMEPLAY_PASS:false,USER_VISIBLE_PROVEN:false,STEP2_PASS:noErrors&&seamPass&&Object.values(gates).every(x=>x.status==='PASS'),deployed:false,validationElapsedSeconds:(Date.now()-start)/1000};
 fs.writeFileSync(path.join(OUT,'spatial_authority_v2_step2_627_root_gates.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({STEP2_PASS:result.STEP2_PASS,rootErrors:result.rootErrors,gates:Object.fromEntries(Object.entries(gates).map(([k,v])=>[k,v.status])),assertions:result.fieldAssertions.counts,failures:fails,frameJumps,retainedStationary:provenance.target},null,2));if(!result.STEP2_PASS)process.exitCode=2;
}
if(require.main===module){
 if(process.argv.includes('--seam-controls-only')){
  const result=seamControls();fs.writeFileSync(path.join(OUT,'spatial_authority_v2_step2_627_seam_controls.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({PASS:result.PASS,assertions:result.rows.length,failures:result.rows.filter(x=>x.status==='FAIL')},null,2));if(!result.PASS)process.exitCode=2;
 }else if(process.argv.includes('--provenance-only')){
  const provenance=stationaryProvenance(),expected={start:32.1,end:57.4,duration:25.3},actual=provenance.target?{start:provenance.target.start,end:Number(provenance.target.end.toFixed(6)),duration:provenance.target.duration}:null;
  const report={...provenance,exactRetainedIntervalReproduced:eq(expected,actual)};
  fs.writeFileSync(path.join(OUT,'spatial_authority_v2_step2_627_stationary_provenance.json'),JSON.stringify(report,null,2)+'\n');
  const rootPath=path.join(OUT,'spatial_authority_v2_step2_627_root_gates.json'),root=JSON.parse(fs.readFileSync(rootPath));root.stationaryProvenance=report;root.evidenceReuse={reason:'Production source, root command/configuration and seed unchanged; only the stationary diagnostic runner corrected from #620 runToChoice to the #619 production NON_HERO_SHOT runner.',rootDeterministicChecksReused:true};
  fs.writeFileSync(rootPath,JSON.stringify(root,null,2)+'\n');
  console.log(JSON.stringify({exactRetainedIntervalReproduced:report.exactRetainedIntervalReproduced,target:report.target,clockJumps:report.clockJumps.map(x=>({from:x.from,to:x.to,deadAdded:x.deadAdded})),stationaryTicks:report.stationaryTicks},null,2));if(!report.exactRetainedIntervalReproduced)process.exitCode=2;
 }else main();
}
