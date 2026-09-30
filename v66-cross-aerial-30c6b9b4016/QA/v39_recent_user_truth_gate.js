'use strict';
const path=require('path');
const TRUTH=require('./v39_validation_truth_guards.js');
const PRESENTATION=require('./v39_presentation_truth_gate.js');
require('./v39_runtime_candidate_loader.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');
const runtimeDir=path.resolve(__dirname,'../runtime');

/* This batch is user authority from the first V39 post-deploy visual retest.
 * Detector-clean never means PASS; it only means the exact report may be shown
 * again to the user. Reports without a safe causal detector remain calibration
 * blockers rather than being silently treated as clean. */
const CASES=Object.freeze([
  {id:'V39-PD01-01',scenario:'GK_SHOT_CLOSE',seed:'FINAL-MATCH-TEST-135',guards:['GK_RENDERER_ENGINE_DIVE_SEMANTIC_MISMATCH']},
  {id:'V39-PD01-02',scenario:'GK_SHOT_BOX',seed:'FINAL-MATCH-TEST-135',guards:['GK_RENDERER_ENGINE_DIVE_SEMANTIC_MISMATCH']},
  {id:'V39-PD01-03',scenario:'GK_SHOT_LONG',seed:'FINAL-MATCH-TEST-103',guards:['GK_RENDERER_ENGINE_DIVE_SEMANTIC_MISMATCH']},
  {id:'V39-PD01-04',scenario:'ST_BREAKAWAY',seed:'FINAL-MATCH-TEST-98',guards:['BREAKAWAY_SAME_TEAM_FORWARD_SUPPORT_SHADOW'],coverage:'ACTUAL_PATH_RESPONSIBILITY_DETECTOR',note:'Exact user-facing path now commits CARRY then CARRY with cursor/continuation evidence; detector checks sustained trailing occupation against dynamic lane scale and responsibility, not the reported gap.'},
  {id:'V39-PD01-05',scenario:'ST_BREAKAWAY',seed:'FINAL-MATCH-TEST-95',guards:[],coverage:'PRESENTATION_CONTRACT',note:'Second-choice replay is validated by the dedicated continuation-frame cursor contract.'},
  {id:'V39-PD01-06',scenario:'CROSS_LEFT',seed:'FINAL-MATCH-TEST-77',guards:['FORWARD_LAYER_UNEXPLAINED_ABANDONMENT']},
  {id:'V39-PD01-07',scenario:'FREE_KICK_DEFEND_LEFT',seed:'FINAL-MATCH-TEST-27',guards:['SET_PIECE_MIDFIELD_CHANNEL_CROSS']},
  {id:'V39-PD01-08',scenario:'FREE_KICK_ATTACK_RIGHT',seed:'FINAL-MATCH-TEST-27',guards:['SET_PIECE_MIDFIELD_CHANNEL_CROSS'],note:'After defender-frame repair, targeted truth is channel crossing/role inversion, not raw longitudinal movement during reconnect.'},
  {id:'V39-PD01-09',scenario:'FREE_KICK_ATTACK_LEFT',seed:'FINAL-MATCH-TEST-27',guards:['SET_PIECE_POST_KICK_OWNERSHIP_COLLAPSE']},
  {id:'V39-PD01-10',scenario:'FREE_KICK_ATTACK_LEFT',seed:'FINAL-MATCH-TEST-21',guards:['SET_PIECE_CENTRAL_FORWARD_UNOWNED'],note:'Central ST exposure is blocked only when sustained live-play distance coincides with no explicit owner and no compensating defender.'},
  {id:'V39-PD01-11',scenario:'FREE_KICK_ATTACK_LEFT',seed:'FINAL-MATCH-TEST-15',guards:['SET_PIECE_MIDFIELD_CHANNEL_CROSS']},
  {id:'V39-PD01-12',scenario:'CORNER_DEFEND_LEFT',seed:'FINAL-MATCH-TEST-15',guards:['SET_PIECE_LIVE_WIDE_THREAT_UNOWNED']},
  {id:'V39-PD01-13',scenario:'CORNER_ATTACK_RIGHT',seed:'FINAL-MATCH-TEST-13',guards:['CORNER_LIVE_MULTI_PLAYER_UNOWNED_PASSIVITY'],coverage:'ACTUAL_LIVE_RESPONSIBILITY_DETECTOR',note:'Detector starts at live kick/contact progression and evaluates ball/opponent/space responsibility; pre-kick DEAD-state stillness is excluded.'},
  {id:'V39-PD01-14',scenario:'CORNER_ATTACK_RIGHT',seed:'FINAL-MATCH-TEST-8',guards:['SET_PIECE_LIVE_WIDE_THREAT_UNOWNED'],context:['WINGER_CROSSOVER_REQUIRES_HUMAN_CONTEXT']},
  {id:'V39-PD01-15',scenario:'CORNER_ATTACK_LEFT',seed:'FINAL-MATCH-TEST-4',guards:['SET_PIECE_LIVE_WIDE_THREAT_UNOWNED']},
  {id:'V39-PD01-16',scenario:'CORNER_ATTACK_LEFT',seed:'FINAL-MATCH-TEST-1',guards:['FORWARD_LAYER_UNEXPLAINED_ABANDONMENT','SET_PIECE_LIVE_WIDE_THREAT_UNOWNED']}
]);

