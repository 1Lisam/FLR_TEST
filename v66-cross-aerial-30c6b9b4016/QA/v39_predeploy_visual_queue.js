'use strict';
const path=require('path');
const REG=require('./v39_visual_regression_registry.js');
const BASE=require('./v39_visual_detectors.js');
const REL=require('./v39_relational_detectors.js');
const CAUSAL=require('./v39_causal_detector_overrides.js');
const {evaluatePlausibility}=require('./v39_plausibility_guards.js');
const TRUTH=require('./v39_validation_truth_guards.js');
const COORD=require('./v39_coordinate_frame_contract.js');
require('./v39_runtime_candidate_loader.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');
const RECENT=require('./v39_recent_user_truth_gate.js');
const P0=require('./v40_p0_set_piece_wrong_end_detector.js');

const runtimeDir=path.resolve(__dirname,'../runtime');
const DETECTORS=Object.freeze({...BASE.DETECTORS,...REL.DETECTORS,...CAUSAL.DETECTORS});
const SCENARIO_KEYS=Object.freeze([
  'CORNER_ATTACK_LEFT','CORNER_ATTACK_RIGHT','CORNER_DEFEND_LEFT','CORNER_DEFEND_RIGHT',
  'FREE_KICK_ATTACK_LEFT','FREE_KICK_ATTACK_RIGHT','FREE_KICK_DEFEND_LEFT','FREE_KICK_DEFEND_RIGHT',
  'CROSS_LEFT','CROSS_RIGHT','ST_BREAKAWAY','GK_SHOT_LONG','GK_SHOT_BOX','GK_SHOT_CLOSE'
]);
const SMOKE_SEEDS=Object.freeze(['FINAL-MATCH-TEST-1','FINAL-MATCH-TEST-4','FINAL-MATCH-TEST-6','FINAL-MATCH-TEST-10','FINAL-MATCH-TEST-12','FINAL-MATCH-TEST-30']);

function runScenario(scenario,seed){return H.run(scenario,seed,{runtimeDir});}
function inspectReport(report,scenario){
  const symptoms=report.symptoms.map(symptom=>{
    if(!symptom.detector)return{id:symptom.id,state:symptom.coverage==='CONTEXT_RETEST'?'CONTEXT_RETEST_REQUIRED':'CALIBRATION_PENDING',coverage:symptom.coverage};
    const detector=DETECTORS[symptom.detector];
    if(!detector)return{id:symptom.id,state:'DETECTOR_MISSING',coverage:symptom.coverage,detector:symptom.detector};
    const result=detector(scenario);
    return{id:symptom.id,state:result.detected?'AUTOMATED_FAIL_DETECTED':'DETECTOR_CLEAN',coverage:symptom.coverage,detector:symptom.detector,result};
  });
  const plausibility=evaluatePlausibility(scenario),validationTruth=TRUTH.evaluateValidationTruth(scenario);
  const knownBlocks=symptoms.filter(s=>s.state==='AUTOMATED_FAIL_DETECTED'||s.state==='DETECTOR_MISSING');
  const pending=symptoms.filter(s=>s.state==='CALIBRATION_PENDING');
  const contextRetest=symptoms.filter(s=>s.state==='CONTEXT_RETEST_REQUIRED');
  const plausibilityBlocks=plausibility.filter(x=>x.severity==='BLOCK_CANDIDATE');
  const truthBlocks=validationTruth.filter(x=>x.severity==='BLOCK_CANDIDATE');
  let disposition='READY_FOR_USER_RETEST';
  if(knownBlocks.length||plausibilityBlocks.length||truthBlocks.length)disposition='AUTOMATED_FAIL_BLOCKED';
  else if(pending.length)disposition='CALIBRATION_BLOCKED';
  return{
    id:report.id,scenario:report.scenario,seed:report.seed,userStatus:report.status,disposition,
    symptoms,plausibility,validationTruth,contextRetest:contextRetest.map(s=>s.id),
    reason:disposition==='READY_FOR_USER_RETEST'
      ?'Automated causal blockers are clean. CONTEXT_RETEST items remain for human review because plausible football variation must not be auto-failed.'
      :disposition==='CALIBRATION_BLOCKED'
        ?'At least one symptom is still neither safely automatable nor explicitly classified as contextual visual review.'
        :'A known causal detector, plausibility guard, or validation-truth guard still fires; do not spend user visual-test time on this scene.'
  };
}

