#!/usr/bin/env node
'use strict';
/* TEST_ONLY: observational football-causality layer.  It never writes runtime state. */
const distance=(a,b)=>Math.hypot(Number(a.x)-Number(b.x),Number(a.y)-Number(b.y));
const speed=p=>Math.hypot(Number(p.vx)||0,Number(p.vy)||0);
const team=p=>p.team||(String(p.id).startsWith('H-')?'HOME':'AWAY');
const role=p=>p.role||'CM';
const local=(side,p)=>side==='HOME'?{x:+p.x,y:+p.y}:{x:105-(+p.x),y:68-(+p.y)};
const opposing=(f,side)=>(f.players||[]).filter(p=>team(p)!==side&&role(p)!=='GK');
const defenders=(f,side)=>(f.players||[]).filter(p=>team(p)===side&&role(p)!=='GK');
const pressing=p=>/PRIMARY_BALL_PRESSURE|PRESS|RECOVER|CHASE/.test(`${p.responsibility||''} ${p.action||''}`);
const cover=p=>/COVER|SCREEN|MARK|DANGEROUS|WEAK_SIDE|HOLD_BLOCK/.test(`${p.responsibility||''} ${p.action||''}`);
const carrier=f=>(f.players||[]).find(p=>p.id===f.ball?.ownerId)||null;
const intended=f=>(f.players||[]).find(p=>p.id===f.ball?.intendedReceiverId)||null;
function aerialOrDuel(f){return Number(f.ball?.z||0)>1||/HEADER|DUEL|CROSS|AERIAL|SCRAMBLE|BLOCK/.test(JSON.stringify([f.phase,f.ball?.kind,f.event,f.triggeringEvent]).toUpperCase());}
function materialThreats(f,side){
 const c=carrier(f),i=intended(f),ballLocal=local(side,f.ball||{x:0,y:0}); return opposing(f,side).filter(p=>{
  const q=local(side,p), wide=Math.abs(q.y-34)>=19, advanced=q.x>=58;
  // An off-ball runner becomes material only in an already advanced phase, or when the ball is plausibly deliverable to it.
  return p.id===c?.id||p.id===i?.id||(ballLocal.x>=38&&advanced&&(wide||role(p)==='ST')&&distance(p,f.ball)<34);
 });
}
function ownedBy(f,side,threat){return defenders(f,side).filter(d=>d.markTargetId===threat.id||d.responsibilityTargetId===threat.id||distance(d,threat)<8||(/DANGEROUS/.test(`${d.responsibility||''}`)&&distance(d,threat)<13));}
function justified(f,d,target){
 const c=carrier(f),i=intended(f),text=`${d.action||''} ${d.responsibility||''}`;
 return d.id===c?.id||target?.id===c?.id||target?.id===i?.id||pressing(d)||cover(d)||/HANDOFF|ROTAT|INVERT|REST|EMERGENCY/.test(text)||aerialOrDuel(f);
}
function frameIssues(f){
 const issues=[];
 for(const side of ['HOME','AWAY']){
  const ds=defenders(f,side), c=carrier(f), incoming=intended(f), threats=materialThreats(f,side);
  // A fullback's position itself is deliberately never a predicate.  Only an exposed material wide threat is.
  for(const t of threats.filter(p=>['WF','FB'].includes(role(p))||Math.abs(local(side,p).y-34)>=21)){
   const owners=ownedBy(f,side,t), fbs=ds.filter(d=>role(d)==='FB');
   const wideFb=fbs.find(d=>Math.abs(local(side,d).y-local(side,t).y)<18);
   if(!owners.length&&wideFb&&!justified(f,wideFb,t)) issues.push({category:'UNMARKED_WIDE_THREAT_UNJUSTIFIED_FB_DEPARTURE',side,at:f.time,threatId:t.id,defenderId:wideFb.id,reason:'material wide threat has neither owner nor cover; FB has no current press/cover/rotation/rest-defense justification'});
  }
  for(const d of ds) for(const t of opposing(f,side)){
   if(distance(d,t)>=1.55||local(side,t).x<48||t.id===c?.id||t.id===incoming?.id||aerialOrDuel(f))continue;
   if(!justified(f,d,t))issues.push({category:'OFF_BALL_OVER_TIGHT_MARKING',side,at:f.time,defenderId:d.id,threatId:t.id,reason:'off-ball contact is tight without possession, incoming-pass, aerial/duel, press, cover, or handoff context'});
  }
  for(const t of threats){const owners=ownedBy(f,side,t);if(!owners.length&&t.id!==c?.id){
   const higher=ds.some(d=>pressing(d)&&c&&distance(d,c)<10); if(!higher)issues.push({category:'MARKING_RESPONSIBILITY_ABANDONMENT',side,at:f.time,threatId:t.id,reason:'material threat has no mark, proximity cover, recorded handoff, or higher-priority ball response'});
  }}
  if(c&&team(c)!==side){const chasers=ds.filter(d=>distance(d,c)<8&&pressing(d));const abandoned=threats.filter(t=>t.id!==c.id&&!ownedBy(f,side,t).length);if(chasers.length>=2&&abandoned.length)issues.push({category:'UNJUSTIFIED_DOUBLE_PRESS_VACATES_THREAT',side,at:f.time,carrierId:c.id,defenderIds:chasers.map(x=>x.id),threatIds:abandoned.map(x=>x.id),reason:'multiple pressers are near the carrier while a nearby material threat lacks cover/handoff'});}
 }
 return issues;
}
function temporalIssues(frames){
 const issues=[];const fs=[...frames].filter(f=>Number.isFinite(+f.time)).sort((a,b)=>a.time-b.time);
 for(let k=1;k<fs.length;k++){
  const a=fs[k-1],b=fs[k],dt=Math.max(.01,+b.time-(+a.time));
  for(const p of b.players||[]){const q=(a.players||[]).find(x=>x.id===p.id);if(!q)continue;const sv=speed(q),sn=speed(p),move=distance(p,q),dot=(+q.vx||0)*(+p.vx||0)+(+q.vy||0)*(+p.vy||0);
   if(sv<=2&&sn<=2&&move/dt>5.5)issues.push({category:'LOW_SPEED_TURN_SLIDE',at:b.time,playerId:p.id,reason:'low-speed turn has displacement inconsistent with low-speed control',metrics:{previousSpeed:sv,nextSpeed:sn,displacement:move,dt}});
   if(sv>=5&&sn>=4&&dot<0&&move/dt>4)issues.push({category:'HIGH_SPEED_TURN_INERTIA',at:b.time,playerId:p.id,reason:'high-speed direction reversal retains momentum; recorded separately from low-speed slide',metrics:{previousSpeed:sv,nextSpeed:sn,displacement:move,dt}});
   const oldCarrier=carrier(a),newCarrier=carrier(b);if(oldCarrier&&newCarrier&&oldCarrier.id!==newCarrier.id&&team(oldCarrier)!==team(newCarrier)&&distance(q,oldCarrier)<5&&sn>=4&&distance(p,oldCarrier)>distance(q,oldCarrier)+1.2)issues.push({category:'POST_CONTACT_GLIDE_VELOCITY_RETENTION',at:b.time,playerId:p.id,contactWith:oldCarrier.id,reason:'defender remains fast and increases distance past the contact after possession changes',metrics:{previousSpeed:sv,nextSpeed:sn,before:distance(q,oldCarrier),after:distance(p,oldCarrier)}});
  }
 }
 return issues;
}
function evaluate(frames){const perFrame=frames.map(f=>({time:f.time,issues:frameIssues(f)})),temporal=temporalIssues(frames),all=[...perFrame.flatMap(x=>x.issues),...temporal];const firstByCategory={};for(const x of all)if(firstByCategory[x.category]==null)firstByCategory[x.category]=x.at;return{schemaVersion:'V43_CAUSAL_PLAUSIBILITY_1.0',teamShapeLayer:frames.map(f=>{const D=require('./v42_team_shape_collapse_detector');return{time:f.time,HOME:D.detect(f,'HOME').flagged,AWAY:D.detect(f,'AWAY').flagged};}),perFrame,temporalIssues:temporal,issues:all,firstFlagTime:Object.keys(firstByCategory).length?Math.min(...Object.values(firstByCategory)):null,firstByCategory};}
module.exports={evaluate,frameIssues,temporalIssues,materialThreats};
