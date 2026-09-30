#!/usr/bin/env node
'use strict';

// Focused current-state guard for the post-#1860 visual freeze. A passive same-side
// FB must begin a goal-side contain adjustment before a live wide body crosses its
// depth; the test deliberately verifies no mark ownership or future result is added.
const assert=require('assert');
const E=require('../runtime/continuous_match_core.js');
const T=require('../runtime/tactical_movement.js');
const other=team=>team==='HOME'?'AWAY':'HOME';
const prefix=team=>team==='HOME'?'H':'A';
const localToWorld=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};

function fixture(team,slot,{carrier=true,distant=false,liveDuty='ZONE'}={}){
  const m=E.createMatch(`V58-FB-CONTAIN-${team}-${slot}-${carrier?'CARRIER':'THREAT'}`),opp=other(team),fb=m.playersById[`${prefix(team)}-${slot}`];
  const threatSlot=slot==='LB'?'RW':'LW',threat=m.playersById[`${prefix(opp)}-${threatSlot}`],owner=carrier?threat:m.playersById[`${prefix(opp)}-CM`];
  const side=slot==='LB'?-1:1,put=(p,x,y,vx=0,vy=0)=>{const w=localToWorld(team,x,y);Object.assign(p,{x:w.x,y:w.y,tx:w.x,ty:w.y,vx:team==='HOME'?vx:-vx,vy:team==='HOME'?vy:-vy});};
  m.restart=null;m.phase='OPEN_PLAY';m.time=70;
  put(fb,51.41,34+side*28.05);fb.tx=localToWorld(team,51.40,34+side*28.06).x;fb.ty=localToWorld(team,51.40,34+side*28.06).y;fb.action=fb.tacticalTask='HOLD_BLOCK';
  put(threat,distant?64.0:53.0,34+side*25.0,-3.2,0);
  put(owner,carrier?(distant?64.0:53.0):62.0,34+side*(carrier?25.0:4.0),carrier?-3.2:0,0);
  for(const p of m.players)p.hasBall=p.id===owner.id;
  owner.controlledSince=68;owner.action='CARRY_FORWARD';m.possession=opp;m.ball={...m.ball,mode:'CONTROLLED',ownerId:owner.id,x:owner.x,y:owner.y};
  m._defensiveResponsibility={[team]:{records:{[fb.id]:{type:liveDuty,targetId:liveDuty==='ZONE'?null:threat.id}}}};
  return{m,fb,threat,owner,team};
}

