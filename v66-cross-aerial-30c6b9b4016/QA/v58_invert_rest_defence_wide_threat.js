#!/usr/bin/env node
'use strict';

// Focused current-state checks for the V58 INVERT rest-defence relationship.  These
// are geometry fixtures, not outcome scripts: the guard only proposes the current
// full-back target and never changes possession, a mark owner, or a future result.
const assert=require('assert'),crypto=require('crypto'),fs=require('fs'),path=require('path');
const E=require('../runtime/continuous_match_core.js');
const T=require('../runtime/tactical_movement.js');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const localToWorld=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const player=(id,team,role,slot,lx,ly)=>{const w=localToWorld(team,lx,ly);return{id,team,role,slot,x:w.x,y:w.y,tx:w.x,ty:w.y,vx:0,vy:0};};

function fixture(team,slot,{covered=false}={}){
  const opposite=team==='HOME'?'AWAY':'HOME',isLeft=slot==='LB',fbId=`${team==='HOME'?'H':'A'}-${slot}`;
  const cbSlot=isLeft?'LCB':'RCB',cbId=`${team==='HOME'?'H':'A'}-${cbSlot}`;
  const threatSlot=isLeft?'RW':'LW',threatId=`${opposite==='HOME'?'H':'A'}-${threatSlot}`;
  const y=isLeft?21.54:46.46,threatY=isLeft?15.03:52.97,cbY=covered?(isLeft?20.5:47.5):(isLeft?25.98:42.02);
  const fb=player(fbId,team,'FB',slot,60.45,y);
  const cb=player(cbId,team,'CB',cbSlot,50.10,cbY);
  // The counter outlet is expressed in the possessing FB's current coordinate frame.
  // Its slot/team identity remains opposition; only this observed physical location matters.
  const tw=localToWorld(team,52.37,threatY),threat={id:threatId,team:opposite,role:'WF',slot:threatSlot,x:tw.x,y:tw.y,tx:tw.x,ty:tw.y,vx:0,vy:0};
  const filler=player(`${team==='HOME'?'H':'A'}-CM`,team,'CM','CM',42,34);
  const players=[fb,cb,threat,filler];
  return{players,playersById:Object.fromEntries(players.map(p=>[p.id,p])),fb,cb,threat,target:{lx:64,ly:isLeft?21.8:46.2,task:'INVERT_SUPPORT',sprint:true}};
}

const checks=[];
for(const team of ['HOME','AWAY'])for(const slot of ['LB','RB']){
  const m=fixture(team,slot),result=T.capInvertedFullbackForWideThreat(m,m.fb,m.target);
  const threatLocalX=52.37,cbLocalY=slot==='LB'?25.98:42.02;
  assert.equal(result.wideThreatGuarded,true,`${team} ${slot}: live wide outlet must gate unsupported invert`);
  assert.equal(result.task,'INVERT_REST_WIDE_GUARD',`${team} ${slot}: recovery remains an INVERT task`);
  assert(result.lx<=threatLocalX-1.19,`${team} ${slot}: target must be goal-side of outlet`);
  assert(Math.abs(result.ly-cbLocalY)>2.5,`${team} ${slot}: must preserve established CB lane separation`);
  assert(Math.abs(result.ly-(slot==='LB'?15.03:52.97))>=1.7,`${team} ${slot}: must not turn into a hard winger mark`);
  checks.push({id:`${team}_${slot}_UNSUPPORTED_WIDE_OUTLET`,status:'PASS',target:result});
}
for(const team of ['HOME','AWAY'])for(const slot of ['LB','RB']){
  const m=fixture(team,slot,{covered:true}),result=T.capInvertedFullbackForWideThreat(m,m.fb,m.target);
  assert.equal(result.wideThreatGuarded,false,`${team} ${slot}: acquired same-side cover must preserve INVERT freedom`);
  assert.deepStrictEqual({lx:result.lx,ly:result.ly,task:result.task,sprint:result.sprint},m.target,`${team} ${slot}: cover control changed base invert target`);
  checks.push({id:`${team}_${slot}_ACQUIRED_COVER_CONTROL`,status:'PASS',target:result});
}
// Exercise the configured production profile too (AWAY LB is the current INVERT role),
// so the focused gate proves it is reached through assign -> attackTask, not only directly.
{
  const team='AWAY',m=E.createMatch('V58-REST-LIVE-PRODUCTION'),set=(id,lx,ly)=>{const p=m.playersById[id],w=localToWorld(team,lx,ly);Object.assign(p,{x:w.x,y:w.y,tx:w.x,ty:w.y,vx:0,vy:0});};
  for(const p of m.players.filter(p=>p.team===team&&p.role!=='GK'))set(p.id,80,34);
  set('A-LB',60.45,21.54);set('A-LCB',50.10,25.98);set('H-RW',52.37,15.03);set('A-CM',75,34);
  for(const p of m.players)p.hasBall=false;
  const owner=m.playersById['A-CM'];owner.hasBall=true;m.possession=team;m.ball={...m.ball,mode:'CONTROLLED',ownerId:owner.id,x:owner.x,y:owner.y};m.time=600;m.nextShape=0;m.phase='OPEN_PLAY';
  T.assign(m);
  const fb=m.playersById['A-LB'],target={x:105-fb.tx,y:68-fb.ty};
  assert.equal(fb.tacticalTask,'INVERT_REST_WIDE_GUARD','configured AWAY INVERT LB did not receive live wide-threat guard');
  assert(target.x<=51.17,'configured AWAY INVERT LB target remains ahead of counter outlet');
  assert(Math.abs(target.y-25.98)>2.5,'configured AWAY INVERT LB lost CB-lane separation');
  checks.push({id:'AWAY_LB_LIVE_ASSIGNMENT_PATH',status:'PASS',task:fb.tacticalTask,targetLocal:target});
}
const out={schemaVersion:'V58_INVERT_REST_DEFENCE_WIDE_THREAT_1.0',verdict:'PASS',checks,source:{tacticalMovementSha256:sha(path.resolve(__dirname,'../runtime/tactical_movement.js'))},futureOutcomePrecomputed:false,protagonistControlChanged:false};
console.log(JSON.stringify(out,null,2));
