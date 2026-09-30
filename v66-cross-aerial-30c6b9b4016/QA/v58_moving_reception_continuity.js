#!/usr/bin/env node
'use strict';
const assert=require('assert');
const E=require('../runtime/continuous_match_core');

function fixture(moving){
  const m=E.createMatch(`V58-MOVING-RECEPTION-${moving?'RUN':'FEET'}`);
  m.restart=null;m.phase='OPEN_PLAY';m.time=100;m.nextShape=0;
  // Isolate the intended receiver and leave the flight/contact simulation authoritative.
  for(const p of m.players)Object.assign(p,{x:p.team==='HOME'?5:95,tx:p.team==='HOME'?5:95,vx:0,vy:0});
  const source=m.playersById['H-LCM'],receiver=m.playersById['H-ST'];
  Object.assign(source,{x:40,y:34,tx:40,ty:34,vx:0,vy:0});
  Object.assign(receiver,{x:50,y:34,tx:54,ty:34,vx:moving?4.5:0,vy:0,bodyAngle:0});
  E.choiceActionBridge().setControlled(m,source,true);
  E.choiceActionBridge().executePass(m,source,receiver,'PASS',{running:moving,forward:14,open:8,block:0},moving?'TEST_MOVING_OPEN_PASS':'CANDIDATE_SAFE');
  const release={targetX:receiver.tx,targetY:receiver.ty,leadDistance:Math.hypot(receiver.tx-receiver.x,receiver.ty-receiver.y),movingApproach:receiver.movingReceiveApproach||null,delivery:m.ball.deliveryMode,kind:m.ball.kind};
  const frames=[];
  let contactIndex=-1;
  for(let i=0;i<52;i++){
    E.step(m,.05);
    frames.push({time:Number(m.time.toFixed(3)),x:Number(receiver.x.toFixed(4)),y:Number(receiver.y.toFixed(4)),speed:Number(Math.hypot(receiver.vx,receiver.vy).toFixed(4)),action:receiver.action,ballMode:m.ball.mode,ownerId:m.ball.ownerId||null,receiveFlowUntil:Number((receiver.receiveFlowUntil||0).toFixed(3)),movingApproach:!!receiver.movingReceiveApproach,movingFlow:!!receiver.movingReceptionFlow});
    if(contactIndex<0&&m.ball.ownerId===receiver.id)contactIndex=frames.length-1;
    if(contactIndex>=0&&m.time>=(receiver.receiveFlowUntil||0)+.10)break;
  }
  const lastFlight=frames.filter(x=>x.ballMode==='FLIGHT').at(-1),contact=contactIndex>=0?frames[contactIndex]:null;
  return{release,lastFlight,contact,contactIndex,frames};
}

const moving=fixture(true),stationary=fixture(false);
const movingPre=moving.frames.slice(0,Math.max(0,moving.contactIndex)),movingFlow=moving.frames.slice(moving.contactIndex).filter(x=>x.action==='FIRST_TOUCH_FLOW'&&x.time<=moving.contact.receiveFlowUntil);
function noTickStop(rows){return rows.length>=3&&rows.every((row,i)=>i===0||Math.hypot(row.x-rows[i-1].x,row.y-rows[i-1].y)>0.003);}
const checks={
  movingIsGroundForwardPass:moving.release.delivery==='GROUND'&&moving.release.kind==='PASS',
  movingReceiverGetsMaterialLead:moving.release.leadDistance>=1.5,
  movingApproachIsArmedAtRelease:!!moving.release.movingApproach,
  movingReceiverNeverStopsBeforeContact:noTickStop(movingPre),
  movingReceiverEntersExistingFirstTouchFlow:moving.contact?.ownerId==='H-ST'&&moving.contact?.action==='FIRST_TOUCH_FLOW',
  movingReceiverNeverStopsDuringReceiveFlow:movingFlow.length>=5&&noTickStop(movingFlow),
  stationaryFeetPassStaysNearFeet:stationary.release.leadDistance<=0.25,
  stationaryFeetPassDoesNotArmMovingApproach:stationary.release.movingApproach===null,
  stationaryReceiverStillUsesFirstTouchFlow:stationary.contact?.ownerId==='H-ST'&&stationary.contact?.action==='FIRST_TOUCH_FLOW'
};
const passed=Object.values(checks).every(Boolean);
const out={schemaVersion:'V58_MOVING_RECEPTION_CONTINUITY_2.0',verdict:passed?'PASS':'FAIL',checks,moving:{release:moving.release,lastFlight:moving.lastFlight,contact:moving.contact,contactIndex:moving.contactIndex,fullTickFrames:moving.frames},stationary:{release:stationary.release,lastFlight:stationary.lastFlight,contact:stationary.contact,fullTickFrames:stationary.frames},futureOutcomePrecomputed:false};
console.log(JSON.stringify(out,null,2));
assert(passed,'V58 moving reception continuity failed');
