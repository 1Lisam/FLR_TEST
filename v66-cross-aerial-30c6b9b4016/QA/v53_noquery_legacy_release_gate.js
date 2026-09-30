#!/usr/bin/env node
'use strict';

// This is deliberately a product-default gate.  It never passes a V2 option,
// query value, or global flag to the Hybrid session.
const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),H=require('../live_hybrid_session_v02.js'),V=require('../live_v06_scene_authority_browser.js');
const OUT_DIR=path.join(ROOT,'evidence/v53/noquery_legacy_release_gate');
const SLOTS=['GK','LB','LCB','RCB','RB','LCM','CM','RCM','LW','ST','RW'];
const CENTRE_MARK={x:52.5,y:34},CENTRE_CIRCLE_RADIUS=9.15;
const actionTypes=new Set(['SHOT','HEADER_SHOT','GOAL','PASS','THROUGH_PASS','TAKE_ON','CARRY']);
const deep=value=>JSON.parse(JSON.stringify(value));
const localX=player=>player.team==='HOME'?Number(player.x):105-Number(player.x);
const write=(name,value)=>{fs.mkdirSync(OUT_DIR,{recursive:true});fs.writeFileSync(path.join(OUT_DIR,name),JSON.stringify(value,null,2)+'\n');};
function defaultSession(seed){return H.createSession({seed,heroTeam:'HOME',heroRole:'ST',heroPlayerId:'H-ST',durationSeconds:5400});}
function kickoff(session){const spatial=H.initialSpatialSnapshot(session),ids=new Set(spatial.players.map(p=>p.id)),illegal=spatial.players.filter(p=>localX(p)>CENTRE_MARK.x+1e-9).map(p=>({id:p.id,team:p.team,role:p.role,slot:p.slot,localX:Number(localX(p).toFixed(3))}));
 const counts=Object.fromEntries(['HOME','AWAY'].map(team=>[team,spatial.players.filter(p=>p.team===team).length]));
 const expectedIds=['HOME','AWAY'].flatMap(team=>SLOTS.map(slot=>`${team==='HOME'?'H':'A'}-${slot}`));
 const owner=spatial.players.find(p=>p.id===spatial.ball.ownerId)||null;
 const opponents=spatial.players.filter(p=>p.team==='AWAY'),homeNonTakers=spatial.players.filter(p=>p.team==='HOME'&&p.id!=='H-CM');
 const opponentClearance=opponents.length?Math.min(...opponents.map(p=>Math.hypot(p.x-CENTRE_MARK.x,p.y-CENTRE_MARK.y))):0;
 const awayWrongHalf=opponents.filter(p=>p.x<CENTRE_MARK.x-1e-9).map(p=>p.id),homeWrongHalf=homeNonTakers.filter(p=>p.x>CENTRE_MARK.x+1e-9).map(p=>p.id);
 const actualCentreMark=!!owner&&owner.id==='H-CM'&&owner.x===CENTRE_MARK.x&&owner.y===CENTRE_MARK.y&&spatial.ball.x===CENTRE_MARK.x&&spatial.ball.y===CENTRE_MARK.y;
 return{schemaVersion:spatial.schemaVersion,mode:session.opts.continuousSpatialAuthorityV2Coarse===undefined?'COARSE_LEGACY':'NOT_DEFAULT',v2OptionPresent:Object.prototype.hasOwnProperty.call(session.opts,'continuousSpatialAuthorityV2Coarse'),players:spatial.players.length,counts,identityComplete:expectedIds.every(id=>ids.has(id))&&ids.size===22,centreMark:CENTRE_MARK,actualCentreMark,illegalKickoffRows:illegal,awayWrongHalf,homeWrongHalf,ball:{x:spatial.ball.x,y:spatial.ball.y,ownerId:spatial.ball.ownerId,ownerMatchesSpatialPlayer:!!owner&&owner.x===spatial.ball.x&&owner.y===spatial.ball.y,opponentClearanceFromCentreMark:Number(opponentClearance.toFixed(3))},futureOutcomePrecomputed:spatial.futureOutcomePrecomputed===true,legal:actualCentreMark&&illegal.length===0&&awayWrongHalf.length===0&&homeWrongHalf.length===0&&counts.HOME===11&&counts.AWAY===11&&ids.size===22&&spatial.ball.ownerId==='H-CM'&&!!owner&&opponentClearance>=CENTRE_CIRCLE_RADIUS&&spatial.futureOutcomePrecomputed===false};}
