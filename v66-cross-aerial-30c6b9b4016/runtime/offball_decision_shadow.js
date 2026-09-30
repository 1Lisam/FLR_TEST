(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FLRPG_OFFBALL_DECISION_SHADOW=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

/*
 * V57 D1 pure shadow decision model.
 *
 * This module has no live-match writer.  `observe` copies a bounded current-state
 * DTO and returns a decision plus isolated history for the caller to retain.
 * Legacy A/B/C remains the only gameplay authority.
 */

const HOME='HOME',AWAY='AWAY',TEAMS=[HOME,AWAY];
const DUTIES=new Set(['PRESS','MARK','COVER','ZONE','BALANCE','RECOVER','PRESS_SUPPORT','ATTACK_SUPPORT','ACTIVE_RUN','REST_DEFENCE','HOLD','PROTECTED']);
const TRANSFER_STATES=new Set(['OWNED','HANDOFF_REQUESTED','ACQUIRING','ACQUIRED','RELEASED','CANCELLED']);
const ADVANCE_TASK=/OVERLAP|UNDERLAP|INVERT|SURGE|ATTACK|SUPPORT|RUN/;
const RUN_TASK=/RUN|OVERLAP|UNDERLAP|SURGE|ATTACK_NEAR|ATTACK_BACK|BOX|RELEASE/;
const PRESS_TASK=/PRESS|ENGAGE|CLOSE_DOWN|CHASE/;

// D1 calibration bands are observable heuristics, not universal football truth.
const BANDS=Object.freeze({
  centralY:15,halfSpaceY:23,wideY:18,
  centralMaterialX:62,wideMaterialX:59,
  acquisitionDistance:{BALL:10,CENTRAL_FORWARD:15,CENTRAL_RUNNER:13.5,HALF_SPACE:13,WIDE:12.5,FLIGHT_RECEIVER:14},
  targetDistanceSlack:2.5,goalSideSlack:2.2,separatedThreatDistance:8,
  pressureDistance:14,coverDistance:20,restDepth:46
});

function finite(v,fallback=0){return Number.isFinite(Number(v))?Number(v):fallback;}
function nullableFinite(v){return Number.isFinite(Number(v))?Number(v):null;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function other(team){return team===HOME?AWAY:HOME;}
function local(team,p){return team===HOME?{x:p.x,y:p.y}:{x:105-p.x,y:68-p.y};}
function localVelocity(team,p){return team===HOME?{x:p.vx,y:p.vy}:{x:-p.vx,y:-p.vy};}
function world(team,p){return team===HOME?{x:p.x,y:p.y}:{x:105-p.x,y:68-p.y};}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function angleDiff(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
function byId(a,b){return String(a.id).localeCompare(String(b.id));}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function freezeDeep(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const key of Object.keys(value))freezeDeep(value[key]);
  return Object.freeze(value);
}
function selected(source,keys){
  if(!source||typeof source!=='object')return null;
  const out={};for(const key of keys)if(source[key]!==undefined)out[key]=clone(source[key]);
  return Object.keys(out).length?out:null;
}
function normalizePoint(p){return p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))?{x:finite(p.x),y:finite(p.y)}:null;}

function copyPlayer(p){
  const final=p.finalMovementIntent||null;
  return{
    id:String(p.id),team:p.team===AWAY?AWAY:HOME,role:String(p.role||''),slot:String(p.slot||p.role||''),
    x:finite(p.x),y:finite(p.y),vx:finite(p.vx),vy:finite(p.vy),
    bodyAngle:nullableFinite(p.bodyAngle),facing:nullableFinite(p.faceTargetAngle),
    hasBall:!!p.hasBall,
    legacy:{
      tx:nullableFinite(p.tx),ty:nullableFinite(p.ty),action:p.action||null,tacticalTask:p.tacticalTask||null,
      markTargetId:p.markTargetId||null,responsibilityType:p.responsibilityType||null,
      responsibilityTargetId:p.responsibilityTargetId||null,
      finalMovementIntent:final?{
        targetPoint:normalizePoint(final.targetPoint)||((Number.isFinite(final.x)&&Number.isFinite(final.y))?{x:finite(final.x),y:finite(final.y)}:null),
        type:final.type||null,targetId:final.targetId||null,reason:final.reason||null,writer:final.writer||null
      }:null
    },
    ability:selected(p,['pace','acceleration','agility','stamina','positioning','marking','workRate'])
  };
}

function copyRestart(r){
  if(!r)return null;
  const setup=r.setup||{};
  const targetRows=Object.entries(setup.targets||{}).sort(([a],[b])=>a.localeCompare(b)).map(([id,t])=>({
    id,task:t?.task||null,x:nullableFinite(t?.x),y:nullableFinite(t?.y)
  }));
  return{
    kind:r.kind||null,team:r.team||null,stage:r.stage||null,x:nullableFinite(r.x),y:nullableFinite(r.y),
    setup:{kickerId:setup.kickerId||null,targets:targetRows},
    userRestartChoice:selected(r.userRestartChoice,['playerId','choiceId','targetId','inputSource','armedAt','futureOutcomePrecomputed'])
  };
}

