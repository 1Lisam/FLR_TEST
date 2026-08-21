'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]||process.argv[1]||'.');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const checks=[];const add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});

const core=read('runtime/continuous_match_core.js');
const ctl=read('runtime/protagonist_match_controller.js');
const tactics=read('runtime/tactical_movement.js');
add('player-offside-mode',core.includes("passOptions(m,owner,'PLAYER')")&&core.includes("const playerChoice=offsideMode==='PLAYER'"));
add('marginal-moving-window',core.includes('const playerMargin=running?1.75:1.15'));
add('ai-offside-timing-preserved',core.includes('if(!offsideMode||!running||offsideMargin>0.85)continue')&&core.includes('OFFSIDE_TIMING'));
add('release-law-preserved',core.includes('const offsideAtRelease=offsideEligible?isOffsideAtPass')&&core.includes("if(m.ball.offsideAtRelease===true){m.stats.offsides++"));
add('physically-risky-pass-floor',core.includes('o.block<=1')&&core.includes('o.open>=0.35')&&core.includes("reason:'physically_available_receiver'"));
add('risky-pass-executable',core.includes("if(c.id==='AVAILABLE_PASS'){const o=optionById(opts,c.meta?.targetId);if(o&&o.block<=1)"));
add('no-explicit-offside-answer-risk',ctl.includes("if(c.id==='THROUGH_PASS')return'보통';")&&!ctl.includes("return c.meta?.offsideRisk?'높음':'보통'"));
add('no-current-offside-answer-tooltip',!ctl.includes('침투 타이밍이 경계선에 있어 실제 패스 순간 오프사이드가 될 위험이 큼'));
add('risk-floor-survives-six-menu',ctl.includes('const riskyPhysical=ranked.filter')&&ctl.includes("c.id==='THROUGH_PASS'&&c.meta?.offsideRisk"));
add('marginal-runner-not-immediate-recover',tactics.includes('marginalShoulder=over>.18&&over<=1.55,recover=over>1.55')&&tactics.includes("'FAR_SIDE_SHOULDER'"));

function setPlayer(p,x,y){p.x=x;p.y=y;p.tx=x;p.ty=y;p.vx=0;p.vy=0;p.hasBall=false;p.runUntil=0;p.tacticalTask='HOLD_SHAPE';p.action='HOLD_SHAPE';}
function scenario({lwX=79.0,contested=false}={}){
  const P=require(path.join(root,'runtime/protagonist_match_controller.js'));
  const s=P.create('QA-PLAYER-RISK',{heroPlayerId:'H-ST',mode:'PLAYER_ALL'}),m=s.m;
  m.time=1200;m.phase='OPEN_PLAY';m.restart=null;m.completed=false;m.possession='HOME';m.protagonistExplicitActionRequired=true;
  const ps=m.playersById,hero=ps['H-ST'];
  for(const p of m.players){if(p.team==='HOME')setPlayer(p,55,34);else setPlayer(p,70,60);}
  setPlayer(ps['A-LCB'],78.2,61);setPlayer(ps['A-RCB'],78.0,58);
  setPlayer(hero,72,34);hero.hasBall=true;hero.controlledSince=m.time-1.2;hero.nextThink=m.time;hero.action='HOLD_BALL';hero.tacticalTask='HOLD_BALL';
  m.ball={...m.ball,mode:'CONTROLLED',x:72.45,y:34,z:0,vx:0,vy:0,vz:0,ownerId:hero.id,intendedReceiverId:null,kind:'CONTROL',lastTouchTeam:'HOME',lastTouchPlayer:hero.id,age:0};m.ballOwner=hero.id;m.lastTouchTeam='HOME';m.lastTouchPlayer=hero.id;
  const lw=ps['H-LW'];setPlayer(lw,lwX,12);lw.vx=1.8;lw.tx=lwX+2;lw.runUntil=m.time+2;lw.tacticalTask='FAR_SIDE_RUN';lw.action='FAR_SIDE_RUN';
  const rw=ps['H-RW'];setPlayer(rw,76,46);rw.tacticalTask='MOVE_TO_RECEIVE';rw.action='MOVE_TO_RECEIVE';
  for(const id of ['H-LCM','H-CM','H-RCM','H-LB','H-RB','H-LCB','H-RCB']){const p=ps[id];if(p){p.x=58;p.y=id.includes('L')?24:54;p.tx=p.x;p.ty=p.y;}}
  if(contested)setPlayer(ps['A-CM'],74,40);else setPlayer(ps['A-CM'],70,60);
  const q=P.inspect(s);return{s,m,q,lw,rw};
}
try{
  const marginal=scenario({lwX:79.0,contested:false});
  const rawMarg=marginal.q?.frame?._frame?.opts?.find(o=>o.p?.id==='H-LW');
  const uiMarg=marginal.q?.options?.find(o=>o.targetId==='H-LW');
  add('dynamic-marginal-raw-admitted',!!rawMarg&&rawMarg.offsideRisk===true&&rawMarg.offsideMargin>0&&rawMarg.offsideMargin<1.75,JSON.stringify(rawMarg&&{margin:rawMarg.offsideMargin,block:rawMarg.block,running:rawMarg.running}));
  add('dynamic-marginal-user-choice-visible',!!uiMarg,JSON.stringify(marginal.q?.options?.map(o=>({id:o.id,targetId:o.targetId,label:o.label}))));
  add('dynamic-no-answer-key-label',!!uiMarg&&!String(uiMarg.label||'').includes('오프사이드')&&!String(uiMarg.hint||'').includes('경계선'),String(uiMarg?.hint||''));

  const extreme=scenario({lwX:80.7,contested:false});
  const rawExtreme=extreme.q?.frame?._frame?.opts?.find(o=>o.p?.id==='H-LW');
  const uiExtreme=extreme.q?.options?.find(o=>o.targetId==='H-LW');
  add('dynamic-obvious-offside-still-filtered',!rawExtreme&&!uiExtreme,JSON.stringify(extreme.q?.options?.map(o=>({id:o.id,targetId:o.targetId}))));

  // Keep LW clearly outside the player margin so this scenario tests the blocked RW independently.
  const contested=scenario({lwX:80.7,contested:true});
  const rawRw=contested.q?.frame?._frame?.opts?.find(o=>o.p?.id==='H-RW');
  const uiRw=contested.q?.options?.find(o=>o.targetId==='H-RW');
  add('dynamic-contested-geometry-created',!!rawRw&&rawRw.block===1,JSON.stringify(rawRw&&{block:rawRw.block,open:rawRw.open,forward:rawRw.forward}));
  add('dynamic-high-risk-pass-remains-choice',!!uiRw,JSON.stringify(contested.q?.options?.map(o=>({id:o.id,targetId:o.targetId,meta:o.meta}))));
  add('dynamic-future-not-precomputed',marginal.q?.futureOutcomePrecomputed===false&&contested.q?.futureOutcomePrecomputed===false);
}catch(e){add('dynamic-player-risk-scenarios',false,String(e&&e.stack||e));}

const failures=checks.filter(x=>!x.ok);
const out={schemaVersion:'FLR_TT051_PLAYER_RISK_CHOICE_VALIDATION_1.1',pass:failures.length===0,checks,failures};
console.log(JSON.stringify(out,null,2));process.exit(failures.length?1:0);
