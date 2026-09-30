'use strict';
const E=require('../runtime/continuous_match_core.js');
const T=require('../runtime/tactical_movement.js');
const m=E.createMatch('R20-CONT-GATE',{telemetry:{}});
m.time=100;
// Emulate exact high-res entry: all live positions/velocities/targets are inherited.
const before={};
for(const p of m.players){
  p.vx=(p.team==='HOME'?1:-1)*(0.8+(p.slot.length%4)*0.35);
  p.vy=((p.id.charCodeAt(p.id.length-1)||0)%3-1)*0.18;
  p.tx=p.x+p.vx*0.25; p.ty=p.y+p.vy*0.25;
  before[p.id]={x:p.x,y:p.y,vx:p.vx,vy:p.vy,tx:p.tx,ty:p.ty};
}
m._hybridEntryContinuity={startedAt:m.time,shapeDelayUntil:m.time+.55,fadeUntil:m.time+6,players:Object.fromEntries(m.players.map(p=>[p.id,{x:p.x,y:p.y,vx:p.vx,vy:p.vy,tx:p.tx,ty:p.ty,task:p.tacticalTask||p.action||null,markTargetId:p.markTargetId||null,offsetX:null,offsetY:null}]))};
T.assign(m);
let posErr=0,velErr=0,targetErr=0,moving=0;
for(const p of m.players){const b=before[p.id];posErr=Math.max(posErr,Math.hypot(p.x-b.x,p.y-b.y));velErr=Math.max(velErr,Math.hypot(p.vx-b.vx,p.vy-b.vy));targetErr=Math.max(targetErr,Math.hypot(p.tx-b.tx,p.ty-b.ty));if(Math.hypot(p.vx,p.vy)>.35)moving++;}
const result={pass:posErr<1e-12&&velErr<1e-12&&moving>=19,posErr,velErr,targetErrDiagnostic:targetErr,moving,players:m.players.length,historicalContract:'position+velocity continuity; tactical targets may react to urgent live state'};
console.log(JSON.stringify(result,null,2));
if(!result.pass)process.exit(1);