function findLegacyChoiceBoundary(){for(let i=0;i<32;i++){const session=defaultSession(`V53-NOQUERY-LEGACY-${i}`),advanced=H.advanceUntilBoundary(session),boundary=advanced.boundary;if(boundary?.type!=='PROTAGONIST_2D_WINDOW')continue;const opened=V.runToChoice(boundary,{seed:`${session.opts.seed}|${boundary.sceneId}|NOQUERY`,runtimeDir:path.join(ROOT,'runtime')}),option=opened.pending?.options?.find(row=>row.id==='SAFE_PASS'&&row.targetId!=null);if(option)return{session,boundary,opened,option,seed:session.opts.seed,actionsAdvanced:advanced.actionsAdvanced};}throw new Error('DEFAULT_LEGACY_PROTAGONIST_BOUNDARY_NOT_FOUND');}
function sceneAndHandback(){const found=findLegacyChoiceBoundary(),{session,boundary,opened,option}=found;
 assert.equal(session.opts.continuousSpatialAuthorityV2Coarse,undefined,'V2 option leaked into default session');
 assert.equal(boundary.stateSnapshot.spatial.schemaVersion,'HYBRID_AUTHORITATIVE_COARSE_SPATIAL_1.0','default boundary is not Legacy spatial');
 const before=JSON.stringify({snapshot:opened.E.snapshot(opened.state.m),pending:opened.state.pending,events:opened.state.m.events,userChoiceLog:opened.state.m.userChoiceLog});
 const wrongTarget=option.targetId==null?'V53-NOQUERY-INVALID-TARGET':`${option.targetId}--INVALID`;
 const rejected=opened.P.applyChoice(opened.state,option.id,wrongTarget,{source:'V53_NOQUERY_GUARD'});
 const after=JSON.stringify({snapshot:opened.E.snapshot(opened.state.m),pending:opened.state.pending,events:opened.state.m.events,userChoiceLog:opened.state.m.userChoiceLog});
 const preChoiceHeroActions=(opened.state.m.events||[]).filter(event=>event.actorId===session.opts.heroPlayerId&&actionTypes.has(event.type));
 const noFutureBefore=opened.futureOutcomePrecomputed===false&&opened.pending.futureOutcomePrecomputed!==true;
 assert.equal(rejected.ok,false,'INVALID_EXACT_TARGET_WAS_ACCEPTED');
 assert.equal(rejected.reason,'CHOICE_TARGET_NOT_AVAILABLE','INVALID_EXACT_TARGET_WRONG_REASON');
 assert.equal(before,after,'INVALID_EXACT_TARGET_MUTATED_STATE');
 assert.equal(preChoiceHeroActions.length,0,'UNCHOSEN_PROTAGONIST_ACTION_BEFORE_CHOICE');
 const resolved=V.applyChoiceAndAdvance(opened,option.id,option.targetId??null,{maxPostSeconds:12});
 assert.equal(resolved.applyReceipt.choice,option.id,'CHOICE_ID_DRIFT');
 assert.equal(resolved.applyReceipt.targetId??null,option.targetId??null,'TARGET_ID_DRIFT');
 assert.equal(resolved.futureOutcomePrecomputed,false,'RESOLVED_FUTURE_OUTCOME_PRECOMPUTED');
 assert.equal(resolved.applyReceipt.futureOutcomePrecomputed,false,'CHOICE_RECEIPT_PRECOMPUTED');
 const committed=(resolved.state.m.events||[]).find(event=>event.commitEventId===resolved.applyReceipt.commitEventId);
 const choiceCommit=(resolved.state.m.events||[]).find(event=>event.type==='USER_CHOICE'&&event.commitEventId===resolved.applyReceipt.commitEventId);
 assert(committed,'CHOICE_CAUSAL_EVENT_MISSING');
 assert(choiceCommit,'CHOICE_COMMIT_EVENT_MISSING');
 assert.equal(choiceCommit.choiceId,option.id,'COMMITTED_CHOICE_ID_DRIFT');
 assert.equal(choiceCommit.targetId??null,option.targetId??null,'COMMITTED_TARGET_ID_DRIFT');
 assert(!resolved.nextPending,'CHAINED_CHOICE_REQUIRES_ANOTHER_EXACT_USER_SELECTION');
 H.resumeFromHighRes(session,resolved);
 assert.equal(session.status,'RUNNING','LEGACY_HANDBACK_DID_NOT_RESUME');
 assert.equal(session.opts.continuousSpatialAuthorityV2Coarse,undefined,'V2 OPTION APPEARED AFTER HANDBACK');
 assert.equal(session.state.spatial.futureOutcomePrecomputed,false,'HANDBACK_PRECOMPUTED_OUTCOME');
 const beforeContinue=session.state.second;H.advanceUntilBoundary(session);
 assert(session.state.second>beforeContinue,'LEGACY_COARSE_DID_NOT_CONTINUE_AFTER_HANDBACK');
 assert(String(session.state.spatial.stateId||'').startsWith('HC'),'POST_HANDBACK_DID_NOT_USE_LEGACY_COARSE_WRITER');
 return{seed:found.seed,boundary:{type:boundary.type,sceneId:boundary.sceneId,spatialSchema:boundary.stateSnapshot.spatial.schemaVersion},scene:{entry:'seedMatchLegacy',pendingOptions:opened.pending.options.map(row=>[row.id,row.targetId??null])},choice:{invalidExactTargetRejected:rejected.reason,invalidRequestUnchanged:before===after,chosen:[option.id,option.targetId??null],commitEventId:resolved.applyReceipt.commitEventId,committed:[choiceCommit.choiceId,choiceCommit.targetId??null],causalEventType:committed.type},protagonist:{preChoiceActionCount:preChoiceHeroActions.length,onlySelectedChoiceCommitted:true},futureOutcomePrecomputed:false,handback:{resumeCount:session.resumeCount,continuedFrom:beforeContinue,continuedTo:session.state.second,postHandbackSpatialSchema:session.state.spatial.schemaVersion,postHandbackStateId:session.state.spatial.stateId,mode:'COARSE_LEGACY'}};}