function runCase(c){
  if(c.coverage==='PRESENTATION_CONTRACT'){
    const contract=PRESENTATION.run();return{...c,state:contract.verdict==='PASS'?'DETECTOR_CLEAN_NEEDS_USER_RETEST':'KNOWN_FAIL_DETECTED',fired:contract.verdict==='PASS'?[]:['CHOICE_CONTINUATION_REPLAY_CONTRACT'],presentationContract:contract,hits:[]};
  }
  let scenario;try{scenario=H.run(c.scenario,c.seed,{runtimeDir});}catch(err){return{...c,state:'HARNESS_ERROR_BLOCKED',error:String(err&&err.stack||err)};}
  const hits=TRUTH.evaluateValidationTruth(scenario),hitIds=new Set(hits.filter(x=>x.severity==='BLOCK_CANDIDATE').map(x=>x.id));
  if(!c.guards.length)return{...c,state:c.coverage||'CALIBRATION_PENDING',hits};
  const fired=c.guards.filter(id=>hitIds.has(id)),clean=c.guards.filter(id=>!hitIds.has(id));
  return{...c,state:fired.length?'KNOWN_FAIL_DETECTED':'DETECTOR_CLEAN_NEEDS_USER_RETEST',fired,clean,hits};
}
function run(){
  const rows=CASES.map(runCase),hard=rows.filter(r=>['KNOWN_FAIL_DETECTED','HARNESS_ERROR_BLOCKED','CALIBRATION_PENDING'].includes(r.state)),clean=rows.filter(r=>r.state==='DETECTOR_CLEAN_NEEDS_USER_RETEST');
  return{module:'V39_POST_DEPLOY_USER_TRUTH_GATE',batch:'POST_DEPLOY_VISUAL_REPORT_BATCH_01',verdict:hard.length?'DO_NOT_DEPLOY_FOR_USER_VISUAL_RETEST':'READY_FOR_USER_VISUAL_RETEST_CANDIDATE',policy:{userFailIsAuthority:true,detectorCleanIsNotUserPass:true,uncoveredUserFailureIsCalibrationBlocker:true,contextOnlyObservationsDoNotAutoFail:true,presentationControlIsSeparateTruthContract:true},counts:{total:rows.length,blocked:hard.length,detectorCleanNeedsUserRetest:clean.length},blocked:hard.map(r=>({id:r.id,scenario:r.scenario,seed:r.seed,state:r.state,fired:r.fired||[],note:r.note||null})),clean:clean.map(r=>({id:r.id,scenario:r.scenario,seed:r.seed})),rows};
}
if(require.main===module){const out=run();console.log(JSON.stringify(out,null,2));if(out.verdict!=='READY_FOR_USER_VISUAL_RETEST_CANDIDATE')process.exitCode=5;}
module.exports={CASES,run,runCase};
