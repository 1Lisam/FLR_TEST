'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const oraclePath=path.resolve(__dirname,'v40_human_calibration_oracles.json');
const oracle=require(oraclePath);
const future=require('./v40_human_calibration_future_session_contract.json');
const manifest=require('./v40_human_calibration_manifest.json');
const phase=fs.readFileSync(path.resolve(__dirname,'../evidence/v40/V40_VALIDATION_CONFIDENCE_PHASE_B.md'),'utf8');
const ready=fs.readFileSync(path.resolve(__dirname,'../evidence/v40/V40_HUMAN_CALIBRATION_SURFACE_READY.md'),'utf8');
function rows(){return Object.entries(oracle.oracles||{}).map(([caseId,row])=>({caseId,...row}));}
function validatePrecommit(){
  const rs=rows();
  const canonical=JSON.stringify(rs.slice().sort((a,b)=>a.caseId.localeCompare(b.caseId)));
  const hash=crypto.createHash('sha256').update(canonical).digest('hex');
  const ids=manifest.cases.map(x=>x.id), mapping=future.mapping||[];
  const mapped=new Map(mapping.map(x=>[x.caseId,x]));
  const uniqueGroups=new Map();
  for(const r of rs){const m=mapped.get(r.caseId);if(m?.weight>0)uniqueGroups.set(m.duplicateGroup,(uniqueGroups.get(m.duplicateGroup)||0)+m.weight);}
  return rs.length===12 && oracle.schemaVersion==='V40_HUMAN_CALIBRATION_ORACLES_2.0' && oracle.visibility==='validator-only' && oracle.precommittedAt && oracle.precommitSource && oracle.oracleSha256===hash && ids.length===12 && ids.every(id=>mapped.has(id)) && mapping.length===ids.length && rs.every(r=>{const m=mapped.get(r.caseId);return (r.expectedJudgment||r.expectedClass)&&r.targetObservable&&r.acceptanceRationale&&['CONTROL','KNOWN_BAD','AMBIGUOUS_PROBE','PRESENTATION_PROBE'].includes(r.caseType)&&Number.isFinite(r.weight)&&r.weight>=0&&r.duplicateGroup&&m.targetObservable===r.targetObservable&&m.weight===r.weight&&m.duplicateGroup===r.duplicateGroup;}) && [...uniqueGroups.values()].every(x=>x<=1);
}
function run(){
  const claimsExpected=/Expected judgments are (withheld|stored separately)/i.test(phase+ready);
  const precommitted=validatePrecommit();
  const out={module:'V40_HUMAN_CALIBRATION_ORACLE_CONTRACT_SELFTEST',verdict:claimsExpected&&precommitted?'PASS':'QA_INFRA_FAIL',claimsExpected,precommitted,oracleSchemaVersion:oracle.schemaVersion,oracleSha256:oracle.oracleSha256,futureSessionId:future.sessionId,duplicateWeighting:'PASS',missingRows:rows().filter(r=>!(r.expectedJudgment||r.expectedClass)||!r.targetObservable||!r.acceptanceRationale||!r.caseType).map(r=>r.caseId),policy:{expectedOutcomeRequiredBeforeSession:true,targetObservableRequiredBeforeReady:true,immutablePrecommitRequiredBeforeReady:true,retroactiveJudgmentAssignmentForbidden:true,missingMappingBlocksMaterialization:true,duplicateCasesDoNotDoubleWeight:true}};
  assert.equal(out.verdict,'PASS',JSON.stringify(out));
  return out;
}
if(require.main===module){try{console.log(JSON.stringify(run(),null,2));}catch(e){console.error(e.message);process.exitCode=7;}}
module.exports={run,validatePrecommit};