function copySetPieceLive(s){
  if(!s)return null;
  return{
    kind:s.kind||null,team:s.team||null,startedAt:nullableFinite(s.startedAt),maxUntil:nullableFinite(s.maxUntil),
    roles:Object.entries(s.roles||{}).sort(([a],[b])=>a.localeCompare(b)).map(([id,r])=>({id,role:typeof r==='string'?r:(r?.role||r?.task||null)})),
    firstOutcome:s.firstOutcome?selected(s.firstOutcome,['type','team','playerId','targetId','at']):null
  };
}

function buildSnapshot(match,priorShadowDecision=null){
  if(!match||!Array.isArray(match.players)||!match.ball)throw new TypeError('D1_SHADOW_REQUIRES_CURRENT_MATCH_STATE');
  const ball=match.ball;
  const snapshot={
    schemaVersion:'V57_D1_IMMUTABLE_SNAPSHOT_1',
    epoch:{time:finite(match.time),phase:String(match.phase||''),ballAge:finite(ball.age)},
    possession:match.possession||null,
    phase:String(match.phase||''),
    ball:{
      mode:ball.mode||null,kind:ball.kind||null,ownerId:ball.ownerId||null,
      intendedReceiverId:ball.intendedReceiverId||null,flightReceiverId:ball.flightReceiverId||ball.intendedReceiverId||null,
      x:finite(ball.x),y:finite(ball.y),z:finite(ball.z),vx:finite(ball.vx),vy:finite(ball.vy),vz:finite(ball.vz),
      lastTouchTeam:ball.lastTouchTeam||match.lastTouchTeam||null,lastTouchPlayer:ball.lastTouchPlayer||match.lastTouchPlayer||null
    },
    restart:copyRestart(match.restart),setPieceLive:copySetPieceLive(match.setPieceLive),
    tacticalProfiles:{
      HOME:selected(match.managerProfiles?.HOME,['attacking','pressing','lineHeight','transition','directness']),
      AWAY:selected(match.managerProfiles?.AWAY,['attacking','pressing','lineHeight','transition','directness']),
      legacyProfileIds:selected(match.tactical?.profile,['HOME','AWAY'])
    },
    protectedFacts:{
      protagonistControllerId:match.protagonistControllerId||null,
      ballOwnerId:ball.ownerId||null,
      actualFlightReceiverId:ball.flightReceiverId||ball.intendedReceiverId||null,
      incomingIntent:selected(match.userIncomingIntent,['playerId','choiceId','targetId','sourceId','flightKind','setAt','expiresAt','futureOutcomePrecomputed']),
      restartChoice:match.restart?.userRestartChoice?selected(match.restart.userRestartChoice,['playerId','choiceId','targetId','inputSource','armedAt','futureOutcomePrecomputed']):null
    },
    players:match.players.map(copyPlayer).sort(byId),
    priorShadowDecision:clone(priorShadowDecision)
  };
  return freezeDeep(snapshot);
}

function playerMap(snapshot){return new Map(snapshot.players.map(p=>[p.id,p]));}
function routeKind(team,p){
  const q=local(team,p),dy=Math.abs(q.y-34);
  if(p.role==='ST'&&dy<=BANDS.centralY)return'CENTRAL_FORWARD';
  if(['CM','WF'].includes(p.role)&&dy<=BANDS.centralY)return'CENTRAL_RUNNER';
  if(dy<=BANDS.halfSpaceY&&dy>BANDS.centralY)return'HALF_SPACE';
  if(['WF','FB'].includes(p.role)&&dy>=BANDS.wideY)return'WIDE';
  return null;
}
function routeMaterial(team,p,kind){
  const q=local(team,p),v=localVelocity(team,p),towardGoal=Math.max(0,-v.x);
  const depth=kind==='WIDE'?BANDS.wideMaterialX:BANDS.centralMaterialX;
  const entryPressure=Math.max(0,depth-q.x)+towardGoal*1.2;
  return{material:q.x<=depth||towardGoal>=1.5,entryPressure:Number(entryPressure.toFixed(4)),towardGoal:Number(towardGoal.toFixed(4))};
}

