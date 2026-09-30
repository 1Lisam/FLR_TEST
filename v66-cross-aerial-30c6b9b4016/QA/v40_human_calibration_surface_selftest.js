'use strict';
const assert=require('assert'),path=require('path'),fs=require('fs');
const manifest=require('./v40_human_calibration_manifest.json'),oracles=require('./v40_human_calibration_oracles.json');
const H=require('../final_match_rare_scenario_harness.js');
require('./v39_runtime_candidate_loader.js'); global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H; require('../final_match_v37_forced_harness_patch.js');
const causal=require('./v39_causal_detector_overrides.js').DETECTORS;
const parity=require('./v40_runtime_parity_contract.js');
const runtimeDir=path.resolve(__dirname,'../runtime');
const surface=fs.readFileSync(path.resolve(__dirname,'../v40_human_calibration_surface.js'),'utf8');
const p=(id,team,role,x,y,task,extra={})=>({id,team,role,x,y,tx:x,ty:y,tacticalTask:task,...extra});
function frame(players,mode='LOOSE'){return{time:1,phase:'SET_PIECE_LIVE',ball:{mode,kind:'CORNER',x:80,y:34},possession:'HOME',players};}
function liveTargetBad(){return{frames:[frame([p('H-A','HOME','CB',70,30,'CORNER_ZONE_HOLD',{tx:75,ty:34}),p('H-B','HOME','CB',71,31,'CORNER_ZONE_HOLD',{tx:75,ty:34}),p('H-C','HOME','FB',72,32,'CORNER_ZONE_HOLD',{tx:75,ty:34})])]};}
function liveTargetControl(){return{frames:[frame([p('H-A','HOME','CB',70,30,'AERIAL_DUEL',{tx:75,ty:34}),p('H-B','HOME','CB',71,31,'POST_PROTECT',{tx:75,ty:34}),p('H-C','HOME','FB',72,32,'CORNER_ZONE_HOLD',{tx:75,ty:34})])]};}
function liveClusterBad(){return{frames:[frame([p('A-A','AWAY','CB',80,34,'CORNER_ZONE_HOLD'),p('A-B','AWAY','CB',81,34,'CORNER_ZONE_HOLD'),p('A-C','AWAY','FB',82,34,'CORNER_ZONE_HOLD')])]};}
function liveClusterControl(){return{frames:[frame([p('A-A','AWAY','CB',80,34,'AERIAL_DUEL'),p('A-B','AWAY','CB',81,34,'POST_PROTECT'),p('A-C','AWAY','FB',82,34,'CORNER_ZONE_HOLD')])]};}
function run(){
  const ids=manifest.cases.map(x=>x.id),oracleIds=Object.keys(oracles.oracles||{}),userCases=manifest.cases.map(({id,scenario,seed,renderable})=>({id,scenario,seed,renderable}));
  assert.equal(new Set(ids).size,12);assert.deepEqual(ids,oracleIds);assert(userCases.every(x=>x.renderable===true));assert(!JSON.stringify(userCases).match(/expected|oracle|automated|judgment|verdict|category|catastrophic|legitimate|variation|plausibility|presentation|continuity/i));assert(manifest.cases.every(x=>!Object.prototype.hasOwnProperty.call(x,'category')),'user manifest must not expose evaluation category');
  const listMount=surface.match(/<div class="human-calibration__case-list"[^>]*><\/div>/)?.[0]||'';
  assert.match(listMount,/data-hc-case-list/,'case-list mount target missing data attribute');
  assert.match(surface,/root\.querySelector\('\[data-hc-case-list\]'\)/,'case-list query contract missing');
  assert.match(surface,/cases\.forEach\(/,'case materialization loop missing');
  assert.match(surface,/list\.appendChild\(b\)/,'case materialization append missing');
  assert.equal((surface.match(/b\.dataset\.caseId=c\.id/g)||[]).length,1);
  assert.match(surface,/b\.textContent=c\.id/,'case button must expose only neutral case id');
  assert.doesNotMatch(surface,/b\.textContent=.*category/,'case button must not leak evaluation category');
  assert.doesNotMatch(surface,/row=\{[^}]*category:/,'result row must not copy hidden evaluation category');
  assert.equal(ids.length,12,'12 cases must be materializable');
  const timings=[],renders=manifest.cases.map(c=>{const t=process.hrtime.bigint(),r=H.run(c.scenario,c.seed,{runtimeDir}),ms=Number(process.hrtime.bigint()-t)/1e6;timings.push({id:c.id,scenario:c.scenario,seed:c.seed,wallClockMs:+ms.toFixed(3),frameCount:r.frames?.length||0});assert.equal(r.futureOutcomePrecomputed,false);return r;});
  assert.equal(renders.length,12);assert(timings.every(x=>x.wallClockMs<1000));
  const tb=causal.SET_PIECE_TARGET_CONVERGENCE,ac=causal.SET_PIECE_ACTUAL_CLUSTER;
  assert.equal(tb(liveTargetBad()).detected,true,'target bad fixture');assert.equal(tb(liveTargetControl()).detected,false,'target control fixture');assert.equal(ac(liveClusterBad()).detected,true,'cluster bad fixture');assert.equal(ac(liveClusterControl()).detected,false,'cluster control fixture');
  const currentTarget=H.run('CORNER_DEFEND_RIGHT','FINAL-MATCH-TEST-6',{runtimeDir}),currentCluster=H.run('CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-1',{runtimeDir});
  assert.equal(tb(currentTarget).detected,false);assert.equal(ac(currentCluster).detected,false);
  const pr=parity.run();assert.equal(pr.verdict,'PASS');
  return{module:'V40_HUMAN_CALIBRATION_SURFACE_SELFTEST',verdict:'PASS',manifest:{userCases:12,oracleCases:12,oneToOne:true,renderable:12,expectedJudgmentExposed:false,evaluationCategoryExposed:false},blockerReconciliation:{targetConvergence:{scenario:'CORNER_DEFEND_RIGHT',seed:'FINAL-MATCH-TEST-6',currentLiveDetected:tb(currentTarget).detected,badDetected:tb(liveTargetBad()).detected,controlDetected:tb(liveTargetControl()).detected},actualCluster:{scenario:'CORNER_ATTACK_LEFT',seed:'FINAL-MATCH-TEST-1',currentLiveDetected:ac(currentCluster).detected,badDetected:ac(liveClusterBad()).detected,controlDetected:ac(liveClusterControl()).detected}},runtimeParity:pr,perCaseTimings:timings,boundedStartupReplay:{maxWallClockMs:Math.max(...timings.map(x=>x.wallClockMs)),maxFrames:Math.max(...timings.map(x=>x.frameCount)),fullMatchPerCase:false}};
}
if(require.main===module){const out=run();console.log(JSON.stringify(out,null,2));}
module.exports={run};
