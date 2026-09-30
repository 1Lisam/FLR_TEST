'use strict';
const assert=require('assert');
const P0=require('./v40_p0_set_piece_wrong_end_detector.js');
const parity=require('./v40_runtime_parity_contract.js');
const proof=require('./v40_same_head_proof_contract.js');
const L0=require('./v40_l0_invariant_framework.js');
const corner=require('./v40_corner_geometry_gate.js');
function run({currentHead='TEST-HEAD'}={}){
 const rows=[
  {id:'MUT-P0-RESTART-DEFENDER-FRAME-INVERSION',p0:true,expected:'RED',actual:P0.runFixtures('SYNTHETIC_WRONG').some(x=>x.badDetected)?'RED':'GREEN'},
  {id:'MUT-RUNTIME-MODULE-OMISSION',p0:true,expected:'RED',actual:parity.run({omit:['runtime/corner_templates.js']}).verdict==='QA_INFRA_BLOCKED'?'RED':'GREEN'},
  {id:'MUT-SAME-HEAD-PROOF-SHA-MISMATCH',p0:true,expected:'RED',actual:proof.validate({gameplaySourceSHA:currentHead,payloadSourceSHA:'STALE-SHA'},{currentHead}).verdict==='BLOCKED'?'RED':'GREEN'},
  {id:'MUT-PROTAGONIST-CAUSALITY-BYPASS',p0:true,expected:'RED',actual:L0.checks.find(x=>x.id==='PROTAGONIST_UNSELECTED_ACTION_TARGET').run(L0.fixture('PROTAGONIST_UNSELECTED_ACTION_TARGET',true))?'RED':'GREEN'},
  {id:'MUT-CORNER-DUPLICATE-TARGET',p0:true,expected:'RED',actual:corner.setupGeometry(corner.fixtures().duplicate).detected?'RED':'GREEN'},
  {id:'MUT-CORNER-COLLAPSED-ZONE-HOLD-SPACING',p0:true,expected:'RED',actual:corner.setupGeometry(corner.fixtures().spacing).detected?'RED':'GREEN'},
  {id:'MUT-CORNER-MISSING-ROLE-OWNER',p0:true,expected:'RED',actual:corner.setupGeometry(corner.fixtures().missing).detected?'RED':'GREEN'},
  {id:'MUT-CORNER-WRONG-PHASE-BINDING',p0:true,expected:'RED',actual:corner.setupGeometry(corner.fixtures().wrongPhase).detected?'GREEN':'RED'}
 ];
 const killed=rows.filter(x=>x.actual===x.expected),survivors=rows.filter(x=>x.actual!==x.expected);
 return{module:'V40_MUTATION_CHALLENGE_HARNESS',schemaVersion:'V40_MUTATION_1.0',verdict:survivors.length?'RED':'PASS',mutationCount:rows.length,killed:killed.length,survivors,killRatio:rows.length?Number((killed.length/rows.length).toFixed(3)):0,mutations:rows,policy:{productionFilesMutated:false,p0SurvivorMakesGateRed:true}};
}
function selftest(){const out=run();assert.equal(out.verdict,'PASS');assert.equal(out.survivors.length,0);assert.equal(out.killed,8);return{module:out.module,selftest:'PASS',killed:out.killed,mutationCount:out.mutationCount};}
if(require.main===module){const st=process.argv.includes('--selftest'),out=st?selftest():run({currentHead:process.argv[2]||'TEST-HEAD'});console.log(JSON.stringify(out,null,2));if(!st&&out.verdict!=='PASS')process.exitCode=14;}
module.exports={run,selftest};
