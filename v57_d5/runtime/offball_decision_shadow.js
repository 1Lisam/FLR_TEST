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
  pressureDistance:14,coverDistance:20,restDepth:46,
  // Shape-continuity bands describe a usable CB connection, not a forbidden
  // zone.  A current carrier/receiver or an immediate goalward lane can still
  // justify a step beyond them when the present snapshot supplies cover.
  cbConnectedDepth:12,cbCentralCoverY:12,cbSameFlankY:8,
  cbImmediateLaneDepth:10,cbGoalwardVelocity:.75
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
      tx:nullableFinite(p.tx),ty:nullableFinite(p.ty),action:p.action||null,tacticalTask:p.tacticalTask||null,sprint:!!p.sprint,
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
  for(const r of rows)if(r.subjectId&&['MARK','PRESS','RECOVER'].includes(r.duty)&&['OWNED','ACQUIRED','ACQUIRING'].includes(r.lifecycle))map.set(r.subjectId,r);
  return map;
}
function currentThreatClaim(snapshot,team,threat,old){
  if(!old||old.subjectId!==threat.subjectId)return{valid:false,reason:'PRIOR_SUBJECT_MISMATCH'};
  const actor=snapshot.players.find(p=>p.id===old.actorId);
  if(!actor||actor.team!==team||actor.role==='GK')return{valid:false,reason:'PRIOR_ACTOR_INVALID'};
  const protectedBy=protectedReason(snapshot,actor);if(protectedBy)return{valid:false,reason:`PRIOR_ACTOR_PROTECTED_${protectedBy}`};
  const jurisdiction=candidateJurisdiction(actor,threat);if(!jurisdiction.eligible)return{valid:false,reason:`PRIOR_ACTOR_OUTSIDE_JURISDICTION_${jurisdiction.reason}`};
  const shape=continuityShapeValidity(snapshot,team,actor,threat);
  if(!shape.valid)return{valid:false,reason:`PRIOR_SHAPE_INVALID_${shape.reason}`,actor,jurisdiction,shape,releaseToShape:true};
  return{valid:true,actor,jurisdiction,shape};
}
function median(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;}
function cbShapeFacts(snapshot,team,actor,threat){
  const a=local(team,actor),t=threat.localPosition,relation=relationshipTarget(team,threat,'MARK'),target=local(team,relation.targetPoint);
  const peers=snapshot.players.filter(p=>p.team===team&&p.role==='CB'&&p.id!==actor.id).map(p=>({actor:p,q:local(team,p)}));
  const partner=peers.slice().sort((u,v)=>distance(a,u.q)-distance(a,v.q)||u.actor.id.localeCompare(v.actor.id))[0]||null;
  const partnerPrior=partner?(priorTeam(snapshot,team)?.responsibilities||[]).find(r=>r.actorId===partner.actor.id&&['MARK','PRESS','RECOVER'].includes(r.duty)&&r.approvedTargetRelation?.targetPoint):null;
  const partnerCoverPosition=partnerPrior?local(team,partnerPrior.approvedTargetRelation.targetPoint):partner?.q||null;
  const backline=snapshot.players.filter(p=>p.team===team&&['CB','FB'].includes(p.role)&&p.id!==actor.id).map(p=>local(team,p));
  const lineDepth=median(peers.map(x=>x.q.x))??median(backline.map(x=>x.x))??a.x;
  const partnerDepthGap=partnerCoverPosition?target.x-partnerCoverPosition.x:0;
  const currentPartnerDepthGap=partner?a.x-partner.q.x:0;
  const actorSide=Math.sign(target.y-34),partnerSide=partnerCoverPosition?Math.sign(partnerCoverPosition.y-34):0;
  const sameFlankPair=!!partnerCoverPosition&&actorSide!==0&&actorSide===partnerSide&&Math.abs(target.y-34)>BANDS.cbSameFlankY&&Math.abs(partnerCoverPosition.y-34)>BANDS.cbSameFlankY;
  const currentActorSide=Math.sign(a.y-34),currentPartnerSide=partner?Math.sign(partner.q.y-34):0,currentSameFlankPair=!!partner&&currentActorSide!==0&&currentActorSide===currentPartnerSide&&Math.abs(a.y-34)>BANDS.cbSameFlankY&&Math.abs(partner.q.y-34)>BANDS.cbSameFlankY;
  const otherCentralCbs=partnerCoverPosition&&Math.abs(partnerCoverPosition.y-34)<=BANDS.cbCentralCoverY?1:0;
  const currentOtherCentralCbs=partner&&Math.abs(partner.q.y-34)<=BANDS.cbCentralCoverY?1:0;
  const leavesCentralLane=Math.abs(target.y-34)>BANDS.cbCentralCoverY&&otherCentralCbs===0;
  const currentlyLeavesCentralLane=Math.abs(a.y-34)>BANDS.cbCentralCoverY&&currentOtherCentralCbs===0;
  const currentCarrier=threat.subjectId===snapshot.ball.ownerId;
  const flightReceiver=snapshot.ball.mode==='FLIGHT'&&threat.subjectId===snapshot.ball.flightReceiverId;
  const laneDepth=t.x-lineDepth,immediateLane=['CENTRAL_FORWARD','CENTRAL_RUNNER','HALF_SPACE'].includes(threat.kind)&&Math.abs(t.y-34)<=BANDS.halfSpaceY&&laneDepth>=-2&&laneDepth<=BANDS.cbImmediateLaneDepth;
  const goalward=Number(threat.localVelocity?.x||0)<=-BANDS.cbGoalwardVelocity,goalwardImmediate=goalward&&laneDepth>=-2&&laneDepth<=BANDS.cbConnectedDepth&&Math.abs(t.y-34)<=BANDS.halfSpaceY;
  const emergency=['CENTRAL_FORWARD','CENTRAL_RUNNER','HALF_SPACE'].includes(threat.kind)&&laneDepth>=-2&&Number(threat.currentFacts?.entryPressure||0)>=24;
  // Possession by itself is not an emergency licence for two CBs to leave the
  // centre.  The exception is a present, immediate goalward lane, not a
  // prediction about what the carrier might do next.
  const immediateGoalwardEmergency=goalwardImmediate||emergency;
  const urgent=flightReceiver||immediateLane||immediateGoalwardEmergency;
  return{actorPosition:a,threatPosition:t,relationshipTarget:target,partnerId:partner?.actor.id||null,partnerPosition:partner?.q||null,partnerCoverPosition,lineDepth,laneDepth,partnerDepthGap,currentPartnerDepthGap,sameFlankPair,currentSameFlankPair,otherCentralCbs,currentOtherCentralCbs,leavesCentralLane,currentlyLeavesCentralLane,currentCarrier,flightReceiver,immediateLane,goalward,goalwardImmediate,emergency,immediateGoalwardEmergency,urgent};
}

