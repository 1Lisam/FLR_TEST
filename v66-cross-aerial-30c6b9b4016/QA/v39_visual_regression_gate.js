'use strict';
const path=require('path');
const REG=require('./v39_visual_regression_registry.js');
const BASE=require('./v39_visual_detectors.js');
const REL=require('./v39_relational_detectors.js');
const CAUSAL=require('./v39_causal_detector_overrides.js');
const TRUTH=require('./v39_validation_truth_guards.js');
require('./v39_runtime_candidate_loader.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');

const runtimeDir=path.resolve(__dirname,'../runtime');
const DETECTORS=Object.freeze({...BASE.DETECTORS,...REL.DETECTORS,...CAUSAL.DETECTORS});
const allPairedControls=()=>[...BASE.pairedControls(),...REL.pairedControls(),...CAUSAL.pairedControls(),...TRUTH.pairedControls()];

function evaluateReport(report,scenario){
  const symptoms=[];
  for(const symptom of report.symptoms){
    if(!symptom.detector){
      symptoms.push({...symptom,state:symptom.coverage==='CONTEXT_RETEST'?'CONTEXT_RETEST_REQUIRED':'CALIBRATION_PENDING'});
      continue;
    }
    const detector=DETECTORS[symptom.detector];
    const result=detector?detector(scenario):{detected:false,reason:'DETECTOR_NOT_IMPLEMENTED'};
    symptoms.push({...symptom,state:result.detected?'KNOWN_FAIL_DETECTED':'DETECTOR_CLEAN_NEEDS_USER_RETEST',result});
  }
  return symptoms;
}

function runCalibration(){
  const cache=new Map(),rows=[];
  const run=(scenario,seed)=>{const key=`${scenario}|${seed}`;if(!cache.has(key))cache.set(key,H.run(scenario,seed,{runtimeDir}));return cache.get(key);};
  for(const report of REG.USER_FAIL_REPORTS){
    const scenario=run(report.scenario,report.seed);
    const symptoms=evaluateReport(report,scenario).map(s=>s.state==='DETECTOR_CLEAN_NEEDS_USER_RETEST'?{...s,state:'FALSE_PASS_UNEXPLAINED'}:s);
    rows.push({id:report.id,scenario:report.scenario,seed:report.seed,status:report.status,symptoms,validationTruth:TRUTH.evaluateValidationTruth(scenario)});
  }
  const pairs=allPairedControls(),allSymptoms=rows.flatMap(r=>r.symptoms.map(s=>({report:r.id,...s})));
  const cleaned=allSymptoms.filter(s=>s.coverage==='DETECTOR_READY'&&s.state!=='KNOWN_FAIL_DETECTED').map(s=>`${s.report}:${s.id}`);
  const pending=allSymptoms.filter(s=>s.state==='CALIBRATION_PENDING').map(s=>`${s.report}:${s.id}`);
  const contextRetest=allSymptoms.filter(s=>s.state==='CONTEXT_RETEST_REQUIRED').map(s=>`${s.report}:${s.id}`);
  const badPairs=pairs.filter(x=>!x.ok).map(x=>x.id);
  const verdict=badPairs.length?'FAIL':pending.length?'PASS_WITH_CALIBRATION_PENDING':'PASS';
  return{module:'V39_USER_VISUAL_REGRESSION_GATE',mode:'CALIBRATION',registryVersion:REG.version,verdict,knownUserFailReports:REG.USER_FAIL_REPORTS.length,knownUserPassControls:REG.USER_PASS_CONTROLS.length,detectorReadySymptoms:allSymptoms.filter(s=>s.coverage==='DETECTOR_READY').length,pendingSymptoms:pending.length,contextRetestSymptoms:contextRetest.length,cleanedSymptoms:cleaned.length,cleaned,badPairs,pending,contextRetest,pairs,rows,note:'Candidate detector-clean means eligible for predeploy visual queue, not user PASS. Validation-truth guards separately test responsibility, post-kick ownership, midfield channel crossing, forward-layer abandonment, and actual Test Dock GK renderer semantics.'};
}

function runRelease(){
  const open=REG.USER_FAIL_REPORTS.filter(r=>r.status==='USER_FAIL_OPEN');
  return{module:'V39_USER_VISUAL_REGRESSION_GATE',mode:'RELEASE_ACCEPTANCE',verdict:open.length?'BLOCKED_BY_USER_FAIL_OPEN':'PASS',openUserFailReports:open.map(r=>({id:r.id,scenario:r.scenario,seed:r.seed})),policy:REG.policy,note:'Detector cleanliness cannot close a user visual failure. A clean candidate remains NEEDS_USER_RETEST until the user explicitly passes it.'};
}

if(require.main===module){
  const mode=process.argv.includes('--release')?'release':'calibration',out=mode==='release'?runRelease():runCalibration();
  console.log(JSON.stringify(out,null,2));
  if(mode==='release'&&out.verdict!=='PASS')process.exitCode=2;
  if(mode==='calibration'&&out.badPairs?.length)process.exitCode=1;
}
module.exports={DETECTORS,evaluateReport,runCalibration,runRelease};
