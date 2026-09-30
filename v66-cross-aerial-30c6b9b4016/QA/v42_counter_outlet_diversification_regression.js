'use strict';
const assert=require('assert'),path=require('path');
const H=require('../final_match_rare_scenario_harness.js');
require('./v39_runtime_candidate_loader.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;require('../final_match_v37_forced_harness_patch.js');
const scenario='CORNER_ATTACK_RIGHT',seed='FINAL-MATCH-TEST-8';
const run=H.run(scenario,seed,{runtimeDir:path.resolve(__dirname,'../runtime')});
const outletFrames=(run.frames||[]).filter(f=>(f.players||[]).some(p=>/^CORNER_COUNTER_OUTLET(?:_(?:LEFT|RIGHT))?$/.test(String(p.tacticalTask||p.action||''))));
const collisions=[];
for(const f of outletFrames){const groups=new Map();for(const p of f.players||[]){const task=String(p.tacticalTask||p.action||'');if(!/^CORNER_COUNTER_OUTLET(?:_(?:LEFT|RIGHT))?$/.test(task))continue;const key=`${p.team}|${task}|${Number(p.tx).toFixed(3)}|${Number(p.ty).toFixed(3)}`;(groups.get(key)||groups.set(key,[]).get(key)).push(p.id);}for(const [target,ids] of groups)if(ids.length>=3)collisions.push({time:f.time,target,ids});}
const out={module:'V42_COUNTER_OUTLET_DIVERSIFICATION_REGRESSION',scenario,seed,framesObserved:outletFrames.length,collisions,verdict:outletFrames.length&&collisions.length===0&&run.futureOutcomePrecomputed===false?'PASS':'RED'};
assert.equal(out.verdict,'PASS',JSON.stringify(out));
console.log(JSON.stringify(out,null,2));
