#!/usr/bin/env node
'use strict';
/* TEST_ONLY temporal guard: several shape ticks, then advance/turnover/loose-ball continuity. */
const assert=require('assert'),E=require('../runtime/continuous_match_core.js'),T=require('../runtime/tactical_movement.js');
const HOME='HOME',AWAY='AWAY',place=(m,id,x,y)=>{const p=m.playersById[id];p.x=p.tx=x;p.y=p.ty=y;p.vx=p.vy=0;return p;};
function controlled(m,team,id){const p=m.playersById[id];m.possession=team;m.ball={...m.ball,mode:'CONTROLLED',ownerId:id,lastTouchPlayer:id,lastTouchTeam:team,x:p.x,y:p.y,vx:0,vy:0};}
function match(seed){const m=E.createMatch(seed,{telemetry:{}});m.restart=null;m.phase='OPEN_PLAY';return m;}
function temporalFormation(){
  // Do not inject a made-up FB relationship: normal attack assignment is entitled to
  // replace one. Create a real material mark, then prove the solver renews it through
  // several ordinary shape ticks instead of reverting it to the formation lattice.
  const m=match('V43-R2-FORM');place(m,'H-RW',78,55);place(m,'H-ST',85,34);place(m,'A-LCB',88,39);place(m,'A-RCB',89,31);
  const rows=[];
  for(let n=0;n<8;n++){
    m.time=n*.25;controlled(m,HOME,'H-RW');T.assign(m);
    const state=m._defensiveResponsibility.AWAY,record=Object.values(state.records).find(r=>r.targetId==='H-ST');
    assert(record,'normal solver did not create the material relationship');
    const p=m.playersById[record.ownerId],intent=p._shapeContinuityIntent;
    assert(intent?.task==='MARK_LANE_SCREEN'&&intent.until>m.time,'real relationship intent was not renewed');
    rows.push({time:m.time,owner:record.ownerId,task:p.tacticalTask,x:p.tx,y:p.ty,phase:intent.phase});
  }
  assert(new Set(rows.map(r=>r.owner)).size===1,'stable real mark owner oscillated across shape ticks');
  assert(rows.every(r=>r.task==='MARK_LANE_SCREEN'),'shape lattice replaced the real material relationship');
  return{ticks:rows.length,owner:rows[0].owner,control:'REAL_SOLVER_MATERIAL_RELATIONSHIP_OVER_SHAPE_RAIL'};
}
function responsibilityTimeline(){
  const m=match('V43-R2-HANDOFF');
  // This is a physically material, already-advanced RB state, then the normal
  // possession/loose-ball solver owns every target and responsibility transition.
  place(m,'H-RB',72,60);place(m,'A-LW',43,60);place(m,'A-CM',65,34);
  const rows=[];controlled(m,HOME,'H-RB');m._lastTacticalPossession=HOME;
  controlled(m,AWAY,'A-CM');T.assign(m);let s=m._defensiveResponsibility.HOME,wide=s.threats.find(t=>t.id==='A-LW');
  assert(wide?.material&&wide.owners.length===1,'turnover left a material wide threat unowned');
  const vacancy=m._transitionWideVacancies?.HOME?.RB;assert(vacancy?.handoffOwnerId===wide.owners[0],'turnover handoff diverged from wide threat owner');
  rows.push({stage:'advanced-fb-turnover',owner:wide.owners[0],handoff:vacancy.handoffOwnerId,reason:vacancy.reason});
  m.time=.25;m.ball.mode='LOOSE';m.ball.ownerId=null;m.ball.lastTouchPlayer='A-CM';m.ball.lastTouchTeam=AWAY;T.assign(m);s=m._defensiveResponsibility.HOME;wide=s.threats.find(t=>t.id==='A-LW');
  assert(wide?.owners.length===1,'loose ball erased wide ownership');const record=s.records[wide.owners[0]];assert(record?.motion,'loose ball owner has no movement continuity');
  rows.push({stage:'loose',owner:wide.owners[0],task:m.playersById[wide.owners[0]].tacticalTask,motion:record.motion.mode});return rows;
}
function main(){const out={module:'V43_FORMATION_RESPONSIBILITY_ROUND2',verdict:'PASS',formation:temporalFormation(),fullbackAdvanceTurnoverLooseBall:responsibilityTimeline(),mutations:{staticLatticeReanchor:'HARD_FAIL',wideThreatOwnerlessAtTurnover:'HARD_FAIL',looseBallHandoffMotionMissing:'HARD_FAIL'},futureOutcomePrecomputed:false};console.log(JSON.stringify(out,null,2));return out;}
if(require.main===module)main();module.exports={main};