function deriveDangerFacts(snapshot,team){
  if(!TEAMS.includes(team))throw new TypeError('D1_SHADOW_TEAM_REQUIRED');
  const opponents=snapshot.players.filter(p=>p.team===other(team)&&p.role!=='GK');
  const rows=[];
  for(const p of opponents){
    const kind=routeKind(team,p);if(!kind)continue;
    const mat=routeMaterial(team,p,kind);if(!mat.material)continue;
    const q=local(team,p),priority=(kind==='CENTRAL_FORWARD'?80:kind==='CENTRAL_RUNNER'?70:kind==='HALF_SPACE'?65:60)+mat.entryPressure;
    rows.push({
      id:`ROUTE:${p.id}`,subjectId:p.id,kind,priority:Number(priority.toFixed(4)),
      localPosition:{x:q.x,y:q.y},localVelocity:localVelocity(team,p),
      currentFacts:{entryPressure:mat.entryPressure,towardGoal:mat.towardGoal,goalSideLane:{from:{x:q.x,y:q.y},to:{x:0,y:34}}},
      sources:['CURRENT_POSITION','CURRENT_VELOCITY','CURRENT_ENTRY_LANE']
    });
  }
  const owner=opponents.find(p=>p.id===snapshot.ball.ownerId);
  const carrier=owner?{
    id:`BALL:${owner.id}`,subjectId:owner.id,kind:'BALL',priority:120,
    localPosition:local(team,owner),localVelocity:localVelocity(team,owner),
    currentFacts:{pressureDistance:null,ball:{x:snapshot.ball.x,y:snapshot.ball.y}},sources:['CURRENT_BALL_OWNER']
  }:null;
  const receiver=snapshot.ball.mode==='FLIGHT'?opponents.find(p=>p.id===snapshot.ball.flightReceiverId):null;
  const flight=receiver?{
    id:`FLIGHT:${receiver.id}`,subjectId:receiver.id,kind:'FLIGHT_RECEIVER',priority:105,
    localPosition:local(team,receiver),localVelocity:localVelocity(team,receiver),
    currentFacts:{corridor:{from:local(team,snapshot.ball),to:local(team,receiver)},ballVelocity:localVelocity(team,snapshot.ball)},
    sources:['ACTUAL_CURRENT_FLIGHT_RECEIVER','CURRENT_FLIGHT_CORRIDOR']
  }:null;
  const merged=new Map();
  for(const r of rows){
    const old=merged.get(r.subjectId);
    if(!old||r.priority>old.priority)merged.set(r.subjectId,r);
    else old.sources=[...new Set([...old.sources,...r.sources])].sort();
  }
  const routes=[...merged.values()].sort((a,b)=>b.priority-a.priority||a.subjectId.localeCompare(b.subjectId));
  const uncovered=routes.map(r=>r.id);
  return freezeDeep({
    schemaVersion:'V57_D1_CURRENT_DANGER_1',team,carrier,flightReceiver:flight,routes,
    routeSummary:{centralForward:routes.filter(r=>r.kind==='CENTRAL_FORWARD').map(r=>r.subjectId),centralRunner:routes.filter(r=>r.kind==='CENTRAL_RUNNER').map(r=>r.subjectId),halfSpace:routes.filter(r=>r.kind==='HALF_SPACE').map(r=>r.subjectId),wide:routes.filter(r=>r.kind==='WIDE').map(r=>r.subjectId)},
    uncoveredRouteIds:uncovered,degradedRouteIds:[],futureOutcomePrecomputed:false
  });
}

function roleBias(actor,threat){
  const kind=threat.kind;
  if(kind==='CENTRAL_FORWARD')return actor.role==='CB'?-7:actor.role==='CM'?-2:actor.role==='FB'?1:7;
  if(kind==='CENTRAL_RUNNER')return actor.role==='CM'?-7:actor.role==='CB'?-2:actor.role==='FB'?1:7;
  if(kind==='WIDE'||kind==='HALF_SPACE'){
    const side=Math.sign(threat.localPosition.y-34),actorSide=/^L/.test(actor.slot)?-1:/^R/.test(actor.slot)?1:0;
    return actor.role==='FB'&&(!side||actorSide===side)?-8:actor.role==='CM'?-2:actor.role==='CB'?2:actor.role==='WF'?4:8;
  }
  return 0;
}
function candidateJurisdiction(actor,threat){
  const emergency=Number(threat.currentFacts?.entryPressure||0)>=24;
  const tactical=/DEEP_TRACK|TRACK_BACK|MARK/.test(String(actor.legacy?.tacticalTask||actor.legacy?.action||''));
  if(actor.role==='ST'&&!emergency&&!tactical)return{eligible:false,reason:'ST_DEEP_PRIMARY_REQUIRES_TACTICAL_OR_EMERGENCY'};
  if(actor.role==='WF'){
    const side=Math.sign(threat.localPosition.y-34),actorSide=/^L/.test(actor.slot)?-1:/^R/.test(actor.slot)?1:0;
    if(!['WIDE','HALF_SPACE'].includes(threat.kind))return{eligible:false,reason:'WF_PRIMARY_OUTSIDE_WIDE_JURISDICTION'};
    if(side&&actorSide&&side!==actorSide)return{eligible:false,reason:'WF_OPPOSITE_SIDE_PRIMARY_REJECTED'};
    if(!emergency&&!tactical)return{eligible:false,reason:'WF_DEEP_PRIMARY_REQUIRES_TACTICAL_OR_EMERGENCY'};
  }
  return{eligible:true,reason:emergency?'CURRENT_EMERGENCY':tactical?'EXPLICIT_TACTICAL_TRACKING':'SOFT_ROLE_JURISDICTION'};
}
function protectedReason(snapshot,actor){
  const f=snapshot.protectedFacts;
  if(actor.id===f.protagonistControllerId)return'PROTAGONIST_CONTROLLER';
  if(actor.id===f.ballOwnerId)return'CURRENT_BALL_OWNER';
  if(actor.id===f.actualFlightReceiverId)return'ACTUAL_FLIGHT_RECEIVER';
  if(actor.id===snapshot.restart?.setup?.kickerId)return'RESTART_KICKER';
  if(snapshot.restart?.setup?.targets?.some(x=>x.id===actor.id&&/WALL|KICKER/.test(String(x.task))))return'RESTART_ROLE';
  if(snapshot.setPieceLive?.roles?.some(x=>x.id===actor.id))return'SET_PIECE_LIVE_ROLE';
  return null;
}
function relationshipTarget(team,threat,duty='MARK'){
  const t=threat.localPosition,gap=duty==='COVER'?5.2:duty==='PRESS'?1.8:2.6;
  const towardCentre=clamp((34-t.y)*.16,-2.4,2.4);
  const q={x:clamp(t.x-gap,2.5,102.5),y:clamp(t.y+towardCentre,3,65)};
  return{
    purpose:duty==='PRESS'?'PRESS_CURRENT_CARRIER':duty==='COVER'?'PROTECT_ENTRY_LANE_BEHIND_PRIMARY':'PROTECT_GOAL_SIDE_ENTRY_LANE',
    subjectId:threat.subjectId,targetPoint:world(team,q),facingPoint:world(team,t),holdSatisfiedDistance:duty==='COVER'?1.5:1.1
  };
}

