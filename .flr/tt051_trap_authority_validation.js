'use strict';
const path=require('path');
const root=path.resolve(process.argv[2]||'.');
const E=require(path.join(root,'runtime/continuous_match_core.js'));
const P=require(path.join(root,'runtime/protagonist_match_controller.js'));
const checks=[];const add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
function setP(p,x,y){p.x=x;p.y=y;p.tx=x;p.ty=y;p.vx=p.vy=0;p.hasBall=false;p.runUntil=0;p.action='HOLD_SHAPE';p.tacticalTask='HOLD_SHAPE';p.nextThink=9999;}
const s=P.create('QA-TRAP-AUTHORITY',{heroPlayerId:'H-ST',mode:'PLAYER_ALL'}),m=s.m,ps=m.playersById;
m.time=1800;m.phase='OPEN_PLAY';m.restart=null;m.completed=false;m.possession='HOME';m.events=[];m.protagonistExplicitActionRequired=false;
for(const p of m.players)setP(p,p.team==='HOME'?55:78,p.slot==='LW'?12:p.slot==='RW'?56:34);
const hero=ps['H-ST'],src=ps['H-LCM'];setP(hero,76,34);setP(src,68,31);hero.nextThink=m.time;src.nextThink=m.time;
const br=E.choiceActionBridge();br.setControlled(m,src,false);br.executePass(m,src,hero,'PASS',{running:false,block:0,forward:8,open:8},'QA_TRAP_FEED');
let pending=null,guard=0;
while(!pending&&guard++<120){P.step(s,.05);pending=P.maybeCheckpoint(s);}
add('incoming-checkpoint-found',!!pending&&pending.kind==='INCOMING_BALL',JSON.stringify(pending&&{kind:pending.kind,options:pending.options?.map(o=>[o.id,o.targetId])}));
const trap=pending?.options?.find(o=>o.id==='TRAP_CONTROL');add('trap-option-present',!!trap);
let applied=null;if(trap)applied=P.applyChoice(s,'TRAP_CONTROL',null,{source:'QA'});add('trap-choice-applied',!!applied?.ok,JSON.stringify(applied));
const trapChoiceTime=m.time;let gotControl=false,nextPending=false,unchosenHeroMaterial=[];guard=0;
while(guard++<240&&m.time<trapChoiceTime+8){
  P.step(s,.05);
  if(m.ball.mode==='CONTROLLED'&&m.ball.ownerId===hero.id)gotControl=true;
  if(s.pending){nextPending=true;break;}
  for(const e of m.events){if(e.t<trapChoiceTime-.001||e.actorId!==hero.id)continue;if(['PASS','SHOT','TAKE_ON','HEADER_SHOT'].includes(e.type)){const userAtSame=m.events.some(u=>u.type==='USER_CHOICE'&&u.t>=trapChoiceTime-.001&&Math.abs(u.t-e.t)<.02);if(!userAtSame&&!unchosenHeroMaterial.some(x=>x.t===e.t&&x.type===e.type))unchosenHeroMaterial.push({t:e.t,type:e.type,text:e.text});}}
  P.maybeCheckpoint(s);if(s.pending){nextPending=true;break;}
}
add('hero-receives-after-trap',gotControl,JSON.stringify({time:m.time,ball:m.ball&&{mode:m.ball.mode,ownerId:m.ball.ownerId},resultTracker:!!s.resultTracker,interactive:m.protagonistInteractiveEpisode||null}));
add('no-unchosen-material-action-after-trap',unchosenHeroMaterial.length===0,JSON.stringify(unchosenHeroMaterial));
add('next-user-choice-or-live-protection',nextPending||!!m.protagonistInteractiveEpisode||!!m.protagonistDeferredChoice||!!s.resultTracker,JSON.stringify({nextPending,interactive:m.protagonistInteractiveEpisode||null,deferred:m.protagonistDeferredChoice||null,resultTracker:!!s.resultTracker}));
add('future-not-precomputed',s.futureOutcomePrecomputed===false&&applied?.futureOutcomePrecomputed===false);
const failures=checks.filter(x=>!x.ok);console.log(JSON.stringify({schemaVersion:'FLR_TT051_TRAP_AUTHORITY_VALIDATION_1.0',pass:failures.length===0,checks,failures},null,2));process.exit(failures.length?1:0);
