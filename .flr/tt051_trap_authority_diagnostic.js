'use strict';
const path=require('path');
const root=path.resolve(process.argv[2]||'.');
const E=require(path.join(root,'runtime/continuous_match_core.js'));
const P=require(path.join(root,'runtime/protagonist_match_controller.js'));
const B=E.choiceActionBridge();
const checks=[];const add=(name,ok,detail={})=>checks.push({name,ok:!!ok,detail});
function setP(p,x,y){p.x=x;p.y=y;p.tx=x;p.ty=y;p.vx=0;p.vy=0;p.hasBall=false;p.runUntil=0;p.tacticalTask='HOLD_SHAPE';p.action='HOLD_SHAPE';p.nextThink=99999;p.lockTargetUntil=0;}
function runCase(explicit){
  const s=P.create(`TRAP-AUTH-${explicit?'EXPLICIT':'EPISODE'}`,{heroPlayerId:'H-ST',mode:'PLAYER_ALL',replaySeconds:10}),m=s.m,ps=m.playersById;
  m.time=5180;m.phase='OPEN_PLAY';m.restart=null;m.completed=false;m.score={HOME:1,AWAY:0};m.possession='HOME';m.protagonistExplicitActionRequired=explicit;
  for(const p of m.players){if(p.team==='HOME')setP(p,55,8+(p.slot?.length||1)*4);else setP(p,38,8+(p.slot?.length||1)*4);}
  const hero=ps['H-ST'],src=ps['H-LCM'];setP(hero,80,34);setP(src,70,32);hero.nextThink=m.time;src.nextThink=m.time;
  B.setControlled(m,src,true);B.executePass(m,src,hero,'PASS',{running:false,block:0,forward:10,open:8},'QA_RETURN_TO_HERO');
  s.lastPauseAt=m.time-5;
  let incoming=null;for(let i=0;i<80&&!s.pending;i++){P.step(s,.05);const q=P.inspect(s);if(q?.frame?.kind==='INCOMING_BALL'&&q.options?.some(o=>o.id==='TRAP_CONTROL'))incoming=q;}
  const pending=s.pending;const trap=pending?.options?.find(o=>o.id==='TRAP_CONTROL');
  if(!trap)return{explicit,valid:false,reason:'NO_TRAP_PENDING',time:m.time,pending:pending?{kind:pending.kind,options:pending.options.map(o=>o.id)}:null};
  const applied=P.applyChoice(s,'TRAP_CONTROL',null,{source:'QA_TRAP_AUTHORITY'});const chosenAt=m.time;
  let heroReceived=false,receiveAt=null,nextPendingAt=null,autoMaterial=null,lockAtReceive=null,steps=0;
  while(!m.completed&&m.time<chosenAt+8&&steps++<300){
    P.step(s,.05);
    if(!heroReceived&&m.ball.mode==='CONTROLLED'&&m.ball.ownerId===hero.id){heroReceived=true;receiveAt=m.time;lockAtReceive={interactive:m.protagonistInteractiveEpisode?{...m.protagonistInteractiveEpisode}:null,explicit:m.protagonistExplicitActionRequired,deferred:m.protagonistDeferredChoice?{...m.protagonistDeferredChoice}:null};}
    const bad=(m.events||[]).find(e=>e.t>chosenAt+.001&&e.actorId===hero.id&&['PASS','SHOT','HEADER_SHOT','GOAL','TAKE_ON'].includes(e.type));if(bad){autoMaterial={t:bad.t,type:bad.type,text:bad.text,targetId:bad.targetId||null};break;}
    if(s.pending){nextPendingAt=m.time;break;}
  }
  return{explicit,valid:true,applied,chosenAt,heroReceived,receiveAt,nextPendingAt,autoMaterial,lockAtReceive,pending:s.pending?{kind:s.pending.kind,options:s.pending.options.map(o=>[o.id,o.targetId||null])}:null,events:(m.events||[]).filter(e=>e.t>=chosenAt-.01).map(e=>({t:e.t,type:e.type,actorId:e.actorId||null,targetId:e.targetId||null,text:e.text})).slice(-16),futureOutcomePrecomputed:s.futureOutcomePrecomputed};
}
const episode=runCase(false),explicit=runCase(true);
for(const row of [episode,explicit]){
  const tag=row.explicit?'explicit':'interactive-episode';
  add(`${tag}-trap-scenario-valid`,row.valid,row);
  add(`${tag}-hero-actually-receives-after-trap`,row.valid&&row.heroReceived,row);
  add(`${tag}-no-unchosen-material-action`,row.valid&&row.heroReceived&&!row.autoMaterial,row);
  add(`${tag}-next-choice-before-ai-action`,row.valid&&row.heroReceived&&!row.autoMaterial&&row.nextPendingAt!=null,row);
  add(`${tag}-future-not-precomputed`,row.valid&&row.futureOutcomePrecomputed===false,row);
}
const failures=checks.filter(x=>!x.ok);const out={schemaVersion:'FLR_TT051_TRAP_AUTHORITY_DIAG_1.0',pass:failures.length===0,checks,failures,cases:{episode,explicit}};console.log(JSON.stringify(out,null,2));process.exit(failures.length?1:0);