function assessAcquisition(snapshot,team,actorOrId,threat,approvedRelation,mandatory=[]){
  const players=playerMap(snapshot),actor=typeof actorOrId==='string'?players.get(actorOrId):actorOrId;
  const subject=players.get(threat?.subjectId),failures=[];
  if(!actor||actor.team!==team||actor.role==='GK')failures.push('INELIGIBLE_ACTOR');
  if(!subject||subject.team===team)failures.push('MISSING_CURRENT_THREAT');
  const protectedBy=actor?protectedReason(snapshot,actor):null;if(protectedBy)failures.push(`PROTECTED_${protectedBy}`);
  if(!approvedRelation||approvedRelation.subjectId!==threat?.subjectId||!normalizePoint(approvedRelation.targetPoint))failures.push('APPROVED_RELATION_MISSING');
  let geometry=null;
  if(actor&&subject){
    const a=local(team,actor),t=local(team,subject),v=localVelocity(team,actor),d=distance(a,t);
    const limit=BANDS.acquisitionDistance[threat.kind]||13;
    const goalSide=a.x<=t.x+BANDS.goalSideSlack;
    const desired=Math.atan2(subject.y-actor.y,subject.x-actor.x),facing=actor.facing??actor.bodyAngle;
    const facingError=facing==null?null:Math.abs(angleDiff(facing,desired));
    const separating=(a.x-t.x)*v.x+(a.y-t.y)*v.y>Math.max(4,d*.55);
    geometry={distance:d,limit,goalSide,facingError,separating};
    if(d>limit)failures.push('BODY_TOO_FAR');
    if(!goalSide)failures.push('BODY_NOT_GOAL_SIDE');
    if(facingError!=null&&facingError>2.62&&d>4.5)failures.push('BODY_FACING_AWAY');
    if(separating&&d>limit*.72)failures.push('BODY_ABANDONING_RELATION');
  }
  if(approvedRelation&&subject&&normalizePoint(approvedRelation.targetPoint)){
    const q=local(team,approvedRelation.targetPoint),t=local(team,subject),limit=(BANDS.acquisitionDistance[threat.kind]||13)+BANDS.targetDistanceSlack;
    if(distance(q,t)>limit)failures.push('TARGET_LEAVES_THREAT');
    if(q.x>t.x+BANDS.goalSideSlack)failures.push('TARGET_NOT_GOAL_SIDE');
    if(!/PROTECT|PRESS/.test(String(approvedRelation.purpose||'')))failures.push('TARGET_PURPOSE_INCOMPATIBLE');
  }
  const incompatible=mandatory.find(x=>x.actorId===actor?.id&&x.subjectId!==threat?.subjectId&&x.state==='ACQUIRED'&&x.primary!==false);
  if(incompatible){
    const otherSubject=players.get(incompatible.subjectId);
    if(!otherSubject||!subject||distance(otherSubject,subject)>BANDS.separatedThreatDistance)failures.push('SOLE_MANDATORY_DUTY_CONFLICT');
  }
  return freezeDeep({acquired:failures.length===0,failures,geometry,approvedTargetRelation:clone(approvedRelation)});
}

function priorTeam(snapshot,team){return snapshot.priorShadowDecision?.teamDecisions?.[team]||null;}
function priorOwners(snapshot,team){
  const rows=priorTeam(snapshot,team)?.responsibilities||[];
  const map=new Map();
  for(const r of rows)if(r.subjectId&&['MARK','PRESS'].includes(r.duty)&&['OWNED','ACQUIRED'].includes(r.lifecycle))map.set(r.subjectId,r);
  return map;
}
function threatCandidates(snapshot,team,threat,reserved,mandatory){
  const players=snapshot.players.filter(p=>p.team===team&&p.role!=='GK'&&!reserved.has(p.id)&&!protectedReason(snapshot,p));
  return players.map(actor=>{
    const jurisdiction=candidateJurisdiction(actor,threat);if(!jurisdiction.eligible)return null;
    const relation=relationshipTarget(team,threat,'MARK'),assessment=assessAcquisition(snapshot,team,actor,threat,relation,mandatory);
    const score=distance(local(team,actor),threat.localPosition)+roleBias(actor,threat)+(assessment.acquired?0:40);
    return{actor,relation,assessment,score,jurisdiction};
  }).filter(Boolean).sort((a,b)=>a.score-b.score||a.actor.id.localeCompare(b.actor.id));
}
function transfer(id,threat,predecessorId,successorId,state,at,reason,geometry=null){
  if(!TRANSFER_STATES.has(state))throw new Error(`INVALID_TRANSFER_STATE:${state}`);
  return{id,threatId:threat.id,subjectId:threat.subjectId,predecessorId:predecessorId||null,successorId:successorId||null,state,at,reason,geometry:clone(geometry)};
}

