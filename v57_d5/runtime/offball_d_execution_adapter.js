(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FLRPG_OFFBALL_D_EXECUTION_ADAPTER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

// D3 is deliberately a narrow translator.  It owns no match mutation, RNG, or
// tactical formula: one D1 immutable snapshot becomes one complete set of D2 rows.
const D=(typeof globalThis!=='undefined'&&globalThis.FLRPG_OFFBALL_DECISION_SHADOW)||((typeof require==='function')?(()=>{try{return require('./offball_decision_shadow.js')}catch(_e){return null}})():null);
const DUTIES=new Set(['PRESS','MARK','COVER','ZONE','BALANCE','RECOVER','PRESS_SUPPORT','ATTACK_SUPPORT','ACTIVE_RUN','REST_DEFENCE','HOLD','PROTECTED']);
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const point=(p,fallback)=>finite(p?.x)!=null&&finite(p?.y)!=null?{x:finite(p.x),y:finite(p.y)}:{x:finite(fallback.x),y:finite(fallback.y)};
const angle=(from,to)=>Math.atan2(to.y-from.y,to.x-from.x);

function protectedReason(snapshot,p){
  const f=snapshot.protectedFacts||{},restart=snapshot.restart,live=snapshot.setPieceLive;
  if(p.id===f.protagonistControllerId)return'PROTAGONIST_CONTROLLER';
  if(p.id===f.ballOwnerId)return'CURRENT_BALL_OWNER';
  if(p.id===f.actualFlightReceiverId)return'ACTUAL_FLIGHT_RECEIVER';
  if(p.id===restart?.setup?.kickerId)return'RESTART_KICKER';
  if(restart?.setup?.targets?.some(x=>x.id===p.id&&/WALL|KICKER/.test(String(x.task))))return'RESTART_ROLE';
  if(live?.roles?.some(x=>x.id===p.id))return'SET_PIECE_LIVE_ROLE';
  return null;
}
function currentTarget(p){return point(p.legacy?.finalMovementIntent?.targetPoint||p.legacy,{x:p.x,y:p.y});}
function relationshipFor(row,p,requireRelation=false){
  const relation=row?.approvedTargetRelation||null;
  if(relation?.targetPoint){
    const target=point(relation.targetPoint,p),facing=point(relation.facingPoint||relation.targetPoint,p);
    return{targetPoint:target,facingPoint:facing,purpose:relation.purpose||'D1_CURRENT_RELATION',subjectId:relation.subjectId||row.subjectId||null,source:'D1_APPROVED_TARGET_RELATION'};
  }
  // An unprotected D row must carry a decision-owned current-state relation.
  // Falling through to tx/ty or finalMovementIntent here would silently restore
  // Legacy coordinate authority inside an otherwise whole-mode D epoch.
  if(requireRelation)throw new Error(`D4_APPROVED_ATTACK_RELATION_REQUIRED:${p.id}`);
  const target={x:p.x,y:p.y};
  return{targetPoint:target,facingPoint:target,purpose:'D1_CURRENT_POSITION_HOLD',subjectId:row?.subjectId||null,source:'D1_CURRENT_SNAPSHOT_HOLD'};
}
function dRow(snapshot,p,teamRow){
  const protectedBy=protectedReason(snapshot,p);
  if(protectedBy){
    const target=currentTarget(p),type=p.legacy?.tacticalTask||p.legacy?.action||'HOLD';
    return{teamId:p.team,actorId:p.id,duty:'PROTECTED',relationshipTargetId:null,targetPoint:target,type,task:p.legacy?.tacticalTask||type,action:p.legacy?.action||type,sprint:!!p.legacy?.sprint,facing:{faceTargetAngle:p.facing,bodyDirectionInput:p.bodyAngle},hold:{provenance:'D_PROTECTED_EXTERNAL_CONTRACT',protectedBy},protectedBy,provenance:{source:'D1_PROTECTED_FACTS',purpose:protectedBy},futureOutcomePrecomputed:false};
  }
  let selected=teamRow.responsibilities.find(r=>r.actorId===p.id)||teamRow.attackIntents.find(r=>r.actorId===p.id)||null;
  // D1 intentionally excludes goalkeepers from tactical duties.  This is a
  // snapshot-only HOLD row, not a Legacy goalkeeper assignment.
  if(!selected&&p.role==='GK')selected={actorId:p.id,duty:'HOLD',purpose:'D1_GK_CURRENT_POSITION_HOLD',approvedTargetRelation:null};
  if(!selected)throw new Error(`D3_INCOMPLETE_D_DECISION_ROW:${p.id}`);
  if(!DUTIES.has(selected.duty))throw new Error(`D3_UNKNOWN_D_DUTY:${p.id}:${selected.duty}`);
  const relation=relationshipFor(selected,p,teamRow.mode==='ATTACK'&&p.role!=='GK'),distance=Math.hypot(relation.targetPoint.x-p.x,relation.targetPoint.y-p.y);
  const sprint=['PRESS','MARK','COVER','RECOVER','ACTIVE_RUN'].includes(selected.duty)&&distance>1.05;
  return{teamId:p.team,actorId:p.id,duty:selected.duty,relationshipTargetId:relation.subjectId,targetPoint:relation.targetPoint,type:`D_${selected.duty}`,task:`D_${selected.duty}`,action:`D_${selected.duty}`,sprint,facing:{faceTargetAngle:angle({x:p.x,y:p.y},relation.facingPoint),bodyDirectionInput:p.bodyAngle},hold:{provenance:'D1_CURRENT_STATE_RELATION',purpose:relation.purpose,holdSatisfiedDistance:selected.approvedTargetRelation?.holdSatisfiedDistance||null},protectedBy:null,provenance:{source:relation.source,purpose:relation.purpose,subjectId:relation.subjectId,lifecycle:selected.lifecycle||null,continuity:selected.continuity||null},futureOutcomePrecomputed:false};
}
function buildExecutionEpoch(match){
  if(!D)throw new Error('D3_D1_MODULE_UNAVAILABLE');
  const prior=match.dExecutionRuntime?.priorDecision||null;
  const snapshot=D.buildSnapshot(match,prior),decision=D.decideEpoch(snapshot);
  const rows=snapshot.players.map(p=>dRow(snapshot,p,decision.teamDecisions[p.team]));
  if(rows.length!==snapshot.players.length||new Set(rows.map(r=>r.actorId)).size!==snapshot.players.length)throw new Error('D3_INCOMPLETE_D_CONTRACT_SET');
  if(rows.some(r=>!r.targetPoint||finite(r.targetPoint.x)==null||finite(r.targetPoint.y)==null||!r.duty||typeof r.sprint!=='boolean'||!r.facing||r.futureOutcomePrecomputed!==false))throw new Error('D3_UNSAFE_D_CONTRACT_ROW');
  return Object.freeze({snapshot,decision,rows:Object.freeze(rows.map(clone)),nextPriorDecision:D.priorFromDecision(decision),futureOutcomePrecomputed:false});
}
return{buildExecutionEpoch,protectedReason};
});
