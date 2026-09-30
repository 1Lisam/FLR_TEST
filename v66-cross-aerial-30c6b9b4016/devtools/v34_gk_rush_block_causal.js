'use strict';
const path=require('path');
const root=path.resolve(__dirname,'..');
const E=require(path.join(root,'runtime','continuous_match_core.js'));

const fixtures=[
  {id:'RUSH-15M-20',seed:'V34-RUSH-15M-20',startX:90,speed:20,y:34},
  {id:'RUSH-18M-24',seed:'V34-RUSH-18M-24',startX:87,speed:24,y:32}
];

function setup(s){
  const m=E.createMatch(s.seed,{dt:.05});m.restart=null;m.phase='OPEN_PLAY';m.nextShape=99999;
  for(const p of m.players){p.nextThink=99999;p.vx=p.vy=0;p.hasBall=false;}
  const st=m.playersById['H-ST'],gk=m.playersById['A-GK'];
  Object.assign(st,{x:s.startX-2,y:s.y,tx:s.startX-2,ty:s.y,bodyAngle:0,faceTargetAngle:0});
  Object.assign(gk,{x:101,y:s.y,tx:101,ty:s.y,action:'GK_SAVE_SET',tacticalTask:'GK_SAVE_SET'});
  m.playerAbilityProfiles={'A-GK':{handling:45,reaction:60,gk_positioning:60,agility:60,diving:60},'H-ST':{finishing:75}};
  m.ball={mode:'FLIGHT',kind:'SHOT',x:s.startX,y:s.y,z:0,vx:s.speed,vy:0,vz:0,age:.4,ownerId:null,intendedReceiverId:null,lastTouchTeam:'HOME',lastTouchPlayer:'H-ST',shotTeam:'HOME',shotTargetY:s.y,onTarget:true,shotOneVOne:true,shotClearKeeperChance:true,shotDistance:105-s.startX,originX:s.startX,originY:s.y,targetX:105,targetY:s.y,airborne:false};
  return{m,st,gk};
}

function runRush(s){
  const {m,st,gk}=setup(s),trace=[];let rushStart=null,block=null;
  for(let i=0;i<80&&['FLIGHT','LOOSE'].includes(m.ball.mode);i++){
    const before={x:gk.x,y:gk.y,t:m.time,ballX:m.ball.x,mode:m.ball.mode};E.step(m,.05);
    trace.push({t:Number(m.time.toFixed(3)),gkX:gk.x,gkY:gk.y,ballX:m.ball.x,mode:m.ball.mode});
    if(!rushStart&&m.events.some(e=>e.type==='GK_RUSH_START')){const e=m.events.find(x=>x.type==='GK_RUSH_START');rushStart={event:e,gkX:gk.x,gkY:gk.y,traceIndex:trace.length-1};}
    if(!block&&m.events.some(e=>e.type==='RUSH_BLOCK'))block=m.events.find(e=>e.type==='RUSH_BLOCK');
    void before;
  }
  const contactIndex=block?trace.findIndex(x=>x.t>=Number(block.t.toFixed(3))):-1;
  const preContact=rushStart?trace.slice(rushStart.traceIndex,contactIndex<0?trace.length:contactIndex):[];
  const contactKeeper=block?.contact?.keeperAtContact||null;
  return{fixture:s.id,seed:s.seed,speed:s.speed,geometry:{startX:s.startX,y:s.y},rushStart:!!rushStart,block:!!block,preContactFrames:preContact.length,keeperStart:rushStart?{x:rushStart.gkX,y:rushStart.gkY}:null,keeperAtContact:contactKeeper,keeperAdvance:contactKeeper&&rushStart?{x:Number((contactKeeper.x-rushStart.gkX).toFixed(3)),y:Number((contactKeeper.y-rushStart.gkY).toFixed(3))}:null,contact:block?{time:block.contact.time,gap:block.contact.gap,ball:block.contact.ballAtContact}:null,preContactState:preContact.map(x=>({t:x.t,gkX:x.gkX,gkY:x.gkY,ballX:x.ballX,mode:x.mode})),postBlockState:block?block.ballState:null,postBlockVelocity:block?.ballVelocityAfter||null,sourcePlayerId:block?.shotSourcePlayerId||null,lastTouchPlayer:block?.ballState?.lastTouchPlayer||null,events:m.events.filter(e=>['GK_RUSH_START','RUSH_BLOCK','GOAL','SAVE','PARRY','BLOCK'].includes(e.type)).map(e=>({type:e.type,t:e.t,npcGkOutcome:e.npcGkOutcome||null}))};
}

