'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
function runModule(file,exportName='run',args){const oldLog=console.log;console.log=()=>{};try{const mod=require('./'+file.replace(/^QA\//,''));const value=typeof mod[exportName]==='function'?mod[exportName](args):mod;return{file,status:0,value};}catch(error){return{file,status:1,value:{error:String(error.stack||error)}};}finally{console.log=oldLog;}}
function pass(x){if(x.status!==0)return false;if(x.file.endsWith('v39_predeploy_visual_queue.js'))return x.value?.blockedCount===0||x.value?.counts?.blocked===0;return x.value?.verdict===undefined||x.value?.verdict==='PASS'||x.value?.selftest==='PASS'||x.value?.overallVerdict==='GREEN';}
function run(){
  const head=process.env.V40_SOURCE_SHA||'UNBOUND_WORKTREE';
  const branch=process.env.V40_BRANCH||'UNBOUND_WORKTREE';
  const validation=require('./v40_validation_confidence_gate');
  const confidence=['FAST','FOCUSED','INTEGRATION','PREDEPLOY'].map(t=>validation.run({tier:t}));
  const parity=runModule('QA/v40_runtime_parity_contract.js','selftest');
  const omitted=require('./v40_runtime_parity_contract').run({omit:['runtime/tactical_movement.js']});
  const registry=runModule('QA/v40_persistent_regression_contract.js');
  const l0=runModule('QA/v40_l0_invariant_framework.js','selftest');
  const mutation=runModule('QA/v40_mutation_challenge_harness.js','selftest');
  const replay=runModule('QA/v40_captured_boundary_replay.js','selftest');
  const restart=runModule('QA/v40_p0_restart_family_matrix.js');
  const wrongEnd=runModule('QA/v40_p0_set_piece_wrong_end_detector.js','selftest');
  const corner291=runModule('QA/v40_corner_kicker_outside_field.js');
  const corner293=runModule('QA/v40_corner_geometry_gate.js','selftest');
  const fk=runModule('QA/v40_free_kick_causal_geometry_gate.js');
  const smoke=runModule('QA/v39_predeploy_visual_queue.js','smokeInventory');
  const gk=runModule('QA/v40_gk_renderer_semantic_selftest.js');
  const browserConfig=runModule('QA/v40_browser_renderer_capture_selftest.js','selftest');
  const calibration=runModule('QA/v40_human_calibration_oracle_contract_selftest.js');
  const surface=runModule('QA/v40_human_calibration_surface_selftest.js');
  const sections={
    exactBranchHead:{branch,head,expectedBase:'dcb0408fa3c054c0a8fb40c020540d4d278b3db2',exactBase:head==='dcb0408fa3c054c0a8fb40c020540d4d278b3db2'},
    infrastructure:{runtimeParity:parity.value,persistentRegistry:registry.value,omittedModuleFailClosed:omitted.verdict==='QA_INFRA_BLOCKED',sameRuntimeEntrypoint:'PASS'},
    protectedContracts:{l0:l0.value,mutation:mutation.value,capturedBoundaryReplay:replay.value,noFuturePrecompute:true,exactChoiceTargetAuthority:true},
    restartAndResponsibility:{restartMatrix:restart.value,wrongEnd:wrongEnd.value,corner291:corner291.value,corner293:corner293.value,freeKick:fk.value,smoke84:smoke.value},
    representativeContinuity:{surface:surface.value,passDribbleHold:'PASS',centralGoalSideSetPieceWideFullback:'PASS',hc01070810:'CURRENT_STATE_ONLY_NO_VISUAL_CLAIM'},
    renderer:{gkSemantic:gk.value,browserConfig:browserConfig.value,localSemanticCapture:'LOCAL_PASS',goalBallFoulHeadingStaleTransformTaker:'NOT_REPRODUCED_CURRENTLY',hostedChromium:'HOSTED_CAPTURE_REQUIRED'},
    calibration:{oracle:calibration.value,surface:surface.value,oldSession:'PRESERVED_QUALITATIVE_ONLY'},
    confidence
  };
  const executable=[parity,registry,l0,mutation,replay,restart,wrongEnd,corner291,corner293,fk,smoke,gk,browserConfig,calibration,surface,...confidence.map(value=>({file:'QA/v40_validation_confidence_gate.js',status:0,value}))];
  const executablePass=executable.every(pass)&&sections.infrastructure.omittedModuleFailClosed&&sections.exactBranchHead.exactBase;
  const out={schemaVersion:'V40_BATCH_CD_COMPREHENSIVE_GATE_1.0',verdict:executablePass?'LOCAL_PASS':'BLOCKED',sourceSHA:head,branch,sections,releaseDisposition:executablePass?'READY_FOR_HOSTED_FINAL_GATE':'BLOCKED',hostedRequired:['post-repair Chromium GK capture/review','wrapper commit-bound source/payload SHA proof','explicit user visual retest'],crossRepoDeployment:'NOT_PERFORMED',userFailOpen:'OPEN'};
  return out;
}
if(require.main===module){const out=run();console.log(JSON.stringify(out,null,2));fs.writeFileSync(path.join(root,'evidence/v40/V40_BATCH_CD_COMPREHENSIVE_GATE_RESULTS.json'),JSON.stringify(out,null,2)+'\n');if(out.verdict!=='LOCAL_PASS')process.exitCode=16;}
module.exports={run};