function currentQueue(){
  const rows=[];
  for(const report of REG.USER_FAIL_REPORTS){
    let scenario;
    try{scenario=runScenario(report.scenario,report.seed);}
    catch(err){rows.push({id:report.id,scenario:report.scenario,seed:report.seed,userStatus:report.status,disposition:'HARNESS_ERROR_BLOCKED',error:String(err&&err.stack||err)});continue;}
    rows.push(inspectReport(report,scenario));
  }
  const ready=rows.filter(r=>r.disposition==='READY_FOR_USER_RETEST');
  const automatedBlocked=rows.filter(r=>r.disposition==='AUTOMATED_FAIL_BLOCKED'||r.disposition==='HARNESS_ERROR_BLOCKED');
  const calibrationBlocked=rows.filter(r=>r.disposition==='CALIBRATION_BLOCKED');
  const recentTruth=RECENT.run(),recentBlocked=recentTruth.verdict!=='READY_FOR_USER_VISUAL_RETEST_CANDIDATE';
  const coordinateFrameContract=COORD.run(),coordinateBlocked=coordinateFrameContract.verdict!=='PASS';
  const p0=P0.run(),p0Blocked=p0.verdict!=='PASS';
  return{
    module:'V39_PREDEPLOY_VISUAL_QUEUE',mode:'CURRENT_USER_FAIL_BATCH',registryVersion:REG.version,
    verdict:(automatedBlocked.length||calibrationBlocked.length||recentBlocked||coordinateBlocked||p0Blocked)?'DO_NOT_DEPLOY_FOR_USER_VISUAL_RETEST':'READY_TO_DEPLOY_FOR_USER_VISUAL_RETEST',
    policy:{automatedFailScenesMustNotReachUser:true,calibrationPendingMustNotReachUser:true,contextRetestDoesNotAutoBlock:true,detectorCleanDoesNotEqualUserPass:true,detectorCleanOpenUserFailBecomesUserRetestCandidate:true,recentUserTruthBatchMustAlsoBeClean:true,taskLabelAloneDoesNotProveResponsibility:true,postKickOwnershipWindowRequired:true,rendererTruthOverridesInternalTaskSemantics:true,setPieceDangerTargetsUseRestartFrame:true,defenderIdentityDoesNotOwnLongitudinalFrame:true,p0WrongEndTargetMustBlock:true},
    counts:{total:rows.length,readyForUserRetest:ready.length,automatedBlocked:automatedBlocked.length,calibrationBlocked:calibrationBlocked.length,recentTruthBlocked:recentTruth.counts.blocked,sourceContractBlocked:coordinateBlocked?1:0,p0WrongEndBlocked:p0Blocked?1:0},
    readyForUserRetest:ready.map(r=>({id:r.id,scenario:r.scenario,seed:r.seed,contextRetest:r.contextRetest||[]})),recentTruth,coordinateFrameContract,p0WrongEnd:p0,rows
  };
}

function smokeInventory(){
  const rows=[];
  for(const scenario of SCENARIO_KEYS){
    for(const seed of SMOKE_SEEDS){
      try{const r=runScenario(scenario,seed),plausibilityHits=evaluatePlausibility(r),validationTruthHits=TRUTH.evaluateValidationTruth(r),all=[...plausibilityHits,...validationTruthHits];rows.push({scenario,seed,plausibilityHits,validationTruthHits,allHits:all});}
      catch(err){rows.push({scenario,seed,error:String(err&&err.stack||err),plausibilityHits:[],validationTruthHits:[{id:'HARNESS_ERROR',severity:'BLOCK_CANDIDATE'}],allHits:[{id:'HARNESS_ERROR',severity:'BLOCK_CANDIDATE'}]});}
    }
  }
  const blocked=rows.filter(r=>r.allHits.some(x=>x.severity==='BLOCK_CANDIDATE'));
  return{module:'V39_PREDEPLOY_VISUAL_QUEUE',mode:'VALIDATION_TRUTH_SMOKE_INVENTORY',note:'Inventory only. Guards target missing causal responsibility and renderer-visible truth, not rare-but-valid football shapes.',scenarioCount:SCENARIO_KEYS.length,seedCount:SMOKE_SEEDS.length,totalRuns:rows.length,blockedCount:blocked.length,blocked:blocked.map(r=>({scenario:r.scenario,seed:r.seed,hits:r.allHits})),rows};
}

const smoke=process.argv.includes('--smoke');
const strict=process.argv.includes('--predeploy')||process.argv.includes('--strict-smoke');
const out=smoke?smokeInventory():currentQueue();
console.log(JSON.stringify(out,null,2));
if(strict){if(smoke&&out.blockedCount>0)process.exitCode=4;if(!smoke&&out.verdict!=='READY_TO_DEPLOY_FOR_USER_VISUAL_RETEST')process.exitCode=3;}
module.exports={currentQueue,smokeInventory,inspectReport,SCENARIO_KEYS,SMOKE_SEEDS};
