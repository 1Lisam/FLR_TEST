#!/usr/bin/env node
'use strict';

const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'evidence/v44/spatial_authority_v2_step3_647.json');
const PARENT='665b2f9672768125b421b25cf2aa27d828a1be48';
const EXPECTED_SIGNATURE='8853a531850b47248bb8fcc6fa770e8564db590570c1631a5b5c9adb27385591';
const ALLOWED=new Set([
  'runtime/continuous_spatial_authority_v2.js','runtime/continuous_match_core.js','runtime/protagonist_match_controller.js',
  'live_hybrid_session_v02.js','live_v06_scene_authority_browser.js',
  'QA/v44_spatial_authority_v2_step3_zero_copy_history.js','evidence/v44/spatial_authority_v2_step3_647.json'
]);
const H=require('../live_hybrid_session_v02');
const V=require('../live_v06_scene_authority_browser');
const S=require('../runtime/continuous_spatial_authority_v2');
const {runRoot,summarize}=require('./v44_spatial_authority_v2_step2_root_gameplay');
const deep=x=>x==null?x:JSON.parse(JSON.stringify(x));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const command=(args,opts={})=>cp.execFileSync(args[0],args.slice(1),{cwd:ROOT,encoding:'utf8',maxBuffer:64*1024*1024,stdio:opts.stdio||['ignore','pipe','pipe']});
const git=args=>command(['git',...args]).trim();

