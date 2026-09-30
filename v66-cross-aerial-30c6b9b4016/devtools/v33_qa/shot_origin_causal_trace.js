'use strict';
const path=require('path');
const root=process.argv[2],seed=process.argv[3];if(!root||!seed){console.error('usage: node shot_origin_causal_trace.js <source> <seed>');process.exit(2)}
const E=require(path.resolve(root,'runtime/continuous_match_core.js'));
const m=E.createMatch(seed,{dt:.05,telemetry:{}}),dt=.05;
let steps=0,prev={mode:m.ball.mode,ownerId:m.ball.ownerId,kind:m.ball.kind||null,shots:0,boxShots:0,reasons:{}};
const acquisitions=new Map(),shots=[];
function eventType(e){return e&&e.type||null}
function latestActor(){for(let i=m.events.length-1;i>=0;i--){const e=m.events[i];if((e.type==='SHOT'||e.type==='HEADER_SHOT')&&e.actorId)return e.actorId;}return m.ball?.lastTouchPlayer||m.lastTouchPlayer||null;}
function changedReason(){const cur=m.stats.shotReasons||{};for(const [k,v] of Object.entries(cur)){if(v>(prev.reasons[k]||0))return k;}return null;}
function classify(recent,acq,controlAge,setPieceRecent){
  const within=(types,sec)=>recent.some(e=>types.includes(e.type)&&m.time-e.t<=sec);
  if(setPieceRecent||within(['CORNER','FOUL','PENALTY_TAKEN'],3.2))return'SET_PIECE_SEQUENCE';
  if(within(['PARRY','CHIP_PARRY','SAVE','CHIP_SAVE'],3.2))return'GK_REBOUND_RESHOT';
  if(within(['BLOCK'],3.2)&&within(['SHOT','HEADER_SHOT'],4.0))return'BLOCK_REBOUND_RESHOT';
  if(acq&&acq.fromMode==='LOOSE'&&controlAge<=2.4)return'LOOSE_RECOVERY_RESHOT';
  if(within(['CROSS_RECEIVE','AERIAL_DUEL','PUNCH','GK_CROSS_CATCH'],3.8))return'CROSS_OR_AERIAL_SECOND_PHASE';
  if(within(['TAKE_ON','DRIBBLE_BEAT','TAKE_ON_LOOSE','TAKE_ON_TACKLED'],3.0))return'TAKE_ON_SEQUENCE';
  if(acq&&acq.fromMode==='FLIGHT'&&controlAge<=2.2)return'PASS_FIRST_ACTION';
  if(controlAge<=1.2)return'QUICK_CONTROL_SHOT';
  return'SUSTAINED_POSSESSION';
}
while(!m.completed&&steps++<110000){
  const beforeMode=m.ball.mode,beforeOwner=m.ball.ownerId,beforeKind=m.ball.kind||null;
  E.step(m,dt);
  if(m.ball.mode==='CONTROLLED'&&m.ball.ownerId&&(beforeMode!=='CONTROLLED'||beforeOwner!==m.ball.ownerId)){
    acquisitions.set(m.ball.ownerId,{at:m.time,fromMode:beforeMode,fromOwnerId:beforeOwner||null,fromKind:beforeKind,lastEvent:eventType(m.events[m.events.length-1])});
  }
  if((m.stats.shots||0)>prev.shots){
    const actorId=latestActor(),p=m.playersById?.[actorId]||m.players.find(x=>x.id===actorId)||null,acq=acquisitions.get(actorId)||null,controlAge=acq?Math.max(0,m.time-acq.at):null;
    const recent=m.events.filter(e=>m.time-e.t<=5.0&&e.type!=='SHOT_PREP').map(e=>({t:Number(e.t.toFixed(2)),type:e.type,actorId:e.actorId||null,targetId:e.targetId||null,kind:e.passKind||null}));
    // Drop the just-created shot event from causal history while retaining older shots.
    let dropped=false;const causal=[];for(let i=recent.length-1;i>=0;i--){const e=recent[i];if(!dropped&&(e.type==='SHOT'||e.type==='HEADER_SHOT')&&Math.abs(m.time-e.t)<0.12){dropped=true;continue;}causal.push(e)}causal.reverse();
    const box=(m.stats.boxShots||0)>prev.boxShots,setPieceRecent=!!m.setPieceLive||causal.some(e=>['CORNER','FOUL','PENALTY_TAKEN'].includes(e.type)&&m.time-e.t<=3.2);
    const origin=classify(causal,acq,controlAge==null?99:controlAge,setPieceRecent);
    shots.push({index:shots.length+1,at:Number(m.time.toFixed(2)),team:p?.team||m.ball.shotTeam||null,actorId,role:p?.role||null,slot:p?.slot||null,inBox:box,dGoal:Number((m.ball.shotDistance||0).toFixed(2)),reason:changedReason(),controlAge:controlAge==null?null:Number(controlAge.toFixed(2)),acquiredFrom:acq?.fromMode||null,acquiredKind:acq?.fromKind||null,origin,setPieceLive:!!m.setPieceLive,recent:causal.slice(-8)});
  }
  prev={mode:m.ball.mode,ownerId:m.ball.ownerId,kind:m.ball.kind||null,shots:m.stats.shots||0,boxShots:m.stats.boxShots||0,reasons:{...(m.stats.shotReasons||{})}};
}
const counts={},boxCounts={},reasonCounts={};for(const s of shots){counts[s.origin]=(counts[s.origin]||0)+1;if(s.inBox)boxCounts[s.origin]=(boxCounts[s.origin]||0)+1;reasonCounts[s.reason||'UNKNOWN']=(reasonCounts[s.reason||'UNKNOWN']||0)+1;}
console.log(JSON.stringify({seed,completed:m.completed,time:Number(m.time.toFixed(2)),score:m.score,totalShots:shots.length,boxShots:shots.filter(s=>s.inBox).length,originCounts:counts,boxOriginCounts:boxCounts,reasonCounts,shots},null,2));
