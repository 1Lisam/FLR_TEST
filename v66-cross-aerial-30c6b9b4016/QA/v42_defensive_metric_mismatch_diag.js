#!/usr/bin/env node
'use strict';
/* QA-only source instrumentation. It compiles an in-memory copy of tactical_movement
 * with an observation hook; runtime/tactical_movement.js is never written or altered. */
const fs=require('fs'),path=require('path'),Module=require('module'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..'),TACTICS=path.join(ROOT,'runtime/tactical_movement.js'),CORE=path.join(ROOT,'runtime/continuous_match_core.js');
const D=require('./v42_team_shape_collapse_detector');
const n=x=>Number.isFinite(Number(x))?Number(Number(x).toFixed(3)):null;
const cases=[
 {seed:'V42-ORACLE-100-CB-25',heroRole:'CB',heroPlayerId:'H-LCB',team:'AWAY',from:294.6,to:294.9,expected:294.7},
 {seed:'V42-SHAPE-SWEEP-FRESH-CM-002',heroRole:'CM',heroPlayerId:'H-CM',team:'HOME',from:36.6,to:36.9,expected:36.7}
];
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function installInstrumentedTactics(){
 const needle='  state.waypointArbitration={schemaVersion:';
 const hook="  if(globalThis.__V42_DEFENSIVE_METRIC_MISMATCH_HOOK__)globalThis.__V42_DEFENSIVE_METRIC_MISMATCH_HOOK__({m,team,planned,base,live,proposed,finalShape,relativeSpacingLoss,centralShell,exempt,nearSevereCompression,preservesOrWorsensDanger,nearThresholdActivation,worsens,arbitrationActive});\n";
 const source=fs.readFileSync(TACTICS,'utf8'); if(!source.includes(needle))throw Error('QA_HOOK_ANCHOR_NOT_FOUND');
 const mod=new Module(TACTICS,module);mod.filename=TACTICS;mod.paths=Module._nodeModulePaths(path.dirname(TACTICS));
 mod._compile(source.replace(needle,hook+needle),TACTICS);require.cache[TACTICS]=mod;
}
function frameOf(m){return require(CORE).snapshot(m);}
function detectorGeometryForPlanned(m,team,planned){
 const byId=new Map(planned.map(p=>[p.d.id,p.chosen]));
 const players=m.players.map(p=>{const q=byId.get(p.id);if(!q)return{...p};const w=team==='HOME'?q:{x:105-q.x,y:68-q.y};return{...p,x:w.x,y:w.y};});
 const z=D.metrics({players},team);return{centralOccupancy:z.centralOccupancy,largestConnectedCluster:z.largestConnectedCluster};
}
function compactHook(x){
 const ids=x.planned.map(p=>p.d.id), roles=x.planned.map(p=>p.d.role);
 const snap=frameOf(x.m), detector=D.detect(snap,x.team);
 const detectorLikeProposed=detectorGeometryForPlanned(x.m,x.team,x.planned);
 return {time:n(x.m.time),team:x.team,planned:{count:ids.length,ids,roles,allCurrentTeamOutfield:ids.length===x.m.players.filter(p=>p.team===x.team&&p.role!=='GK').length},detectorAtArbitration:detector,detectorLikeProposed,arbitration:{base:x.base,live:x.live,proposed:x.proposed,final:x.finalShape,relativeSpacingLoss:n(x.relativeSpacingLoss),centralShell:x.centralShell,exempt:x.exempt,nearSevereCompression:x.nearSevereCompression,preservesOrWorsensDanger:x.preservesOrWorsensDanger,nearThresholdActivation:x.nearThresholdActivation,worsens:x.worsens,arbitrationActive:x.arbitrationActive}};
}
function selftest(){
 const roles=['GK','FB','CB','CB','FB','CM','CM','CM','WF','ST','WF'],players=Array.from({length:22},(_,i)=>({id:`${i<11?'H':'A'}-${i}`,team:i<11?'HOME':'AWAY',role:roles[i%11],x:50+(i%5),y:30+(i%4)}));
 const bad={phase:'OPEN_PLAY',ball:{x:50,y:34},players};for(const p of bad.players.filter(p=>p.team==='AWAY'&&p.role!=='GK')){p.x=55;p.y=34;}
 if(!D.detect(bad,'AWAY').flagged)throw Error('DETECTOR_SELFTEST_FAILED');return'V42_TEAM_SHAPE_COLLAPSE_DETECTOR_SELFTEST_PASS';
}
function replay(c,A,E){
 const hooks=[],post=[],orig=E.step;
 globalThis.__V42_DEFENSIVE_METRIC_MISMATCH_HOOK__=x=>{if(x.team===c.team&&x.m.time>=c.from-.001&&x.m.time<=c.to+.001)hooks.push(compactHook(x));};
 E.step=function(m,dt){const out=orig(m,dt);if(m.time>=c.from-.001&&m.time<=c.to+.001){const snap=E.snapshot(m);post.push({time:n(m.time),detectorAfterStep:D.detect(snap,c.team),persistedArbitration:m._defensiveResponsibility?.[c.team]?.waypointArbitration||null});}return out;};
 try{A.captureActualPath({...c,durationSeconds:1800});}finally{E.step=orig;delete globalThis.__V42_DEFENSIVE_METRIC_MISMATCH_HOOK__;}
 const crossing=hooks.find(x=>Math.abs(x.time-c.expected)<.001);if(!crossing)throw Error(`CROSSING_HOOK_MISSING:${c.seed}`);
 const after=post.find(x=>Math.abs(x.time-c.expected)<.001);if(!after?.detectorAfterStep.flagged)throw Error(`CROSSING_DETECTOR_NOT_REPRODUCED:${c.seed}`);
 crossing.arbitration.applied=after.persistedArbitration?.applied??null;
 const a=crossing.arbitration, blockers=[];if(a.exempt)blockers.push('!exempt');if(!a.nearSevereCompression)blockers.push('nearSevereCompression (live.central>=7 || live.centralConnected>=7)');if(!a.preservesOrWorsensDanger)blockers.push('preservesOrWorsensDanger (proposed.central>=live.central || proposed.centralConnected>=live.centralConnected)');
 return {...c,hooks,post,crossing,activationBlockers:blockers,firstPostFlag:post.find(x=>x.detectorAfterStep.flagged)?.time??null};
}
function main(){
 const self=selftest();installInstrumentedTactics();const E=require(CORE),A=require('./v42_oracle_observation_adapter');
 const results=cases.map(c=>replay(c,A,E));
 const out={schemaVersion:'V42_DEFENSIVE_METRIC_MISMATCH_DIAG_1.0',verdict:'MIXED_MISMATCH_FOUND',truth:{USER_FAIL_OPEN:'OPEN',STEP79:'NOT_STARTED',productionGameplayChanged:false,deploymentPerformed:false,browserUsed:false,broadSweepRun:false,excluded:['attack-side ST-23','transient CM-13']},source:{head:process.env.V42_REPO_HEAD||'NOT_SUPPLIED',tacticalMovementSha256:sha(TACTICS),detectorSha256:sha(path.join(ROOT,'QA/v42_team_shape_collapse_detector.js')),qaHelperSha256:sha(__filename),instrumentation:'in-memory tactical_movement.js compile; no production file write'},staticComparison:{detector:{playerSet:'all current team non-GK players',cardinality:10,coordinate:'worldToLocal; AWAY mirrors x=105-x and y=68-y',central:'x 25..82 inclusive; abs(y-34)<=16',graph:'all ten players, fixed radius 14',metrics:'bounding depth/lateral/area; line separation; 5 channels; local density R10; connected cluster R14; central occupancy',activation:'non-exempt and >=5 of 7 signals'},arbitration:{playerSet:'planned from executeDefensiveResponsibilityMotion: every outfield(team) with state.records[id]; replay confirms all 10 current team outfield players',cardinality:'10 in both crossings',coordinate:'worldToLocal; AWAY mirrors x=105-x and y=68-y',central:'x<48; abs(y-34)<12',graph:'central subset only; adaptive link radius clamp(10,14, mean all-pairs distance * .55)',metrics:'central count; largest connected central subset; mean pair distance; relative spacing loss; base central shell',activation:'worsens OR (!exempt && (live.central>=7 || live.centralConnected>=7) && (proposed.central>=live.central || proposed.centralConnected>=live.centralConnected))'}},selftest:self,cases:results};
 fs.writeFileSync(path.join(ROOT,'evidence/v42/V42_DEFENSIVE_METRIC_MISMATCH_DIAG.json'),JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify(results.map(r=>({seed:r.seed,crossing:r.crossing,activationBlockers:r.activationBlockers,firstPostFlag:r.firstPostFlag})),null,2));return out;
}
if(require.main===module){try{main();}catch(e){console.error(e.stack);process.exitCode=1;}}