// This is deliberately a current relationship test, rather than a formation
// coordinate rule.  A defender is credible inside cover when they are already
// goal-side and lie on the inside of the carrier-to-goal lane.  The lane is
// derived from the one current snapshot, so it also works for asymmetric and
// staggered back lines.
function insideGoalSideLane(q,threat){
  if(q.x>threat.localPosition.x+BANDS.goalSideSlack)return false;
  const t=threat.localPosition,ratio=t.x>1?clamp(q.x/t.x,0,1):0;
  const laneY=34+(t.y-34)*ratio;
  return t.y<34?q.y>=laneY-2.5:t.y>34?q.y<=laneY+2.5:true;
}
function relationPosition(team,player,row){
  return row?.approvedTargetRelation?.targetPoint?local(team,row.approvedTargetRelation.targetPoint):local(team,player);
}
function isWideCbAssignment(team,threat,relation){
  const target=relation?.targetPoint?local(team,relation.targetPoint):null;
  // `threat` is already in the defending team's local coordinates.  The
  // relationship target carries no additional authority here: its purpose is
  // to make a current wide/half-space subject explicit.
  return ['WIDE','HALF_SPACE'].includes(threat.kind)||Math.abs(threat.localPosition.y-34)>BANDS.centralY||!!target&&Math.abs(target.y-34)>BANDS.centralY;
}
function cbActionShapeValidity(snapshot,team,actorOrId,threat,relation,draft=null){
  const actor=typeof actorOrId==='string'?playerMap(snapshot).get(actorOrId):actorOrId;
  if(!actor||actor.role!=='CB')return freezeDeep({valid:true,reason:'NON_CB_ACTION',facts:null});
  const facts=cbShapeFacts(snapshot,team,actor,threat);
  if(!isWideCbAssignment(team,threat,relation))return freezeDeep({valid:true,reason:'CENTRAL_CB_ACTION',facts});
  if(facts.immediateGoalwardEmergency)return freezeDeep({valid:true,reason:'IMMEDIATE_CURRENT_GOALWARD_EMERGENCY',facts});
  const rows=draft?.responsibilities||[];
  const committedElsewhere=id=>rows.some(r=>r.actorId===id&&r.subjectId&&r.subjectId!==threat.subjectId&&['OWNED','ACQUIRED','ACQUIRING'].includes(r.lifecycle));
  const coverers=[];
  for(const p of snapshot.players){
    if(p.team!==team||p.id===actor.id||!['CB','CM','FB'].includes(p.role)||protectedReason(snapshot,p)||committedElsewhere(p.id))continue;
    const row=rows.find(r=>r.actorId===p.id&&r.subjectId===threat.subjectId&&['PRESS','MARK','COVER','RECOVER'].includes(r.duty));
    // A CB already committed to this same wide subject is the stepping player,
    // not the central successor.  CM/FB cover is allowed only when it is
    // presently inside and goal-side, never as a future promise.
    if(p.role==='CB'&&row)continue;
    const q=relationPosition(team,p,row);
    if(insideGoalSideLane(q,threat))coverers.push({actorId:p.id,role:p.role,source:row?'CURRENT_APPROVED_RELATION':'CURRENT_BODY_POSITION'});
  }
  const partner=snapshot.players.find(p=>p.team===team&&p.role==='CB'&&p.id!==actor.id)||null;
  const partnerWideOnSubject=!!partner&&rows.some(r=>r.actorId===partner.id&&r.subjectId===threat.subjectId&&['PRESS','MARK','COVER','RECOVER'].includes(r.duty));
  const factsWithCover={...facts,wideSubject:true,centralCoverers:coverers,partnerWideOnSubject};
  if(!coverers.length)return freezeDeep({valid:false,reason:partnerWideOnSubject?'SECOND_CB_WIDE_SUBJECT_WITHOUT_CENTRAL_SUCCESSOR':'WIDE_CB_ACTION_WITHOUT_CENTRAL_COVER',facts:factsWithCover});
  return freezeDeep({valid:true,reason:'CURRENT_CENTRAL_GOALSIDE_COVER_PRESENT',facts:factsWithCover});
}
function continuityShapeValidity(snapshot,team,actorOrId,threat){
  const actor=typeof actorOrId==='string'?playerMap(snapshot).get(actorOrId):actorOrId;
  if(!actor||actor.role!=='CB')return freezeDeep({valid:true,reason:'NON_CB_CONTINUITY',facts:null});
  const facts=cbShapeFacts(snapshot,team,actor,threat);
  const relation=relationshipTarget(team,threat,'MARK'),wideAction=isWideCbAssignment(team,threat,relation),action=cbActionShapeValidity(snapshot,team,actor,threat,relation);
  const severeDepthSplit=Math.max(facts.partnerDepthGap,facts.currentPartnerDepthGap)>BANDS.cbConnectedDepth;
  let reason=null;
  if(!action.valid)reason=action.reason;
  else if(!wideAction&&!facts.urgent&&(facts.leavesCentralLane||facts.currentlyLeavesCentralLane))reason='CENTRAL_LANE_UNPROTECTED';
  else if(!wideAction&&!facts.urgent&&(facts.sameFlankPair||facts.currentSameFlankPair))reason='BOTH_CBS_SAME_FLANK';
  else if(!wideAction&&!facts.urgent&&severeDepthSplit)reason='BACKLINE_DEPTH_DISCONNECTED';
  return freezeDeep({valid:!reason,reason:reason||'CURRENT_STEP_HAS_CENTRAL_COVER',facts:{...facts,severeDepthSplit,action}});
}
function shapeRecoveryRelation(snapshot,team,actor,threat){
  const a=local(team,actor),others=snapshot.players.filter(p=>p.team===team&&['CB','FB'].includes(p.role)&&p.id!==actor.id).map(p=>local(team,p));
  const cbPeers=snapshot.players.filter(p=>p.team===team&&p.role==='CB'&&p.id!==actor.id).map(p=>local(team,p));
  const lineX=median([...cbPeers.map(p=>p.x),...others.map(p=>p.x)])??a.x;
  const slot=String(actor.slot||''),side=/^L/.test(slot)?-1:/^R/.test(slot)?1:Math.sign(a.y-34)||1;
  const currentPairWidth=cbPeers.length?Math.abs(a.y-cbPeers[0].y):13,pairWidth=clamp(currentPairWidth,10,18);
  const q={x:clamp(lineX,2.5,102.5),y:clamp(34+side*pairWidth/2,16,52)};
  return{purpose:'RECONNECT_CURRENT_BACKLINE_AND_PROTECT_CENTRE',subjectId:threat?.subjectId||null,targetPoint:world(team,q),facingPoint:threat?world(team,threat.localPosition):world(team,{x:q.x+8,y:34}),holdSatisfiedDistance:1.5};
}
function threatCandidates(snapshot,team,threat,reserved,mandatory,responsibilities=[],excluded=new Set()){
  const players=snapshot.players.filter(p=>p.team===team&&p.role!=='GK'&&!reserved.has(p.id)&&!excluded.has(p.id)&&!protectedReason(snapshot,p));
  return players.map(actor=>{
    const jurisdiction=candidateJurisdiction(actor,threat);if(!jurisdiction.eligible)return null;
    const relation=relationshipTarget(team,threat,'MARK'),assessment=assessAcquisition(snapshot,team,actor,threat,relation,mandatory);
    const continuity=continuityShapeValidity(snapshot,team,actor,threat),actionShape=cbActionShapeValidity(snapshot,team,actor,threat,relation,{responsibilities});
    const shape=actionShape.valid?continuity:actionShape;
    const score=distance(local(team,actor),threat.localPosition)+roleBias(actor,threat)+(assessment.acquired?0:40)+(shape.valid?0:80);
    return{actor,relation,assessment,score,jurisdiction,shape};
  }).filter(Boolean).sort((a,b)=>a.score-b.score||a.actor.id.localeCompare(b.actor.id));
}
function transfer(id,threat,predecessorId,successorId,state,at,reason,geometry=null){
  if(!TRANSFER_STATES.has(state))throw new Error(`INVALID_TRANSFER_STATE:${state}`);
  return{id,threatId:threat.id,subjectId:threat.subjectId,predecessorId:predecessorId||null,successorId:successorId||null,state,at,reason,geometry:clone(geometry)};
}