const checks=[];
for(const team of ['HOME','AWAY'])for(const slot of ['LB','RB']){
  const {m,fb,threat,owner}=fixture(team,slot),before={tx:fb.tx,ty:fb.ty,markTargetId:fb.markTargetId||null,record:{...m._defensiveResponsibility[team].records[fb.id]}};
  const applied=T.enforceFullbackWideContainBeforeBeaten(m,team,owner),after=team==='HOME'?{x:fb.tx,y:fb.ty}:{x:105-fb.tx,y:68-fb.ty},threatLocal=team==='HOME'?{x:threat.x,y:threat.y}:{x:105-threat.x,y:68-threat.y};
  assert.equal(applied.length,1,`${team} ${slot}: current wide carrier must activate contain`);
  assert.equal(fb.tacticalTask,'FB_WIDE_CONTAIN_BEFORE_BEATEN');
  assert.equal(fb.sprint,true,`${team} ${slot}: contain adjustment must move now`);
  assert(after.x<=threatLocal.x-3.19,`${team} ${slot}: FB target must remain goal-side before the beat`);
  assert(after.x<(team==='HOME'?before.tx:105-before.tx)-.18,`${team} ${slot}: frozen zonal depth was retained`);
  assert.equal(fb.markTargetId||null,before.markTargetId,`${team} ${slot}: guard must not create hard marking`);
  assert.deepStrictEqual(m._defensiveResponsibility[team].records[fb.id],before.record,`${team} ${slot}: guard must not rewrite responsibility`);
  checks.push({id:`${team}_${slot}_CURRENT_WIDE_CARRIER`,status:'PASS',task:fb.tacticalTask,source:fb.wideContainRelationship.source});
}
for(const team of ['HOME','AWAY']){
  const {m,fb,owner}=fixture(team,'RB',{carrier:false});
  T.enforceFullbackWideContainBeforeBeaten(m,team,owner);
  assert.equal(fb.tacticalTask,'FB_WIDE_CONTAIN_BEFORE_BEATEN',`${team}: same-side wide threat must protect the carrier-independent case`);
  assert.equal(fb.wideContainRelationship.source,'SAME_SIDE_WIDE_THREAT');
  checks.push({id:`${team}_RB_WIDE_THREAT_WHILE_CENTRAL_CARRIER`,status:'PASS'});
}
for(const team of ['HOME','AWAY']){
  const distant=fixture(team,'RB',{distant:true}),live=fixture(team,'RB',{liveDuty:'MARK'});
  assert.equal(T.enforceFullbackWideContainBeforeBeaten(distant.m,team,distant.owner).length,0,`${team}: distant threat must retain ordinary zone`);
  assert.equal(distant.fb.tacticalTask,'HOLD_BLOCK');
  assert.equal(T.enforceFullbackWideContainBeforeBeaten(live.m,team,live.owner).length,0,`${team}: explicit live duty must outrank contain relationship`);
  assert.equal(live.fb.tacticalTask,'HOLD_BLOCK');
  checks.push({id:`${team}_RB_DISTANCE_AND_LIVE_DUTY_CONTROLS`,status:'PASS'});
}
// #1861 passed the helper fixture but failed after the production assign sequence.
// Rebuild the reported HOME H-RB / AWAY A-LW corridor at its native .05s sample
// interval and call only the public production assign entrypoint for every frame.
function assignPathReproduction(){
  const m=E.createMatch('V58-REST-01'),put=(id,x,y,vx=0,vy=0)=>Object.assign(m.playersById[id],{x,y,tx:x,ty:y,vx,vy});
  m.restart=null;m.phase='OPEN_PLAY';m.possession='AWAY';m.nextShape=Infinity;
  // H-RCM and H-RCB retain the real press/cover jobs.  H-RB therefore reaches
  // the final guard as a passive channel body rather than being made the carrier
  // defender by this test setup.
  put('H-RB',51.41,62.05);put('H-RCM',58.0,58.0);put('H-RCB',55.0,56.0);
  const wing=m.playersById['A-LW'];
  for(const p of m.players)p.hasBall=p.id==='A-LW';
  wing.controlledSince=68;wing.action=wing.tacticalTask='CARRY_FORWARD';
  const trace=[];
  for(let tick=0;tick<=100;tick++){
    const time=70+tick*.05,x=67.4-(9.5*tick/100),vx=-3.2-(tick%4)*.9;
    put('A-LW',x,59,vx,0);wing.hasBall=true;
    m.time=time;m.ball={...m.ball,mode:'CONTROLLED',kind:'CONTROL',ownerId:'A-LW',x:wing.x,y:wing.y,lastTouchTeam:'AWAY',lastTouchPlayer:'A-LW'};
    T.assign(m);
    const fb=m.playersById['H-RB'],record=m._defensiveResponsibility?.HOME?.records?.[fb.id]||{};
    const frame={time:Number(time.toFixed(2)),threatX:Number(x.toFixed(3)),threatVx:vx,targetX:Number(fb.tx.toFixed(3)),targetY:Number(fb.ty.toFixed(3)),task:fb.tacticalTask,relationship:fb.wideContainRelationship||null,responsibilityType:record.type||null,responsibilityTargetId:record.targetId||null};
    // Keep the recorded carrier geometry authoritative for the next sample, but
    // run the real motor for this .05s interval so the integration proof also
    // catches a target that is authored yet physically inert.
    E.step(m,.05);
    frame.bodyX=Number(fb.x.toFixed(3));frame.bodyY=Number(fb.y.toFixed(3));frame.speed=Number(Math.hypot(fb.vx,fb.vy).toFixed(3));trace.push(frame);
  }
  const active=trace.filter(frame=>frame.task==='FB_WIDE_CONTAIN_BEFORE_BEATEN');
  const rewrites=active.filter(frame=>Math.abs(Number(frame.relationship?.at)-frame.time)<.001);
  assert(active.length>0,'T.assign must reach the contain relationship in the reported corridor');
  assert(rewrites.length>0,'T.assign must author current stand-off relationship updates, not only retain a stale task');
  const first=rewrites[0],last=active.at(-1);
  assert(first.targetX>51.59,'goal-side HOLD_BLOCK rail must advance into the stand-off band');
  assert(active.every(frame=>frame.targetX<=frame.threatX-.18),'contain target must remain goal-side of the current winger');
  // The later anchor pass may retain a still-goal-side physical waypoint between
  // shape ticks.  The relationship itself must nevertheless be authored at the
  // exact current stand-off band, with the executable target advancing from the
  // frozen rail without ever crossing the winger.
  assert(rewrites.every(frame=>Math.abs(frame.relationship.targetLocal.x-(frame.threatX-3.2))<.02),'contain relationship must close the current 3.2m stand-off band');
  assert(active.every(frame=>frame.relationship?.source==='CURRENT_WIDE_CARRIER'&&frame.relationship?.futureOutcomePrecomputed===false),'integration path must remain current-state carrier containment');
  assert(active.every(frame=>frame.responsibilityTargetId===null),'stand-off repair must not create a hard-mark target');
  assert(active.some(frame=>frame.speed>.05)&&last.bodyX>51.59,'the authored stand-off target must move H-RB during real .05s motor ticks');
  return{frames:trace.length,activeFrames:active.length,relationshipUpdates:rewrites.length,firstActive:first,lastActive:last};
}
const integration=assignPathReproduction();
checks.push({id:'V58_REST_01_ASSIGN_PATH_REPRODUCED_STANDOFF',status:'PASS',integration});
const out={schemaVersion:'V58_FULLBACK_WIDE_CONTAIN_BEFORE_BEATEN_2.0',verdict:'PASS',checks,futureOutcomePrecomputed:false,protagonistControlChanged:false,hardMarkingAdded:false,responsibilityRewrite:false};
console.log(JSON.stringify(out,null,2));