function buildProtectionDraft(snapshot,team,danger){
  const at=snapshot.epoch.time,prior=priorOwners(snapshot,team),priorRows=priorTeam(snapshot,team)?.responsibilities||[],reserved=new Set(),mandatory=[],responsibilities=[],transfers=[],deficits=[];
  const threats=danger.routes.slice();
  if(danger.flightReceiver&&!threats.some(x=>x.subjectId===danger.flightReceiver.subjectId))threats.unshift(danger.flightReceiver);
  const seenThreat=new Set();
  for(const threat of threats.sort((a,b)=>b.priority-a.priority||a.subjectId.localeCompare(b.subjectId))){
    if(seenThreat.has(threat.subjectId))continue;seenThreat.add(threat.subjectId);
    const old=prior.get(threat.subjectId),oldActor=old?snapshot.players.find(p=>p.id===old.actorId):null;
    const relation=relationshipTarget(team,threat,'MARK');
    const oldAssessment=oldActor&&!reserved.has(oldActor.id)?assessAcquisition(snapshot,team,oldActor,threat,relation,mandatory):null;
    if(oldAssessment?.acquired){
      reserved.add(oldActor.id);mandatory.push({actorId:oldActor.id,subjectId:threat.subjectId,state:'ACQUIRED',primary:true});
      responsibilities.push({actorId:oldActor.id,duty:'MARK',subjectId:threat.subjectId,threatId:threat.id,lifecycle:'OWNED',continuity:'VALID_PRIOR_PROTECTION_RETAINED',approvedTargetRelation:relation,acquisition:oldAssessment});
      continue;
    }
    const choices=threatCandidates(snapshot,team,threat,reserved,mandatory),acquired=choices.find(x=>x.assessment.acquired)||null,nearest=choices[0]||null;
    if(acquired){
      reserved.add(acquired.actor.id);mandatory.push({actorId:acquired.actor.id,subjectId:threat.subjectId,state:'ACQUIRED',primary:true});
      responsibilities.push({actorId:acquired.actor.id,duty:'MARK',subjectId:threat.subjectId,threatId:threat.id,lifecycle:'ACQUIRED',continuity:old?'VALID_SAME_TICK_HANDOFF':'CURRENT_GEOMETRY_ACQUIRED',approvedTargetRelation:acquired.relation,acquisition:acquired.assessment});
      if(old&&old.actorId!==acquired.actor.id){
        const tid=`${team}:${threat.subjectId}:${at}`;
        transfers.push(transfer(tid,threat,old.actorId,acquired.actor.id,'HANDOFF_REQUESTED',at,'PRIOR_INVALID_REPLACEMENT_REQUESTED',oldAssessment));
        transfers.push(transfer(tid,threat,old.actorId,acquired.actor.id,'ACQUIRED',at,'SUCCESSOR_CURRENT_GEOMETRY_AND_DUTY_VALID',acquired.assessment));
        transfers.push(transfer(tid,threat,old.actorId,acquired.actor.id,'RELEASED',at,'ACQUIRE_BEFORE_RELEASE',acquired.assessment));
      }
    }else{
      if(nearest){
        reserved.add(nearest.actor.id);
        responsibilities.push({actorId:nearest.actor.id,duty:'RECOVER',subjectId:threat.subjectId,threatId:threat.id,lifecycle:'ACQUIRING',continuity:'NOMINATED_NOT_ACQUIRED',approvedTargetRelation:nearest.relation,acquisition:nearest.assessment});
        if(old){const tid=`${team}:${threat.subjectId}:${at}`;transfers.push(transfer(tid,threat,old.actorId,nearest.actor.id,'HANDOFF_REQUESTED',at,'SUCCESSOR_NOMINATED',oldAssessment));transfers.push(transfer(tid,threat,old.actorId,nearest.actor.id,'ACQUIRING',at,'CURRENT_GEOMETRY_NOT_ACQUIRED',nearest.assessment));}
      }
      deficits.push({threatId:threat.id,subjectId:threat.subjectId,status:old?'DEGRADED':'UNOWNED',reason:nearest?'SUCCESSOR_NOT_ACQUIRED':'NO_DUTY_COMPATIBLE_SUCCESSOR'});
    }
  }
  for(const [subjectId,old] of prior){
    if(seenThreat.has(subjectId))continue;
    const pseudo={id:old.threatId||`ENDED:${subjectId}`,subjectId};
    transfers.push(transfer(`${team}:${subjectId}:${at}`,pseudo,old.actorId,null,'RELEASED',at,'CURRENT_THREAT_ENDED'));
  }
  for(const old of priorRows){
    if(!old.subjectId||seenThreat.has(old.subjectId)||!['ACQUIRING','HANDOFF_REQUESTED'].includes(old.lifecycle))continue;
    const pseudo={id:old.threatId||`ENDED:${old.subjectId}`,subjectId:old.subjectId};
    transfers.push(transfer(`${team}:${old.subjectId}:${at}`,pseudo,old.predecessorId||null,old.actorId||null,'CANCELLED',at,'CURRENT_THREAT_ENDED_DURING_ACQUISITION'));
  }
  return{responsibilities,transfers,deficits,reserved,mandatory};
}

