'use strict';
const assert=require('assert');
const E=require('../runtime/continuous_match_core.js');
const T=require('../runtime/tactical_movement.js');
const HOME='HOME',AWAY='AWAY';
const place=(m,id,x,y)=>{const p=m.playersById[id];p.x=p.tx=x;p.y=p.ty=y;p.vx=p.vy=0;return p;};
function controlled(m,team,id){const p=m.playersById[id];m.possession=team;m.ball={...m.ball,mode:'CONTROLLED',ownerId:id,lastTouchPlayer:id,lastTouchTeam:team,x:p.x,y:p.y,vx:0,vy:0};p.controlledSince=m.time;}
function match(seed='V43-R1'){const m=E.createMatch(seed,{telemetry:{}});m.restart=null;m.phase='OPEN_PLAY';return m;}
function materialWide(state){return state.threats.filter(t=>t.material&&t.kind==='WIDE');}
function formationContinuity(){
  const m=match('V43-FORMATION');place(m,'H-CM',48,34);place(m,'H-LCB',35,27);controlled(m,HOME,'H-CM');
  m._shapeAuthorityPhase={HOME:'ATTACK:PROGRESSION'};
  const cb=m.playersById['H-LCB'],held={x:44,y:17};cb._shapeContinuityIntent={x:held.x,y:held.y,task:'FULLBACK_RECYCLE_SUPPORT',sprint:false,until:2.0,possession:HOME,phase:'ATTACK:PROGRESSION',futureOutcomePrecomputed:false};
  const rows=[];for(let i=0;i<4;i++){m.time=i*.25;controlled(m,HOME,'H-CM');T.assign(m);rows.push({x:cb.tx,y:cb.ty,task:cb.tacticalTask});}
  assert(rows.every(r=>Math.hypot(r.x-held.x,r.y-held.y)<.001&&r.task==='FULLBACK_RECYCLE_SUPPORT'),'shape rail replaced a live relationship');
  m.time=1.25;place(m,'H-CM',18,34);controlled(m,HOME,'H-CM');T.assign(m);assert(cb.tacticalTask!=='FULLBACK_RECYCLE_SUPPORT','phase change did not release recovery reference');
  return{ticks:rows.length,phaseRelease:'PASS'};
}
function wideTurnover(team,slot,fbId,carrierId,threatId,fb,threat){
  const m=match('V43-'+team+'-'+slot);place(m,fbId,fb.x,fb.y);place(m,threatId,threat.x,threat.y);place(m,carrierId,carrierId.startsWith('H-')?65:40,34);
  const lost=team,gain=lost===HOME?AWAY:HOME;controlled(m,lost,fbId);m._lastTacticalPossession=lost;controlled(m,gain,carrierId);T.assign(m);
  const v=m._transitionWideVacancies?.[lost]?.[slot],s=m._defensiveResponsibility?.[lost],wide=materialWide(s);
  assert(v,'material wide channel vacancy was not captured');assert.equal(v.threatId,threatId);assert(v.handoffOwnerId||m.playersById[fbId].tacticalTask==='TRANSITION_FB_RECOVERY','vacancy lacks atomic handoff or FB recovery');
  const row=wide.find(t=>t.id===threatId);assert(row&&row.owners.length===1,'material wide threat ownerless after turnover');if(v.handoffOwnerId)assert.equal(row.owners[0],v.handoffOwnerId,'recorded wide handoff diverged from semantic owner');
  return{policy:v.policy,slot,handoffOwnerId:v.handoffOwnerId,owner:row.owners[0],reason:v.reason};
}
function widePolicies(){
  const overlap=wideTurnover(HOME,'RB','H-RB','A-CM','A-LW',{x:72,y:59},{x:43,y:60});
  const balanced=wideTurnover(HOME,'LB','H-LB','A-CM','A-RW',{x:70,y:9},{x:43,y:8});
  const invert=wideTurnover(AWAY,'LB','A-LB','H-CM','H-RW',{x:65,y:34},{x:60,y:60});
  assert.equal(overlap.policy,'OVERLAP');assert.equal(invert.policy,'INVERT');assert.equal(balanced.policy,'BALANCED');
  return{overlap,balanced,invert,legitimateCover:'PASS'};
}
function defenderContinuity(){
  const m=match('V43-MARK');place(m,'H-RW',78,55);place(m,'H-ST',85,34);place(m,'A-LCB',88,39);place(m,'A-RCB',89,31);controlled(m,HOME,'H-RW');
  const rows=[];for(let i=0;i<4;i++){m.time=i*.25;controlled(m,HOME,'H-RW');T.assign(m);const s=m._defensiveResponsibility.AWAY,mark=Object.values(s.records).find(r=>r.targetId==='H-ST');assert(mark,'central material threat lost mark');const p=m.playersById[mark.ownerId];rows.push({owner:mark.ownerId,target:p.markTargetId,tx:p.tx,ty:p.ty,task:p.tacticalTask});}
  assert(rows.every(r=>r.target==='H-ST'),'mark target was erased by shape/postprocessor');assert(new Set(rows.map(r=>r.owner)).size===1,'stable material mark oscillated');return{ticks:rows.length,owner:rows[0].owner};
}
function looseBallMotion(){
  const m=match('V43-LOOSE');place(m,'H-RW',72,55);place(m,'H-ST',78,34);place(m,'A-LCB',82,39);place(m,'A-RCB',82,30);controlled(m,HOME,'H-RW');m.ball.mode='LOOSE';m.ball.ownerId=null;m.ball.lastTouchPlayer='H-RW';m.ball.lastTouchTeam=HOME;m.ball.x=72;m.ball.y=55;m._lastTacticalPossession=HOME;T.assign(m);
  const s=m._defensiveResponsibility.AWAY,mark=Object.values(s.records).find(r=>r.targetId==='H-ST');assert(s?.motionSchemaVersion==='DEFENSIVE_RESPONSIBILITY_MOTION_1.0','loose-ball reconciliation did not execute motion');assert(mark?.motion,'loose material responsibility has no movement record');const p=m.playersById[mark.ownerId];assert(['MARK_LANE_SCREEN','RECOVERY_CHASE'].includes(p.tacticalTask),'loose material responsibility did not become movement authority');return{owner:mark.ownerId,task:p.tacticalTask};
}
function main(){const out={module:'V43_FORMATION_RESPONSIBILITY_ROUND1',verdict:'PASS',controls:{formationTemporalReanchor:formationContinuity(),widePolicies:widePolicies(),persistentDefenderMark:defenderContinuity(),looseBallResponsibilityMotion:looseBallMotion()},oldBehaviorDetectedBy:{formationRailReplacement:'HARD_FAIL',overlapVacancyMiss:'HARD_FAIL',balancedVacancyMiss:'HARD_FAIL',invertControl:'HARD_FAIL',markReset:'HARD_FAIL',looseSemanticMotionDisconnect:'HARD_FAIL'},futureOutcomePrecomputed:false};console.log(JSON.stringify(out,null,2));return out;}
if(require.main===module)main();module.exports={main};
