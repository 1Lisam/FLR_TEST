#!/usr/bin/env node
'use strict';
const assert=require('assert');
const A=require('../live_v06_scene_authority_browser.js');
const rows=[];
for(let t=90;t<=100;t+=.5)rows.push({time:t,score:{HOME:0,AWAY:0},phase:'CHANCE',possession:'HOME',ball:{mode:'CONTROLLED',x:80+(t-90),y:34,ownerId:'H-RCM'},players:[],futureOutcomePrecomputed:false});
const boundary={atSecond:100,stateSnapshot:{second:100,score:{HOME:0,AWAY:0},phase:'CHANCE',possession:'HOME',coarseHistory:rows}};
const lead=A.nonHeroLeadInFrames(boundary,{minLeadSeconds:5,maxLeadSeconds:10});
assert(lead.length>=2,'NONHERO_LEADIN_EMPTY');
assert(lead[0].time<=90.5,'NONHERO_LEADIN_NOT_5_10_SECONDS_EARLY');
assert(lead.at(-1).time<=100.001,'NONHERO_LEADIN_FUTURE_FRAME');
assert(lead.every(f=>f.actualOrigin===true&&f.synthetic===false&&f.resimulated===false&&f.futureOutcomePrecomputed===false),'NONHERO_LEADIN_NOT_ACTUAL_HISTORY');
console.log(JSON.stringify({module:'V55_NONHERO_LEADIN_REPLAY',verdict:'PASS',start:lead[0].time,end:lead.at(-1).time,span:lead.at(-1).time-lead[0].time,futureOutcomePrecomputed:false},null,2));