function runNonBlock(){
  const m=E.createMatch('V34-RUSH-NONBLOCK',{dt:.05});m.restart=null;m.phase='OPEN_PLAY';m.nextShape=99999;
  for(const p of m.players){p.nextThink=99999;p.vx=p.vy=0;p.hasBall=false;}
  const st=m.playersById['H-ST'],gk=m.playersById['A-GK'];Object.assign(st,{x:88,y:34,tx:88,ty:34});Object.assign(gk,{x:101,y:45,tx:101,ty:45,action:'GK_SAVE_SET',tacticalTask:'GK_SAVE_SET'});
  m.playerAbilityProfiles={'A-GK':{handling:40,reaction:40,gk_positioning:40,agility:40,diving:40},'H-ST':{finishing:75}};
  m.ball={mode:'FLIGHT',kind:'SHOT',x:90,y:34,z:0,vx:20,vy:0,vz:0,age:.4,ownerId:null,intendedReceiverId:null,lastTouchTeam:'HOME',lastTouchPlayer:'H-ST',shotTeam:'HOME',shotTargetY:34,onTarget:true,shotDistance:15,originX:90,originY:34,targetX:105,targetY:34,airborne:false};
  for(let i=0;i<60&&!m.completed;i++)E.step(m,.05);
  return{fixture:'GOAL-NONBLOCK',goal:m.events.some(e=>e.type==='GOAL'),rushBlock:m.events.some(e=>e.type==='RUSH_BLOCK'),score:m.score,events:m.events.filter(e=>['GK_RUSH_START','RUSH_BLOCK','GOAL','SAVE','PARRY','BLOCK'].includes(e.type)).map(e=>e.type)};
}

const rows=fixtures.map(runRush),nonBlock=runNonBlock();
const checks={twoFixtures:rows.length===2,distinctGeometryOrSpeed:new Set(rows.map(r=>`${r.geometry.startX}|${r.speed}|${r.geometry.y}`)).size===2,allRushBlocks:rows.every(r=>r.rushStart&&r.block),multiTickRush:rows.every(r=>r.preContactFrames>=3),keeperAdvances:rows.every(r=>r.keeperAdvance&&(Math.abs(r.keeperAdvance.x)+Math.abs(r.keeperAdvance.y))>=0.40),noOutcomeBeforeContact:rows.every(r=>r.preContactState.every(x=>x.mode==='FLIGHT')&&r.events.filter(e=>['RUSH_BLOCK','GOAL','SAVE','PARRY','BLOCK'].includes(e.type)).length===1),blockAtLiveInteraction:rows.every(r=>r.contact&&r.contact.gap<=1.18&&r.contact.time>0),postBlockLiveLooseNoOwner:rows.every(r=>r.postBlockState?.mode==='LOOSE'&&r.postBlockState.ownerId==null&&r.postBlockState.intendedReceiverId==null&&r.postBlockVelocity&&Math.hypot(r.postBlockVelocity.x,r.postBlockVelocity.y)>0),gkLastTouchAndScorerSource:rows.every(r=>r.lastTouchPlayer==='A-GK'&&r.sourcePlayerId==='H-ST'),normalCloseRangeGoal:nonBlock.goal&&!nonBlock.rushBlock};
const pass=Object.values(checks).every(Boolean);
console.log(JSON.stringify({schema:'FLR_V34_GK_RUSH_BLOCK_CAUSAL_V1',dt:.05,verdict:pass?'PASS_FOR_VISUAL_RETEST':'FAIL',pass,checks,rows,nonBlock},null,2));
if(!pass)process.exit(1);
