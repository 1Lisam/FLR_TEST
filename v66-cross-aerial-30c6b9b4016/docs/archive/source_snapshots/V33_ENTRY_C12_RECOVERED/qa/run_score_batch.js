'use strict';
const E=require('../runtime/continuous_match_core.js');
const seeds=process.argv.slice(2); if(!seeds.length) throw new Error('seeds required');
const out=[]; for(const seed of seeds){const m=E.createMatch(seed,{telemetry:{}});let n=0;while(!m.completed&&m.time<5400&&n++<220000)E.step(m,.05);const s=E.snapshot(m),x=s.stats||{};out.push({seed,score:s.score,totalGoals:(s.score?.HOME||0)+(s.score?.AWAY||0),shots:x.shots||0,tacklesWon:x.tacklesWon||0,interceptions:x.interceptions||0,blocks:x.blocks||0,steps:n});}
console.log(JSON.stringify(out,null,2));
