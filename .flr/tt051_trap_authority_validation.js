'use strict';
const path=require('path');
const root=path.resolve(process.argv[2]||'.');
const E=require(path.join(root,'runtime/continuous_match_core.js'));
const P=require(path.join(root,'runtime/protagonist_match_controller.js'));
const checks=[];const add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
function setP(p,x,y){p.x=x;p.y=y;p.tx=x;p.ty=y;p.vx=p.vy=0;p.hasBall=false;p.runUntil=0;p.action='HOLD_SHAPE';p.tacticalTask='HOLD_SHAPE';p.nextThink=9999;p.lockTargetUntil=0;}
const s=P.create('QA-TRAP-AUTHORITY',{heroPlayerId:'H-ST',mode:'PLAYER_ALL'}),m=s.m,ps=m.playersById;
m.time=1800;m.phase='OPEN_PLAY';m.restart=null;m.completed=false;m.possession='HOME';m.events=[];m.protagonistExplicitActionRequired=false;
for(const p of m.players){const y=p.slot==='LW'?10:p.slot==='RW'?58:p.team==='HOME'?20:50;setP(p,p.team==='HOME'?54:88,y);}
const hero=ps['H-ST'],src=ps['H-LCM'];setP(hero,76,34);setP(src,68,34);hero.nextThink=m.time;src.nextThink=m.time;
// Build the exact pre-contact state directly: same-team PASS, intended hero, about 0.28s to contact.
m.ball={...m.ball,mode:'FLIGHT',x:70,y:34,z:0,vx:15,vy:0,vz:0,ownerId:null,intendedReceiverId:hero.id,kind:'PASS',lastTouchTeam:'HOME',lastTouchPlayer:src.id,age:.30,originX:68,originY:34,targetX:hero.x,targetY:hero.y,deliveryMode:'GROUND',interceptResolved:false};m.ballOwner=null;m.lastTouchTeam='HOME';m.lastTouchPlayer=src.id;
let q=P.inspect(s);add('incoming-inspect-found',q?.frame?.kind==='INCOMING_BALL',JSON.stringify(q&&{kind:q.frame?.kind,eta:q.frame?.eta,options:q.options?.map(o=>[o.id,o.targetId])}));
let pending=P.maybeCheckpoint(s);add('incoming-checkpoint-found',!!pending&&pending.kind==='INCOMING_BALL',JSON.stringify(pending&&{kind:pending.kind,options:pending.options?.map(o=>[o.id,o.targetId])}));
const trap=pending?.options?.find(o=>o.id==='TRAP_CONTROL');add('trap-option-present',!!trap);
let applied=null;if(trap)applied=P.applyChoice(s,'TRAP_CONTROL',null,{source:'QA'});add('trap-choice-applied',!!applied?.ok,JSON.stringify(applied));
const trapChoiceTime=m.time;let gotControl=false,nextPending=false,unchosenHeroMaterial=[],controlAt=null;let guard=0;
while(guard++<200&&m.time<trapChoiceTime+6){
  P.step(s,.05);
  if(m.ball.mode==='CONTROLLED'&&m.ball.ownerId===hero.id){gotControl=true;if(controlAt==null)controlAt=m.time;}
  for(const e of m.events){if(e.t<trapChoiceTime-.001||e.actorId!==hero.id)continue;if(['PASS','SHOT','TAKE_ON','HEADER_SHOT'].includes(e.type)){const userAtSame=m.events.some(u=>u.type==='USER_CHOICE'&&u.t>=trapChoiceTime-.001&&Math.abs(u.t-e.t)<.02);if(!userAtSame&&!unchosenHeroMaterial.some(x=>x.t===e.t&&x.type===e.type))unchosenHeroMaterial.push({t:e.t,type:e.type,text:e.text});}}
  P.maybeCheckpoint(s);if(s.pending&&s.pending.at>trapChoiceTime+.001){nextPending=true;break;}
  if(gotControl&&m.ball.ownerId!==hero.id)break;
}
add('hero-receives-after-trap',gotControl,JSON.stringify({controlAt,time:m.time,ball:m.ball&&{mode:m.ball.mode,ownerId:m.ball.ownerId}}));
add('no-unchosen-material-action-after-trap',unchosenHeroMaterial.length===0,JSON.stringify(unchosenHeroMaterial));
add('next-user-choice-or-live-protection',nextPending||!!m.protagonistInteractiveEpisode||!!m.protagonistDeferredChoice||!!s.resultTracker,JSON.stringify({nextPending,interactive:m.protagonistInteractiveEpisode||null,deferred:m.protagonistDeferredChoice||null,resultTracker:!!s.resultTracker}));
add('future-not-precomputed',s.futureOutcomePrecomputed===false&&applied?.futureOutcomePrecomputed===false);
const failures=checks.filter(x=>!x.ok);console.log(JSON.stringify({schemaVersion:'FLR_TT051_TRAP_AUTHORITY_VALIDATION_1.1',pass:failures.length===0,checks,failures},null,2));process.exit(failures.length?1:0);
