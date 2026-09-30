#!/usr/bin/env node
'use strict';
// V58-REST-03 focused reproduction: an attacker can retain possession near goal while
// a live PRESS_CONTAIN defender reaches legal contact distance.  This is not an outcome
// fixture: the tackle result remains the ordinary live resolver's RNG.
const assert=require('assert');
const E=require('../runtime/continuous_match_core.js');

function placeFinalThird(m,{diagnostic=false}={}){
  const p=m.playersById;m.restart=null;m.time=300;m.nextShape=999;m.lastChallengeAt=-99;
  for(const q of m.players){q.x=q.team==='HOME'?8:97;q.y=q.slot?.includes('L')?8:60;q.tx=q.x;q.ty=q.y;q.vx=q.vy=0;q.hasBall=false;q.nextThink=999;}
  const owner=p['H-ST'],defender=p['A-CM'];
  Object.assign(owner,{x:88,y:34,tx:88,ty:34,hasBall:true,controlledSince:298,nextThink:999});
  // The final movement target makes the press body face its live carrier as it closes; this
  // preserves the production facing gate rather than bypassing it in the fixture.
  Object.assign(defender,{x:87.05,y:34.05,tx:88,ty:34,tacticalTask:'PRESS_CONTAIN',action:'PRESS_CONTAIN',bodyAngle:0,nextChallengeAt:0});
  m._defenceRoleLocks={AWAY:{pressId:defender.id,coverId:null}};
  m.ball={...m.ball,mode:'CONTROLLED',ownerId:owner.id,x:owner.x,y:owner.y,vx:0,vy:0};m.possession='HOME';m.finalThirdDeadlockDiagnostic=diagnostic;
  return{owner,defender};
}
function attackingTrace(){
  const m=E.createMatch('V58-REST-03-ATTACK-TRACE'),{owner}=placeFinalThird(m);
  owner.x=82;owner.tx=84;owner.nextThink=0;m.ball.x=owner.x;
  const action=E.choiceActionBridge().chooseOwnerAction(m,owner),trace=m.attackingDecisionTrace?.at(-1);
  assert(trace&&trace.currentState.distanceToGoal>0,'final-third attack decision trace missing');
  assert(trace.currentState.distanceToGoal===23,'attack trace did not retain current geometry');
  assert.equal(trace.futureOutcomePrecomputed,false,'attack trace must remain observation-only');
  return{action,trace};
}
function defensiveEligibility(){
  const m=E.createMatch('V58-REST-03-DEFENCE-TRACE'),{defender}=placeFinalThird(m,{diagnostic:true});
  E.step(m,.05);
  const trace=E.snapshot(m).finalThirdChallengeTrace?.at(-1),row=trace?.rows.find(x=>x.playerId===defender.id);
  assert(row,'defensive challenge eligibility trace missing press owner');
  assert.equal(row.task,'PRESS_CONTAIN','fixture lost containment task before challenge');
  assert.equal(row.eligible,true,'close, facing PRESS_CONTAIN must enter ordinary challenge eligibility');
  assert.equal(row.reason,'ELIGIBLE','eligibility trace reason mismatch');
  assert.equal(m.stats.challenges,1,'eligible press did not enter the ordinary challenge resolver');
  assert.equal(m.ball.mode,'CONTROLLED','fixture unexpectedly requires a forced turnover to pass');
  return{trace,row,challenges:m.stats.challenges,events:m.events.slice(-3),futureOutcomePrecomputed:false};
}
function run(){
  const attack=attackingTrace(),defence=defensiveEligibility();
  const source=require('fs').readFileSync(require('path').join(__dirname,'../runtime/continuous_match_core.js'),'utf8');
  assert(/CHALLENGE_ELIGIBLE_TASKS=new Set\(\['ENGAGE','CLOSE_DOWN','CHASE_LOOSE','PRESS_CONTAIN'\]\)/.test(source),'PRESS_CONTAIN is absent from the bounded contact eligibility set');
  return{schemaVersion:'V58_FINAL_THIRD_DEADLOCK_RESOLUTION_QA_1.0',verdict:'PASS',dominantRoot:'A physically close, facing primary PRESS_CONTAIN defender was excluded from tryChallenges; attack-side trace records alternatives but no timeout outcome is injected.',attack,defence,guards:{noForcedShot:true,noForcedTurnover:true,protagonistControlChanged:false,futureOutcomePrecomputed:false}};
}
if(require.main===module)console.log(JSON.stringify(run(),null,2));
module.exports={run};
