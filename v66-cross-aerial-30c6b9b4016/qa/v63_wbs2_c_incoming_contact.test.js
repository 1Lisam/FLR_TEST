'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../runtime/continuous_match_core.js');
const PROFILE='OPEN_PLAY_LOB_V1';

function fixture(){
  const m=E.createMatch('V63-WBS2-C3-INCOMING'),source=m.playersById['H-LCM'],hero=m.playersById['H-ST'];
  m.restart=null;m.phase='OPEN_PLAY';m.time=100;m.nextShape=Infinity;
  for(const p of m.players)Object.assign(p,{x:5,y:4,tx:5,ty:4,vx:0,vy:0,nextThink:Infinity});
  Object.assign(source,{x:40,y:34,tx:40,ty:34});Object.assign(hero,{x:50,y:34,tx:50,ty:34,bodyAngle:0});
  m.protagonistControllerId=hero.id;m.protagonistExplicitActionRequired=true;
  E.choiceActionBridge().setControlled(m,source,true);
  assert.equal(E.choiceActionBridge().executePass(m,source,hero,'PASS',null,null,{physicsProfile:PROFILE,choiceId:'LOB_PASS',targetId:hero.id,commitEventId:'C3'}),true);
  Object.assign(m.ball,{x:50,y:34,z:1.2,vx:0,vy:0,vz:0,airborne:true,age:0,offsideAtRelease:false,lobContacts:[]});
  return{m,source,hero};
}
function clear(f){for(const p of f.m.players)if(p.id!==f.hero.id){const x=p.team==='HOME'?5:100;Object.assign(p,{x,y:4,tx:x,ty:4,vx:0,vy:0});}}
function arm(f,choiceId,targetId=null){
  const b=f.m.ball;
  return f.m.userIncomingIntent={playerId:f.hero.id,choiceId,targetId,sourceId:f.source.id,flightKind:'PASS',originX:b.originX,originY:b.originY,setAt:f.m.time,expiresAt:f.m.time+2,futureOutcomePrecomputed:false};
}
function tick(f){E.step(f.m,.05);}
function contact(f){return f.m.events.filter(e=>e.type==='LOB_CONTACT').at(-1)?.receipt;}

test('C3 uses the existing incoming-choice arming path without a precomputed contact result',()=>{
  const f=fixture();clear(f);Object.assign(f.m.ball,{x:48,y:34,z:.5,vx:4,vy:0,vz:0,airborne:true});
  const frame=E.choiceStateBridge().inspect(f.m,f.hero.id);assert.equal(frame.kind,'INCOMING_BALL');
  const before=f.m.r.observe().drawCount,result=E.choiceStateBridge().applyCandidate(f.m,f.hero.id,'TRAP_CONTROL');
  assert.equal(result.ok,true);assert.equal(f.m.userIncomingIntent.choiceId,'TRAP_CONTROL');assert.equal(f.m.userIncomingIntent.sourceId,f.source.id);assert.equal(f.m.r.observe().drawCount,before);assert.equal(f.m.userIncomingIntent.futureOutcomePrecomputed,false);
});

test('C3 consumes an existing selected trap only at a legal first contact, while that trap can physically fail',()=>{
  const f=fixture();clear(f);f.m.playerAbilityProfiles={[f.hero.id]:{ball_control:1}};Object.assign(f.m.ball,{z:1.2,vx:40});arm(f,'TRAP_CONTROL');tick(f);
  const r=contact(f);assert.equal(r.outcome,'FAILED_TOUCH');assert.equal(f.m.userIncomingIntent,null);assert.equal(f.m.ball.ownerId,null);assert.equal(f.m.ball.physicsProfile,PROFILE);
});

test('C3 executes only the selected exact header-pass target from the factual collision origin and retains the lob descendant',()=>{
  const f=fixture(),target=f.m.playersById['H-LW'];clear(f);Object.assign(target,{x:62,y:28,tx:62,ty:28});Object.assign(f.m.ball,{z:1.2,vx:3});arm(f,'HEADER_PASS',target.id);tick(f);
  const r=contact(f);assert.equal(r.outcome,'HEADER_PASS');assert.deepEqual(r.intent,{choiceId:'HEADER_PASS',targetId:target.id,sourceId:f.source.id});assert.deepEqual(r.contactOrigin,{x:50,y:34,z:1.2});assert.equal(f.m.ball.intendedReceiverId,target.id);assert.equal(f.m.ball.lastTouchPlayer,f.hero.id);assert.equal(f.m.ball.physicsProfile,PROFILE);assert.equal(f.m.ball.ownerId,null);
});

test('C3 keeps an ineligible or absent incoming intent out of the C2 first-contact result',()=>{
  const low=fixture(),target=low.m.playersById['H-LW'];clear(low);Object.assign(target,{x:62,y:28,tx:62,ty:28});Object.assign(low.m.ball,{z:.5,vx:2});const intent=arm(low,'HEADER_PASS',target.id);tick(low);
  assert.equal(contact(low).outcome,'FOOT_CONTROL');assert.equal(low.m.userIncomingIntent,intent);assert.notEqual(low.m.ball.intendedReceiverId,target.id);
  const none=fixture();clear(none);Object.assign(none.m.ball,{z:1.8,vx:4});tick(none);assert.equal(contact(none).outcome,'FAILED_TOUCH');assert.ok(!none.m.events.some(e=>e.type==='SHOT'));
});

test('C3 applies an existing low one-touch pass and direct shot only at their actual legal contact heights',()=>{
  const pass=fixture(),receiver=pass.m.playersById['H-LW'];clear(pass);Object.assign(receiver,{x:58,y:28,tx:58,ty:28});Object.assign(pass.m.ball,{z:.5,vx:3});arm(pass,'ONE_TOUCH_PASS',receiver.id);tick(pass);
  assert.equal(contact(pass).outcome,'ONE_TOUCH_PASS');assert.equal(pass.m.ball.intendedReceiverId,receiver.id);assert.equal(pass.m.ball.physicsProfile,PROFILE);
  const shot=fixture();clear(shot);Object.assign(shot.hero,{x:90,y:34,tx:90,ty:34});Object.assign(shot.m.ball,{x:90,y:34,z:.5,vx:2});arm(shot,'DIRECT_SHOT');tick(shot);
  assert.equal(contact(shot).outcome,'DIRECT_SHOT');assert.equal(shot.m.ball.kind,'SHOT');assert.equal(shot.m.ball.physicsProfile,PROFILE);assert.equal(shot.m.ball.ownerId,null);
});
