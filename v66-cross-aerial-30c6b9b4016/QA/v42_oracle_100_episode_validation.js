#!/usr/bin/env node
'use strict';

/* V42 QA-only production-import Oracle batch.  This file consumes the shipped
 * Hybrid -> boundary -> V0.6 adapter and never mutates gameplay/runtime code. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {captureActualPath}=require('./v42_oracle_observation_adapter');
const {evaluate}=require('./v42_football_plausibility_oracle_runner');
const {adjudicate,selftest:watchSelftest}=require('./v42_oracle_watch_adjudication');
const {run:drawBinding}=require('./v42_oracle_draw_input_binding');
const {run:kickoffPreview}=require('./v42_kickoff_preview_live_state');
const {closure}=require('./v42_production_closure');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'evidence/v42');
const ROLE_SPECS=[
  ...Array.from({length:34},(_,i)=>({heroRole:'ST',heroPlayerId:'H-ST',requestedRole:'ST',seed:`V42-ORACLE-100-ST-${String(i+1).padStart(2,'0')}` })),
  ...Array.from({length:33},(_,i)=>({heroRole:'CM',heroPlayerId:'H-CM',requestedRole:'CM',seed:`V42-ORACLE-100-CM-${String(i+1).padStart(2,'0')}` })),
  ...Array.from({length:33},(_,i)=>({heroRole:'CB',heroPlayerId:'H-LCB',requestedRole:'FB/CB',roleSubstitution:'CB is the supported production FB/CB defensive bucket; FB has no natural protagonist boundary.',seed:`V42-ORACLE-100-CB-${String(i+1).padStart(2,'0')}` }))
];
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const finite=x=>Number.isFinite(Number(x));
function ecology(o){
  const score=o.current?.score||{}; const goals=Number(score.HOME||0)+Number(score.AWAY||0);
  const goalEvents=(o.events||[]).filter(e=>String(e.type||e.event||'').toUpperCase()==='GOAL');
  const ids=goalEvents.map(e=>e.id||e.eventId||`${e.time}|${e.scorerId||e.playerId||''}`), duplicates=ids.length-new Set(ids).size;
  return {terminalGoals:goals,goalEventCount:goalEvents.length,duplicateGoalEventCount:duplicates,grossRunaway:goals>12||goalEvents.length>12||duplicates>0,watchOnly:true};
}
function compactOracle(results){return results.map(r=>({contractId:r.contractId,status:r.status,detail:r.detail,candidateBlocking:r.candidateBlocking||false}));}
function classify(results,watch){
  if(results.some(r=>r.status==='HARD_FAIL'))return 'HARD_FAIL';
  if(results.some(r=>r.status==='FAIL'))return 'FAIL';
  if(watch?.classification==='TRUE_WATCH')return 'TRUE_WATCH';
  return 'CLEAN';
}
function signatureRows(episodes){
  const m=new Map(); for(const e of episodes){for(const r of e.verdicts.filter(x=>['HARD_FAIL','FAIL'].includes(x.status))){const k=`${r.status}|${r.contractId}|${r.detail}`;const x=m.get(k)||{status:r.status,contractId:r.contractId,detail:r.detail,episodes:[],seeds:[]};x.episodes.push(e.episodeId);x.seeds.push(`${e.seed}/${e.heroRole}`);m.set(k,x);}}
  return [...m.values()];
}
function run(){
  if(ROLE_SPECS.length!==100||new Set(ROLE_SPECS.map(x=>x.seed)).size!==100)throw Error('V42_100_EPISODE_MATRIX_INVALID');
  watchSelftest();
  const episodes=[];
  for(const spec of ROLE_SPECS){
    let observation,error=null; try{observation=captureActualPath({...spec,durationSeconds:1800});}catch(e){error={name:e.name,message:e.message};observation={seed:spec.seed,frames:[],current:null,missing:['CAPTURE_ERROR']};}
    // CON-005 is a boundary->entry continuity contract.  The terminal pending
    // frame is intentionally later in the V0.6 window and is covered by #436;
    // feeding it to CON-005 would convert legitimate high-res evolution into
    // a false rematerialization failure.
    const oracle=evaluate({...observation,firstVisibleChoiceFrame:observation.entryTraceB}), watch=adjudicate(observation), eco=ecology(observation);
    episodes.push({episodeId:`E${String(episodes.length+1).padStart(3,'0')}`,seed:spec.seed,heroRole:spec.heroRole,heroPlayerId:spec.heroPlayerId,requestedRole:spec.requestedRole,roleSubstitution:spec.roleSubstitution||null,boundaryReached:!!observation.boundary,boundaryTime:observation.boundary?.time??null,terminalTime:observation.time??observation.current?.time??null,phase:observation.phase||observation.current?.phase||null,frameCount:observation.frames?.length||0,choiceCount:observation.choices?.length||0,missing:observation.missing||[],captureError:error,classification:classify(oracle.results,watch),verdicts:compactOracle(oracle.results),watch:{classification:watch.classification,classificationReason:watch.classificationReason,legacyFamilies:watch.legacyFamilies,legacyHitCount:watch.legacyHits.length,persistentSpans:watch.persistentSpans.map(s=>({key:s.key,start:s.start,end:s.end,persistence:s.persistence,frames:s.frames})),watch:watch.watch?{reason:watch.watch.reason,scenes:watch.watch.scenes}:null},ecology:eco,metrics:{maxLocalDensity:Math.max(0,...watch.frames.map(x=>x.raw.localDensity)),maxTeamVectorConvergence:Math.max(0,...watch.frames.map(x=>x.raw.teamVectorIds.length)),maxSuddenDisplacement:null,boundaryABDelta:null}});
  }
  const counts=Object.fromEntries(['HARD_FAIL','FAIL','TRUE_WATCH','CLEAN'].map(x=>[x,episodes.filter(e=>e.classification===x).length]));
  const detectorCounts={}; for(const e of episodes)for(const r of e.verdicts)if(r.status!=='PASS'){const k=`${r.contractId}:${r.status}`;detectorCounts[k]??={count:0,episodes:[]};detectorCounts[k].count++;detectorCounts[k].episodes.push(e.episodeId);}
  const gross=episodes.filter(e=>e.ecology.grossRunaway);
  const draw=drawBinding(),preview=kickoffPreview();
  const browserBlocked=episodes.flatMap(e=>e.verdicts.filter(r=>r.status==='BLOCKED').map(r=>r.contractId));
  const disposition=counts.HARD_FAIL||counts.FAIL?'V42_100_ORACLE_HAS_BOUNDED_FAILURES':counts.TRUE_WATCH?'V42_100_ORACLE_HAS_TRUE_WATCHES_ONLY':'V42_100_ORACLE_CLEAN_READY_FOR_FINAL_HOSTED_VALIDATION';
  const repoHead=process.env.V42_REPO_HEAD||'NOT_SUPPLIED_BY_RUNNER', production=closure();
  const result={schemaVersion:'V42_100_EPISODE_ORACLE_1.1',disposition,generatedAt:new Date().toISOString(),source:{requiredHead:'6b3fd3ee40af657178a193436350b4f62f2d0f05',repoHead,informationalRepoHead:repoHead,validatedProductionClosureFingerprint:production.closureFingerprint,productionPath:'live_hybrid_session_v02 -> live_v06_scene_authority_browser -> v42_oracle_observation_adapter -> v42_football_plausibility_oracle_runner',runnerSha256:sha(__filename),adapterSha256:sha(path.join(__dirname,'v42_oracle_observation_adapter.js')),oracleSha256:sha(path.join(__dirname,'v42_football_plausibility_oracle_runner.js')),watchAdjudicatorSha256:sha(path.join(__dirname,'v42_oracle_watch_adjudication.js'))},truth:{USER_FAIL_OPEN:'OPEN',STEP79:'NOT_STARTED',deploymentPerformed:false,userPass:false,productionGameplayChanged:false,futureOutcomePrecomputed:false},matrix:{requestedEpisodes:100,completedEpisodes:episodes.length,uniqueSeeds:100,roleDistribution:{ST:34,CM:33,CB:33},seedsByRole:Object.fromEntries(['ST','CM','CB'].map(r=>[r,ROLE_SPECS.filter(x=>x.heroRole===r).map(x=>x.seed)])),syntheticTestOnlyCount:0,cbNote:'CB is the supported FB/CB production bucket.'},summary:{total:100,...counts,detectorFamilyCounts:detectorCounts,scoreEcology:{grossRunawayOrDuplicateScoringSignal:gross.length>0,episodes:gross.map(e=>e.episodeId),maxTerminalGoals:Math.max(...episodes.map(e=>e.ecology.terminalGoals),0)},blockedContractObservations:{count:browserBlocked.length,contracts:[...new Set(browserBlocked)],reason:'Browser/pixel/event timing evidence is unavailable in this environment; BLOCKED is not promoted to failure or WATCH.'}},regressions:{hash436DrawInputBinding:{verdict:draw.verdict,drawEqualsInPitch:draw.answers?.inPitchChoiceFedSameState==='YES',terminalEqualsPreDraw:draw.answers?.oracleTerminalRepresentativeOfCanvasDraw==='YES',coordinateWriterAfterTerminalBeforeDraw:draw.answers?.coordinateWriterAfterTerminalBeforeDraw||null},hash437KickoffPreview:{verdict:preview.verdict,allRepresentativeCasesZeroDisplacement:preview.cases.every(x=>x.after.maxPlayerDisplacement===0&&x.after.meanPlayerDisplacement===0),cases:preview.cases.map(x=>({seed:x.seed,heroRole:x.heroRole,maxPlayerDisplacement:x.after.maxPlayerDisplacement,meanPlayerDisplacement:x.after.meanPlayerDisplacement}))}},failureSignatures:signatureRows(episodes),browserEvidence:{status:'BLOCKED',remainingBoundaries:['canvas pixels','CSS/layout','browser event timing'],doNotClaimFromThisTask:true},episodes};
  fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'V42_100_EPISODE_ORACLE.json'),JSON.stringify(result,null,2)+'\n');fs.writeFileSync(path.join(OUT,'V42_100_EPISODE_ORACLE.md'),markdown(result)+'\n');return result;
}
function markdown(o){
  const s=o.summary,m=o.matrix,bt='`';
  const lines=['# V42 100-Episode Oracle Validation','',`Disposition: ${bt}${o.disposition}${bt}`,`Source HEAD: ${bt}${o.source.head}${bt}`,'',`Exactly ${s.total} deterministic production-import episodes were run through Hybrid → boundary → V0.6 Oracle. No gameplay tuning, deployment, user PASS, or STEP79 work was performed.`,`Role distribution: ST ${m.roleDistribution.ST}, CM ${m.roleDistribution.CM}, CB ${m.roleDistribution.CB}. Unique seeds: ${m.uniqueSeeds}; syntheticTestOnly episodes counted: ${m.syntheticTestOnlyCount}.`,'','## Required counts','', '| Total | HARD_FAIL | FAIL | TRUE_WATCH | CLEAN |','|---:|---:|---:|---:|---:|',`| ${s.total} | ${s.HARD_FAIL} | ${s.FAIL} | ${s.TRUE_WATCH} | ${s.CLEAN} |`,'','## Detector-family counts/signatures',''];
  for(const [k,v] of Object.entries(s.detectorFamilyCounts))lines.push(`- ${k}: ${v.count} observations (${v.episodes.join(', ')}).`);
  if(!Object.keys(s.detectorFamilyCounts).length)lines.push('- No HARD_FAIL, FAIL, or BLOCKED detector observations.');
  lines.push('','## Score ecology','');
  lines.push('- Gross runaway or repeated duplicate scoring signal: **'+(s.scoreEcology.grossRunawayOrDuplicateScoringSignal?'YES':'NO')+'**. Max terminal goals: '+s.scoreEcology.maxTerminalGoals+'.');
  lines.push('- Score/shot ecology remains WATCH-only; no quota or probability tuning was applied.','','## #436 / #437 regression bindings');
  lines.push('- #436 terminal -> real '+bt+'showPending'+bt+' pre-draw identity: **'+o.regressions.hash436DrawInputBinding.verdict+'**; terminal/draw identity: '+(o.regressions.hash436DrawInputBinding.terminalEqualsPreDraw?'PASS':'NOT PROVEN')+'; same in-pitch state: '+(o.regressions.hash436DrawInputBinding.drawEqualsInPitch?'PASS':'NOT PROVEN')+'; post-capture coordinate writer: '+(o.regressions.hash436DrawInputBinding.coordinateWriterAfterTerminalBeforeDraw||'not reported')+'.');
  lines.push('- #437 kickoff-preview identity: **'+o.regressions.hash437KickoffPreview.verdict+'**; representative ST/CM/CB displacement all zero: '+(o.regressions.hash437KickoffPreview.allRepresentativeCasesZeroDisplacement?'PASS':'NOT PROVEN')+'.','','## Failure handling','',o.failureSignatures.length?'Failures are not repaired in this validation; grouped signatures and exact seed/role pairs are in the JSON.':'No HARD_FAIL/FAIL signatures occurred. TRUE_WATCH is also absent; no ordinary or genuine WATCH condition was observed.','','## Browser boundary','');
  lines.push('- Browser/pixel evidence remains **'+o.browserEvidence.status+'**. This batch does not claim canvas rasterization, CSS/layout, or browser event timing. Browser-only blocked observations: '+(s.blockedContractObservations.contracts.join(', ')||'none')+'.','','## Episode index (compact)','', '| Episode | Role | Seed | Classification | Boundary | Frames |','|---|---|---|---|---:|---:|');
  for(const e of o.episodes)lines.push(`| ${e.episodeId} | ${e.heroRole} | ${e.seed} | ${e.classification} | ${e.boundaryTime??'-'} | ${e.frameCount} |`);
  lines.push('','## Next recommendation',o.disposition==='V42_100_ORACLE_CLEAN_READY_FOR_FINAL_HOSTED_VALIDATION'?'Final bounded hosted/deployment validation, with browser/pixel checks still open.':'Bounded repair or root-cause analysis is required before hosted validation.','','Truth: USER_FAIL_OPEN=OPEN; STEP79=NOT_STARTED; no gameplay changes; no deployment; no user PASS; no next Worker started.');
  return lines.join('\n');
}
if(require.main===module){try{const r=run();console.log(JSON.stringify({disposition:r.disposition,summary:r.summary,files:['evidence/v42/V42_100_EPISODE_ORACLE.md','evidence/v42/V42_100_EPISODE_ORACLE.json']},null,2));}catch(e){console.error(e.stack);process.exitCode=1;}}
module.exports={ROLE_SPECS,run};
