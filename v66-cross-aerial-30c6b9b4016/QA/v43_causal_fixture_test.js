#!/usr/bin/env node
'use strict';
const assert=require('assert'),{evaluate}=require('./v43_causal_plausibility_detector');
const p=(id,team,role,x,y,vx=0,vy=0,extra={})=>({id,team,role,x,y,vx,vy,...extra});
const base=(players,ball={ownerId:'A-CM',x:55,y:34,z:0})=>({time:1,phase:'OPEN_PLAY',ball,players});
function has(x,c){return x.issues.some(i=>i.category===c);}
function run(){
 const wideBad=base([p('H-LB','HOME','FB',40,10),p('H-LCB','HOME','CB',35,28),p('A-RW','AWAY','WF',64,5),p('A-CM','AWAY','CM',55,34)]);assert(has(evaluate([wideBad]),'UNMARKED_WIDE_THREAT_UNJUSTIFIED_FB_DEPARTURE'));
 const invertedOk=base([p('H-LB','HOME','FB',42,25,0,0,{action:'INVERT_REST_DEFENSE',responsibility:'REST_DEFENSE'}),p('A-RW','AWAY','WF',62,5),p('A-CM','AWAY','CM',55,34)]);assert(!has(evaluate([invertedOk]),'UNMARKED_WIDE_THREAT_UNJUSTIFIED_FB_DEPARTURE'));
 const tightBad=base([p('H-RCB','HOME','CB',57,35),p('A-ST','AWAY','ST',58,35),p('A-CM','AWAY','CM',55,20)]);assert(has(evaluate([tightBad]),'OFF_BALL_OVER_TIGHT_MARKING'));
 const tightBall=base([p('H-RCB','HOME','CB',57,35),p('A-ST','AWAY','ST',58,35),p('A-CM','AWAY','CM',55,20)],{ownerId:'A-ST',x:58,y:35,z:0});assert(!has(evaluate([tightBall]),'OFF_BALL_OVER_TIGHT_MARKING'));
 const doubleBad=base([p('H-LCM','HOME','CM',54,33,0,0,{action:'PRESS_CONTAIN',responsibility:'PRIMARY_BALL_PRESSURE'}),p('H-CM','HOME','CM',55,35,0,0,{action:'PRESS_CONTAIN',responsibility:'PRIMARY_BALL_PRESSURE'}),p('A-CM','AWAY','CM',55,34),p('A-RW','AWAY','WF',67,7)]);assert(has(evaluate([doubleBad]),'UNJUSTIFIED_DOUBLE_PRESS_VACATES_THREAT'));
 const turn=[base([p('H-CM','HOME','CM',30,30,.5,0),p('A-CM','AWAY','CM',55,34)]),base([p('H-CM','HOME','CM',31,30,.5,0),p('A-CM','AWAY','CM',55,34)])];turn[1].time=1.1;assert(has(evaluate(turn),'LOW_SPEED_TURN_SLIDE'));
 const inertia=[base([p('H-CM','HOME','CM',30,30,6,0),p('A-CM','AWAY','CM',55,34)]),base([p('H-CM','HOME','CM',30.5,30,-5,0),p('A-CM','AWAY','CM',55,34)])];inertia[1].time=1.1;assert(has(evaluate(inertia),'HIGH_SPEED_TURN_INERTIA'));
 return{module:'V43_CAUSAL_FIXTURES',verdict:'PASS',positiveAndNegativeCounterexamples:true};
}
if(require.main===module)console.log(JSON.stringify(run(),null,2));module.exports={run};