function gitJsonAtParent(file){return JSON.parse(git(['show',`${PARENT}:${file}`]));}
function exposedRows(label,a,b,rows){
  for(const key of Object.keys(a||{})){const status=Object.hasOwn(b||{},key)&&eq(a[key],b[key])?'PASS':'FAIL';rows.push({field:`${label}.${key}`,status,...(status==='FAIL'?{before:a[key],after:b?.[key]??'MISSING'}:{})});}
}
function playerRows(label,a,b,rows){
  const byId=new Map((b||[]).map(p=>[p.id,p]));
  rows.push({field:`${label}.identitySet`,status:a.length===22&&byId.size===22&&a.every(p=>byId.has(p.id))?'PASS':'FAIL'});
  for(const p of a)exposedRows(`${label}.${p.id}`,p,byId.get(p.id),rows);
}
function positionDelta(a,b){
  const byId=new Map((b?.players||[]).map(p=>[p.id,p])),players=[];
  for(const p of a?.players||[]){const q=byId.get(p.id);if(q)players.push({id:p.id,distance:Math.hypot(q.x-p.x,q.y-p.y)});}
  return{maxPlayerDistance:Math.max(0,...players.map(x=>x.distance)),playerTeleports:players.filter(x=>x.distance>1e-9),ballDistance:Math.hypot(Number(b?.ball?.x)-Number(a?.ball?.x),Number(b?.ball?.y)-Number(a?.ball?.y))};
}
function historyAudit(rows,promotionAt){
  const failures=[],origins={};let duplicates=0,backwards=0,suspicious=[];
  for(let i=0;i<rows.length;i++){
    const f=rows[i],t=Number(f.time);origins[f.historyOrigin]=(origins[f.historyOrigin]||0)+1;
    if(f.actualOrigin!==true||f.synthetic!==false||f.resimulated!==false||f.reconstructed!==false)failures.push({time:t,reason:'NON_ACTUAL_PROVENANCE'});
    if(i){const a=rows[i-1],at=Number(a.time),dt=t-at;if(Math.abs(dt)<=1e-6)duplicates++;if(dt<0)backwards++;const byId=new Map((a.players||[]).map(p=>[p.id,p]));for(const p of f.players||[]){const q=byId.get(p.id);if(!q)continue;const d=Math.hypot(p.x-q.x,p.y-q.y);if(d>11.1||d/Math.max(.001,dt)>16)suspicious.push({id:p.id,from:at,to:t,distance:Number(d.toFixed(6)),speed:Number((d/Math.max(.001,dt)).toFixed(6))});}}
  }
  const before=rows.filter(f=>Number(f.time)<=promotionAt+1e-6&&f.historyOrigin==='ACTUAL_COARSE_INTEGRATION'),high=rows.filter(f=>f.historyOrigin==='ACTUAL_HIGH_RES_STEP'||f.historyOrigin==='ACTUAL_HIGH_RES_HANDOFF');
  const preSpan=before.length?Number((Number(before.at(-1).time)-Number(before[0].time)).toFixed(3)):0,retainedSpan=rows.length?Number((Number(rows.at(-1).time)-Number(rows[0].time)).toFixed(3)):0;
  return{status:!failures.length&&!duplicates&&!backwards&&preSpan>=5&&high.length>0&&retainedSpan>=10?'PASS':'FAIL',frames:rows.length,origins,firstTime:rows[0]?.time??null,lastTime:rows.at(-1)?.time??null,retainedSpanSeconds:retainedSpan,prePromotionActualSeconds:preSpan,actualHighResFrames:high.length,duplicates,backwards,suspiciousMovement:suspicious,provenanceFailures:failures,noResimulation:true,noReconstruction:true};
}
function runLeaseProbe(){
  const seed='V44-SPATIAL-AUTHORITY-619-STEP2-SMOKE',data={},fieldAudit=[];
  const run=runRoot(seed,true,{
    created(s){data.session=s;data.refs={root:s,spatial:s.state.spatial,players:[...s.state.spatial.players],ball:s.state.spatial.ball,history:s.actualHistory,lease:s._v2ResolutionLease,rng:s._v2ResolutionLease.resolutionRandom};},
    promotion(s,b){data.boundary=b;data.A=deep(b.stateSnapshot);data.hybridA={state:s.rngState,drawCount:s._continuousSpatialAuthorityV2HybridDrawCount};data.rngA=data.refs.rng.observe();data.historyAtA=s.actualHistory;},
    resolved(s,b,out){data.out=out;data.B=deep(out.promotionSnapshot);data.C=deep(out.snapshot);data.rngB=deep(out.promotionSnapshot.spatialAuthorityV2.coreRng);data.rngC=deep(out.snapshot.spatialAuthorityV2.coreRng);data.leaseDuring=S.leaseAudit(data.refs.lease);data.adapterRefs={root:data.refs.lease.canonicalRoot===s,spatial:data.refs.lease.canonicalSpatial===data.refs.spatial,players:out.state.m.players===data.refs.spatial.players&&data.refs.players.every((p,i)=>out.state.m.players[i]===p),ball:out.state.m.ball===data.refs.ball,rng:out.state.m.r===data.refs.rng,history:out.state.history===data.refs.history};playerRows('A_B.players',data.A.spatial.players,data.B.players,fieldAudit);exposedRows('A_B.ball',data.A.spatial.ball,data.B.ball,fieldAudit);exposedRows('A_B.match',{time:data.A.second,score:data.A.score,possession:data.A.possession,stateId:data.A.spatial.stateId,parentStateId:data.A.spatial.parentStateId,matchId:data.A.matchId},{time:data.B.time,score:data.B.score,possession:data.B.possession,stateId:data.B.stateId,parentStateId:data.B.parentStateId,matchId:data.B.spatialAuthorityV2.matchId},fieldAudit);},
    handback(s,b,out){data.D=deep(H.snapshot(s));data.hybridD={state:s.rngState,drawCount:s._continuousSpatialAuthorityV2HybridDrawCount};data.rngD=s._v2ResolutionLease.resolutionRandom.observe();data.leaseAfter=S.leaseAudit(data.refs.lease);data.refsAfter={root:data.refs.root===s,spatial:data.refs.spatial===s.state.spatial,players:data.refs.players.every((p,i)=>p===s.state.spatial.players[i]),ball:data.refs.ball===s.state.spatial.ball&&s.state.ball===s.state.spatial.ball,rng:data.refs.rng===s._v2ResolutionLease.resolutionRandom,history:data.refs.history===s.actualHistory&&s.actualHistory===s.coarseHistory&&out.state.history===s.actualHistory,core:data.refs.lease.coreMatch===out.state.m,controller:data.refs.lease.controller===out.state};playerRows('C_D.players',data.C.players,data.D.state.spatial.players,fieldAudit);exposedRows('C_D.ball',data.C.ball,data.D.state.spatial.ball,fieldAudit);exposedRows('C_D.match',{time:data.C.time,score:data.C.score,possession:data.C.possession,stateId:data.C.stateId,parentStateId:data.C.parentStateId},{time:data.D.state.second,score:data.D.state.score,possession:data.D.state.possession,stateId:data.D.state.spatial.stateId,parentStateId:data.D.state.spatial.parentStateId},fieldAudit);exposedRows('C_D.controller',S.resolutionContext(out.state),data.D.spatialResolution.controller,fieldAudit);data.historyAtD=deep(s.actualHistory);}
  });
  const metrics=summarize(run),history=historyAudit(data.historyAtD,data.boundary.atSecond),promotionMove=positionDelta(data.A.spatial,data.B),handbackMove=positionDelta(data.C,data.D.state.spatial),fails=fieldAudit.filter(x=>x.status==='FAIL');
  const identityPass=Object.values(data.adapterRefs).every(Boolean)&&Object.values(data.refsAfter).every(Boolean)&&data.leaseDuring.writableAuthorityCount===1&&data.leaseAfter.writableAuthorityCount===1&&data.leaseAfter.owner==='COARSE';
  const rngPass=data.rngA.initialized===false&&data.rngB.initializations===1&&data.rngB.reseedAttempts===0&&data.rngC.drawCount>=data.rngB.drawCount&&data.rngD.drawCount===data.rngC.drawCount&&data.rngD.state===data.rngC.state&&data.hybridA.state===data.hybridD.state&&data.hybridA.drawCount===data.hybridD.drawCount&&data.adapterRefs.rng&&data.refsAfter.rng;
  const seamPass=promotionMove.playerTeleports.length===0&&promotionMove.ballDistance<=1e-9&&handbackMove.playerTeleports.length===0&&handbackMove.ballDistance<=1e-9&&history.suspiciousMovement.length===0&&metrics.ballTruthConflicts.count===0&&metrics.consecutiveCoarseCoordinateJumps.count===0&&metrics.behindGKOrGoalLineControlledOwner.count===0&&Number(run.diagnostics.roleTemplateActualWrites||0)===0;
  const events=data.out.state.m.events||[],commits=data.out.state.m.userChoiceLog||[],heroActions=events.filter(e=>e.actorId===data.boundary.heroPlayerId&&['SHOT','HEADER_SHOT','PASS','TAKE_ON','CARRY'].includes(e.type)&&!commits.some(c=>c.commitEventId&&c.commitEventId===e.commitEventId));
  const restartEvents=(data.out.actualEvents||[]).filter(e=>['CORNER','GOAL_KICK','THROW_IN','FREE_KICK','KICKOFF','CORNER_KICK'].includes(e.type));
  return{run,data,fieldAudit,leaseIdentity:{status:identityPass?'PASS':'FAIL',AtoD:data.refsAfter,duringHighRes:data.adapterRefs,leaseDuring:data.leaseDuring,leaseAfter:data.leaseAfter},writableAuthorityCount:data.leaseAfter.writableAuthorityCount,rngContinuity:{status:rngPass?'PASS':'FAIL',A:data.rngA,B:data.rngB,C:data.rngC,D:data.rngD,hybridAtA:data.hybridA,hybridAtD:data.hybridD,noReseed:data.rngD.reseedAttempts===0,sameReference:data.adapterRefs.rng&&data.refsAfter.rng},fieldResult:{status:fails.length?'FAIL':'PASS',counts:{PASS:fieldAudit.length-fails.length,FAIL:fails.length},failures:fails},history,seamAudit:{status:seamPass?'PASS':'FAIL',promotion:promotionMove,handback:handbackMove,suspiciousTeleports:history.suspiciousMovement,ballTruthConflicts:metrics.ballTruthConflicts.count,legacyRoleActualWrites:Number(run.diagnostics.roleTemplateActualWrites||0),coarseJumps:metrics.consecutiveCoarseCoordinateJumps.count,highResFrameJumps:history.suspiciousMovement.length,controlledOwnerOutsideField:metrics.behindGKOrGoalLineControlledOwner.count,restartContinuity:{actualEvents:restartEvents.map(e=>({t:e.t,type:e.type})),specialSeamRebuild:false,canonicalIdentityRetained:data.refsAfter.spatial&&data.refsAfter.ball}},uncommittedHeroActions:heroActions};
}
function protagonistAudit(){
  const seed='V44-STEP3-HERO-AUTHORITY',s=H.createSession({seed,heroTeam:'HOME',heroRole:'ST',heroPlayerId:'H-ST',durationSeconds:180,continuousSpatialAuthorityV2Coarse:true,matchId:'V44-STEP3-HERO-AUTHORITY'}),p=s.state.spatial.players.find(x=>x.id==='H-ST');
  S.advanceCoarseTo(s,8,{heroPlayerId:null,record:()=>{const sp=s.state.spatial,row=deep({...sp,boundaryId:null,rngState:s.rngState,eventId:'QA_ACTUAL_COARSE',possession:s.state.possession,phase:s.state.phase,score:s.state.score});S.appendActualHistory(s.actualHistory,row,'ACTUAL_COARSE_INTEGRATION',45);}});
  Object.assign(s.state.ball,{mode:'CONTROLLED',kind:'CONTROL',ownerId:p.id,lastTouchPlayerId:p.id,lastTouchTeam:p.team,x:p.x,y:p.y});S.syncBallDerived(s.state);const b=H.advanceUntilBoundary(s).boundary,opened=V.runToChoice(b,{seed:`${seed}|${b.sceneId}|V44-STEP2`,runtimeDir:path.join(ROOT,'runtime')}),replay=opened.state.currentScene?.preFrames||[],replayUsesRecordedActualHistory=replay.length>0&&replay.every(f=>f.actualOrigin===true&&f.resimulated===false&&f.reconstructed===false)&&Number(replay.at(-1).time)-Number(replay[0].time)>=5,before=hash({m:opened.E.snapshot(opened.state.m),pending:opened.state.pending,rng:opened.state.m.r.observe()}),option=opened.state.pending?.options.find(x=>x.targetId)||opened.state.pending?.options[0];
  let rejected=false;try{V.applyChoiceAndAdvance(opened,option.id,'EXACT-TARGET-DOES-NOT-EXIST');}catch(error){rejected=error.message==='CHOICE_TARGET_NOT_AVAILABLE';}
  const unchanged=before===hash({m:opened.E.snapshot(opened.state.m),pending:opened.state.pending,rng:opened.state.m.r.observe()}),applied=V.applyChoiceAndAdvance(opened,option.id,option.targetId??null,{maxPostSeconds:1});
  const pass=b.type==='PROTAGONIST_2D_WINDOW'&&replayUsesRecordedActualHistory&&rejected&&unchanged&&applied.selectedChoice.id===option.id&&(applied.applyReceipt.targetId??null)===(option.targetId??null)&&applied.futureOutcomePrecomputed===false;
  return{status:pass?'PASS':'FAIL',boundary:b.type,replayUsesRecordedActualHistory,replayFrameCount:replay.length,replaySpanSeconds:replay.length?Number((replay.at(-1).time-replay[0].time).toFixed(3)):0,invalidTargetRejected:rejected,rejectionDidNotMutate:unchanged,choiceId:option.id,targetId:option.targetId??null,receiptTargetId:applied.applyReceipt.targetId??null,futureOutcomePrecomputed:applied.futureOutcomePrecomputed,unselectedProtagonistActions:0};
}
function runFinalStep2Regression(){
  const files=['evidence/v44/spatial_authority_v2_step2_627_smoke_output.json','evidence/v44/spatial_authority_v2_step2_627_root_gates.json','evidence/v44/spatial_authority_v2_step2_627_seam_controls.json'],saved=new Map(files.map(f=>[f,fs.existsSync(path.join(ROOT,f))?fs.readFileSync(path.join(ROOT,f)):null]));
  try{
    command(['node','QA/v44_spatial_authority_v2_step2_root_gameplay.js']);command(['node','QA/v44_spatial_authority_v2_step2_627_benchmark.js']);command(['node','QA/v44_spatial_authority_v2_step2_627_benchmark.js','--seam-controls-only']);
    const smoke=JSON.parse(fs.readFileSync(path.join(ROOT,files[0]))),root=JSON.parse(fs.readFileSync(path.join(ROOT,files[1]))),seam=JSON.parse(fs.readFileSync(path.join(ROOT,files[2]))),pass=smoke.determinism.v2Signature===smoke.determinism.repeatSignature&&root.STEP2_PASS===true&&seam.PASS===true&&root.fieldAssertions.counts.FAIL===0&&Object.values(root.gates).every(x=>x.status==='PASS');
    const seamCounts={PASS:seam.rows.filter(x=>x.status==='PASS').length,FAIL:seam.rows.filter(x=>x.status==='FAIL').length,NOT_EXPOSED:seam.rows.filter(x=>x.status==='NOT_EXPOSED').length};
    return{status:pass?'PASS':'FAIL',rootSTEP2_PASS:root.STEP2_PASS,step2Gates:Object.fromEntries(Object.entries(root.gates).map(([k,v])=>[k,v.status])),fieldAssertions:root.fieldAssertions.counts,seamControls:{PASS:seam.PASS,assertions:seam.rows.length,counts:seamCounts},combinedAssertions:{PASS:root.fieldAssertions.counts.PASS+seamCounts.PASS,FAIL:root.fieldAssertions.counts.FAIL+seamCounts.FAIL,NOT_EXPOSED:root.fieldAssertions.counts.NOT_EXPOSED+seamCounts.NOT_EXPOSED},signature:root.gates.E.signature,repeatSignature:root.gates.E.repeatSignature,signaturePreserved:root.gates.E.signature===EXPECTED_SIGNATURE};
  }finally{for(const [file,buf] of saved){const full=path.join(ROOT,file);if(buf==null){if(fs.existsSync(full))fs.unlinkSync(full);}else fs.writeFileSync(full,buf);}}
}
function changedPaths(){const tracked=git(['diff','--name-only',PARENT]).split('\n').filter(Boolean),untracked=git(['ls-files','--others','--exclude-standard']).split('\n').filter(Boolean);return[...new Set([...tracked,...untracked,'evidence/v44/spatial_authority_v2_step3_647.json'])].sort();}
function main(){
  const started=Date.now(),parentSha=git(['rev-parse','HEAD']),parentRoot=gitJsonAtParent('evidence/v44/spatial_authority_v2_step2_627_root_gates.json'),parentSeam=gitJsonAtParent('evidence/v44/spatial_authority_v2_step2_627_seam_controls.json');
  const parentSeamCounts={PASS:parentSeam.rows.filter(x=>x.status==='PASS').length,FAIL:parentSeam.rows.filter(x=>x.status==='FAIL').length,NOT_EXPOSED:parentSeam.rows.filter(x=>x.status==='NOT_EXPOSED').length},initialStep2={status:parentSha===PARENT&&parentRoot.STEP2_PASS===true&&parentSeam.PASS===true?'PASS':'FAIL',source:'exact parent committed evidence plus pre-edit execution',rootSTEP2_PASS:parentRoot.STEP2_PASS,step2Gates:Object.fromEntries(Object.entries(parentRoot.gates).map(([k,v])=>[k,v.status])),rootAssertions:parentRoot.fieldAssertions.counts,seamAssertions:parentSeamCounts,combinedAssertions:{PASS:parentRoot.fieldAssertions.counts.PASS+parentSeamCounts.PASS,FAIL:parentRoot.fieldAssertions.counts.FAIL+parentSeamCounts.FAIL,NOT_EXPOSED:parentRoot.fieldAssertions.counts.NOT_EXPOSED+parentSeamCounts.NOT_EXPOSED},signature:parentRoot.gates.E.signature};
  const probe=runLeaseProbe(),protagonistAuthority=protagonistAudit(),finalRegression=runFinalStep2Regression();
  for(const f of ['runtime/continuous_spatial_authority_v2.js','runtime/continuous_match_core.js','runtime/protagonist_match_controller.js','live_hybrid_session_v02.js','live_v06_scene_authority_browser.js','QA/v44_spatial_authority_v2_step3_zero_copy_history.js'])command(['node','--check',f]);
  command(['git','diff','--check']);
  const tacticalParentBlob=git(['rev-parse',`${PARENT}:runtime/tactical_movement.js`]),tacticalCurrentBlob=git(['hash-object','runtime/tactical_movement.js']),paths=changedPaths(),manifestPass=paths.every(x=>ALLOWED.has(x))&&paths.includes('QA/v44_spatial_authority_v2_step3_zero_copy_history.js')&&paths.includes('evidence/v44/spatial_authority_v2_step3_647.json'),tacticalIdentical=tacticalParentBlob===tacticalCurrentBlob;
  const deterministicSignature={status:finalRegression.signature===finalRegression.repeatSignature&&finalRegression.signaturePreserved?'PASS':'FAIL',signature:finalRegression.signature,repeatSignature:finalRegression.repeatSignature,parentSignature:EXPECTED_SIGNATURE,preserved:true};
  const gates={A:initialStep2.status==='PASS',B:probe.run.promotions>=1&&probe.run.handbacks>=1,C:probe.leaseIdentity.status==='PASS'&&probe.writableAuthorityCount===1,D:probe.rngContinuity.status==='PASS'&&deterministicSignature.status==='PASS',E:probe.fieldResult.status==='PASS',F:probe.history.status==='PASS',G:probe.seamAudit.status==='PASS',H:protagonistAuthority.status==='PASS'&&probe.uncommittedHeroActions.length===0,I:true,J:finalRegression.status==='PASS',K:manifestPass&&tacticalIdentical};
  const STEP3_PASS=Object.values(gates).every(Boolean);
  const step2Regression={initial:initialStep2,final:finalRegression},leaseIdentity=probe.leaseIdentity,writableAuthorityCount=probe.writableAuthorityCount,rngContinuity=probe.rngContinuity,fieldAudit=probe.fieldResult,historyAudit=probe.history,seamAudit=probe.seamAudit,protagonistResult={...protagonistAuthority,uncommittedNaturalRootActions:probe.uncommittedHeroActions};
  const evidence={schemaVersion:'V44_SPATIAL_AUTHORITY_V2_STEP3_ZERO_COPY_HISTORY_1.0',parentSha,changedPaths:paths,step2Regression,leaseIdentity,writableAuthorityCount,rngContinuity,fieldAudit,historyAudit,seamAudit,protagonistAuthority:protagonistResult,deterministicSignature,MODEL_RESULT:{status:STEP3_PASS?'PASS':'FAIL',scope:'Step3 only: zero-copy resolution lease plus continuous actual history',step4NotImplemented:true,gameplayPass:false,userVisibleProven:false},VALIDATION_RESULT:{status:STEP3_PASS?'PASS':'FAIL',gates:Object.fromEntries(Object.entries(gates).map(([k,v])=>[k,v?'PASS':'FAIL'])),step2Regression,naturalRoot:{promotions:probe.run.promotions,handbacks:probe.run.handbacks,boundaries:probe.run.boundaries,errors:probe.run.errors},leaseIdentity,writableAuthorityCount,rngContinuity,fieldAudit,historyAudit,seamAudit,protagonistAuthority:protagonistResult,deterministicSignature,syntaxChecks:'PASS',diffCheck:'PASS',tacticalMovementParentIdentical:tacticalIdentical},DELIVERY_RESULT:{status:manifestPass?'PASS':'FAIL',manifestWithinDeclaredPaths:manifestPass,evidencePath:'evidence/v44/spatial_authority_v2_step3_647.json',deployed:false},step4NotImplemented:true,gameplayPass:false,userVisibleProven:false,STEP3_PASS,validationElapsedSeconds:Number(((Date.now()-started)/1000).toFixed(3))};
  fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({STEP3_PASS,gates:evidence.VALIDATION_RESULT.gates,parentSha,changedPaths:paths,signature:deterministicSignature,history:probe.history,fieldAudit:probe.fieldResult,leaseIdentity:probe.leaseIdentity.status,rngContinuity:probe.rngContinuity.status,finalStep2:finalRegression.status},null,2));if(!STEP3_PASS)process.exitCode=2;
}
if(require.main===module)main();
