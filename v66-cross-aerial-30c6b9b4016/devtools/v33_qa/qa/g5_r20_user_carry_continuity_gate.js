'use strict';
const E=require('../runtime/continuous_match_core.js');
const B=E.choiceStateBridge(), A=E.choiceActionBridge();
const m=E.createMatch('R20-CARRY-CONTINUITY-GATE',{telemetry:{}}),p=m.playersById['H-LB'];
// Historical R20 developer carry scenario: LB around x56/y16, already moving forward,
// with a long forward carry intent. Opponents are displaced only to isolate locomotion continuity.
p.x=56;p.y=16;p.vx=3.1;p.vy=.15;p.tx=74;p.ty=16;p.bodyAngle=0;p.action='CARRY_FORWARD';p.tacticalTask='CARRY_FORWARD';
for(const q of m.players.filter(q=>q.team==='AWAY')){q.x=q.role==='GK'?100:90;q.y=50;q.tx=q.x;q.ty=q.y;q.vx=q.vy=0;}
for(const q of m.players.filter(q=>q.team==='HOME'&&q.id!==p.id)){q.x=Math.min(q.x,42);q.tx=q.x;q.ty=q.y;q.vx=q.vy=0;}
A.setControlled(m,p);m.phase='OPEN_PLAY';m.possession='HOME';m.protagonistControllerId=p.id;m.protagonistExplicitActionRequired=true;m.protagonistInteractiveEpisode={active:true,playerId:p.id};
const state=B.inspect(m,p.id),carry=state?.candidates.find(c=>c.id==='CARRY');
const applied=carry?B.applyCandidate(m,p.id,'CARRY',null,'QA'):null;
const rows=[];if(applied?.ok){for(let i=0;i<48;i++){E.step(m,.05);rows.push({t:m.time,x:p.x,y:p.y,v:Math.hypot(p.vx,p.vy),tx:p.tx,ty:p.ty,action:p.action});}}
const est=rows.filter(r=>r.t>=.30&&r.t<=2.40);let maxAdjacentDrop=0,backwardSteps=0,hardStops=0;
for(let i=1;i<est.length;i++){maxAdjacentDrop=Math.max(maxAdjacentDrop,est[i-1].v-est[i].v);if(est[i].x<est[i-1].x-.01)backwardSteps++;if(est[i].v<.20)hardStops++;}
const forwardGain=rows.length?rows.at(-1).x-56:0;
const results=[
 {id:'G5_USER_CARRY_AVAILABLE',pass:!!carry,detail:{candidates:state?.candidates.map(c=>c.id)}},
 {id:'G5_USER_CARRY_APPLIED_CURRENT_STATE',pass:!!applied?.ok&&applied.futureOutcomePrecomputed===false,detail:applied},
 // Historical R20 measured maxAdjacentDrop=0.520000...; preserve that actual regression bound.
 {id:'G5_R20_NO_SPEED_CLIFF',pass:maxAdjacentDrop<=.520001,detail:{maxAdjacentDrop,historicalMax:0.5200000000000005}},
 {id:'G5_R20_NO_HARD_STOP',pass:hardStops===0,detail:{hardStops,minEstablished:est.length?Math.min(...est.map(r=>r.v)):null}},
 {id:'G5_FORWARD_VECTOR_PRESERVED',pass:backwardSteps===0&&forwardGain>6.0,detail:{backwardSteps,forwardGain}}
];
const pass=results.every(r=>r.pass);console.log(JSON.stringify({pass,results,summary:{samples:est.length,maxAdjacentDrop,hardStops,backwardSteps,forwardGain}},null,2));if(!pass)process.exit(1);