function selectPressure(snapshot,team,danger,draft){
  const carrier=danger.carrier;if(!carrier)return null;
  const priorOnCarrier=draft.responsibilities.find(r=>r.subjectId===carrier.subjectId&&r.duty==='MARK'&&['OWNED','ACQUIRED'].includes(r.lifecycle));
  if(priorOnCarrier){priorOnCarrier.duty='PRESS';priorOnCarrier.threatId=carrier.id;priorOnCarrier.approvedTargetRelation=relationshipTarget(team,carrier,'PRESS');priorOnCarrier.continuity='MARK_TO_PRESS_SAME_CURRENT_SUBJECT';return priorOnCarrier;}
  const candidates=snapshot.players.filter(p=>p.team===team&&p.role!=='GK'&&!draft.reserved.has(p.id)&&!protectedReason(snapshot,p)).map(actor=>({actor,d:distance(local(team,actor),carrier.localPosition),bias:['ST','WF','CM'].includes(actor.role)?-2:0})).sort((a,b)=>(a.d+a.bias)-(b.d+b.bias)||a.actor.id.localeCompare(b.actor.id));
  const pick=candidates[0];if(!pick||pick.d>BANDS.pressureDistance){draft.deficits.push({threatId:carrier.id,subjectId:carrier.subjectId,status:'DEFICIT',reason:'NO_CURRENT_PRESSURE_OWNER_IN_RANGE'});return null;}
  const relation=relationshipTarget(team,carrier,'PRESS'),assessment=assessAcquisition(snapshot,team,pick.actor,carrier,relation,draft.mandatory);
  draft.reserved.add(pick.actor.id);draft.mandatory.push({actorId:pick.actor.id,subjectId:carrier.subjectId,state:assessment.acquired?'ACQUIRED':'ACQUIRING',primary:true});
  const row={actorId:pick.actor.id,duty:'PRESS',subjectId:carrier.subjectId,threatId:carrier.id,lifecycle:assessment.acquired?'ACQUIRED':'ACQUIRING',continuity:'PRESS_SEPARATE_FROM_UNRELATED_MARK',approvedTargetRelation:relation,acquisition:assessment};
  draft.responsibilities.push(row);if(!assessment.acquired)draft.deficits.push({threatId:carrier.id,subjectId:carrier.subjectId,status:'DEGRADED',reason:'PRESSURE_ACTOR_APPROACHING_NOT_ACQUIRED'});return row;
}

function selectCover(snapshot,team,danger,draft,pressure){
  if(!pressure||!danger.carrier)return null;
  const carrier=danger.carrier,candidates=snapshot.players.filter(p=>p.team===team&&['CB','CM','FB'].includes(p.role)&&!draft.reserved.has(p.id)&&!protectedReason(snapshot,p)).map(actor=>{
    const a=local(team,actor),d=distance(a,carrier.localPosition),goalSide=a.x<=carrier.localPosition.x;
    return{actor,d,score:d+(goalSide?-4:8)+(actor.role==='CB'?-2:0)};
  }).filter(x=>x.d<=BANDS.coverDistance&&local(team,x.actor).x<=carrier.localPosition.x).sort((a,b)=>a.score-b.score||a.actor.id.localeCompare(b.actor.id));
  const pick=candidates[0];if(!pick)return null;
  const relation=relationshipTarget(team,carrier,'COVER');
  const row={actorId:pick.actor.id,duty:'COVER',subjectId:carrier.subjectId,threatId:carrier.id,lifecycle:'ACQUIRED',continuity:'PRESS_COVER_SEPARATED',approvedTargetRelation:relation,acquisition:{acquired:true,failures:[],geometry:{distance:pick.d,goalSide:local(team,pick.actor).x<=carrier.localPosition.x}}};
  draft.reserved.add(pick.actor.id);draft.responsibilities.push(row);return row;
}

