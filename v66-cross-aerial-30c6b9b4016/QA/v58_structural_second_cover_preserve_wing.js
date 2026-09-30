#!/usr/bin/env node
'use strict';

// Production-path regression for V58-REST-04: in the wide-CB / central-ST guard,
// a close forward must not be used as shot-lane cover while an FB or CM can cover
// inside the same 14.5m envelope. The mirror fixtures also prove that this is a
// role relationship, not a HOME/AWAY or left/right player exception.
const assert=require('assert');
const E=require('../runtime/continuous_match_core.js');
const T=require('../runtime/tactical_movement.js');
const other=team=>team==='HOME'?'AWAY':'HOME';
const prefix=team=>team==='HOME'?'H':'A';
const localToWorld=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};

function setLocal(m,team,id,x,y){
  const p=m.playersById[id],w=localToWorld(team,x,y);
  Object.assign(p,{x:w.x,y:w.y,tx:w.x,ty:w.y,vx:0,vy:0,markTargetId:null});
  return p;
}

function fixture(team,{structuralAvailable}){
  const attack=other(team),dp=prefix(team),ap=prefix(attack);
  const m=E.createMatch(`V58-STRUCTURAL-SECOND-COVER-${team}-${structuralAvailable?'STRUCTURAL':'EMERGENCY'}`);
  m.restart=null;m.phase='OPEN_PLAY';m.time=700;m.nextShape=Infinity;m.possession=attack;
  // Keep unrelated bodies outside the guard's 14.5m cover envelope.
  for(const p of m.players.filter(p=>p.role!=='GK'))setLocal(m,team,p.id,72,p.slot==='LW'||p.slot==='LB'?8:60);
  // A CB must confront the live wide carrier while the same-side FB cannot arrive.
  setLocal(m,team,`${dp}-LCB`,25.8,15.8);
  setLocal(m,team,`${dp}-LB`,43.0,15.0);
  setLocal(m,team,`${dp}-LCM`,structuralAvailable?31.0:48.0,20.0);
  // The tempting but incorrect close forward cover is deliberately nearer than CM.
  setLocal(m,team,`${dp}-RW`,26.4,14.0);
  setLocal(m,team,`${ap}-RW`,25.0,15.0);
  setLocal(m,team,`${ap}-ST`,28.0,34.0);
  const owner=m.playersById[`${ap}-RW`];
  for(const p of m.players)p.hasBall=p.id===owner.id;
  owner.controlledSince=m.time-1;owner.action=owner.tacticalTask='CARRY_FORWARD';
  m.ball={...m.ball,mode:'CONTROLLED',kind:'CONTROL',ownerId:owner.id,x:owner.x,y:owner.y,lastTouchTeam:attack,lastTouchPlayer:owner.id};
  return{m,team,ids:{cb:`${dp}-LCB`,cm:`${dp}-LCM`,wf:`${dp}-RW`}};
}

function assignAndRead(state){
  T.assign(state.m);
  const lock=state.m._defenceRoleLocks?.[state.team];
  assert(lock,'public T.assign must establish the defending role lock');
  assert.equal(lock.pressId,state.ids.cb,'wide CB must retain the primary press');
  return lock;
}

const checks=[];
for(const team of ['HOME','AWAY']){
  const structural=fixture(team,{structuralAvailable:true}),lock=assignAndRead(structural);
  assert.equal(lock.coverId,structural.ids.cm,`${team}: available CM must take structural second cover before close winger`);
  checks.push({id:`${team}_STRUCTURAL_CM_SECOND_COVER`,status:'PASS',pressId:lock.pressId,coverId:lock.coverId});

  // Forward cover is retained only when there is no structural body in the existing
  // reach envelope, then is replaced on the next public assignment when CM returns.
  const handback=fixture(team,{structuralAvailable:false});
  let emergency=assignAndRead(handback);
  assert.equal(emergency.coverId,handback.ids.wf,`${team}: forward remains valid emergency cover when structural cover is unavailable`);
  const emergencyCoverId=emergency.coverId;
  setLocal(handback.m,team,handback.ids.cm,31.0,20.0);handback.m.time+=.05;
  handback.m.ball.x=handback.m.playersById[`${prefix(other(team))}-RW`].x;
  handback.m.ball.y=handback.m.playersById[`${prefix(other(team))}-RW`].y;
  const restored=assignAndRead(handback);
  assert.equal(restored.coverId,handback.ids.cm,`${team}: structural cover must reclaim the lane immediately when available`);
  checks.push({id:`${team}_EMERGENCY_FORWARD_HANDS_BACK_TO_CM`,status:'PASS',emergencyCoverId,restoredCoverId:restored.coverId});
}

console.log(JSON.stringify({
  schemaVersion:'V58_STRUCTURAL_SECOND_COVER_PRESERVE_WING_1.0',
  verdict:'PASS',
  integration:'public T.assign only',
  mirroredFixtures:['HOME','AWAY'],
  futureOutcomePrecomputed:false,
  protagonistControlChanged:false,
  checks
},null,2));
