'use strict';
const path=require('path');
const BASE=require('./v39_visual_detectors.js');
const REL=require('./v39_relational_detectors.js');
const CAUSAL=require('./v39_causal_detector_overrides.js');
require('./v39_runtime_candidate_loader.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');
const runtimeDir=path.resolve(__dirname,'../runtime'),D={...BASE.DETECTORS,...REL.DETECTORS,...CAUSAL.DETECTORS};
const cases=[
 ['CORNER_DEFEND_RIGHT','FINAL-MATCH-TEST-6',['SET_PIECE_TARGET_CONVERGENCE']],
 ['CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-6',['SET_PIECE_SAME_TEAM_LAYER_COLLISION','CORNER_KICKER_PATH_DIRECTION','CORNER_CENTRAL_CROWD_RELATION']],
 ['CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-4',['SET_PIECE_ACTUAL_CLUSTER','CORNER_GK_POST_RESPONSIBILITY']],
 ['CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-4',['SET_PIECE_ACTUAL_CLUSTER','CORNER_KICKER_PATH_DIRECTION']],
 ['CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-1',['SET_PIECE_ACTUAL_CLUSTER']]
];
const rows=[];for(const [scenario,seed,ids] of cases){const r=H.run(scenario,seed,{runtimeDir});rows.push({scenario,seed,detectors:Object.fromEntries(ids.map(id=>[id,D[id]?D[id](r):{detected:false,reason:'MISSING'}]))});}
console.log(JSON.stringify({module:'V39_CORNER_DETECTOR_METRICS',rows},null,2));
