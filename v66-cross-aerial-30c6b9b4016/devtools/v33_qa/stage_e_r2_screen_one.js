'use strict';
const path=require('path');
const root=process.argv[2], seed=process.argv[3];
if(!root||!seed){console.error('usage: node stage_e_r2_screen_one.js <candidateRoot> <seed>');process.exit(2);}
const E=require(path.resolve(root,'runtime/continuous_match_core.js'));
const r=E.runToEnd(seed,{dt:0.05,telemetry:{}}),s=r.snapshot,x=s.stats||{},goals=(s.score?.HOME||0)+(s.score?.AWAY||0),sot=(x.saves||0)+goals;
console.log(JSON.stringify({seed,dt:0.05,completed:!!s.completed,time:s.time,score:s.score,totalGoals:goals,shots:x.shots||0,boxShots:x.boxShots||0,saves:x.saves||0,estimatedSoT:sot,corners:x.corners||0,shotBlocks:x.shotBlocks||0,shotBlockCorners:x.shotBlockCorners||0,fouls:x.fouls||0,freeKicks:x.freeKicks||0,offsides:x.offsides||0,steps:r.steps},null,2));
