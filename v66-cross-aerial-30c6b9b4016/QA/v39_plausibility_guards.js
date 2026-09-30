'use strict';

const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const localX=(p,team)=>team==='AWAY'?105-n(p?.x):n(p?.x);
const speed=p=>Math.hypot(n(p?.vx),n(p?.vy));
const targetGap=p=>Math.hypot(n(p?.tx,p?.x)-n(p?.x),n(p?.ty,p?.y)-n(p?.y));
const EXPLAINED=/REST_DEFENCE|SECOND_BALL|RECYCLE|SHORT_OPTION|KICKER|APPROACH|RUN_UP|RUNNER|COUNTER|OUTLET|COVER|TRACK|MARK|ZONE|LINE|CLEARANCE|EDGE|PRESS|SUPPORT|WALL|POST_PROTECT|AERIAL|DUEL/;

function kickTime(r){
  const ev=(r.actualEvents||[]).find(e=>/CORNER_KICK|FREE_KICK|RESTART_KICK|SET_PIECE_KICK/.test(String(e.type||'')));
  if(ev)return n(ev.t);
  const f=(r.frames||[]).find(x=>String(x?.ball?.mode||'').toUpperCase()==='FLIGHT');
  return f?n(f.time):null;
}

/* This guard intentionally does NOT say that a fullback outside the box is
 * wrong. It only raises a block candidate when all of the following persist:
 *   1) the fullback belongs to the attacking set-piece team,
 *   2) he is outside the attacking box,
 *   3) no football responsibility is encoded (rest defence / second ball /
 *      recycle / mark / cover / outlet / etc.),
 *   4) he has no explicit opponent/target responsibility,
 *   5) he is effectively stationary at his target for a sustained window.
 * Thus an overlap, a deliberate rest-defence role, or a rare tactical run is
 * allowed. The target is the 'stands there for no reason' failure class. */
function unexplainedSetPieceIdleFullback(r){
  const team=r?.boundary?.setPiece?.team||r?.boundary?.stateSnapshot?.possession;
  if(!['HOME','AWAY'].includes(team))return[];
  const kt=kickTime(r),counts=new Map(),first=new Map(),last=new Map(),examples=new Map();
  for(const f of r.frames||[]){
    if(kt!=null&&n(f.time)>kt+0.051)continue;
    for(const p of (f.players||[]).filter(x=>x.team===team&&x.role==='FB')){
      const outsideBox=localX(p,team)<84;
      const noEncodedReason=!EXPLAINED.test(task(p));
      const noExplicitOwner=!p.markTargetId&&!p.targetId;
      const inert=speed(p)<0.35&&targetGap(p)<1.5;
      if(!(outsideBox&&noEncodedReason&&noExplicitOwner&&inert))continue;
      counts.set(p.id,(counts.get(p.id)||0)+1);
      if(!first.has(p.id))first.set(p.id,n(f.time));
      last.set(p.id,n(f.time));examples.set(p.id,p);
    }
  }
  const out=[];
  for(const [id,count] of counts){
    const duration=(last.get(id)||0)-(first.get(id)||0),p=examples.get(id);
    if(count<8||duration<0.5)continue;
    out.push({
      id:'UNEXPLAINED_SET_PIECE_IDLE_FULLBACK',severity:'BLOCK_CANDIDATE',player:id,
      metric:{durationSeconds:Number(duration.toFixed(2)),frames:count,localX:Number(localX(p,team).toFixed(2)),task:task(p)||null,speed:Number(speed(p).toFixed(3)),targetGap:Number(targetGap(p).toFixed(3))},
      rationale:'Attacking fullback remains outside the box without an encoded rest-defence/second-ball/recycle/mark/cover/outlet responsibility and is effectively stationary. Position alone is not the failure; absence of causal responsibility is.'
    });
  }
  return out;
}

function evaluatePlausibility(r){
  return[
    ...unexplainedSetPieceIdleFullback(r)
  ];
}

module.exports={evaluatePlausibility,unexplainedSetPieceIdleFullback};
