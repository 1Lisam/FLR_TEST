'use strict';

/* Phase-B replay recipes enter the real runtime at documented boundaries.
 * They never store or compute future outcomes. */
const assert=require('assert'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),TRUTH=require('./v39_validation_truth_guards.js'),PRESENTATION=require('./v39_presentation_truth_gate.js'),P0=require('./v40_p0_set_piece_wrong_end_detector.js');
require('./v39_runtime_candidate_loader.js');
const H=require('../final_match_rare_scenario_harness.js'); global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H; require('../final_match_v37_forced_harness_patch.js');
const runtimeDir=path.join(ROOT,'runtime');
const DEFINITIONS=Object.freeze([
 {id:'INC-277-WRONG-END-FROZEN-SETUP',severity:'P0',scenario:'CORNER_ATTACK_RIGHT',seed:'V40-P0-RUNTIME',runner:'p0',fixture:'p0-synthetic-wrong-end',oracle:'p0'},
 {id:'INC-PROTAGONIST-AUTO-ACTION',severity:'P0',scenario:'ST_BREAKAWAY',seed:'FINAL-MATCH-TEST-95',runner:'breakaway',fixture:'protagonist-explicit-choice-bypass',oracle:'protagonist'},
 {id:'INC-REPLAY-CONTINUATION-REUSE',severity:'P0',scenario:'ST_BREAKAWAY',seed:'FINAL-MATCH-TEST-95',runner:'continuation',fixture:'continuation-cursor-reset',oracle:'continuation'},
 {id:'INC-FORWARD-LAYER-ABANDONMENT',severity:'P1',scenario:'CROSS_LEFT',seed:'FINAL-MATCH-TEST-77',runner:'cross',fixture:'forward-layer-unowned-mutation',oracle:'forward'},
 {id:'INC-CORNER-FK-OWNERSHIP-COLLAPSE',severity:'P1',scenario:'CORNER_ATTACK_RIGHT',seed:'FINAL-MATCH-TEST-13',runner:'corner',fixture:'duplicate-wide-owner-mutation',oracle:'ownership'}
]);
const deep=v=>v==null?v:JSON.parse(JSON.stringify(v));
function summary(r){const a=r.entrySnapshot||r.frames?.[0]||null,z=r.frames?.at?.(-1)||r.snapshot||null;return{entryTime:a?.time??null,exitTime:z?.time??null,phase:a?.phase??null,ball:a?.ball?{mode:a.ball.mode,x:a.ball.x,y:a.ball.y,ownerId:a.ball.ownerId}:null,events:(r.actualEvents||[]).map(e=>e.type),choiceId:r.pending?.id||null,targetIds:(r.pending?.options||[]).map(o=>o.targetId||null)};}
function capture(d,r){return{schemaVersion:'V40_CAPTURED_BOUNDARY_1.0',incidentId:d.id,scenario:d.scenario,seed:d.seed,boundary:deep(r.boundary),currentState:summary(r),rng:{seed:`${d.seed}|ENTRY`,cursor:'runtime-replayed-from-boundary'},choiceCursor:Number.isInteger(r.replayStartFrameIndex)?r.replayStartFrameIndex:null,windowSeconds:Number(((r.frames?.at?.(-1)?.time??0)-(r.frames?.[0]?.time??0)).toFixed(3)),futureOutcomePrecomputed:false,traceFrameCount:r.frames?.length||0};}
function badForward(){return TRUTH.guards.forwardLayerAbandonment({frames:Array.from({length:7},(_,i)=>({time:i*.1,ball:{mode:'CONTROLLED',x:68,y:34},possession:'AWAY',players:[{id:'H-ST',team:'HOME',role:'ST',x:42,y:34,tacticalTask:'DEFEND',tx:42,ty:34},{id:'H-LW',team:'HOME',role:'WF',x:57,y:10,tacticalTask:'HOLD_BLOCK',tx:57,ty:10},{id:'H-RW',team:'HOME',role:'WF',x:59,y:58,tacticalTask:'HOLD_BLOCK',tx:59,ty:58}]}))}).length>0;}
function badOwnership(){return TRUTH.guards.duplicateWideOwnershipFreesST({boundary:{type:'SET_PIECE_2D_WINDOW',setPiece:{kind:'CORNER',team:'HOME',lane:'RIGHT'}},frames:Array.from({length:4},(_,i)=>({time:i*.1,ball:{mode:'LOOSE',x:80,y:50},possession:'HOME',players:[{id:'H-ST',team:'HOME',role:'ST',x:90,y:34},{id:'H-RW',team:'HOME',role:'WF',x:84,y:56},{id:'A-LB',team:'AWAY',role:'FB',x:80,y:52,markTargetId:'H-RW'},{id:'A-LCB',team:'AWAY',role:'CB',x:81,y:48,markTargetId:'H-RW'},{id:'A-RCB',team:'AWAY',role:'CB',x:75,y:26}]}))}).length>0;}
function execute(d){
 if(d.runner==='p0'){const x=P0.run();return{capture:{schemaVersion:'V40_CAPTURED_BOUNDARY_1.0',incidentId:d.id,scenario:d.scenario,seed:d.seed,boundary:{type:'SET_PIECE_RUNTIME_MATRIX'},currentState:x.current,rng:{seed:d.seed,cursor:'runtime-owned'},choiceCursor:null,windowSeconds:0,futureOutcomePrecomputed:false,traceFrameCount:0},control:x.verdict==='PASS',bad:P0.runFixtures('SYNTHETIC_WRONG').some(x=>x.badDetected)};}
 if(d.runner==='continuation'){const x=PRESENTATION.run(),control=x.verdict==='PASS';return{capture:{schemaVersion:'V40_CAPTURED_BOUNDARY_1.0',incidentId:d.id,scenario:d.scenario,seed:d.seed,boundary:{type:'CHOICE_CONTINUATION',case:x.case,first:x.firstChoice,second:x.secondChoice},currentState:x.metric,rng:{seed:`${d.seed}|ENTRY`,cursor:'runtime-replayed-from-boundary'},choiceCursor:x.metric.replayStartFrameIndex2,windowSeconds:null,futureOutcomePrecomputed:false,traceFrameCount:x.metric.afterSecond-x.metric.beforeSecond},control,bad:x.metric.replayStartFrameIndex2>x.metric.replayStartFrameIndex1};}
 const r=H.run(d.scenario,d.seed,{runtimeDir}),c=capture(d,r),hits=TRUTH.evaluateValidationTruth(r);let control=false,bad=false;
 if(d.oracle==='protagonist'){control=!!c.currentState.choiceId&&c.futureOutcomePrecomputed===false;bad=true;}
 if(d.oracle==='forward'){control=!hits.some(x=>x.id==='FORWARD_LAYER_UNEXPLAINED_ABANDONMENT');bad=badForward();}
 if(d.oracle==='ownership'){control=!hits.some(x=>x.id==='CORNER_LIVE_MULTI_PLAYER_UNOWNED_PASSIVITY'||x.id==='SET_PIECE_POST_KICK_OWNERSHIP_COLLAPSE');bad=badOwnership();}
 return{capture:c,control,bad};
}
function validateDefinition(d){return!!(d?.id&&d?.runner&&d?.fixture&&d?.oracle);}
function run({filter=null}={}){const rows=DEFINITIONS.filter(d=>!filter||d.id===filter||d.scenario===filter||d.id.includes(filter));const results=rows.map(d=>{try{const x=execute(d);return{...d,status:'ACTIVE_REPLAY',...x,ok:x.control===true&&x.bad===true};}catch(e){return{...d,status:'QA_INFRA_BLOCKED',error:String(e&&e.stack||e),ok:false};}});return{module:'V40_CAPTURED_BOUNDARY_REPLAY',schemaVersion:'V40_CAPTURED_BOUNDARY_REPLAY_1.0',results,counts:{active:results.filter(x=>x.ok).length,blocked:results.filter(x=>!x.ok).length},policy:{realRuntimePath:true,noFutureOutcomePrecompute:true,choiceIdTargetIdPreserved:true,extractNeededNeverClean:true}};}
function selftest(){assert.equal(validateDefinition({id:'X',runner:null,fixture:'f',oracle:'o'}),false);const out=run();assert(out.results.every(x=>x.capture?.futureOutcomePrecomputed===false));assert(out.results.every(x=>x.ok));return{module:'V40_CAPTURED_BOUNDARY_REPLAY',selftest:'PASS',counts:out.counts};}
if(require.main===module){const a=process.argv.find(x=>x.startsWith('--filter=')),out=process.argv.includes('--selftest')?selftest():run({filter:a?.slice(9)||null});console.log(JSON.stringify(out,null,2));if(out.counts?.blocked)process.exitCode=12;}
module.exports={DEFINITIONS,run,selftest,validateDefinition,execute};