function run(){const session=defaultSession('V53-NOQUERY-LEGACY-KICKOFF'),start=kickoff(session),expectFail=process.argv.includes('--expect-fail');
 if(expectFail){const out={schemaVersion:'V53_NOQUERY_LEGACY_RELEASE_GATE_1.0',phase:'A_PRE_FIX',verdict:start.legal?'UNEXPECTED_PASS':'EXPECTED_PRE_FIX_FAIL',defaultSessionOnly:true,noV2FlagQueryOrGlobal:true,kickoff:start,sceneAndHandback:'NOT_RUN_BEFORE_KICKOFF_REPAIR',technicalPass:false,userVisualPass:false};write('PRE_FIX_FAIL.json',out);return out;}
 const scene=sceneAndHandback(),checks={defaultLegacy:start.mode==='COARSE_LEGACY'&&!start.v2OptionPresent,legalKickoff:start.legal,identity22And11Plus11:start.identityComplete&&start.counts.HOME===11&&start.counts.AWAY===11,legacy2dSceneEntry:scene.boundary.spatialSchema==='HYBRID_AUTHORITATIVE_COARSE_SPATIAL_1.0'&&scene.scene.entry==='seedMatchLegacy',exactChoicePairGuard:scene.choice.invalidExactTargetRejected==='CHOICE_TARGET_NOT_AVAILABLE'&&scene.choice.invalidRequestUnchanged&&scene.choice.chosen[0]===scene.choice.committed[0]&&scene.choice.chosen[1]===scene.choice.committed[1],noUnchosenProtagonistAction:scene.protagonist.preChoiceActionCount===0&&scene.protagonist.onlySelectedChoiceCommitted,noFuturePrecompute:!start.futureOutcomePrecomputed&&scene.futureOutcomePrecomputed===false,legacyHandbackContinues:scene.handback.mode==='COARSE_LEGACY'&&String(scene.handback.postHandbackStateId).startsWith('HC')};
 const passed=Object.values(checks).every(Boolean),out={schemaVersion:'V53_NOQUERY_LEGACY_RELEASE_GATE_1.0',phase:'C_REPAIRED_CANDIDATE',verdict:passed?'PASS':'FAIL',defaultSessionOnly:true,noV2FlagQueryOrGlobal:true,checks,kickoff:start,scene,technicalPass:passed,userVisualPass:false};write('RESULT.json',out);return out;}
try{const out=run();console.log(JSON.stringify(out,null,2));if(process.argv.includes('--expect-fail')){if(out.verdict!=='EXPECTED_PRE_FIX_FAIL')process.exitCode=1;}else if(out.verdict!=='PASS')process.exitCode=1;}catch(error){const out={schemaVersion:'V53_NOQUERY_LEGACY_RELEASE_GATE_1.0',verdict:'FAIL',error:error.stack||error.message,technicalPass:false,userVisualPass:false};write('RESULT.json',out);console.error(out.error);process.exitCode=1;}
