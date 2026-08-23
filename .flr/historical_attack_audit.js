'use strict';
const fs=require('fs');
const E=require('../runtime/continuous_match_core.js');
const P=require('../runtime/protagonist_match_controller.js');
const C=E.choiceStateBridge();
const local=(team,x)=>team==='HOME'?x:105-x;
function runNpc(seed){
 const m=E.createMatch(seed),out={seed,score:null,highValueWfActions:0,harmfulBackpasses:0,ditherLosses:0,npcOneTouchPasses:0,examples:[]};
 let eventCursor=0,latestCtx=null,guard=0;
 while(!m.completed&&guard++<120000){
   const owner=m.ball.mode==='CONTROLLED'?m.playersById?.[m.ball.ownerId]||m.players.find(p=>p.id===m.ball.ownerId):null;
   if(owner&&owner.role==='WF'){
     const lx=local(owner.team,owner.x),f=C.inspect(m,owner.id),opts=f?._frame?.opts||[],st=opts.filter(o=>o.p?.role==='ST'&&!o.offsideRisk&&o.block===0&&o.open>=1.2&&o.forward>=1.0).sort((a,b)=>b.forward-a.forward)[0],high=lx>=80&&(!!f?.shot?.openWindow||!!st||f?.shot?.inBox);
     if(high)latestCtx={t:m.time,ownerId:owner.id,team:owner.team,lx:+lx.toFixed(2),shotOpen:!!f?.shot?.openWindow,inBox:!!f?.shot?.inBox,stTarget:st?.p?.id||null,stForward:st?+st.forward.toFixed(2):null};
   }
   E.step(m,.1);
   const newEvents=m.events.slice(eventCursor);eventCursor=m.events.length;
   if(latestCtx&&m.time-latestCtx.t<=1.6){
     const mat=newEvents.find(e=>e.actorId===latestCtx.ownerId&&['PASS','SHOT','TAKE_ON'].includes(e.type));
     if(mat){out.highValueWfActions++;if(mat.type==='PASS'&&mat.targetId){const tp=m.players.find(p=>p.id===mat.targetId),tx=tp?local(latestCtx.team,tp.x):latestCtx.lx;if(tx<latestCtx.lx-4){out.harmfulBackpasses++;if(out.examples.length<8)out.examples.push({kind:'BACKPASS',t:+mat.t.toFixed(2),owner:latestCtx.ownerId,fromX:latestCtx.lx,target:mat.targetId,targetX:+tx.toFixed(2),shotOpen:latestCtx.shotOpen,inBox:latestCtx.inBox,stTarget:latestCtx.stTarget,stForward:latestCtx.stForward});}}latestCtx=null;}
     else{const nowOwner=m.ball.mode==='CONTROLLED'?(m.playersById?.[m.ball.ownerId]||m.players.find(p=>p.id===m.ball.ownerId)):null;if(nowOwner&&nowOwner.team!==latestCtx.team){out.ditherLosses++;if(out.examples.length<8)out.examples.push({kind:'DITHER_LOSS',t:+m.time.toFixed(2),owner:latestCtx.ownerId,fromX:latestCtx.lx,shotOpen:latestCtx.shotOpen,inBox:latestCtx.inBox,stTarget:latestCtx.stTarget,stForward:latestCtx.stForward});latestCtx=null;}}
   }else if(latestCtx)latestCtx=null;
 }
 out.score={...m.score};out.npcOneTouchPasses=m.stats.npcOneTouchPasses||0;return out;
}
function runCarryCadence(seed){
 const s=P.create(seed,{heroPlayerId:'H-ST',mode:'PLAYER_ALL',replaySeconds:10}),out={seed,carries:0,shortReprompts:0,delays:[],examples:[]};let watch=null,guard=0;
 while(!s.m.completed&&s.m.time<1800&&guard++<250000){
   if(s.pending){if(watch){const delay=s.m.time-watch.t;if(s.m.ball.ownerId==='H-ST'){out.delays.push(+delay.toFixed(2));if(delay<2.5){out.shortReprompts++;if(out.examples.length<6)out.examples.push({t:+s.m.time.toFixed(2),delay:+delay.toFixed(2),previous:'CARRY'});}}watch=null;}
     const o=s.pending.options||[],c=o.find(x=>x.id==='CARRY'),pick=c||P.autoPick(s)||o[0];if(!pick){s.pending=null;continue;}const r=P.applyChoice(s,pick.id,pick.targetId||null,{source:'HIST_ATTACK_AUDIT'});if(!r.ok){s.pending=null;continue;}if(pick.id==='CARRY'){out.carries++;watch={t:s.m.time};}continue;
   }
   P.step(s,.1);if(watch&&s.m.ball.ownerId!=='H-ST')watch=null;
 }
 return out;
}
const npc=[];for(let i=1;i<=24;i++)npc.push(runNpc(`HIST-ATTACK-NPC-${i}`));const carry=[];for(let i=1;i<=4;i++)carry.push(runCarryCadence(`HIST-CARRY-CADENCE-${i}`));
const result={schemaVersion:'FLR_HISTORICAL_ATTACK_AUDIT_1.0',generatedAt:new Date().toISOString(),summary:{matches:npc.length,highValueWfActions:npc.reduce((n,x)=>n+x.highValueWfActions,0),harmfulBackpasses:npc.reduce((n,x)=>n+x.harmfulBackpasses,0),ditherLosses:npc.reduce((n,x)=>n+x.ditherLosses,0),npcOneTouchPasses:npc.reduce((n,x)=>n+x.npcOneTouchPasses,0),carryChoices:carry.reduce((n,x)=>n+x.carries,0),shortCarryReprompts:carry.reduce((n,x)=>n+x.shortReprompts,0),minCarryRepromptDelay:Math.min(...carry.flatMap(x=>x.delays),999)},npc,carry};result.gates={boxBackpass:result.summary.harmfulBackpasses===0,attackingDither:result.summary.ditherLosses===0,npcOneTouch:result.summary.npcOneTouchPasses>0,carryCadence:result.summary.shortCarryReprompts===0};result.status=Object.values(result.gates).every(Boolean)?'PASS':'FAIL';fs.writeFileSync(process.argv[2]||'.flr/historical-attack-status.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,summary:result.summary,gates:result.gates},null,2));