function buildProtectionDraft(snapshot,team,danger){
  const at=snapshot.epoch.time,prior=priorOwners(snapshot,team),priorRows=priorTeam(snapshot,team)?.responsibilities||[],reserved=new Set(),mandatory=[],responsibilities=[],transfers=[],deficits=[],shapeClaims=new Map(),shapeReleases=new Map();
  const threats=danger.routes.slice();
  if(danger.flightReceiver&&!threats.some(x=>x.subjectId===danger.flightReceiver.subjectId))threats.unshift(danger.flightReceiver);
  const seenThreat=new Set();
  const orderedThreats=threats.sort((a,b)=>b.priority-a.priority||a.subjectId.localeCompare(b.subjectId));
  const continuity=new Map();
  for(const threat of orderedThreats){
    const old=prior.get(threat.subjectId),claim=currentThreatClaim(snapshot,team,threat,old);
    if(claim.releaseToShape){shapeClaims.set(threat.subjectId,{old,claim});reserved.add(claim.actor.id);}
    if(claim.valid&&!reserved.has(claim.actor.id)){
      continuity.set(threat.subjectId,{old,claim});
      reserved.add(claim.actor.id);
      mandatory.push({actorId:claim.actor.id,subjectId:threat.subjectId,state:'ACQUIRED',primary:true,continuity:true});
    }
  }
  for(const threat of orderedThreats){
    if(seenThreat.has(threat.subjectId))continue;seenThreat.add(threat.subjectId);
    const old=prior.get(threat.subjectId),oldActor=old?snapshot.players.find(p=>p.id===old.actorId):null;
    const relation=relationshipTarget(team,threat,'MARK');
    const retained=continuity.get(threat.subjectId),oldAssessment=retained?assessAcquisition(snapshot,team,retained.claim.actor,threat,relation,mandatory):null;
    if(retained&&oldAssessment?.acquired){
      responsibilities.push({actorId:retained.claim.actor.id,duty:'MARK',subjectId:threat.subjectId,threatId:threat.id,lifecycle:'OWNED',continuity:'VALID_PRIOR_PROTECTION_RETAINED',approvedTargetRelation:relation,acquisition:oldAssessment});
      continue;
    }
    if(retained){
      responsibilities.push({actorId:retained.claim.actor.id,duty:'RECOVER',subjectId:threat.subjectId,threatId:threat.id,lifecycle:'ACQUIRING',continuity:'VALID_PRIOR_CONTINUITY_GEOMETRY_PENDING',approvedTargetRelation:relation,acquisition:oldAssessment});
      deficits.push({threatId:threat.id,subjectId:threat.subjectId,status:'DEGRADED',reason:'PRIOR_CONTINUITY_RETAINED_NOT_ACQUIRED'});
      continue;
    }
    const shapeClaim=shapeClaims.get(threat.subjectId)||null,excluded=shapeClaim?new Set([shapeClaim.old.actorId]):new Set();
    const choices=threatCandidates(snapshot,team,threat,reserved,mandatory,responsibilities,excluded),acquired=choices.find(x=>x.assessment.acquired&&x.shape.valid)||null,nearest=choices.find(x=>x.shape.valid)||choices[0]||null;
    if(acquired){
      reserved.add(acquired.actor.id);mandatory.push({actorId:acquired.actor.id,subjectId:threat.subjectId,state:'ACQUIRED',primary:true});
      responsibilities.push({actorId:acquired.actor.id,duty:'MARK',subjectId:threat.subjectId,threatId:threat.id,lifecycle:'ACQUIRED',continuity:shapeClaim?'SHAPE_AWARE_SAME_TICK_HANDOFF':old?'VALID_SAME_TICK_HANDOFF':'CURRENT_GEOMETRY_ACQUIRED',approvedTargetRelation:acquired.relation,acquisition:acquired.assessment});
      if(old&&old.actorId!==acquired.actor.id){
        const tid=`${team}:${threat.subjectId}:${at}`;
        transfers.push(transfer(tid,threat,old.actorId,acquired.actor.id,'HANDOFF_REQUESTED',at,shapeClaim?shapeClaim.claim.reason:'PRIOR_INVALID_REPLACEMENT_REQUESTED',shapeClaim?.claim.shape||oldAssessment));
        transfers.push(transfer(tid,threat,old.actorId,acquired.actor.id,'ACQUIRED',at,'SUCCESSOR_CURRENT_GEOMETRY_AND_DUTY_VALID',acquired.assessment));
        transfers.push(transfer(tid,threat,old.actorId,acquired.actor.id,'RELEASED',at,'ACQUIRE_BEFORE_RELEASE',acquired.assessment));
        if(shapeClaim)shapeReleases.set(old.actorId,{...shapeRecoveryRelation(snapshot,team,shapeClaim.claim.actor,threat),subjectId:null});
      }
    }else{
      if(shapeClaim){
        const actor=shapeClaim.claim.actor,relation=shapeRecoveryRelation(snapshot,team,actor,threat);
        // No current successor can acquire this wide relationship.  Release the
        // prior CB to the current back-line relation instead of keeping a
        // nominal subject that would make the mark sticky on later frames.
        shapeReleases.set(actor.id,{...relation,subjectId:null});
        transfers.push(transfer(`${team}:${threat.subjectId}:${at}`,threat,shapeClaim.old.actorId,null,'RELEASED',at,'CURRENT_SHAPE_BREAK_RELEASE_TO_SHAPE',shapeClaim.claim.shape));
        deficits.push({threatId:threat.id,subjectId:threat.subjectId,status:'DEGRADED',reason:'CB_RETURNING_TO_SHAPE_NO_CURRENT_SUCCESSOR',shapeReason:shapeClaim.claim.shape.reason});
        continue;
      }
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
  return{responsibilities,transfers,deficits,reserved,mandatory,shapeReleases};
}

function selectPressure(snapshot,team,danger,draft){
  const carrier=danger.carrier;if(!carrier)return null;
  const priorOnCarrier=draft.responsibilities.find(r=>r.subjectId===carrier.subjectId&&r.duty==='MARK'&&['OWNED','ACQUIRED'].includes(r.lifecycle));
  if(priorOnCarrier){
    const actor=playerMap(snapshot).get(priorOnCarrier.actorId),relation=relationshipTarget(team,carrier,'PRESS'),shape=cbActionShapeValidity(snapshot,team,actor,carrier,relation,draft);
    if(shape.valid){priorOnCarrier.duty='PRESS';priorOnCarrier.threatId=carrier.id;priorOnCarrier.approvedTargetRelation=relation;priorOnCarrier.continuity='MARK_TO_PRESS_SAME_CURRENT_SUBJECT';return priorOnCarrier;}
    draft.deficits.push({threatId:carrier.id,subjectId:carrier.subjectId,status:'DEGRADED',reason:'PRIOR_PRESS_REJECTED_BY_CURRENT_SHAPE',shapeReason:shape.reason});
  }
  const candidates=snapshot.players.filter(p=>p.team===team&&p.role!=='GK'&&!draft.reserved.has(p.id)&&!protectedReason(snapshot,p)).map(actor=>{
    const relation=relationshipTarget(team,carrier,'PRESS'),shape=cbActionShapeValidity(snapshot,team,actor,carrier,relation,draft);
    return{actor,d:distance(local(team,actor),carrier.localPosition),bias:['ST','WF','CM'].includes(actor.role)?-2:0,relation,shape};
  }).filter(x=>x.shape.valid).sort((a,b)=>(a.d+a.bias)-(b.d+b.bias)||a.actor.id.localeCompare(b.actor.id));
  const pick=candidates[0];if(!pick||pick.d>BANDS.pressureDistance){draft.deficits.push({threatId:carrier.id,subjectId:carrier.subjectId,status:'DEFICIT',reason:'NO_CURRENT_PRESSURE_OWNER_IN_RANGE'});return null;}
  const relation=pick.relation,assessment=assessAcquisition(snapshot,team,pick.actor,carrier,relation,draft.mandatory);
  draft.reserved.add(pick.actor.id);draft.mandatory.push({actorId:pick.actor.id,subjectId:carrier.subjectId,state:assessment.acquired?'ACQUIRED':'ACQUIRING',primary:true});
  const row={actorId:pick.actor.id,duty:'PRESS',subjectId:carrier.subjectId,threatId:carrier.id,lifecycle:assessment.acquired?'ACQUIRED':'ACQUIRING',continuity:'PRESS_SEPARATE_FROM_UNRELATED_MARK',approvedTargetRelation:relation,acquisition:assessment};
  draft.responsibilities.push(row);if(!assessment.acquired)draft.deficits.push({threatId:carrier.id,subjectId:carrier.subjectId,status:'DEGRADED',reason:'PRESSURE_ACTOR_APPROACHING_NOT_ACQUIRED'});return row;
}

function selectCover(snapshot,team,danger,draft,pressure){
  if(!pressure||!danger.carrier)return null;
  const carrier=danger.carrier,candidates=snapshot.players.filter(p=>p.team===team&&['CB','CM','FB'].includes(p.role)&&!draft.reserved.has(p.id)&&!protectedReason(snapshot,p)).map(actor=>{
    const a=local(team,actor),d=distance(a,carrier.localPosition),goalSide=a.x<=carrier.localPosition.x;
    const relation=relationshipTarget(team,carrier,'COVER'),shape=cbActionShapeValidity(snapshot,team,actor,carrier,relation,draft);
    return{actor,d,score:d+(goalSide?-4:8)+(actor.role==='CB'?-2:0),relation,shape};
  }).filter(x=>x.d<=BANDS.coverDistance&&local(team,x.actor).x<=carrier.localPosition.x&&x.shape.valid).sort((a,b)=>a.score-b.score||a.actor.id.localeCompare(b.actor.id));
  const pick=candidates[0];if(!pick)return null;
  const relation=pick.relation;
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

// Attack relationships deliberately derive their endpoint from the one current
// snapshot.  Legacy labels below are only a bounded request/safety hint; no
// Legacy coordinate participates in choosing a D target.
function sideOf(p){return Math.sign(p.y-34)||(/^L/.test(p.slot)?-1:/^R/.test(p.slot)?1:0)||1;}
function attackContext(snapshot,team){
  const own=snapshot.players.filter(p=>p.team===team&&p.role!=='GK').map(p=>({p,q:local(team,p)})),opp=snapshot.players.filter(p=>p.team===other(team)&&p.role!=='GK').map(p=>({p,q:local(team,p)})),ball=local(team,snapshot.ball);
  const oppCbs=opp.filter(x=>x.p.role==='CB'),cbLine=median(oppCbs.map(x=>x.q.x))??clamp(ball.x+22,62,88);
  const ownCms=own.filter(x=>x.p.role==='CM');
  return{ball,own,opp,oppCbs,cbLine,ownCms,settledBuild:ball.x<70&&Math.abs(ball.y-34)<18};
}
function relation(team,p,q,purpose,subjectId,target,facingPoint,holdSatisfiedDistance=1.1,extra={}){
  return{purpose,subjectId:subjectId||null,targetPoint:world(team,target),facingPoint:world(team,facingPoint||target),holdSatisfiedDistance,...extra};
}
function currentSupportContinuation(team,p,q,horizon=.9){
  const v=localVelocity(team,p);
  return{x:clamp(q.x+v.x*horizon,2.5,102.5),y:clamp(q.y+v.y*horizon,3,65)};
}
function stRelation(team,p,q,c){
  const ballSide=sideOf(c.ball),nearBox=c.ball.x>=68,inside=clamp((q.y-34)*.65+(c.ball.y-34)*.35,-16,16);
  const laneY=nearBox?(Math.abs(c.ball.y-34)>10?(ballSide===sideOf(q)?34+sideOf(q)*8:34-sideOf(q)*12):34+sideOf(q)*10):34+inside;
  // `cbLine - 1.35` is an onside-accessible present line, not a prediction of
  // the next defensive step.  The ball keeps deep strikers available as a pass
  // support instead of pinning them to a formation anchor.
  const x=nearBox?clamp(Math.max(c.ball.x+3,q.x),c.ball.x+1,c.cbLine-1.35):clamp(Math.max(c.ball.x+5,q.x),48,c.cbLine-3.2);
  const target=c.settledBuild?currentSupportContinuation(team,p,q):{x,y:clamp(laneY,7,61)};
  return relation(team,p,q,c.settledBuild?'ST_CURRENT_BUILD_SUPPORT_HOLD':nearBox?'ST_CURRENT_BOX_NEAR_FAR_ONSIDE':'ST_CURRENT_BALL_CB_SUPPORT_ONSIDE',null,target,{x:c.cbLine,y:laneY},1.35,{relationFacts:{ballX:c.ball.x,opposingCbLine:c.cbLine,onsideAccessibleMaxX:c.cbLine-1.35}});
}
function wfRelation(team,p,q,c){
  const side=sideOf(p),ballSide=sideOf(c.ball),sameSide=side===ballSide,wideBall=Math.abs(c.ball.y-34)>=13,nearBox=c.ball.x>=69;
  let purpose,target;
  if(c.settledBuild){
    target=currentSupportContinuation(team,p,q);purpose='WF_CURRENT_BUILD_WIDTH_HOLD';
  }else if(nearBox&&!sameSide&&Math.abs(c.ball.y-34)>=8){
    target={x:clamp(Math.max(c.ball.x+2,q.x),c.ball.x,c.cbLine-1.4),y:clamp(34+side*15,8,60)};
    purpose='WF_CURRENT_FAR_POST_RELATION';
  }else if(sameSide&&wideBall){
    target={x:clamp(Math.max(q.x,c.ball.x-2),45,c.cbLine-2.5),y:clamp(34+side*27+(c.ball.y-(34+side*20))*.25,4,64)};
    purpose='WF_CURRENT_BALL_SIDE_WIDTH';
  }else{
    target={x:clamp(Math.max(c.ball.x+2,q.x-2),48,c.cbLine-2.2),y:clamp(34+side*14+(c.ball.y-34)*.18,8,60)};
    purpose='WF_CURRENT_INSIDE_HALF_SPACE_SUPPORT';
  }
  return relation(team,p,q,purpose,null,target,{x:c.ball.x,y:c.ball.y},1.25,{relationFacts:{ballSide:sameSide?'SAME':'OPPOSITE_OR_CENTRAL',opposingCbLine:c.cbLine}});
}
function cmRelation(team,p,q,c){
  const rank=c.ownCms.slice().sort((a,b)=>a.q.x-b.q.x||a.p.id.localeCompare(b.p.id));
  const connector=rank.slice().sort((a,b)=>distance(a.q,c.ball)-distance(b.q,c.ball)||a.p.id.localeCompare(b.p.id))[0]?.p.id;
  const rearCount=c.own.filter(x=>['CB','FB','CM'].includes(x.p.role)&&x.p.id!==p.id&&x.q.x<=c.ball.x-4).length;
  const lateCandidates=rank.filter(x=>x.q.x<=c.ball.x+1),late=lateCandidates.at(-1)?.p.id;
  let purpose,target;
  if(c.settledBuild){
    target=currentSupportContinuation(team,p,q);purpose='CM_CURRENT_BUILD_CONNECT_HOLD';
  }else if(p.id===late&&c.ball.x>=57&&rearCount>=3){
    target={x:clamp(Math.min(c.cbLine-4,Math.max(c.ball.x+7,q.x+2)),52,78),y:clamp(34+(q.y-34)*.55+(c.ball.y-34)*.25,10,58)};
    purpose='CM_CURRENT_LATE_SUPPORT_WITH_REST_BALANCE';
  }else if(p.id===connector){
    target={x:clamp(c.ball.x-5,30,Math.min(c.cbLine-7,72)),y:clamp(c.ball.y+(q.y-c.ball.y)*.45,9,59)};
    purpose='CM_CURRENT_CONNECT_SUPPORT';
  }else{
    target={x:clamp(Math.min(c.ball.x-8,q.x+2),28,Math.min(c.cbLine-9,67)),y:clamp(34+(q.y-34)*.72+(c.ball.y-34)*.12,10,58)};
    purpose='CM_CURRENT_SECOND_BALL_BALANCE_HOLD';
  }
  return relation(team,p,q,purpose,null,target,{x:c.ball.x,y:c.ball.y},1.15,{relationFacts:{cmConnectorId:connector,lateSupportId:late,rearStructureCount:rearCount}});
}
function fbRelation(team,p,q,c,duty,safety){
  const side=sideOf(p),sameSide=side===sideOf(c.ball),wideBall=Math.abs(c.ball.y-34)>=11;
  let purpose,target;
  if(duty==='BALANCE'){
    target=currentSupportContinuation(team,p,q,5);purpose='FB_CURRENT_BUILD_BALANCE_HOLD';
  }else if(['ACTIVE_RUN','ATTACK_SUPPORT'].includes(duty)){
    if(sameSide&&wideBall){target={x:clamp(Math.max(c.ball.x+5,q.x+3),42,c.cbLine-2),y:clamp(34+side*29,4,64)};purpose='FB_CURRENT_COVERED_OVERLAP';}
    else{target={x:clamp(Math.max(c.ball.x+3,q.x+2),40,c.cbLine-4),y:clamp(34+side*12+(c.ball.y-34)*.12,8,60)};purpose='FB_CURRENT_COVERED_UNDERLAP';}
  }else if(duty==='REST_DEFENCE'){
    target={x:clamp(Math.min(q.x,c.ball.x-17),16,46),y:clamp(34+side*20+(c.ball.y-34)*.14,6,62)};purpose='FB_CURRENT_UNSAFE_ADVANCE_REST_DEFENCE';
  }else{
    target={x:clamp(Math.min(q.x+2,c.ball.x-12),16,48),y:clamp(34+side*22+(c.ball.y-34)*.12,5,63)};purpose='FB_CURRENT_BALANCE_RELATION';
  }
  return relation(team,p,q,purpose,null,target,{x:c.ball.x,y:c.ball.y},1.2,{relationFacts:{sameBallSide:sameSide,wideBall,coverApproved:!!safety?.approved}});
}
function cbRelation(team,p,q,c){
  const side=sideOf(p),partner=c.own.filter(x=>x.p.role==='CB'&&x.p.id!==p.id)[0]||null;
  const lineX=clamp(Math.min(c.ball.x-18,partner?partner.q.x+5:c.ball.x-18),15,46);
  const target=c.settledBuild?currentSupportContinuation(team,p,q):{x:lineX,y:clamp(34+side*7+(c.ball.y-34)*.17,16,52)};
  return relation(team,p,q,'CB_CURRENT_REST_DEFENCE_BACK_LINE',null,target,{x:c.ball.x,y:c.ball.y},1.35,{relationFacts:{ballX:c.ball.x,partnerCbId:partner?.p.id||null}});
}
function attackIntents(snapshot,team,danger,draft){
  const context=attackContext(snapshot,team);
  const intents=[];
  for(const p of snapshot.players.filter(x=>x.team===team&&x.role!=='GK')){
    const protectedBy=protectedReason(snapshot,p);
    if(protectedBy){intents.push({actorId:p.id,duty:'PROTECTED',purpose:protectedBy,approvedTargetRelation:null});continue;}
    const q=local(team,p);
    const legacy=String(p.legacy.tacticalTask||p.legacy.action||p.legacy.finalMovementIntent?.type||'');
    if(p.role==='FB'){
      const wantsAdvance=ADVANCE_TASK.test(legacy),threats=sameSideThreats(team,p,danger),structure=restStructure(snapshot,team,p.id),covered=threats.every(t=>acquiredByOther(draft,p,t));
      const safe=!threats.length||(covered&&structure.central>=2&&structure.left>=1&&structure.right>=1);
      const duty=wantsAdvance&&safe?(RUN_TASK.test(legacy)?'ACTIVE_RUN':'ATTACK_SUPPORT'):(wantsAdvance?'REST_DEFENCE':'BALANCE');
      const safety={sameSideThreatIds:threats.map(t=>t.id),successorAcquiredNow:covered,restStructure:structure,weakSideProtected:structure.left>=1&&structure.right>=1,approved:safe};
      const approvedTargetRelation=fbRelation(team,p,q,context,duty,safety);
      intents.push({actorId:p.id,duty,purpose:approvedTargetRelation.purpose,requestedLegacyRelationship:legacy||null,safety,approvedTargetRelation,hold:distance(q,local(team,approvedTargetRelation.targetPoint))<=approvedTargetRelation.holdSatisfiedDistance});
      continue;
    }
    const moving=Math.hypot(p.vx,p.vy)>.35,duty=p.role==='CB'?'REST_DEFENCE':RUN_TASK.test(legacy)&&moving?'ACTIVE_RUN':'ATTACK_SUPPORT';
    const approvedTargetRelation=p.role==='ST'?stRelation(team,p,q,context):p.role==='WF'?wfRelation(team,p,q,context):p.role==='CM'?cmRelation(team,p,q,context):cbRelation(team,p,q,context);
    intents.push({actorId:p.id,duty,purpose:approvedTargetRelation.purpose,approvedTargetRelation,hold:distance(q,local(team,approvedTargetRelation.targetPoint))<=approvedTargetRelation.holdSatisfiedDistance});
  }
  return intents.sort((a,b)=>a.actorId.localeCompare(b.actorId));
}
function defensiveRemainders(snapshot,team,draft){
  const rows=[];
  for(const p of snapshot.players.filter(x=>x.team===team&&x.role!=='GK').sort(byId)){
    if(draft.responsibilities.some(r=>r.actorId===p.id)||(draft.reserved.has(p.id)&&!draft.shapeReleases?.has(p.id)))continue;
    const protectedBy=protectedReason(snapshot,p);
    const recovery=draft.shapeReleases?.get(p.id)||null;
    rows.push({actorId:p.id,duty:protectedBy?'PROTECTED':recovery?'RECOVER':PRESS_TASK.test(String(p.legacy.tacticalTask||''))?'PRESS_SUPPORT':p.role==='CB'?'BALANCE':'ZONE',subjectId:null,threatId:null,lifecycle:'OWNED',continuity:protectedBy||(recovery?'SHAPE_HANDOFF_RELEASED_TO_CURRENT_LINE':'CURRENT_TEAM_SHAPE_RELATION'),approvedTargetRelation:recovery});
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
  buildSnapshot,deriveDangerFacts,relationshipTarget,assessAcquisition,continuityShapeValidity,rejectCircularHandoffs,
  decideTeam,decideEpoch,priorFromDecision,observe,semanticProjection
};
});
