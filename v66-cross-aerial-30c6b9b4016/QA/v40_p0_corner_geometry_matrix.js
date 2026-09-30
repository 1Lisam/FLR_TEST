'use strict';
const assert=require('assert'),path=require('path');
const H=require('../final_match_rare_scenario_harness.js');
require('./v39_runtime_candidate_loader.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;require('../final_match_v37_forced_harness_patch.js');
const G=require('./v40_corner_geometry_gate.js');
const C=require('./v39_causal_detector_overrides.js').DETECTORS;
const CASES=[
 ['CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-13'],['CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-4'],
 ['CORNER_DEFEND_LEFT','FINAL-MATCH-TEST-15'],['CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-8'],
 ['CORNER_DEFEND_RIGHT','FINAL-MATCH-TEST-6'],['CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-1']
];
const rows=CASES.map(([scenario,seed])=>{const r=H.run(scenario,seed,{runtimeDir:path.resolve(__dirname,'../runtime')}),g=G.runCase(scenario,seed,r);return{scenario,seed,verdict:g.verdict,setup:g.results.SETUP_RESPONSIBILITY_GEOMETRY,liveTarget:g.results.LIVE_TARGET_CONVERGENCE,liveCluster:g.results.LIVE_ACTUAL_CLUSTER,futureOutcomePrecomputed:r.futureOutcomePrecomputed};});
const out={module:'V40_P0_CORNER_GEOMETRY_MATRIX',verdict:rows.every(x=>x.verdict==='PASS'&&x.futureOutcomePrecomputed===false)?'PASS':'RED',rows,axes:['HOME/AWAY','LEFT/RIGHT'],coverage:'setup responsibility/occupancy/target spacing plus live target convergence and actual cluster'};
assert.equal(out.verdict,'PASS');
console.log(JSON.stringify(out,null,2));