function restStructure(snapshot,team,excludedId=null){
  const rows=snapshot.players.filter(p=>p.team===team&&p.role!=='GK'&&p.id!==excludedId).map(p=>({p,q:local(team,p)}));
  const central=rows.filter(x=>['CB','CM','FB'].includes(x.p.role)&&x.q.x<=BANDS.restDepth&&Math.abs(x.q.y-34)<=19).length;
  const left=rows.filter(x=>['CB','CM','FB'].includes(x.p.role)&&x.q.x<=BANDS.restDepth&&x.q.y<=34).length;
  const right=rows.filter(x=>['CB','CM','FB'].includes(x.p.role)&&x.q.x<=BANDS.restDepth&&x.q.y>=34).length;
  return{central,left,right};
}
function sameSideThreats(team,fb,danger){
  const sign=/^L/.test(fb.slot)?-1:/^R/.test(fb.slot)?1:0;
  return danger.routes.filter(t=>['WIDE','HALF_SPACE'].includes(t.kind)&&(!sign||Math.sign(t.localPosition.y-34)===sign));
}
function acquiredByOther(draft,fb,threat){return draft.responsibilities.some(r=>r.actorId!==fb.id&&r.subjectId===threat.subjectId&&['OWNED','ACQUIRED'].includes(r.lifecycle)&&['MARK','COVER'].includes(r.duty));}

function attackIntents(snapshot,team,danger,draft){
  const intents=[];
  for(const p of snapshot.players.filter(x=>x.team===team&&x.role!=='GK')){
    const protectedBy=protectedReason(snapshot,p);
    if(protectedBy){intents.push({actorId:p.id,duty:'PROTECTED',purpose:protectedBy,approvedTargetRelation:null});continue;}
    const legacy=String(p.legacy.tacticalTask||p.legacy.action||p.legacy.finalMovementIntent?.type||'');
    if(p.role==='FB'){
      const wantsAdvance=ADVANCE_TASK.test(legacy),threats=sameSideThreats(team,p,danger),structure=restStructure(snapshot,team,p.id),covered=threats.every(t=>acquiredByOther(draft,p,t));
      const safe=!threats.length||(covered&&structure.central>=2&&structure.left>=1&&structure.right>=1);
      const duty=wantsAdvance&&safe?(RUN_TASK.test(legacy)?'ACTIVE_RUN':'ATTACK_SUPPORT'):(wantsAdvance?'REST_DEFENCE':'BALANCE');
      intents.push({actorId:p.id,duty,purpose:wantsAdvance?(safe?'FB_ADVANCE_CURRENT_COVER_CONFIRMED':'FB_ADVANCE_GATED_CURRENT_COVER_MISSING'):'FB_BALANCE_CURRENT_RELATION',requestedLegacyRelationship:legacy||null,safety:{sameSideThreatIds:threats.map(t=>t.id),successorAcquiredNow:covered,restStructure:structure,weakSideProtected:structure.left>=1&&structure.right>=1,approved:safe}});
      continue;
    }
    const moving=Math.hypot(p.vx,p.vy)>.35,duty=RUN_TASK.test(legacy)&&moving?'ACTIVE_RUN':p.role==='CB'?'REST_DEFENCE':'ATTACK_SUPPORT';
    const target=p.legacy.finalMovementIntent?.targetPoint||(p.legacy.tx!=null&&p.legacy.ty!=null?{x:p.legacy.tx,y:p.legacy.ty}:null);
    intents.push({actorId:p.id,duty,purpose:duty==='REST_DEFENCE'?'CENTRAL_REST_STRUCTURE':duty==='ACTIVE_RUN'?'CURRENT_RELATION_RUN':'CURRENT_RELATION_SUPPORT',approvedTargetRelation:target?{purpose:'DIAGNOSTIC_CURRENT_RELATION',targetPoint:target}:null,hold:!!target&&distance(p,target)<=1.1});
  }
  return intents.sort((a,b)=>a.actorId.localeCompare(b.actorId));
}
function defensiveRemainders(snapshot,team,draft){
  const rows=[];
  for(const p of snapshot.players.filter(x=>x.team===team&&x.role!=='GK').sort(byId)){
    if(draft.reserved.has(p.id)||draft.responsibilities.some(r=>r.actorId===p.id))continue;
    const protectedBy=protectedReason(snapshot,p);
    rows.push({actorId:p.id,duty:protectedBy?'PROTECTED':PRESS_TASK.test(String(p.legacy.tacticalTask||''))?'PRESS_SUPPORT':p.role==='CB'?'BALANCE':'ZONE',subjectId:null,threatId:null,lifecycle:'OWNED',continuity:protectedBy||'CURRENT_TEAM_SHAPE_RELATION',approvedTargetRelation:null});
  }
  return rows;
}
function rejectCircularHandoffs(transfers){
  const acquiring=transfers.filter(t=>['HANDOFF_REQUESTED','ACQUIRING'].includes(t.state)&&t.predecessorId&&t.successorId);
  const edges=new Set(acquiring.map(t=>`${t.predecessorId}>${t.successorId}`));
  const cycles=[];for(const e of edges){const[a,b]=e.split('>');if(a===b||!edges.has(`${b}>${a}`))continue;const abAcquired=transfers.some(t=>t.predecessorId===a&&t.successorId===b&&t.state==='ACQUIRED'),baAcquired=transfers.some(t=>t.predecessorId===b&&t.successorId===a&&t.state==='ACQUIRED');if(!(abAcquired&&baAcquired))cycles.push([a,b].sort().join('<>'));}
  return[...new Set(cycles)].sort();
}

