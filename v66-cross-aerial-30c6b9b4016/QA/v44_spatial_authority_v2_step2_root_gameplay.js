#!/usr/bin/env node
'use strict';

/* V44 Step 2 bounded root smoke.  This deliberately uses the Step 1 production
 * Hybrid -> scene runner -> handback path; it is not a helper-state simulation
 * and it makes no gameplay PASS decision. */
const crypto=require('crypto'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'evidence/v44');
const H=require('../live_hybrid_session_v02'),V=require('../live_v06_scene_authority_browser');
const stable=x=>JSON.stringify(x),hash=x=>crypto.createHash('sha256').update(stable(x)).digest('hex');
const deep=x=>x==null?x:JSON.parse(JSON.stringify(x));
function chooser(pending){return pending.options.find(x=>x.recommended)||pending.options[0]||null;}
function resolveBoundary(boundary,seed){
  const opts={seed:`${seed}|${boundary.sceneId}|V44-STEP2`,runtimeDir:path.join(ROOT,'runtime')};
  if(boundary.type==='PROTAGONIST_2D_WINDOW'){
    const opened=V.runToChoice(boundary,opts);
    return opened.pending?V.autoResolveEpisode(opened,chooser,{maxChoices:1,maxPostSeconds:8}):V.finishWithoutChoice(opened);
  }
  if(boundary.type==='NON_HERO_SHOT_2D_WINDOW')return V.runNonHeroShotWindow(boundary,opts);
  if(boundary.type==='SET_PIECE_2D_WINDOW')return V.runSetPieceWindow(boundary,opts);
  return null;
}
function semantic(session){return {status:session.status,second:session.state.second,score:deep(session.state.score),possession:session.state.possession,ball:deep(session.state.spatial.ball),events:deep(session.state.resolvedEvents),boundaries:deep(session.handledBoundaryIds),resumeCount:session.resumeCount};}
function runRoot(seed,coarse,probe={}){
  const session=H.createSession({seed,heroTeam:'HOME',heroRole:'ST',heroPlayerId:'H-ST',durationSeconds:180,continuousSpatialAuthorityV2Trace:true,continuousSpatialAuthorityV2Coarse:coarse,matchId:`V44-619-${coarse?'V2':'LEGACY'}-${seed}`});
  probe.created?.(session);
  const boundaries=[],errors=[],highResSpans=[];let promotions=0,handbacks=0,guard=0;
  while(session.status==='RUNNING'&&session.state.second<175&&guard++<16){
    let r;try{r=H.advanceUntilBoundary(session,{maxActions:5000});}catch(error){errors.push({stage:'advance',message:error.message});break;}
    const b=r.boundary;if(!b||r.status==='FINISHED')break;
    boundaries.push({id:b.sceneId||b.id||null,type:b.type,atSecond:b.atSecond,reason:b.reason||null});
    if(b.type==='FINAL_2D_WINDOW')break;
    probe.promotion?.(session,b);
    let out;try{out=resolveBoundary(b,seed);}catch(error){errors.push({stage:'production_scene',type:b.type,message:error.message});break;}
    if(!out?.snapshot){errors.push({stage:'handoff_input',type:b.type,message:'PRODUCTION_RUNNER_RETURNED_NO_SNAPSHOT'});break;}
    highResSpans.push({from:b.atSecond,to:out.snapshot.time});
    promotions++;try{probe.resolved?.(session,b,out);H.resumeFromHighRes(session,out);handbacks++;probe.handback?.(session,b,out);}catch(error){errors.push({stage:'handoff',type:b.type,message:error.message});break;}
  }
  probe.finished?.(session);
  return {coarse,virtualSeconds:session.state.second,boundaries,promotions,handbacks,highResSpans,errors,semantic:semantic(session),trace:H.authorityTraceSnapshot(session),diagnostics:deep(session.state.spatial.writerStats||{})};
}
function status(count){return count>0?'OBSERVED':'NOT_OBSERVED';}
function suspiciousJumps(trace){
  const out=[];for(let i=1;i<(trace.spatialSamples||[]).length;i++){const a=trace.spatialSamples[i-1],b=trace.spatialSamples[i],dt=Math.max(.001,b.time-a.time),by=Object.fromEntries(a.players.map(p=>[p.id,p]));for(const p of b.players){const q=by[p.id];if(!q)continue;const d=Math.hypot(p.actual.x-q.actual.x,p.actual.y-q.actual.y);if(d/dt>16||d>11.1)out.push({playerId:p.id,from:a.time,to:b.time,distance:Number(d.toFixed(3)),speed:Number((d/dt).toFixed(3))});}}
  return out;
}
function summarize(run){
  const t=run.trace||{},nulls=(t.movementNullIntervals||[]).filter(x=>['ST','LCM','LW','RW'].includes(x.slot)&&x.stationaryAllowed===false);
  const ballConflicts=(t.violations||[]).filter(x=>x.kind==='BALL_TRUTH_OWNER_CONFLICT');
  const jumps=suspiciousJumps(t),gaps=jumps.filter(j=>(run.highResSpans||[]).some(s=>j.from<=s.from&&j.to>=s.to)),coarseJumps=jumps.filter(j=>!gaps.includes(j)),controlled=(t.spatialSamples||[]).flatMap(row=>row.players.filter(p=>p.id===row.ball.ownerId).map(p=>({time:row.time,ownerId:p.id,x:p.actual.x,y:p.actual.y})));
  const badGoal=controlled.filter(x=>x.x<0||x.x>105||x.y<0||x.y>68); // controlled owner outside field is the bounded detectable proxy.
  return {virtualSeconds:run.virtualSeconds,boundaries:run.boundaries,promotions:run.promotions,handbacks:run.handbacks,errors:run.errors,
    ballTruthConflicts:{finding:status(ballConflicts.length),count:ballConflicts.length,examples:ballConflicts.slice(0,4)},
    roleTemplateCoordinateRematerialization:{finding:run.coarse?status(Number(run.diagnostics.roleTemplateTargetRematerializations||0)):'NOT_APPLICABLE_LEGACY',writerCount:run.coarse?Number(run.diagnostics.roleTemplateTargetRematerializations||0):null,actualWriterCount:run.coarse?Number(run.diagnostics.roleTemplateActualWrites||0):null},
    movementNullIntervals:{finding:status(nulls.length),count:nulls.length,players:nulls.slice(0,20)},
    suspiciousCoordinateJumpsOrResets:{finding:status(jumps.length),count:jumps.length,examples:jumps.slice(0,12),coordinateResets:run.coarse?Number(run.diagnostics.coordinateResets||0):null},
    consecutiveCoarseCoordinateJumps:{count:coarseJumps.length,examples:coarseJumps.slice(0,12),highResGapCandidates:gaps.length,note:'Original raw metric retained above. Gaps containing a production high-res span require A/B/C/D and frame-level verification; their endpoint distance alone is not a teleport.'},
    behindGKOrGoalLineControlledOwner:{finding:status(badGoal.length),count:badGoal.length,examples:badGoal.slice(0,8),scope:'outside-field controlled owner only; this short root smoke cannot prove absence of all goal-line pathologies'},
    writerCounts:t.writerCounts||{},touches:run.coarse?((run.semantic.ball.causalHistory||[]).slice(-12)):null,signature:hash(run.semantic)};
}
function main(){
  const seed='V44-SPATIAL-AUTHORITY-619-STEP2-SMOKE';
  const legacy=runRoot(seed,false),v2=runRoot(seed,true),v2Repeat=runRoot(seed,true);
  const report={schemaVersion:'V44_SPATIAL_AUTHORITY_V2_STEP2_ROOT_GAMEPLAY_SMOKE_1.0',seed,bound:'one fixed seed; 180 virtual seconds; legacy once, V2 once plus one same-seed V2 determinism repeat',productionRootPath:'live_hybrid_session_v02.createSession/advanceUntilBoundary -> live_v06_scene_authority_browser production scene runner -> runtime protagonist/controller/core/tactical movement -> live_hybrid_session_v02.resumeFromHighRes',legacy:summarize(legacy),v2:summarize(v2),determinism:{finding:hash(v2.semantic)===hash(v2Repeat.semantic)?'OBSERVED_SAME_SEED_SIGNATURE_MATCH':'OBSERVED_SIGNATURE_MISMATCH',v2Signature:hash(v2.semantic),repeatSignature:hash(v2Repeat.semantic)},naturalPromotionBoundary:{finding:v2.promotions>0?'OBSERVED':'NOT_OBSERVED_WITHIN_BOUND',count:v2.promotions,boundaries:v2.boundaries.filter(x=>x.type!=='FINAL_2D_WINDOW')},GAMEPLAY_PASS:false,USER_VISIBLE_PROVEN:false,deploymentPerformed:false};
  fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'spatial_authority_v2_step2_627_smoke_output.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({seed,legacy:{seconds:legacy.virtualSeconds,errors:legacy.errors.length},v2:{seconds:v2.virtualSeconds,errors:v2.errors.length,promotions:v2.promotions},determinism:report.determinism.finding},null,2));
  if(legacy.errors.length||v2.errors.length||v2Repeat.errors.length)process.exitCode=2;
}
if(require.main===module)main();
module.exports={runRoot,summarize,main};