function decideTeam(snapshot,team,dangerOverride=null){
  const danger=dangerOverride||deriveDangerFacts(snapshot,team),draft=buildProtectionDraft(snapshot,team,danger),pressure=selectPressure(snapshot,team,danger,draft),cover=selectCover(snapshot,team,danger,draft,pressure);
  const circular=rejectCircularHandoffs(draft.transfers);
  if(circular.length){
    for(const key of circular){const[a,b]=key.split('<>');for(const t of draft.transfers)if((t.predecessorId===a&&t.successorId===b)||(t.predecessorId===b&&t.successorId===a))t.state='CANCELLED';}
    draft.deficits.push({status:'DEGRADED',reason:'CIRCULAR_HANDOFF_REJECTED',cycles:circular});
  }
  const defending=snapshot.possession!==team,attack=attackIntents(snapshot,team,danger,draft);
  const responsibilities=[...draft.responsibilities,...(defending?defensiveRemainders(snapshot,team,draft):[])].sort((a,b)=>a.actorId.localeCompare(b.actorId)||String(a.subjectId).localeCompare(String(b.subjectId)));
  const uncovered=new Set(danger.routes.map(x=>x.id));for(const r of responsibilities)if(['OWNED','ACQUIRED'].includes(r.lifecycle))uncovered.delete(r.threatId);
  return freezeDeep({
    schemaVersion:'V57_D1_TEAM_DRAFT_1',team,mode:defending?'DEFEND':'ATTACK',snapshotEpoch:clone(snapshot.epoch),
    danger,responsibilities,attackIntents:attack,transfers:draft.transfers,
    primaryPressureOwnerId:pressure?.actorId||null,coverOwnerId:cover?.actorId||null,
    diagnostics:{uncoveredRouteIds:[...uncovered].sort(),deficits:draft.deficits,circularHandoffsRejected:circular,legacyLabelsAcceptedWithoutGeometry:false},
    authority:'SHADOW_OBSERVATION_ONLY',futureOutcomePrecomputed:false
  });
}

function semanticProjection(result){
  const projectTeam=t=>({
    team:t.team,mode:t.mode,primaryPressureOwnerId:t.primaryPressureOwnerId,coverOwnerId:t.coverOwnerId,
    responsibilities:t.responsibilities.map(r=>({actorId:r.actorId,duty:r.duty,subjectId:r.subjectId,lifecycle:r.lifecycle,continuity:r.continuity})),
    attackIntents:t.attackIntents.map(r=>({actorId:r.actorId,duty:r.duty,purpose:r.purpose,safety:r.safety||null})),
    transfers:t.transfers.map(x=>({threatId:x.threatId,predecessorId:x.predecessorId,successorId:x.successorId,state:x.state,reason:x.reason})),
    deficits:t.diagnostics.deficits
  });
  return{schemaVersion:result.schemaVersion,snapshotId:result.snapshotId,HOME:projectTeam(result.teamDecisions.HOME),AWAY:projectTeam(result.teamDecisions.AWAY)};
}
function snapshotId(snapshot){
  const s=[snapshot.epoch.time,snapshot.epoch.phase,snapshot.ball.mode,snapshot.ball.ownerId,snapshot.ball.flightReceiverId,...snapshot.players.map(p=>`${p.id}:${p.x.toFixed(4)}:${p.y.toFixed(4)}:${p.vx.toFixed(4)}:${p.vy.toFixed(4)}`)].join('|');
  let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return`D1-${(h>>>0).toString(16).padStart(8,'0')}`;
}
function decideEpoch(snapshot){
  if(!Object.isFrozen(snapshot)||!Object.isFrozen(snapshot.players))throw new TypeError('D1_SHADOW_EXPECTS_IMMUTABLE_SNAPSHOT');
  const homeDanger=deriveDangerFacts(snapshot,HOME),awayDanger=deriveDangerFacts(snapshot,AWAY);
  const result={
    schemaVersion:'V57_D1_SHADOW_DECISION_1',snapshotId:snapshotId(snapshot),snapshotEpoch:clone(snapshot.epoch),
    teamDecisions:{HOME:decideTeam(snapshot,HOME,homeDanger),AWAY:decideTeam(snapshot,AWAY,awayDanger)},
    sameImmutableSnapshotForBothTeams:true,authority:'SHADOW_OBSERVATION_ONLY',gameplayWrites:0,rngReads:0,futureOutcomePrecomputed:false
  };
  return freezeDeep(result);
}
function priorFromDecision(decision){return freezeDeep(clone(decision));}
function observe(match,priorShadowDecision=null){
  const snapshot=buildSnapshot(match,priorShadowDecision),decision=decideEpoch(snapshot);
  return freezeDeep({snapshot,decision,nextPriorShadowDecision:priorFromDecision(decision)});
}

return{
  HOME,AWAY,BANDS,DUTIES,TRANSFER_STATES,
  buildSnapshot,deriveDangerFacts,relationshipTarget,assessAcquisition,rejectCircularHandoffs,
  decideTeam,decideEpoch,priorFromDecision,observe,semanticProjection
};
});
