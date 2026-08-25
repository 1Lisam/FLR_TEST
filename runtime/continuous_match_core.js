(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_CONTINUOUS_CORE=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const TACTICS=(typeof globalThis!=='undefined'&&globalThis.FLRPG_TACTICS)||((typeof require==='function')?(()=>{try{return require('./tactical_movement.js')}catch(_e){return null}})():null);
const RESTARTS=(typeof globalThis!=='undefined'&&globalThis.FLRPG_RESTART_MOVEMENT)||((typeof require==='function')?(()=>{try{return require('./restart_movement.js')}catch(_e){return null}})():null);
const FLOW=(typeof globalThis!=='undefined'&&globalThis.FLRPG_MATCH_FLOW_RESOLUTION)||((typeof require==='function')?(()=>{try{return require('./match_flow_resolution.js')}catch(_e){return null}})():null);
const TELEMETRY=(typeof globalThis!=='undefined'&&globalThis.FLRPG_MATCH_CHOICE_TELEMETRY)||((typeof require==='function')?(()=>{try{return require('./match_choice_telemetry.js')}catch(_e){return null}})():null);
const CANDIDATES=(typeof globalThis!=='undefined'&&globalThis.FLRPG_ACTION_CANDIDATE_ENGINE)||((typeof require==='function')?(()=>{try{return require('./action_candidate_engine.js')}catch(_e){return null}})():null);
const ATTR=(typeof globalThis!=='undefined'&&globalThis.FLRPG_ATTRIBUTE_MATCH_ADAPTER)||((typeof require==='function')?(()=>{try{return require('./attribute_match_adapter.js')}catch(_e){return null}})():null);
const AERIAL=(typeof globalThis!=='undefined'&&globalThis.FLRPG_AERIAL_CONTEST)||((typeof require==='function')?(()=>{try{return require('./aerial_contest.js')}catch(_e){return null}})():null);
const TAKEON=(typeof globalThis!=='undefined'&&globalThis.FLRPG_TAKE_ON_DUEL)||((typeof require==='function')?(()=>{try{return require('./take_on_duel.js')}catch(_e){return null}})():null);
const STRIKE=(typeof globalThis!=='undefined'&&globalThis.FLRPG_BALL_STRIKE_MODEL)||((typeof require==='function')?(()=>{try{return require('./ball_strike_model.js')}catch(_e){return null}})():null);
const FIELD={L:0,R:105,T:0,B:68,GOAL_Y1:30.34,GOAL_Y2:37.66};
const HOME='HOME',AWAY='AWAY';
const DEFAULT_DT=0.05;
const ROLE_SPEED={GK:6.2,FB:7.4,CB:7.0,CM:7.2,WF:7.8,ST:7.7};
const ROLE_ACCEL={GK:4.7,FB:5.2,CB:5.0,CM:5.1,WF:5.4,ST:5.3};
const CONTROL_RADIUS={GK:1.55,FB:1.05,CB:1.10,CM:1.05,WF:1.00,ST:1.05};

const HOME_ROWS=[
  ['H-GK','블루팀 GK','GK','GK',5.5,34],
  ['H-LB','블루팀 LB','FB','LB',20,10],['H-LCB','블루팀 LCB','CB','LCB',18.5,27],['H-RCB','블루팀 RCB','CB','RCB',18.5,41],['H-RB','블루팀 RB','FB','RB',20,58],
  ['H-LCM','블루팀 LCM','CM','LCM',39,21],['H-CM','블루팀 CM','CM','CM',43,34],['H-RCM','블루팀 RCM','CM','RCM',39,47],
  ['H-LW','블루팀 LW','WF','LW',66,11],['H-ST','블루팀 ST','ST','ST',68,34],['H-RW','블루팀 RW','WF','RW',66,57]
];
const AWAY_ROWS=[
  ['A-GK','레드팀 GK','GK','GK',5.5,34],
  ['A-LB','레드팀 LB','FB','LB',20,10],['A-LCB','레드팀 LCB','CB','LCB',18.5,27],['A-RCB','레드팀 RCB','CB','RCB',18.5,41],['A-RB','레드팀 RB','FB','RB',20,58],
  ['A-LCM','레드팀 LCM','CM','LCM',39,21],['A-CM','레드팀 CM','CM','CM',43,34],['A-RCM','레드팀 RCM','CM','RCM',39,47],
  ['A-LW','레드팀 LW','WF','LW',66,11],['A-ST','레드팀 ST','ST','ST',68,34],['A-RW','레드팀 RW','WF','RW',66,57]
];

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function subjectName(name){const t=String(name||'선수'),c=t.charCodeAt(t.length-1);if(c>=0xAC00&&c<=0xD7A3)return t+(((c-0xAC00)%28)?'이':'가');return t+'이';}
function teamDisplayName(team){return team===HOME?'블루팀':'레드팀';}
function lerp(a,b,t){return a+(b-a)*t;}
function hypot(x,y){return Math.hypot(x,y);}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function norm(x,y){const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};}
function other(team){return team===HOME?AWAY:HOME;}
function dir(team){return team===HOME?1:-1;}
function ownGoalX(team){return team===HOME?0:105;}
function oppGoalX(team){return team===HOME?105:0;}
function localToWorld(team,x,y){return team===HOME?{x,y}:{x:105-x,y:68-y};}
function worldToLocal(team,x,y){return team===HOME?{x,y}:{x:105-x,y:68-y};}
function hash32(s){let h=2166136261>>>0;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
function rng(seed){let a=hash32(seed)||1;return function(){a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function angleWrap(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;}
function angleDiff(a,b){return angleWrap(b-a);}
function approachAngle(a,b,maxStep){return a+clamp(angleDiff(a,b),-maxStep,maxStep);}
function abilityValue(m,p,key){const prof=m?.playerAbilityProfiles?.[p.id];return prof&&Number.isFinite(prof[key])?prof[key]:60;}
function movementFactor(v,span=0.30){return clamp(1+(v-60)/100*span,0.80,1.18);}
function playerById(m,id){return id?m.playersById[id]:null;}
function teamPlayers(m,team){return m.players.filter(p=>p.team===team);}
function outfield(m,team){return m.players.filter(p=>p.team===team&&p.role!=='GK');}
function inPenaltyArea(team,x,y){const l=worldToLocal(team,x,y);return l.x<=16.5&&l.y>=13.84&&l.y<=54.16;}
function inOppPenaltyArea(team,x,y){return inPenaltyArea(other(team),x,y);}
function insideField(x,y){return x>=0&&x<=105&&y>=0&&y<=68;}
function segmentPointDistance(ax,ay,bx,by,px,py){const vx=bx-ax,vy=by-ay,wx=px-ax,wy=py-ay,c1=vx*wx+vy*wy,c2=vx*vx+vy*vy;const t=c2?clamp(c1/c2,0,1):0;const qx=ax+vx*t,qy=ay+vy*t;return Math.hypot(px-qx,py-qy);}

function createPlayers(){
  const rows=[];
  for(const r of HOME_ROWS)rows.push([HOME,...r]);
  for(const r of AWAY_ROWS)rows.push([AWAY,...r]);
  return rows.map(([team,id,name,role,slot,lx,ly])=>{const w=localToWorld(team,lx,ly);return{team,id,name,role,slot,x:w.x,y:w.y,vx:0,vy:0,tx:w.x,ty:w.y,action:'HOLD_SHAPE',sprint:false,hasBall:false,nextThink:0,lastActionAt:0,pressure:0,lockTargetUntil:0,controlledSince:-1,lastReceivedAt:-1,lastDecision:'NONE',lastReceivedFromId:null,runUntil:0,runTx:w.x,runTy:w.y,runType:null,tacticalTask:'HOLD_SHAPE',nextChallengeAt:0,pressCommitUntil:0,pressRecoverUntil:0,wasInOppBox:false,lastBoxEntryAt:-99,bodyAngle:team===HOME?0:Math.PI,faceTargetAngle:null};});
}
function rebuildMap(m){m.playersById=Object.fromEntries(m.players.map(p=>[p.id,p]));}
function controlContactGap(m,p){if(!m||!p||!m.ball)return Infinity;const tx=p.x+dir(p.team)*0.42,ty=p.y;return Math.hypot(Number(m.ball.x)-tx,Number(m.ball.y)-ty);}
function materialControlReady(m,p){return !!(p&&m.ball.mode==='CONTROLLED'&&m.ball.ownerId===p.id&&(m.ball.z||0)<=0.38&&controlContactGap(m,p)<=0.92);}
function setControlled(m,p,snap=true,receiveMeta=null){
  const prevPoss=m.possession;for(const q of m.players)q.hasBall=false;
  if(!p){m.ball.ownerId=null;return;}
  const bx=m.ball.x,by=m.ball.y;p.hasBall=true;p.controlledSince=m.time;p.lastReceivedAt=m.time;p.scanFacingSide=0;p.scanFacingSideUntil=0;
  const flow=!!receiveMeta?.flow&&p.role!=='GK';
  p.action=p.role==='GK'?'GK_HOLD':flow?'FIRST_TOUCH_FLOW':'HOLD_BALL';
  p.sprint=false;p.lockTargetUntil=0;p.faceTargetAngle=null;m.ball.ownerId=p.id;m.ball.mode='CONTROLLED';m.ball.intendedReceiverId=null;m.ball.kind='CONTROL';m.ball.vx=m.ball.vy=m.ball.vz=0;m.ball.z=0;m.ball.attachBlend=snap?0:0.22;
  if(prevPoss&&prevPoss!==p.team){for(const q of m.players){q.runUntil=0;q.runType=null;}}m.possession=p.team;if(snap){m.ball.x=p.x+dir(p.team)*0.45;m.ball.y=p.y;}else{m.ball.x=bx;m.ball.y=by;}m.lastTouchTeam=p.team;m.lastTouchPlayer=p.id;
  updateAttackRhythmOnRegain(m,p,prevPoss);
  if(flow){
    const sp=Math.hypot(p.vx,p.vy),kind=receiveMeta.flightKind||'PASS',delivery=receiveMeta.deliveryMode||'GROUND',source=playerById(m,receiveMeta.sourceId);
    const attackGoalX=p.team===HOME?105:0,goalVec=norm(attackGoalX-p.x,34-p.y),goalAngle=Math.atan2(goalVec.y,goalVec.x);
    const incomingSpeed=Math.hypot(Number(receiveMeta.incomingVx)||0,Number(receiveMeta.incomingVy)||0),incomingFace=incomingSpeed>0.2?norm(-(Number(receiveMeta.incomingVx)||0),-(Number(receiveMeta.incomingVy)||0)):(source?norm(source.x-p.x,source.y-p.y):{x:-goalVec.x,y:-goalVec.y});
    const moveVec=sp>0.45?{x:p.vx/sp,y:p.vy/sp}:goalVec;
    // TT-0.51 1_8: moving TO the meeting point and the touch AFTER contact are separate vectors.
    // A through-ball still rewards an active run; ordinary/long receptions open the first touch
    // into the attacking view instead of continuing a baseball-style chase through the ball.
    const incomingTravel=incomingSpeed>0.2?norm(Number(receiveMeta.incomingVx)||0,Number(receiveMeta.incomingVy)||0):moveVec;
    let touchVec;
    if(kind==='THROUGH'&&sp>0.75)touchVec=norm(moveVec.x*.78+goalVec.x*.22,moveVec.y*.78+goalVec.y*.22);
    else if(kind==='PASS'){
      // R19 report: an ordinary/progressive pass receiver often accelerates toward the meeting
      // point before contact. That convergence vector is NOT the desired post-touch direction.
      // Open the first touch into the attacking view, with only a small contribution from the
      // incoming ball path, so a RW receiving at his feet does not keep drifting back/up-field.
      touchVec=norm(incomingTravel.x*.28+goalVec.x*.72,incomingTravel.y*.28+goalVec.y*.72);
    }else if(sp>0.45)touchVec=norm(moveVec.x*.48+incomingTravel.x*.20+goalVec.x*.32,moveVec.y*.48+incomingTravel.y*.20+goalVec.y*.32);
    else touchVec=norm(incomingTravel.x*.62+goalVec.x*.38,incomingTravel.y*.62+goalVec.y*.38);
    const throughMomentum=kind==='THROUGH'&&sp>0.75,continuation=throughMomentum?clamp(sp*.92,4.2,5.8):kind==='THROUGH'?3.10:kind==='CUTBACK'?1.20:kind==='LONG_PASS'?1.05:1.15;
    p.tx=clamp(p.x+touchVec.x*continuation,1,104);p.ty=clamp(p.y+touchVec.y*continuation,1,67);p.tacticalTask='FIRST_TOUCH_FLOW';p.sprint=throughMomentum;if(throughMomentum)p.receiveRunContinuationUntil=m.time+1.05;
    // Pre-contact scan opens the body between the incoming ball and the attacking view. Through
    // runners remain more run-facing; other receivers are visibly half-open before the first touch.
    const faceVec=kind==='THROUGH'&&sp>0.75?norm(moveVec.x*.70+goalVec.x*.30,moveVec.y*.70+goalVec.y*.30):norm(incomingFace.x*.44+goalVec.x*.56,incomingFace.y*.44+goalVec.y*.56);
    let receiveBase=Math.atan2(faceVec.y,faceVec.x),receptionPressure=nearestOppDistance(m,p),tightBackToGoal=p.role==='ST'&&receptionPressure<1.35,receiveTurn=angleDiff(receiveBase,goalAngle);
    const maxReceiveTurn=tightBackToGoal?Math.PI*.55:Math.PI*.72;receiveTurn=clamp(receiveTurn,-maxReceiveTurn,maxReceiveTurn);
    p.faceTargetAngle=receiveBase+receiveTurn*(tightBackToGoal?0.30:0.42);p.receiveFacingUntil=m.time+1.55;
    // INTERNAL V0.6 rhythm: receivers keep moving through the first touch, but do not
    // instantly ping-pong the ball again after 0.1~0.2s. Through-ball receivers still
    // decide fastest; aerial/pressured receptions need a little longer to settle.
    const pressure=nearestOppDistance(m,p);let settle=delivery==='AERIAL'?(0.70+m.r()*0.22):pressure<1.55?(0.56+m.r()*0.20):kind==='THROUGH'?(0.34+m.r()*0.15):(0.53+m.r()*0.18);
    const receiveLocal=worldToLocal(p.team,p.x,p.y),decisiveThroughFlow=kind==='THROUGH'&&['ST','WF','CM'].includes(p.role)&&receiveLocal.x>=80&&pressure>=1.65;
    // R16 feedback: a successful through-ball reception in the attacking lane must not be
    // locked into first-touch animation until the defence has already recovered. The ball
    // is still physically controlled; this only reopens the next live decision earlier.
    if(decisiveThroughFlow)settle=Math.min(settle,0.58);
    const flowTargetHold=throughMomentum?(decisiveThroughFlow?Math.max(0.58,settle):Math.max(1.05,settle)):Math.min(settle,0.62);p.lockTargetUntil=m.time+flowTargetHold;p.nextThink=m.time+settle;p.receiveFlowUntil=m.time+flowTargetHold;
    m.stats.flowReceives=(m.stats.flowReceives||0)+1;if(delivery==='AERIAL')m.stats.flowAerialReceives=(m.stats.flowAerialReceives||0)+1;else m.stats.flowGroundReceives=(m.stats.flowGroundReceives||0)+1;
    m.stats.maxFlowReceiveDelay=Math.max(m.stats.maxFlowReceiveDelay||0,settle);
  }
}
function setBallFlight(m,{source,target,kind='PASS',speed=16,loft=0.2,targetPoint=null,deliveryMode=null,curve=0,style=null,groundDragK=null,crossVariant=null,intendedTargetPoint=null,receiverIntentLock=false}){
  const tp=targetPoint||{x:target.x,y:target.y};
  // Law 11 is frozen at the instant the team-mate plays the ball. The receiver may sprint
  // beyond the line during the following physics frame without retroactively becoming offside.
  const offsideEligible=!!(source&&target&&['PASS','LONG_PASS','THROUGH','CUTBACK','CROSS'].includes(kind));
  const offsideAtRelease=offsideEligible?isOffsideAtPass(m,target,source.team):false;
  const offsideLineAtRelease=offsideEligible?offsideLine(m,source.team):null;
  const releaseBallX=m.ball.x;
  const dx=tp.x-m.ball.x,dy=tp.y-m.ball.y,d=Math.hypot(dx,dy)||1,straight={x:dx/d,y:dy/d};
  let n=straight,curveAccel=Number(curve)||0;
  if(Math.abs(curveAccel)>0.01){
    // Compensate the initial aim for the lateral acceleration so a curled effort still targets
    // the chosen goal lane instead of simply bending away from it. This is deliberately light
    // 2D ball feel, not a full aerodynamic simulation.
    const t=clamp(d/Math.max(1,speed),0.35,1.35),offset=0.5*curveAccel*t*t,px=-straight.y,py=straight.x;
    const adj=norm(dx-px*offset,dy-py*offset);n=adj;
  }
  if(source)source.hasBall=false;
  const chipLob=kind==='SHOT'&&style==='CHIP',arcDuration=chipLob?clamp(d/Math.max(1,speed),0.72,1.55):0,arcHeight=chipLob?clamp(Number(loft)||3.65,3.0,4.4):0;
  m.ball={mode:'FLIGHT',x:m.ball.x,y:m.ball.y,z:chipLob?0:(loft>=0.6?0.15:0),vx:n.x*speed,vy:n.y*speed,vz:chipLob?0:(loft>=0.6?Math.sqrt(Math.max(0,2*9.81*loft)):0),ownerId:null,intendedReceiverId:target?target.id:null,kind,deliveryMode:deliveryMode||(loft>=0.6?'AERIAL':'GROUND'),strikeStyle:style||null,curveAccel,curveSign:Math.sign(curveAccel)||0,groundDragK:Number.isFinite(groundDragK)?Number(groundDragK):null,arcProfile:chipLob?'CHIP_LOB':null,arcDuration,arcHeight,lastTouchTeam:source?source.team:m.lastTouchTeam,lastTouchPlayer:source?source.id:m.lastTouchPlayer,age:0,originX:m.ball.x,originY:m.ball.y,targetX:tp.x,targetY:tp.y,intendedTargetX:intendedTargetPoint?.x??tp.x,intendedTargetY:intendedTargetPoint?.y??tp.y,receiverIntentLock:!!receiverIntentLock,crossVariant:crossVariant||null,airborne:chipLob||loft>=0.6,offsideAtRelease,offsideLineAtRelease,releaseBallX};
  m.ballOwner=null;m.possession=source?source.team:m.possession;
}
function setLoose(m,x,y,vx,vy,lastTeam,lastPlayer){
  for(const p of m.players)p.hasBall=false;
  m.ball={mode:'LOOSE',x,y,z:0,vx,vy,vz:0,ownerId:null,intendedReceiverId:null,kind:'LOOSE',lastTouchTeam:lastTeam,lastTouchPlayer:lastPlayer,age:0,originX:x,originY:y};m.ballOwner=null;
}
const KICKOFF_TAKING_LOCAL={
  GK:[5.5,34],LB:[20,10],LCB:[18.5,27],RCB:[18.5,41],RB:[20,58],
  LCM:[42,22],CM:[52.5,34],RCM:[42,46],LW:[49,14],ST:[50.2,34],RW:[49,54]
};
const KICKOFF_DEFENDING_LOCAL={
  GK:[5.5,34],LB:[20,10],LCB:[18.5,27],RCB:[18.5,41],RB:[20,58],
  LCM:[34,22],CM:[36,34],RCM:[34,46],LW:[42,16],ST:[43.0,34],RW:[42,52]
};
function kickoffSetupTarget(p,kickoffTeam){
  const taking=p.team===kickoffTeam,base=(taking?KICKOFF_TAKING_LOCAL:KICKOFF_DEFENDING_LOCAL)[p.slot]||[35,34];
  let lx=base[0],ly=base[1];
  // Law 8 contract: except for the taker, every player must be in their own half.
  // Opponents also stay outside the 9.15 m centre-circle radius until the kick is taken.
  const takerId=kickoffTeam===HOME?'H-CM':'A-CM';
  if(taking&&p.id===takerId){lx=52.5;ly=34;}
  else lx=Math.min(lx,51.9);
  return localToWorld(p.team,lx,ly);
}
function deterministicCelebrationTarget(m,scorer){
  const local=worldToLocal(scorer.team,scorer.x,scorer.y),nearTop=local.y<=34;
  const nearCorner={x:103.0,y:nearTop?3.0:65.0},farCorner={x:103.0,y:nearTop?65.0:3.0};
  const touch={x:clamp(local.x+3.5,76,99),y:nearTop?3.0:65.0};
  // No simulation RNG is consumed here.  Celebration variety is derived from immutable
  // match context so inserting presentation never changes later football outcomes.
  const h=hash32(`${m.seed}|GOAL_CELEBRATION|${m.stats.goals}|${scorer.id}`)%5;
  const target=h<=2?nearCorner:h===3?touch:farCorner;
  return localToWorld(scorer.team,target.x,target.y);
}
function clearOpenPlayIntentForGoal(m,p){
  p.hasBall=false;p.runUntil=0;p.runType=null;p.lockTargetUntil=0;p.pressCommitUntil=0;p.pressRecoverUntil=0;
  p.duelContainUntil=0;p.duelPairCooldownUntil=0;p.markTargetId=null;p.nextThink=Number.POSITIVE_INFINITY;
  p.action='POST_GOAL_RESET';p.tacticalTask='POST_GOAL_RESET';p.sprint=false;
}
const REALISM_RESTART_TOTAL_SECONDS={THROW_IN:15.6,GOAL_KICK:29.4,CORNER:33.6,FREE_KICK:28.8,OFFSIDE:20.0,GOAL:30.0};
const REALISM_VISIBLE_RESTART_BASELINE={THROW_IN:2.6,GOAL_KICK:5.1,CORNER:5.7,FREE_KICK:3.1,OFFSIDE:3.1,GOAL:5.0};
function consumeCompressedDeadClock(m,kind){
  const target=REALISM_RESTART_TOTAL_SECONDS[kind],visible=REALISM_VISIBLE_RESTART_BASELINE[kind]||0;if(!Number.isFinite(target))return 0;
  const extra=Math.max(0,target-visible);m.time+=extra;m.stats.compressedDeadClock=(m.stats.compressedDeadClock||0)+extra;m.stats.compressedDeadClockByKind=m.stats.compressedDeadClockByKind||{};m.stats.compressedDeadClockByKind[kind]=(m.stats.compressedDeadClockByKind[kind]||0)+extra;return extra;
}
function startGoalCelebration(m,scoringTeam){
  consumeCompressedDeadClock(m,'GOAL');
  const kickoffTeam=other(scoringTeam),scorer=playerById(m,m.ball.lastTouchPlayer)||outfield(m,scoringTeam).sort((a,b)=>dist(a,m.ball)-dist(b,m.ball))[0];
  for(const p of m.players)clearOpenPlayIntentForGoal(m,p);
  m.activeDuel=null;m.transitionUntil=0;m.ballOwner=null;m.possession=kickoffTeam;
  m.ball.mode='DEAD';m.ball.ownerId=null;m.ball.vx=m.ball.vy=m.ball.vz=0;m.ball.z=0;m.ball.kind='GOAL_DEAD';
  const joiners=[];
  if(scorer){
    const celebrationTarget=deterministicCelebrationTarget(m,scorer);
    scorer.tx=celebrationTarget.x;scorer.ty=celebrationTarget.y;scorer.action='GOAL_SCORER_CELEBRATE';scorer.tacticalTask='GOAL_SCORER_CELEBRATE';scorer.sprint=true;
    const near=outfield(m,scoringTeam).filter(p=>p.id!==scorer.id&&dist(p,scorer)<=22).sort((a,b)=>dist(a,scorer)-dist(b,scorer)).slice(0,4);
    for(const p of near){joiners.push(p.id);p.action='JOIN_GOAL_CELEBRATION';p.tacticalTask='JOIN_GOAL_CELEBRATION';p.sprint=true;}
  }
  const joining=new Set(joiners);
  for(const p of m.players){
    if(scorer&&p.id===scorer.id||joining.has(p.id))continue;
    const t=kickoffSetupTarget(p,kickoffTeam);p.tx=t.x;p.ty=t.y;p.action='RETURN_FOR_KICKOFF';p.tacticalTask='RETURN_FOR_KICKOFF';p.sprint=dist(p,t)>7;
  }
  m.goalCelebration={scoringTeam,kickoffTeam,scorerId:scorer?.id||null,joinerIds:joiners,startedAt:m.time};
  m.restart={kind:'KICKOFF',team:kickoffTeam,until:m.time+5.0};m.phase='GOAL_CELEBRATION';m.nextShape=m.restart.until;
}
function updateGoalCelebrationTargets(m){
  const c=m.goalCelebration;if(!c)return;
  const scorer=playerById(m,c.scorerId);if(!scorer)return;
  for(const id of c.joinerIds||[]){
    const p=playerById(m,id);if(!p)continue;
    const h=hash32(`${id}|${c.scorerId}`),side=(h&1)?1:-1,back=1.05+((h>>>1)%7)*0.10,lateral=0.75+((h>>>4)%8)*0.10;
    p.tx=clamp(scorer.x-dir(scorer.team)*back,1,104);p.ty=clamp(scorer.y+side*lateral,1,67);p.action='JOIN_GOAL_CELEBRATION';p.tacticalTask='JOIN_GOAL_CELEBRATION';p.sprint=dist(p,scorer)>2.2;
  }
}
function placeKickoff(m,team){
  for(const p of m.players){
    const w=kickoffSetupTarget(p,team);p.x=w.x;p.y=w.y;p.vx=p.vy=0;p.tx=p.x;p.ty=p.y;p.action='KICKOFF_SHAPE';p.tacticalTask='KICKOFF_SHAPE';p.sprint=false;p.hasBall=false;p.nextThink=0;
  }
  m.goalCelebration=null;
  const p=playerById(m,team===HOME?'H-CM':'A-CM');const c=localToWorld(team,52.5,34);p.x=c.x;p.y=c.y;setControlled(m,p);p.action='KICKOFF_TAKER';p.tacticalTask='KICKOFF_TAKER';m.phase='KICKOFF';m.nextShape=0;m.transitionUntil=0;
}
function kickoff(m,team){placeKickoff(m,team);m.restart={kind:'KICKOFF',team,until:m.time+0.9};event(m,'KICKOFF',`${subjectName(teamDisplayName(team))} 경기를 시작합니다.`);}
function createMatch(seed='step34',opts={}){
  const m={seed:String(seed),r:rng(seed),dt:Number(opts.dt)||DEFAULT_DT,time:0,playerAbilityProfiles:{...(opts.playerAbilityProfiles||{})},managerProfiles:{...(opts.managerProfiles||{})},players:createPlayers(),playersById:{},ball:{mode:'DEAD',x:52.5,y:34,z:0,vx:0,vy:0,vz:0,ownerId:null},ballOwner:null,possession:HOME,lastTouchTeam:HOME,lastTouchPlayer:null,score:{HOME:0,AWAY:0},phase:'KICKOFF',restart:null,nextShape:0,transitionUntil:0,events:[],completed:false,lastChallengeAt:-99,lastFoulAt:-99,lastRecycleAt:{HOME:-99,AWAY:-99},frontPassChain:{HOME:0,AWAY:0},nextRunPlan:{HOME:0,AWAY:0},lastPassAt:{HOME:-99,AWAY:-99},lastShotAt:{HOME:-99,AWAY:-99},kickoffBuildUntil:0,tactical:null,activeDuel:null,attackRecycleUntil:{HOME:0,AWAY:0},attackRecycleFloor:{HOME:0,AWAY:0},attackRhythm:{HOME:{possessionStartedAt:0,regainX:52.5,settleUntil:0,counterUntil:0},AWAY:{possessionStartedAt:0,regainX:52.5,settleUntil:0,counterUntil:0}},stats:{passes:0,completedPasses:0,progressivePasses:0,throughPasses:0,backwardThroughPasses:0,wideThroughPasses:0,passesOnMove:0,longGroundPasses:0,longAerialPasses:0,aerialPasses:0,aerialDuels:0,aerialDuelsWonByAttack:0,aerialDuelsWonByDefence:0,goalKickAerialContests:0,flowReceives:0,flowGroundReceives:0,flowAerialReceives:0,maxFlowReceiveDelay:0,switchesOfPlay:0,crosses:0,earlyCrosses:0,deepWideCrosses:0,bylineCrosses:0,highCrosses:0,drivenLowCrosses:0,crossExecutionErrors:0,crossHeaderAttempts:0,crossHeaderShotsOnTarget:0,crossesCompleted:0,crossesDefended:0,cutbacks:0,recycles:0,recycleReattacks:0,midfieldShots:0,midfieldBoxShots:0,midfieldLongShots:0,midfieldLongShotCandidates:0,midfieldFinalReceipts:0,passDeflections:0,passLooseBalls:0,fouls:0,freeKicks:0,carries:0,carryDistance:0,takeOnAttempts:0,takeOnWins:0,takeOnTackled:0,takeOnLoose:0,takeOnDistance:0,takeOnBreakawayShots:0,boxCommittedCarries:0,boxCarryExtensions:0,boxCarryPressureReleases:0,clearRunwayCarries:0,runsStarted:0,maxFrontPassChain:0,shots:0,boxShots:0,boxFinalActions:0,boxBackPasses:0,boxEntriesST:0,boxEntriesWF:0,boxEntriesCM:0,boxSlotConflicts:0,duelDisengages:0,duelContactResolves:0,duelEpisodes:0,duelForcedResolves:0,maxDuelDuration:0,maxStationaryDuel:0,maxPairedDuel:0,maxBoxPairedDuel:0,goals:0,turnovers:0,interceptions:0,challenges:0,tacklesWon:0,offsides:0,throwIns:0,corners:0,goalKicks:0,saves:0,gkCatches:0,gkParries:0,blocks:0,shotBlocks:0,clearances:0,looseBalls:0,maxCrowd:0,minSpacing:99,possessionSeconds:{HOME:0,AWAY:0},firstHalfPossession:{HOME:0,AWAY:0},secondHalfPossession:{HOME:0,AWAY:0},longestPossession:{HOME:0,AWAY:0},shotReasons:{},currentPossessionTeam:null,currentPossessionStartedAt:0,shotsByTeam:{HOME:0,AWAY:0},crossesByTeam:{HOME:0,AWAY:0},crossesBySourceSlot:{LW:0,RW:0,LB:0,RB:0,OTHER:0},crossesToST:0,wfCrossesToST:0,bylineCrossesByTeam:{HOME:0,AWAY:0},headerShotsByTeam:{HOME:0,AWAY:0},takeOnAttemptsByRole:{WF:0,ST:0,CM:0,FB:0},passStyles:{},shotStyles:{},fullbackSurges:0}};
  if(TELEMETRY&&typeof TELEMETRY.createState==='function')m.telemetry=TELEMETRY.createState(opts.telemetry||{});
  rebuildMap(m);kickoff(m,m.r()<.5?HOME:AWAY);return m;
}
function event(m,type,text,meta=null){m.events.push({t:m.time,type,text,...(meta&&typeof meta==='object'?meta:{})});if(m.events.length>100)m.events.shift();if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.onEvent==='function')TELEMETRY.onEvent(m,type,text);}

function slotLane(slot){
  return{LB:10,LCB:27,RCB:41,RB:58,LCM:21,CM:34,RCM:47,LW:11,ST:34,RW:57,GK:34}[slot]??34;
}
function baseLocalX(role,possessing,progress){
  const attack={GK:6,FB:26,CB:22,CM:46,WF:70,ST:73};
  const defend={GK:6,FB:24,CB:21,CM:42,WF:58,ST:61};
  const b=(possessing?attack:defend)[role]||45;
  const shift=possessing?clamp((progress-50)*0.26,-10,13):clamp((progress-50)*0.18,-8,9);
  return clamp(b+shift,4,99);
}
function offsideLine(m,attTeam){
  // Law 11 uses the second-last OPPONENT, not the second-last outfield defender.
  // The goalkeeper is an opponent too and is normally the last opponent.
  const defenders=teamPlayers(m,other(attTeam)).map(p=>p.x).sort((a,b)=>a-b);
  if(attTeam===HOME)return defenders[defenders.length-2]??101;
  return defenders[1]??4;
}
function isOffsideAtPass(m,target,team){
  if(!target)return false;const line=offsideLine(m,team),bx=m.ball.x;
  return team===HOME?(target.x>52.5&&target.x>bx+0.25&&target.x>line+0.25):(target.x<52.5&&target.x<bx-0.25&&target.x<line-0.25);
}
function nearestOppDistance(m,p){let d=99;for(const q of outfield(m,other(p.team)))d=Math.min(d,dist(p,q));return d;}
function updateAttackRhythmOnRegain(m,p,prevPoss){
  if(!m.attackRhythm||!prevPoss||prevPoss===p.team)return;
  const st=m.attackRhythm[p.team]||(m.attackRhythm[p.team]={possessionStartedAt:m.time,regainX:52.5,settleUntil:0,counterUntil:0});
  const l=worldToLocal(p.team,p.x,p.y),pr=m.managerProfiles?.[p.team]||{},transition=Number(pr.transition??0.50),directness=Number(pr.directness??0.50),pressure=nearestOppDistance(m,p);
  st.possessionStartedAt=m.time;st.regainX=l.x;st.lastRegainAt=m.time;
  // A high regain or a genuinely transition-oriented side may attack the disorganised defence.
  // Routine middle/deep regains instead get a short structure-building phase. This is not a
  // possession quota: reaching the final third or finding a real counter lane ends the restraint.
  const highRegain=l.x>=73;
  const openMidfieldCounter=l.x>=60&&pressure>2.25&&(transition>=0.72||directness>=0.80);
  const transitionReady=highRegain||openMidfieldCounter;
  if(transitionReady){st.counterUntil=m.time+clamp(2.8+transition*1.8,3.0,4.6);st.settleUntil=0;return;}
  // If a transition-oriented side cannot find a REAL counter, do not let it play a
  // half-counter every two seconds. Counter teams should be distinctive in both directions:
  // attack immediately when the defence is genuinely exposed, but take an extra beat to
  // reconnect when that window is closed. This lowers repeated pseudo-counters without
  // dulling genuine high-regain/open-lane transitions.
  const failedCounterReset=clamp(Math.max(0,transition-0.60)*2.40+Math.max(0,directness-0.65)*1.60,0,1.55);
  const settle=clamp(2.35+(1-transition)*2.15+(1-directness)*1.35+failedCounterReset-Math.max(0,l.x-42)*0.025,1.7,6.2);
  st.counterUntil=0;st.settleUntil=m.time+settle;
}
function rhythmBuildUpAction(m,owner,pre){
  const st=m.attackRhythm?.[owner.team];if(!st||m.time>=(st.settleUntil||0)||m.time<(st.counterUntil||0))return null;
  const local=pre.local,shot=pre.shot,opts=pre.opts,held=pre.held,pressure=pre.pressure,space=pre.space;
  // Never suppress an actual finishing state. The rhythm layer only affects the route TO the chance.
  if(local.x>=72||shot.oneVOne||shot.inBox)return null;
  const measured=opts.find(o=>o.block===0&&o.open>1.55&&o.forward>=2&&o.forward<=12&&!o.offsideRisk);
  const support=opts.find(o=>o.block===0&&o.open>1.75&&['CM','FB','CB'].includes(o.p.role)&&o.forward>-6&&o.forward<10&&!o.offsideRisk);
  if(held<0.78&&space>1.8)return{type:'CARRY',reason:'RHYTHM_SETTLE_TOUCH'};
  if(measured&&held>1.05&&pressure>1.25)return{type:'PASS',target:measured.p,kind:measured.d>31?'LONG_PASS':'PASS',option:measured,reason:'RHYTHM_MEASURED_PROGRESS'};
  if(support&&held>1.20)return{type:'PASS',target:support.p,kind:'PASS',option:support,reason:'RHYTHM_SUPPORT'};
  if(local.x<66&&space>1.6)return{type:'CARRY',reason:'RHYTHM_CARRY'};
  return null;
}
function ballCarrierPressureDistance(m,p){let d=nearestOppDistance(m,p);for(const q of outfield(m,other(p.team))){const pairCooling=(q.duelPairCooldownUntil||0)>m.time&&q.duelPairCooldownOwnerId===p.id;if(pairCooling&&dist(p,q)<3.0)d=Math.min(d,0.80);else if((q.duelContainUntil||0)>m.time&&dist(p,q)<2.2)d=Math.min(d,0.65);}return d;}
function attackersAhead(m,p){return outfield(m,p.team).filter(q=>q.id!==p.id&&dir(p.team)*(q.x-p.x)>1);}
function laneBlockers(m,a,b,team){return outfield(m,team).filter(p=>segmentPointDistance(a.x,a.y,b.x,b.y,p.x,p.y)<1.15&&dist(a,p)>1.4&&dist(b,p)>1.2).sort((x,y)=>dist(a,x)-dist(a,y));}


function clearExpiredRuns(m){for(const p of m.players)if((p.runUntil||0)<=m.time){p.runUntil=0;p.runType=null;}}
function safeRunLocalX(m,p,wanted){
  // Offside reference is the farther-forward of the second-last defender and the ball.
  // If the carrier has already broken the line, supporting attackers may legally run up
  // to the ball instead of being artificially pinned outside the penalty area.
  const line=offsideLine(m,p.team),lineLocal=worldToLocal(p.team,line,p.y).x,ballLocal=worldToLocal(p.team,m.ball.x,p.y).x;
  const safeLocal=Math.max(lineLocal,ballLocal)-0.35;
  return clamp(Math.min(wanted,safeLocal,96.8),5,96.8);
}
function beginRun(m,p,lx,ly,type,duration){
  let x=safeRunLocalX(m,p,lx);
  // Real attackers occasionally mistime a run by a fraction of a metre. Keep the error on
  // run timing (not Law 11 judgement): only aggressive in-behind/diagonal runs may cross the
  // safe reference slightly, and better off-ball players do so less often. The passer still has
  // to select that marginally-offside runner, so this creates occasional offsides rather than
  // manufacturing them on every run.
  if(['RUN_IN_BEHIND','DIAGONAL_RUN'].includes(type)&&lx>x+0.15){
    const offBall=abilityValue(m,p,'off_ball'),mistakeP=clamp(0.34-(offBall-50)*0.0032,0.10,0.36),bucket=Math.floor(m.time*2),roll=(hash32(`${m.seed}|RUN_TIMING|${bucket}|${p.id}|${type}`)%10000)/10000;
    if(roll<mistakeP){const magRoll=(hash32(`${m.seed}|RUN_MARGIN|${bucket}|${p.id}|${type}`)%10000)/10000,overshoot=0.28+magRoll*0.52;x=clamp(Math.min(lx,x+overshoot),5,96.8);p.runTimingRisk=true;}else p.runTimingRisk=false;
  }else p.runTimingRisk=false;
  const w=localToWorld(p.team,x,clamp(ly,4,64));m.stats.runsStarted++;p.runUntil=m.time+duration;p.runTx=w.x;p.runTy=w.y;p.runType=type;
}
function planAttackingRuns(m,team,owner,progress,ballLocal){
  if(!owner||m.ball.mode!=='CONTROLLED'||m.nextRunPlan[team]>m.time)return;
  m.nextRunPlan[team]=m.time+10.0+m.r()*6.0;
  const ps=teamPlayers(m,team),ownerLocal=worldToLocal(team,owner.x,owner.y);
  const st=ps.find(p=>p.role==='ST'&&p.id!==owner.id),wfs=ps.filter(p=>p.role==='WF'&&p.id!==owner.id),fbs=ps.filter(p=>p.role==='FB'&&p.id!==owner.id),cms=ps.filter(p=>p.role==='CM'&&p.id!==owner.id);
  const chooseST=m.r()<0.58;
  if(chooseST&&progress>=30&&progress<84&&st&&st.runUntil<=m.time){const sl=worldToLocal(team,st.x,st.y),side=ballLocal.y<34?1:-1;beginRun(m,st,Math.max(sl.x+7,progress+9),clamp(34+side*6,15,53),'RUN_IN_BEHIND',1.6+m.r()*0.7);}
  else if(progress>=35&&progress<87&&wfs.length){const far=wfs.sort((a,b)=>Math.abs(worldToLocal(team,b.x,b.y).y-ballLocal.y)-Math.abs(worldToLocal(team,a.x,a.y).y-ballLocal.y))[0];if(far&&far.runUntil<=m.time){const l=worldToLocal(team,far.x,far.y);beginRun(m,far,Math.max(l.x+6,progress+7),lerp(l.y,34,0.28),'DIAGONAL_RUN',1.5+m.r()*0.7);}}
  if(progress>=48&&progress<80&&fbs.length&&m.r()<0.24){const near=fbs.sort((a,b)=>Math.abs(worldToLocal(team,a.x,a.y).y-ballLocal.y)-Math.abs(worldToLocal(team,b.x,b.y).y-ballLocal.y))[0];if(near&&near.runUntil<=m.time){const l=worldToLocal(team,near.x,near.y);beginRun(m,near,Math.max(l.x+7,progress+2),l.y,'OVERLAP_RUN',1.5+m.r()*0.6);}}
  if(progress>=32&&progress<67&&cms.length&&m.r()<0.08){const cm=cms.sort((a,b)=>dist(a,owner)-dist(b,owner))[0];if(cm&&cm.runUntil<=m.time){const l=worldToLocal(team,cm.x,cm.y);beginRun(m,cm,Math.max(l.x+4,progress+1),lerp(l.y,ownerLocal.y,0.15),'THIRD_MAN_RUN',1.2+m.r()*0.5);}}
}
function forwardSpace(m,p,maxD=11){
  const ddir=dir(p.team);let nearest=maxD;
  for(const q of outfield(m,other(p.team))){const fx=ddir*(q.x-p.x),lat=Math.abs(q.y-p.y);if(fx>0&&fx<maxD&&lat<3.8)nearest=Math.min(nearest,fx);}
  return nearest;
}

function assignShape(m){
  if(m.completed)return;clearExpiredRuns(m);
  if(TACTICS&&typeof TACTICS.assign==='function'){TACTICS.assign(m);return;}
  const ball={x:m.ball.x,y:m.ball.y},poss=m.possession,ballLocalPoss=worldToLocal(poss,ball.x,ball.y),progress=ballLocalPoss.x;
  const attacking=teamPlayers(m,poss),defending=teamPlayers(m,other(poss)),owner=playerById(m,m.ball.ownerId);
  planAttackingRuns(m,poss,owner,progress,ballLocalPoss);
  const supportCandidates=attacking.filter(p=>p.role!=='GK'&&p.id!==m.ball.ownerId).map(p=>({p,d:dist(p,ball)})).sort((a,b)=>a.d-b.d);
  const supportIds=new Set(supportCandidates.slice(0,2).map(x=>x.p.id));
  for(const p of attacking){
    const lane=slotLane(p.slot),local=worldToLocal(p.team,p.x,p.y),baseX=baseLocalX(p.role,true,progress);let lx=baseX,ly=lane,action='HOLD_SHAPE',sprint=false;
    if(m.ball.mode==='FLIGHT'&&m.ball.intendedReceiverId===p.id&&m.ball.kind!=='SHOT'){
      const useIntended=!!m.ball.receiverIntentLock,px=clamp((useIntended?m.ball.intendedTargetX:m.ball.targetX)??p.x,1,104),py=clamp((useIntended?m.ball.intendedTargetY:m.ball.targetY)??p.y,1,67),q=worldToLocal(p.team,px,py);lx=q.x;ly=q.y;action=m.ball.kind==='THROUGH'?'CHASE_THROUGH':'RECEIVE';sprint=dist(p,{x:px,y:py})>2.2;
    }else if(p.role==='GK'){lx=clamp(6+progress*0.025,5,9);ly=lerp(34,ballLocalPoss.y,0.08);action='GK_SUPPORT';}
    else if(p.id===m.ball.ownerId){
      if((p.receiveRunContinuationUntil||0)>m.time){const q=worldToLocal(p.team,p.tx,p.ty);lx=q.x;ly=q.y;action='FIRST_TOUCH_FLOW';sprint=true;}
      else if((p.lockTargetUntil||0)>m.time){const q=worldToLocal(p.team,p.tx,p.ty);lx=q.x;ly=q.y;action=p.action||'CARRY';sprint=p.sprint;}
      else{const probe=forwardSpace(m,p,8),canProbe=p.role!=='GK'&&local.x<88&&probe>2.0;lx=canProbe?local.x+Math.min(1.15,probe*0.18):local.x;ly=canProbe?clamp(local.y+(34-local.y)*0.018,4,64):local.y;action=canProbe?'PROBE_WITH_BALL':'SCAN_WITH_BALL';sprint=false;}
    }else if((p.runUntil||0)>m.time){const q=worldToLocal(p.team,p.runTx,p.runTy);lx=q.x;ly=q.y;action=p.runType||'ATTACK_RUN';sprint=true;}
    else if(p.role==='ST'){
      const line=offsideLine(m,p.team),safeWorld=p.team===HOME?line-0.9:line+0.9,safeLocal=worldToLocal(p.team,safeWorld,p.y).x,wideSupply=owner&&['WF','FB'].includes(owner.role)&&progress>=72&&Math.abs(ballLocalPoss.y-34)>=13;
      if(wideSupply){const top=ballLocalPoss.y<34,variant=hash32(`${m.seed}|CROSS_RUN|${Math.floor(m.time*2)}|${p.id}`)%3,targetY=variant===0?(top?30.0:38.0):variant===1?(top?38.0:30.0):(top?35.5:32.5);lx=Math.min(96.2,Math.max(88.5,Math.min(safeLocal,progress+7.5)));ly=targetY;action=variant===0?'ATTACK_NEAR_POST':variant===1?'ATTACK_FAR_POST':'PULL_OFF_FOR_CROSS';sprint=true;}
      else{lx=Math.min(Math.max(baseX,progress+4),Math.min(95.5,safeLocal));ly=lerp(34,ballLocalPoss.y,0.08);action='PIN_CENTRE_BACKS';}
    }else if(p.role==='WF'){
      const sameSide=(lane<34)===(ballLocalPoss.y<34);lx=clamp(baseX+(sameSide?2:-1),32,94);ly=sameSide?lerp(lane,ballLocalPoss.y,0.10):lane;action=sameSide?'WIDE_OPTION':'HOLD_WIDTH';
    }else if(p.role==='FB'){
      const sameSide=(lane<34)===(ballLocalPoss.y<34);lx=baseX+(sameSide?2:-3);ly=lane;action=sameSide?'SUPPORT_OUTSIDE':'REST_DEFENCE';
    }else if(p.role==='CM'){
      lx=baseX+(supportIds.has(p.id)?2:0);ly=lerp(lane,ballLocalPoss.y,supportIds.has(p.id)?0.11:0.03);action=supportIds.has(p.id)?'SHOW_FOR_BALL':'BALANCE';
    }
    lx=clamp(lx,4,97);ly=clamp(ly,4,64);const w=localToWorld(p.team,lx,ly);p.tx=w.x;p.ty=w.y;p.action=action;p.sprint=sprint;
  }
  const candidates=defending.filter(p=>p.role!=='GK').map(p=>({p,d:dist(p,ball)})).sort((a,b)=>a.d-b.d),press=candidates[0]?.p,cover=candidates[1]?.p;
  const defTeam=other(poss),defLocalBall=worldToLocal(defTeam,ball.x,ball.y),defProgress=defLocalBall.x;
  for(const p of defending){
    const lane=slotLane(p.slot),baseX=baseLocalX(p.role,false,defProgress);let lx=baseX,ly=lerp(lane,defLocalBall.y,p.role==='CB'?0.08:p.role==='CM'?0.12:0.06),action='HOLD_BLOCK',sprint=false;
    if(p.role==='GK'){
      const goalDepth=clamp(5.4+defProgress*0.025,5.2,8.3);lx=goalDepth;ly=lerp(34,defLocalBall.y,0.16);action='GK_SET';
      if(m.ball.mode==='LOOSE'&&inPenaltyArea(p.team,m.ball.x,m.ball.y)&&dist(p,m.ball)<10){const b=worldToLocal(p.team,m.ball.x,m.ball.y);lx=b.x;ly=b.y;action='GK_RUSH';sprint=true;}
      if(m.ball.mode==='FLIGHT'&&m.ball.kind==='SHOT'&&m.ball.shotTargetY!=null){const ideal=worldToLocal(p.team,oppGoalX(other(p.team)),m.ball.shotTargetY).y;lx=clamp(2.0+defProgress*0.01,1.8,4.0);ly=clamp(ideal,30.2,37.8);action='GK_SAVE_SET';sprint=true;}
    }else if(press&&p.id===press.id&&dist(p,ball)<19){
      const bx=owner?owner.x+owner.vx*0.18:ball.x,by=owner?owner.y+owner.vy*0.18:ball.y,b=worldToLocal(p.team,bx,by),ownerCarry=owner&&['CARRY_FORWARD','DRIBBLE_EVADE'].includes(owner.action),danger=defProgress<30,ownerHeld=owner?m.time-(owner.controlledSince||m.time):0,close=ownerCarry||(danger&&ownerHeld>1.8),gap=close?0.95:2.15;lx=clamp(b.x-gap,4,98);ly=b.y;action=close?'CLOSE_DOWN':'CONTAIN';sprint=dist(p,{x:bx,y:by})>3.2;
    }else if(cover&&p.id===cover.id&&dist(p,ball)<18){const b=worldToLocal(p.team,ball.x,ball.y);lx=lerp(baseX,b.x-3.5,0.30);ly=lerp(lane,b.y,0.22);action='COVER';}
    if(['LB','LCB','RCB','RB'].includes(p.slot)&&action==='HOLD_BLOCK')ly=lerp(lane,defLocalBall.y,0.06);
    lx=clamp(lx,3,99);ly=clamp(ly,4,64);const w=localToWorld(p.team,lx,ly);p.tx=w.x;p.ty=w.y;p.action=action;p.sprint=sprint;
  }
  applyTargetSeparation(m);
}
function applyTargetSeparation(m){
  for(const team of [HOME,AWAY]){
    const ps=teamPlayers(m,team).filter(p=>p.role!=='GK');
    for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
      const a=ps[i],b=ps[j],dx=b.tx-a.tx,dy=b.ty-a.ty,d=Math.hypot(dx,dy);if(d>=2.7||d<0.001)continue;
      const n=norm(dx,dy),push=(2.7-d)*0.45;a.tx-=n.x*push;a.ty-=n.y*push;b.tx+=n.x*push;b.ty+=n.y*push;
    }
  }
}
function onBallScanFacingTarget(m,p){
  if(!p||m.ball.mode!=='CONTROLLED'||m.ball.ownerId!==p.id||p.role==='GK'||Number.isFinite(p.faceTargetAngle))return null;
  if(!['HOLD_BALL','SCAN_WITH_BALL','PROTECT_SCAN','SHIELD_SCAN','PROBE_WITH_BALL','CARRY_SCAN','WIDE_CARRY_SCAN'].includes(p.action))return null;
  const goalAngle=Math.atan2(34-p.y,oppGoalX(p.team)-p.x),body=Number.isFinite(p.bodyAngle)?p.bodyAngle:goalAngle,diff=angleDiff(body,goalAngle),pressure=ballCarrierPressureDistance(m,p),l=worldToLocal(p.team,p.x,p.y);
  // A tightly-marked striker in the central attacking lane may genuinely play back-to-goal.
  // Even then, cap the posture at about 105 degrees; 130~170 degree scan states were stale
  // locomotion facing, not believable shielding. Outside that case, keep scan posture within 78°.
  const legitBackToGoal=p.role==='ST'&&pressure<1.50&&l.x>=64&&l.x<=91&&Math.abs(l.y-34)<=18;
  const maxAway=legitBackToGoal?Math.PI*.48:Math.PI*.43;
  const lockedSide=(p.scanFacingSideUntil||0)>m.time&&(p.scanFacingSide===1||p.scanFacingSide===-1)?p.scanFacingSide:0;
  if(Math.abs(diff)<=maxAway&&!lockedSide){p.scanFacingSide=0;p.scanFacingSideUntil=0;return null;}
  const side=lockedSide||Math.sign(diff||1);p.scanFacingSide=side;p.scanFacingSideUntil=Math.max(Number(p.scanFacingSideUntil||0),m.time+0.90);
  return goalAngle+side*maxAway;
}
function extendActiveCarryWaypoint(m,p){
  if(!p||m.ball.mode!=='CONTROLLED'||m.ball.ownerId!==p.id||!['CARRY_FORWARD','DRIBBLE_EVADE'].includes(p.action))return false;
  const user=m.userChoiceControl?.playerId===p.id&&m.userChoiceControl?.mode==='CARRY'&&m.userChoiceControl?.controllerOwned?m.userChoiceControl:null;
  const horizon=Math.max(Number(p.lockTargetUntil||0),user?Number(user.until||0):0);
  const remainTime=horizon-m.time,remain=dist(p,{x:p.tx,y:p.ty});
  // R19 report: open-field carries used a chain of short waypoints. Reaching each waypoint
  // triggered the generic arrival branch (velocity = 0) before ownerThink supplied the next
  // point, producing a visible stop-start-stop rhythm. Extend only the SAME already-authorized
  // carry vector shortly before arrival; defenders/collisions still determine actual speed.
  if(remainTime<=.16||remain>1.45)return false;
  const l=worldToLocal(p.team,p.x,p.y),tl=worldToLocal(p.team,p.tx,p.ty),vl={x:dir(p.team)*(p.vx||0),y:p.vy||0};
  let dx=tl.x-l.x,dy=tl.y-l.y,n=Math.hypot(dx,dy);
  if(n<.18){dx=Math.max(.45,vl.x);dy=vl.y*.28;n=Math.hypot(dx,dy);}
  if(n<.12){dx=1;dy=0;n=1;}
  // Never turn a forward carry backwards merely to preserve momentum.
  if(dx/n<.12){dx=Math.max(.35,Math.abs(dx));n=Math.hypot(dx,dy);}
  const pressure=ballCarrierPressureDistance(m,p),ext=clamp(1.65+remainTime*2.05+(pressure>2.8?.55:0),1.65,4.1),nx=clamp(l.x+dx/n*ext,4,96.2),ny=clamp(l.y+dy/n*ext,4,64),w=localToWorld(p.team,nx,ny);
  p.tx=w.x;p.ty=w.y;p.sprint=p.sprint&&pressure>2.0;m.stats.carryWaypointContinuityExtensions=(m.stats.carryWaypointContinuityExtensions||0)+1;return true;
}
function movePlayers(m,dt){
  const owner=playerById(m,m.ball.ownerId);
  const ownerLocal=owner?worldToLocal(owner.team,owner.x,owner.y):null;
  const ownerCarrying=!!owner&&m.ball.mode==='CONTROLLED'&&['CARRY_FORWARD','CARRY_SCAN','DRIBBLE_EVADE','COMMITTED_BOX_CARRY','TAKE_ON'].includes(owner.action);
  const finalThirdPaceMode=!!ownerCarrying&&!!ownerLocal&&ownerLocal.x>=78;
  for(const p of m.players){
    if((p.receiveFacingUntil||0)>0&&m.time>p.receiveFacingUntil){p.receiveFacingUntil=0;if(!['TURNING_SHOT_PREP','POST_SHOT_FOLLOW'].includes(p.action))p.faceTargetAngle=null;}
    // STEP74: a forward carry target can become stale after contact/spacing correction pushes
    // the carrier beyond it. Never make an active dribble turn around just to revisit that old
    // coordinate; continue from the current physical position instead.
    if(p.id===m.ball.ownerId&&m.ball.mode==='CONTROLLED'&&['DRIBBLE_EVADE','CARRY_FORWARD','TAKE_ON'].includes(p.action)){
      const progressDelta=dir(p.team)*((p.tx??p.x)-p.x);
      if(progressDelta<-.28){p.tx=clamp(p.x+dir(p.team)*.95,1,104);p.ty=clamp(p.y+(p.ty-p.y)*.20,1,67);}
    }
    extendActiveCarryWaypoint(m,p);
    const dx=p.tx-p.x,dy=p.ty-p.y,d=Math.hypot(dx,dy),scanFacing=onBallScanFacingTarget(m,p);
    // R16 feedback: hybrid scene entry may carry a legitimate previous-frame velocity that
    // points opposite the newly-authoritative tactical target. Bleed only that opposing
    // component during the first 0.45s; current position and live target remain untouched.
    if(Number.isFinite(p.hybridEntryAt)&&m.time-p.hybridEntryAt<=0.45&&d>0.08){
      const ndx=dx/d,ndy=dy/d,along=(p.vx||0)*ndx+(p.vy||0)*ndy,side=-((p.vx||0)*ndy)+(p.vy||0)*ndx,speed0=Math.hypot(p.vx||0,p.vy||0);
      if(along<-.20){const opposeDamp=clamp(1-dt*8.0,0.18,0.70);p.vx=ndx*(along*opposeDamp)-ndy*(side*.72);p.vy=ndy*(along*opposeDamp)+ndx*(side*.72);}
      else if(speed0>2.2&&along/Math.max(.01,speed0)<.35){const sideDamp=clamp(1-dt*7.2,.24,.62);p.vx=ndx*along-ndy*(side*sideDamp);p.vy=ndy*along+ndx*(side*sideDamp);}
    }
    if(d<0.02){
      p.vx=0;p.vy=0;
      const stationaryFacing=Number.isFinite(p.faceTargetAngle)?p.faceTargetAngle:scanFacing;
      if(Number.isFinite(stationaryFacing)){
        const agilityAttr=abilityValue(m,p,'agility'),turnRate=(2.15+agilityAttr/100*3.05),before=Number.isFinite(p.bodyAngle)?p.bodyAngle:stationaryFacing;
        p.bodyAngle=approachAngle(before,stationaryFacing,turnRate*dt);
      }
      continue;
    }
    const agilityAttr=abilityValue(m,p,'agility'),turnRate=(2.15+agilityAttr/100*3.05);
    const n={x:dx/d,y:dy/d},accelAttr=abilityValue(m,p,'acceleration'),paceAttr=abilityValue(m,p,'pace'),a=(ROLE_ACCEL[p.role]||5)*movementFactor(accelAttr,0.34);
    let vmax=(ROLE_SPEED[p.role]||7)*movementFactor(paceAttr,0.32)*(p.sprint?1:0.76);
    // R15: reconnecting to the midfield screen is a controlled recovery jog, not a full-speed
    // magnetic snap to a formation anchor.  The tactical target remains live and may update again.
    if(p.tacticalTask==='PIVOT_RECONNECT')vmax=Math.min(vmax,3.20);
    // Front players can recover into a block, but a default HOLD_BLOCK must not look like a
    // centre-back-style emergency sprint through midfield. Explicit press/chase tasks are untouched.
    if(['ST','WF'].includes(p.role)&&p.tacticalTask==='HOLD_BLOCK')vmax=Math.min(vmax,4.20);
    if(p.role==='GK'&&p.tacticalTask==='GK_SAVE_SET'){const gkMove=(abilityValue(m,p,'reaction')+abilityValue(m,p,'agility'))/2;vmax=clamp(5.85+(gkMove-60)*0.032,5.25,7.05);}
    const pathFacing=Math.atan2(n.y,n.x),explicitFacing=Number.isFinite(p.faceTargetAngle)?p.faceTargetAngle:scanFacing,beforeFacing=Number.isFinite(p.bodyAngle)?p.bodyAngle:pathFacing,lowSpeed=Math.hypot(p.vx||0,p.vy||0);
    // R16 feedback: a forward standing on a sub-metre micro-target must not spin through a
    // large arc just because that tiny target redraws around him. Real runs are unchanged;
    // only low-speed, no-explicit-facing micro-adjustments hold the existing posture.
    const microRunTask=['ATTACK_OPEN_CHANNEL','PIN_AND_RUN','PIN_CENTRE_BACKS'].includes(p.tacticalTask),microTargetHold=['ST','WF'].includes(p.role)&&!Number.isFinite(explicitFacing)&&((d<0.85&&lowSpeed<0.95)||(microRunTask&&d<1.35&&lowSpeed<1.55));
    const desiredFacing=microTargetHold?beforeFacing:((d<0.95&&Number.isFinite(explicitFacing))?explicitFacing:pathFacing),facingError=Math.abs(angleDiff(beforeFacing,desiredFacing));
    const effectiveTurnRate=(['ST','WF'].includes(p.role)&&lowSpeed<1.55&&!Number.isFinite(explicitFacing))?Math.min(turnRate,1.65):turnRate;p.bodyAngle=approachAngle(beforeFacing,desiredFacing,effectiveTurnRate*dt);
    // STEP39 V0.3: body orientation now has a visible physical cost.  A player facing
    // the wrong way must pivot before reaching full acceleration; agility shortens that delay.
    const alignment=clamp(1-facingError/Math.PI,0,1),turnMoveScale=0.18+0.82*Math.pow(alignment,1.25);vmax*=turnMoveScale;
    // TT-0.48 anti-skating: when the tactical target changes sharply, bleed the old
    // sideways velocity faster than forward velocity. Players still curve naturally, but
    // they no longer keep gliding laterally while the body is visibly turning.
    if(facingError>Math.PI*.19){const along=p.vx*n.x+p.vy*n.y,side=-p.vx*n.y+p.vy*n.x,sideDamp=clamp(1-dt*(2.4+2.8*facingError/Math.PI),.38,.93),backDamp=along<0?clamp(1-dt*3.8,.42,.90):1,na=along*backDamp,ns=side*sideDamp;p.vx=n.x*na-n.y*ns;p.vy=n.y*na+n.x*ns;}
    if(finalThirdPaceMode){
      if(p.hasBall)vmax=Math.min((ROLE_SPEED[p.role]||7)*0.87,6.40);
      else if(p.team===owner.team&&p.sprint)vmax=Math.min(vmax,4.85);
      else if(p.team!==owner.team&&p.sprint&&['FB','CB','CM'].includes(p.role))vmax=vmax;
    }
    let desired=Math.min(vmax,Math.sqrt(Math.max(0,2*a*d)));
    const userCarry=m.userChoiceControl?.playerId===p.id&&m.userChoiceControl?.mode==='CARRY'&&m.userChoiceControl?.controllerOwned?m.userChoiceControl:null,carryHorizon=Math.max(Number(p.lockTargetUntil||0),Number(userCarry?.until||0)),carrySpeed=Math.hypot(p.vx||0,p.vy||0),carryAlign=carrySpeed>.05?((p.vx||0)*n.x+(p.vy||0)*n.y)/carrySpeed:1,activeCarryFlow=p.hasBall&&['CARRY_FORWARD','DRIBBLE_EVADE'].includes(p.action)&&carryAlign>.55&&(carryHorizon>m.time+.16||d>.90);
    // R20 report: a live dribble may modulate stride, but every short internal waypoint must not
    // become a visible brake pulse. Keep locomotion momentum through the same authorized carry
    // while the direction remains similar; contact, sharp turns and the end of the carry still slow.
    if(activeCarryFlow){const established=carrySpeed>=2.45,continuityFloor=Math.min(vmax*(established?.88:.82),Math.max(established?2.85:2.35,carrySpeed*(established?.96:.92)));desired=Math.max(desired,continuityFloor);}
    if(finalThirdPaceMode&&(p.hasBall||p.sprint)&&!activeCarryFlow){const arrivalScale=clamp(d/1.35,0.12,1);desired=Math.min(desired,Math.sqrt(Math.max(0,2*a*d))*0.88,vmax*arrivalScale);}
    const tvx=n.x*desired,tvy=n.y*desired;
    const dvx=tvx-p.vx,dvy=tvy-p.vy,dv=Math.hypot(dvx,dvy),maxDv=a*dt*(0.58+0.42*turnMoveScale),sc=dv>maxDv?maxDv/(dv||1):1;p.vx+=dvx*sc;p.vy+=dvy*sc;
    const mx=p.vx*dt,my=p.vy*dt,travel=Math.hypot(mx,my);if(travel>=d){p.x=p.tx;p.y=p.ty;p.vx=p.vy=0;}else{const restartThrower=!!(m.restart&&m.restart.kind==='THROW_IN'&&m.restart.setup&&m.restart.setup.kickerId===p.id&&p.tacticalTask==='THROW_IN_THROWER');p.x=clamp(p.x+mx,0.8,104.2);p.y=clamp(p.y+my,restartThrower?-1.2:0.8,restartThrower?69.2:67.2);}
    if(p.hasBall&&['CARRY_FORWARD','DRIBBLE_EVADE','COMMITTED_BOX_CARRY','TAKE_ON'].includes(p.action)){m.stats.carryDistance=(m.stats.carryDistance||0)+travel;if(p.action==='TAKE_ON')m.stats.takeOnDistance=(m.stats.takeOnDistance||0)+travel;}
  }
  resolveSpacing(m);
  stabilizeMarkingBodies(m,dt);
  stabilizeWideMarkingStandoff(m,dt);
  stabilizeOwnerDefenders(m,dt);
  stabilizeBallCarrierDefenderCrowding(m,dt);
  stabilizeOffBallDefenderCrowding(m,dt);
}
function stabilizeBallCarrierDefenderCrowding(m,dt){
  const owner=playerById(m,m.ball.ownerId);if(!owner||m.ball.mode!=='CONTROLLED')return;
  const defTeam=other(owner.team),lock=m._defenceRoleLocks?.[defTeam]||{},pressId=lock.pressId||null,coverId=lock.coverId||null;
  const nearby=m.players.filter(p=>p.team===defTeam&&p.role!=='GK'&&dist(p,owner)<5.35);
  // Enforce the direct-responsibility label every physics tick, not only on the 0.25s shape tick.
  // This closes the transient TT-0.46 case where two CBs could both still display PRESS_CONTAIN.
  for(const d of nearby){
    if(d.id===pressId)continue;
    const task=d.tacticalTask||d.action||'';if(!['PRESS_CONTAIN','ENGAGE'].includes(task))continue;
    if(d.id===coverId){d.action=d.tacticalTask='SHOT_LANE_COVER';}
    else{d.action=d.tacticalTask=d.role==='CM'?'MIDFIELD_LANE_SCREEN':d.role==='FB'?'REST_DEFENCE':'BOX_RECOVERY_LINE';d.markTargetId=null;}
  }
  // Do not over-correct a healthy three-layer shell. TT-0.46 peeled every surplus body as soon
  // as it entered 5.35m, which could turn a compact defence into visible empty space. Allow up to
  // three nearby outfield defenders (presser + cover + one support); only the fourth+ must leave.
  if(nearby.length<=3)return;
  const eligible=nearby.filter(d=>d.id!==pressId&&d.id!==coverId&&!(d.markTargetId&&d.markTargetId!==owner.id&&['MARK_TIGHT','MARK_LANE_SCREEN'].includes(d.tacticalTask||d.action||'')))
    .sort((a,b)=>dist(b,owner)-dist(a,owner));
  const peel=eligible.slice(0,Math.min(eligible.length,nearby.length-3));
  for(const d of peel){
    let tx=Number.isFinite(d.tx)?d.tx:d.x,ty=Number.isFinite(d.ty)?d.ty:d.y,targetGap=Math.hypot(tx-d.x,ty-d.y),targetOwnerGap=Math.hypot(tx-owner.x,ty-owner.y);
    if(targetGap<0.12)continue;
    // Keep the secondary shell useful: if its assigned anchor is excessively far away, cap the
    // immediate recovery destination to a compact 7.2-9.0m goal-/lane-side ring around the ball.
    if(targetOwnerGap>9.0){const dx=tx-owner.x,dy=ty-owner.y,dg=Math.hypot(dx,dy)||1,ring=8.4;tx=owner.x+dx/dg*ring;ty=owner.y+dy/dg*ring;targetGap=Math.hypot(tx-d.x,ty-d.y);targetOwnerGap=ring;}
    if(targetOwnerGap<5.9)continue;
    const nx=(tx-d.x)/(targetGap||1),ny=(ty-d.y)/(targetGap||1),rx=d.x-owner.x,ry=d.y-owner.y,rd=Math.hypot(rx,ry)||1,ux=rx/rd,uy=ry/rd;
    let ex=nx*0.88+ux*0.24,ey=ny*0.88+uy*0.24,en=Math.hypot(ex,ey)||1;ex/=en;ey/=en;
    const inward=d.vx*(-ux)+d.vy*(-uy);if(inward>0){d.vx+=ux*Math.min(inward,1.25);d.vy+=uy*Math.min(inward,1.25);}
    const peelSpeed=rd<3.8?1.95:1.45,step=Math.min(targetGap,peelSpeed*dt);d.x=clamp(d.x+ex*step,0.8,104.2);d.y=clamp(d.y+ey*step,0.8,67.2);
    const desired=Math.min(3.6,Math.max(1.5,targetGap*0.45));d.vx=lerp(d.vx,nx*desired,clamp(dt*3.4,0,0.42));d.vy=lerp(d.vy,ny*desired,clamp(dt*3.4,0,0.42));
    m.stats.ballCarrierCrowdPeelCorrections=(m.stats.ballCarrierCrowdPeelCorrections||0)+1;
  }
}
function stabilizeOffBallDefenderCrowding(m,dt){
  const owner=playerById(m,m.ball.ownerId);if(!owner||m.ball.mode!=='CONTROLLED')return;
  for(const a of m.players){
    if(a.team!==owner.team||a.role==='GK'||a.id===owner.id)continue;
    const near=m.players.filter(d=>d.team!==a.team&&d.role!=='GK'&&dist(d,a)<3.55).sort((x,y)=>{
      const px=(x.markTargetId===a.id?4:0)+(x.role==='CB'?1.2:0)+(x.tacticalTask==='SHOT_LANE_COVER'?0.7:0),py=(y.markTargetId===a.id?4:0)+(y.role==='CB'?1.2:0)+(y.tacticalTask==='SHOT_LANE_COVER'?0.7:0);return py-px||dist(x,a)-dist(y,a);
    });
    if(near.length<=2)continue;
    for(const d of near.slice(2)){
      let vx=(d.tx??d.x)-d.x,vy=(d.ty??d.y)-d.y,td=Math.hypot(vx,vy);
      if(td<0.15||dist({x:d.tx,y:d.ty},a)<4.7){const side=(hash32(`${m.seed}|OFFBALL_DECLUSTER|${a.id}|${d.id}`)&1)?1:-1;vx=(d.x-a.x)*0.55;vy=(d.y-a.y)+side*2.2;td=Math.hypot(vx,vy)||1;}
      const step=Math.min(td,1.05*dt);d.x=clamp(d.x+vx/td*step,0.8,104.2);d.y=clamp(d.y+vy/td*step,0.8,67.2);
    }
  }
}
function stabilizeMarkingBodies(m,dt){
  if(!m._markBodyLocks)m._markBodyLocks={};
  for(const defender of m.players){
    if(defender.role==='GK'||defender.tacticalTask!=='MARK_LANE_SCREEN'||!defender.markTargetId)continue;
    const attacker=playerById(m,defender.markTargetId);if(!attacker||attacker.team===defender.team)continue;
    const d=dist(defender,attacker);if(d>4.6)continue;
    const dl=worldToLocal(defender.team,defender.x,defender.y),al=worldToLocal(defender.team,attacker.x,attacker.y);
    const tl=worldToLocal(defender.team,defender.tx,defender.ty),key=defender.id+'|'+attacker.id;
    let lock=m._markBodyLocks[defender.id];
    if(!lock||lock.attackerId!==attacker.id){
      let rel=dl.y-al.y;if(Math.abs(rel)<0.30)rel=tl.y-al.y;if(Math.abs(rel)<0.18)rel=(hash32(key)&1)?1:-1;
      lock=m._markBodyLocks[defender.id]={attackerId:attacker.id,side:rel>=0?1:-1};
    }
    const side=lock.side||1,gap=al.x-dl.x;
    let nx=dl.x,ny=dl.y;
    // Only repair a small shoulder inversion. If the runner has genuinely beaten the
    // marker by more than 0.8m, do not teleport the defender back in front.
    if(gap>=-0.80&&gap<0.45){const want=al.x-0.55,step=1.55*dt;nx+=clamp(want-nx,-step,step);}
    // Equally, do not recreate the old regression where a marker escorts the attacker
    // from several metres ahead. Keep close marking depth, not a deep safety cushion.
    else if(gap>3.35){const want=al.x-3.05,step=1.15*dt;nx+=clamp(want-nx,-step,step);}
    const relY=ny-al.y;
    if(side*relY<0.42){const wantY=al.y+side*0.58,step=1.45*dt;ny+=clamp(wantY-ny,-step,step);}
    if(Math.abs(nx-dl.x)>1e-5||Math.abs(ny-dl.y)>1e-5){
      const w=localToWorld(defender.team,nx,ny);defender.x=clamp(w.x,0.6,104.4);defender.y=clamp(w.y,0.6,67.4);
      let dvx=defender.team===HOME?defender.vx:-defender.vx,dvy=defender.team===HOME?defender.vy:-defender.vy;
      const avx=defender.team===HOME?attacker.vx:-attacker.vx,avy=defender.team===HOME?attacker.vy:-attacker.vy;
      if(gap>=-0.80&&gap<0.45&&dvx-avx>0.45)dvx=avx+0.45;
      if(side*(dvy-avy)<-0.38)dvy=avy-side*0.38;
      defender.vx=defender.team===HOME?dvx:-dvx;defender.vy=defender.team===HOME?dvy:-dvy;
      m.stats.markBodyCorrections=(m.stats.markBodyCorrections||0)+1;
    }
  }
}
function stabilizeWideMarkingStandoff(m,dt){
  for(const defender of m.players){
    if(defender.role!=='FB'||!defender.markTargetId)continue;
    const task=defender.tacticalTask||defender.action||'';if(!['WIDE_RUN_TRACK','WIDE_GOALSIDE_CONTAIN','WIDE_GOALSIDE_RECOVER'].includes(task))continue;
    const attacker=playerById(m,defender.markTargetId);if(!attacker||attacker.team===defender.team||attacker.id===m.ball.ownerId)continue;
    const dl=worldToLocal(defender.team,defender.x,defender.y),al=worldToLocal(defender.team,attacker.x,attacker.y),localAttVx=defender.team===HOME?Number(attacker.vx||0):-Number(attacker.vx||0),retreating=localAttVx>.35,desired=retreating?2.95:2.10,d=dist(defender,attacker);
    if(d<desired){const side=Math.sign(dl.y-al.y)||(['LB'].includes(defender.slot)?-1:1),wantL={x:al.x-desired,y:al.y+side*(retreating?.70:.48)},want=localToWorld(defender.team,wantL.x,wantL.y),dx=want.x-defender.x,dy=want.y-defender.y,g=Math.hypot(dx,dy)||1,step=Math.min(g,(retreating?2.65:2.30)*dt);defender.x=clamp(defender.x+dx/g*step,.6,104.4);defender.y=clamp(defender.y+dy/g*step,.6,67.4);m.stats.wideMarkStandoffCorrections=(m.stats.wideMarkStandoffCorrections||0)+1;}
    const dx=defender.x-attacker.x,dy=defender.y-attacker.y,rd=Math.hypot(dx,dy)||1,ux=dx/rd,uy=dy/rd,closing=(Number(defender.vx||0)-Number(attacker.vx||0))*ux+(Number(defender.vy||0)-Number(attacker.vy||0))*uy;
    if(rd<desired+.45&&closing<-.12){const remove=Math.min(-closing,retreating?1.60:1.18);defender.vx+=ux*remove;defender.vy+=uy*remove;}
  }
}
function stabilizeOwnerDefenders(m,dt){
  const owner=playerById(m,m.ball.ownerId);if(!owner||m.ball.mode!=='CONTROLLED')return;
  if(!m._ownerBodyLocks)m._ownerBodyLocks={};
  for(const defender of m.players){
    if(defender.team===owner.team||defender.role==='GK')continue;
    const task=defender.tacticalTask||defender.action||'',wideGoalSide=['WIDE_GOALSIDE_CONTAIN','WIDE_GOALSIDE_RECOVER'].includes(task);
    if(!['PRESS_CONTAIN','CLOSE_DOWN','SHOT_LANE_COVER','WIDE_GOALSIDE_CONTAIN','WIDE_GOALSIDE_RECOVER'].includes(task))continue;
    const d=dist(defender,owner),maxD=wideGoalSide?9.5:(task==='SHOT_LANE_COVER'?6.2:3.8);if(d>maxD)continue;
    const dl=worldToLocal(defender.team,defender.x,defender.y),ol=worldToLocal(defender.team,owner.x,owner.y);
    const gap=ol.x-dl.x; // positive = defender goal-side
    let nx=dl.x,ny=dl.y;
    const isCover=task==='SHOT_LANE_COVER';
    const minGap=wideGoalSide?.80:(isCover?1.05:0.32),maxGap=wideGoalSide?4.20:(isCover?4.80:2.85),repairBehind=wideGoalSide?-4.40:(isCover?-1.00:-0.62);
    if(gap>=repairBehind&&gap<minGap){const want=ol.x-minGap,step=(wideGoalSide?1.60:(isCover?1.30:1.05))*dt;nx+=clamp(want-nx,-step,step);}
    else if(gap>maxGap){const want=ol.x-maxGap,step=(isCover?1.05:0.85)*dt;nx+=clamp(want-nx,-step,step);}
    // A cover defender may legitimately switch lateral corridors. A contain presser,
    // however, should not repeatedly cut through the carrier to the opposite shoulder.
    if(!isCover){
      let lock=m._ownerBodyLocks[defender.id];
      if(!lock||lock.ownerId!==owner.id){
        const tl=worldToLocal(defender.team,defender.tx,defender.ty);let rel=dl.y-ol.y;if(Math.abs(rel)<0.28)rel=tl.y-ol.y;if(Math.abs(rel)<0.16)rel=(hash32(defender.id+'|'+owner.id)&1)?1:-1;
        lock=m._ownerBodyLocks[defender.id]={ownerId:owner.id,side:rel>=0?1:-1};
      }
      const side=lock.side||1,relY=ny-ol.y;
      if(side*relY<0.06){const wantY=ol.y+side*0.42,step=0.95*dt;ny+=clamp(wantY-ny,-step,step);}
    }
    if(Math.abs(nx-dl.x)>1e-5||Math.abs(ny-dl.y)>1e-5){
      const w=localToWorld(defender.team,nx,ny);defender.x=clamp(w.x,0.6,104.4);defender.y=clamp(w.y,0.6,67.4);
      let dvx=defender.team===HOME?defender.vx:-defender.vx,dvy=defender.team===HOME?defender.vy:-defender.vy;
      const ovx=defender.team===HOME?owner.vx:-owner.vx,ovy=defender.team===HOME?owner.vy:-owner.vy;
      if(gap>=repairBehind&&gap<minGap&&dvx-ovx>0.48)dvx=ovx+0.48;
      if(!isCover){const side=m._ownerBodyLocks[defender.id]?.side||1;if(side*(dvy-ovy)<-0.42)dvy=ovy-side*0.42;}
      defender.vx=defender.team===HOME?dvx:-dvx;defender.vy=defender.team===HOME?dvy:-dvy;
      m.stats.ownerDefenderBodyCorrections=(m.stats.ownerDefenderBodyCorrections||0)+1;
    }
  }
}
function resolveSpacing(m){
  const ownerId=m.ball.ownerId,insideBox=(p)=>(p.x<16.8||p.x>88.2)&&p.y>13.4&&p.y<54.6;
  const restartKickerId=(m.restart&&RESTARTS&&typeof RESTARTS.kickerId==='function')?RESTARTS.kickerId(m):null;
  for(let pass=0;pass<2;pass++)for(let i=0;i<m.players.length;i++)for(let j=i+1;j<m.players.length;j++){
    const a=m.players[i],b=m.players[j];
    if(restartKickerId&&(a.id===restartKickerId||b.id===restartKickerId))continue;
    let dx=b.x-a.x,dy=b.y-a.y;
    // Exact broad-phase: every legal spacing radius is <= 1.18m. If either axis alone is
    // already >= 1.18m, Euclidean distance cannot be inside any collision radius.
    if(Math.abs(dx)>=1.28||Math.abs(dy)>=1.28)continue;
    let d=Math.hypot(dx,dy);const same=a.team===b.team,duel=!same&&ownerId&&((a.id===ownerId&&['ENGAGE','CLOSE_DOWN','PRESS_CONTAIN'].includes(b.tacticalTask||b.action))||(b.id===ownerId&&['ENGAGE','CLOSE_DOWN','PRESS_CONTAIN'].includes(a.tacticalTask||a.action)));
    const bothBox=insideBox(a)&&insideBox(b),min=a.role==='GK'||b.role==='GK'?0.82:same?(bothBox?1.18:0.88):(duel?1.02:1.24);if(d>=min)continue;
    if(d<0.001){const ang=((hash32(a.id+'|'+b.id)%6283)/1000),eps=0.01;dx=Math.cos(ang)*eps;dy=Math.sin(ang)*eps;d=eps;}
    const n={x:dx/d,y:dy/d};
    if(duel){
      // STEP38 V0.4 approved contact fix.  The old radial shove always pushed the
      // defender directly away from the carrier.  Repeated contacts could therefore
      // walk a contain defender around the carrier like a satellite.  For normal
      // contain we resolve overlap in the defender's local frame and preserve both
      // (a) the goal-side/trailing relationship and (b) the current shoulder.
      // A real ENGAGE tackle remains exempt and may legitimately cross the shoulder.
      const ownerIsA=a.id===ownerId,carrier=ownerIsA?a:b,defender=ownerIsA?b:a;
      const task=defender.tacticalTask||defender.action||'';
      if(task==='ENGAGE'){
        const fromCarrier=ownerIsA?n:{x:-n.x,y:-n.y},push=min-d;
        defender.x=clamp(defender.x+fromCarrier.x*push,0.6,104.4);defender.y=clamp(defender.y+fromCarrier.y*push,0.6,67.4);
        const inward=(defender.vx-carrier.vx)*fromCarrier.x+(defender.vy-carrier.vy)*fromCarrier.y;
        if(inward<0){defender.vx-=fromCarrier.x*inward;defender.vy-=fromCarrier.y*inward;}
      }else{
        const dl=worldToLocal(defender.team,defender.x,defender.y),cl=worldToLocal(defender.team,carrier.x,carrier.y);
        const tl=worldToLocal(defender.team,defender.tx,defender.ty);
        const gap=cl.x-dl.x; // positive = defender remains goal-side
        const sideRef=Math.abs(dl.y-cl.y)>0.12?(dl.y-cl.y):(Math.abs(tl.y-cl.y)>0.12?(tl.y-cl.y):((hash32(defender.id+'|'+carrier.id)&1)?1:-1));
        const side=sideRef>=0?1:-1;
        let targetLocalX,targetLocalY;
        if(gap>=-0.15){
          // Already goal-side (or effectively level): keep a close, realistic body
          // position.  Never deepen the defender several metres ahead of the carrier.
          const depth=clamp(gap,0.30,Math.min(0.90,min-0.04));
          const lateral=Math.sqrt(Math.max(0.01,min*min-depth*depth));
          targetLocalX=cl.x-depth;targetLocalY=cl.y+side*lateral;
        }else{
          // Beaten defender: do NOT teleport him back in front.  Preserve the trailing
          // x relationship and resolve only the lateral overlap on the same shoulder.
          const xSep=Math.min(min-0.02,Math.abs(dl.x-cl.x));
          const lateral=Math.sqrt(Math.max(0.01,min*min-xSep*xSep));
          targetLocalX=dl.x;targetLocalY=cl.y+side*lateral;
        }
        const w=localToWorld(defender.team,targetLocalX,targetLocalY);
        defender.x=clamp(w.x,0.6,104.4);defender.y=clamp(w.y,0.6,67.4);

        // Damp only the relative velocity that would immediately cross the carrier's
        // centre line again.  Do not freeze the defender or alter the carrier path.
        let dvx=defender.team===HOME?defender.vx:-defender.vx,dvy=defender.team===HOME?defender.vy:-defender.vy;
        const cvx=defender.team===HOME?carrier.vx:-carrier.vx,cvy=defender.team===HOME?carrier.vy:-carrier.vy;
        if(gap>=-0.15&&dvx-cvx>0.32)dvx=cvx+0.32;
        if(side*(dvy-cvy)<-0.24)dvy=cvy-side*0.24;
        defender.vx=defender.team===HOME?dvx:-dvx;defender.vy=defender.team===HOME?dvy:-dvy;
        m.stats.goalSideContactResolves=(m.stats.goalSideContactResolves||0)+1;
      }
      m.stats.duelContactResolves=(m.stats.duelContactResolves||0)+1;
    }else{
      const push=(min-d)*0.5;a.x=clamp(a.x-n.x*push,0.6,104.4);a.y=clamp(a.y-n.y*push,0.6,67.4);b.x=clamp(b.x+n.x*push,0.6,104.4);b.y=clamp(b.y+n.y*push,0.6,67.4);
      const rel=(b.vx-a.vx)*n.x+(b.vy-a.vy)*n.y;if(rel<0){const corr=-rel*0.55;a.vx-=n.x*corr*0.5;a.vy-=n.y*corr*0.5;b.vx+=n.x*corr*0.5;b.vy+=n.y*corr*0.5;}
    }
  }
}

function passOptions(m,owner,offsideMode=false){
  const team=owner.team,ownerLocal=worldToLocal(team,owner.x,owner.y),opts=[];
  for(const p of teamPlayers(m,team)){
    if(p.id===owner.id||p.role==='GK'&&ownerLocal.x>45)continue;
    const d=dist(owner,p);if(d<3||d>52)continue;
    const runTasks=new Set(['CHASE_THROUGH','MOVE_TO_RECEIVE','OVERLAP','UNDERLAP','BALANCED_OVERLAP','THIRD_MAN_RUN','FAR_SIDE_RUN','FAR_SIDE_SHOULDER','PIN_AND_RUN','INSIDE_CHANNEL','BOX_EDGE_ARRIVAL','BOX_CHANNEL_RUN','LATE_BOX_ARRIVAL','PENALTY_SPOT_RUN','ATTACK_NEAR_POST','ATTACK_BACK_POST','ATTACK_OPEN_CHANNEL','FB_OVERLAP_SURGE','FB_UNDERLAP_SURGE','ST_RELEASE_RUN','WIDE_RELEASE_OUTLET','ST_WALL_SUPPORT','POST_PASS_CONTINUE_RUN']);
    const taskCommitted=runTasks.has(p.tacticalTask)&&dist(p,{x:p.tx,y:p.ty})>1.8;
    const taskRun=taskCommitted&&Math.hypot(p.vx,p.vy)>1.15;
    const plannedRun=(p.runUntil||0)>m.time;
    const running=plannedRun||taskRun;
    const line=offsideLine(m,team),bx=m.ball.x,threshold=team===HOME?Math.max(52.5,bx+0.25,line+0.25):Math.min(52.5,bx-0.25,line-0.25),offsideMargin=team===HOME?Math.max(0,p.x-threshold):Math.max(0,threshold-p.x);
    let marginalTimingError=false;
    if(offsideMargin>0){
      const playerChoice=offsideMode==='PLAYER';
      if(playerChoice){
        const playerMargin=running?1.75:1.15,roleEligible=['ST','WF','CM','FB'].includes(p.role);
        if(!roleEligible||offsideMargin>playerMargin)continue;
        marginalTimingError=true;
      }else{
        if(!offsideMode||!running||offsideMargin>0.85)continue;
        const timingSkill=(abilityValue(m,owner,'vision')+abilityValue(m,p,'off_ball'))/2,releaseBias=p.tacticalTask==='ST_RELEASE_RUN'?0.025:0,mistakeP=clamp(0.13+releaseBias-(timingSkill-60)*0.0015,0.035,0.20),roll=(hash32(`${m.seed}|OFFSIDE_TIMING|${Math.floor(m.time*5)}|${owner.id}|${p.id}`)%10000)/10000;
        if(roll>mistakeP)continue;marginalTimingError=true;
      }
    }
    const forward=dir(team)*(p.x-owner.x),open=nearestOppDistance(m,p),block=laneBlockers(m,owner,p,other(team)).length;
    // A previously planned run keeps its own runTx/runTy even if the current tactical
    // shape has already reassigned p.tx/p.ty (for example a full-back returning to
    // REST_BALANCE). Using the new shape target as a through-ball lead can literally
    // turn a forward run into a backward through pass.
    const targetLead=taskCommitted?{x:p.tx,y:p.ty}:null,speed=Math.hypot(p.vx,p.vy),motionLeadSeconds=taskRun?(p.role==='WF'&&p.tacticalTask==='FAR_SIDE_RUN'?1.65:(['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(p.tacticalTask)?1.35:1.10)):0,motionLead=taskRun&&speed>1.6?{x:clamp(p.x+p.vx*motionLeadSeconds,1,104),y:clamp(p.y+p.vy*motionLeadSeconds,1,67)}:null;let lead=plannedRun?{x:p.runTx,y:p.runTy}:targetLead;if(motionLead&&(!lead||dir(team)*(motionLead.x-owner.x)>dir(team)*(lead.x-owner.x)+0.35))lead=motionLead;const leadForward=lead?dir(team)*(lead.x-owner.x):forward;
    const switchPlay=Math.abs(p.y-owner.y)>22&&forward>-3;
    const wideChannel=['WF','FB'].includes(p.role)&&Math.abs(p.y-owner.y)>13&&leadForward>10&&ownerLocal.x>28&&ownerLocal.x<76;
    const releaseRun=['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(p.tacticalTask)&&owner.role==='ST'&&(running||taskCommitted)&&block===0&&leadForward>0.5;let score=forward*0.115+open*0.34-d*0.045-block*1.42+(running?1.25:0)+(leadForward>10?0.65:0)+(switchPlay?0.85:0)+(wideChannel?0.75:0)+(releaseRun?2.75+Math.min(2.0,leadForward*0.30):0);
    if(['OVERLAP','THIRD_MAN_RUN','FAR_SIDE_RUN','PIN_AND_RUN','BOX_EDGE_ARRIVAL'].includes(p.tacticalTask))score+=0.55;
    if(p.role==='ST'||p.role==='WF')score+=0.25;if(['CM','FB'].includes(p.role))score+=0.12;if(d<14)score+=0.35;
    const directionRef=releaseRun?leadForward:forward;if(directionRef<-4)score-=0.70+Math.abs(directionRef)*0.05;
    // In the final third, a harmless back-pass should lose against a real shot/cross/progressive option.
    // A ST_RELEASE_RUN is judged by the lead point, not the runner's current trailing body position.
    if(ownerLocal.x>72&&directionRef<-5)score-=1.35;if(ownerLocal.x>83&&directionRef<-2)score-=1.9;if(ownerLocal.x>88&&directionRef<-2)score-=1.5;
    if(p.role==='GK'&&owner.role!=='GK')score-=3.0;
    if(owner.lastReceivedFromId===p.id&&m.time-owner.controlledSince<3.5)score-=3.6;
    if(owner.role==='GK'){if(['CB','FB'].includes(p.role)&&d<30)score+=2.4;else if(p.role==='CM'&&d<34)score+=1.2;if(p.role==='ST'||p.role==='WF')score-=0.5;}
    if(marginalTimingError)score-=0.15+offsideMargin*0.20;
    opts.push({p,d,forward,open,block,score,running,lead,leadForward,switchPlay,wideChannel,offsideRisk:marginalTimingError,offsideMargin});
  }
  return opts.sort((a,b)=>b.score-a.score);
}


function syntheticLeadPassCandidates(m,owner,opts,existingThroughTargets=new Set()){
  // STEP78 TT-0.46: a through-pass is only available when the receiver has already
  // committed to a real run. Never invent a forward lead point for a stationary CM/FB.
  const team=owner.team,rows=[],runTasks=new Set(['CHASE_THROUGH','OVERLAP','UNDERLAP','BALANCED_OVERLAP','THIRD_MAN_RUN','FAR_SIDE_RUN','PIN_AND_RUN','INSIDE_CHANNEL','BOX_EDGE_ARRIVAL','BOX_CHANNEL_RUN','LATE_BOX_ARRIVAL','PENALTY_SPOT_RUN','ATTACK_NEAR_POST','ATTACK_BACK_POST','ATTACK_OPEN_CHANNEL','FB_OVERLAP_SURGE','FB_UNDERLAP_SURGE','ST_RELEASE_RUN','WIDE_RELEASE_OUTLET','POST_PASS_CONTINUE_RUN']);
  for(const o of opts||[]){
    const p=o.p;if(!p||existingThroughTargets.has(p.id)||!['ST','WF','CM','FB'].includes(p.role))continue;
    // TT-0.51 1_5: a FAR_SIDE_RUN label is not enough by itself. The runner must already
    // have live physical velocity before an open-space through-ball can be offered.
    const liveNamedRun=p.tacticalTask!=='FAR_SIDE_RUN'||Math.hypot(p.vx||0,p.vy||0)>1.15;
    const committed=liveNamedRun&&(!!o.running||(runTasks.has(p.tacticalTask)&&o.lead&&o.leadForward>2.5));
    if(!committed||!o.lead||o.leadForward<2.5||o.d>44||o.open<0.85)continue;
    const lead={x:o.lead.x,y:o.lead.y},receiverTravel=dist(p,lead);if(receiverTravel<2.2||receiverTravel>17.0)continue;
    const blockers=laneBlockers(m,owner,lead,other(team)),leadOpen=outfield(m,other(team)).reduce((best,q)=>Math.min(best,Math.hypot(q.x-lead.x,q.y-lead.y)),99);
    if(blockers.length>1||leadOpen<1.35)continue;
    let score=1.85+o.leadForward*0.12+Math.min(leadOpen,6)*0.23-receiverTravel*0.045-blockers.length*0.65;
    if(p.role==='WF')score+=0.48;else if(p.role==='ST')score+=0.35;else if(p.role==='CM')score+=0.12;
    rows.push({id:'THROUGH_PASS',score:Number(score.toFixed(3)),reason:'user_visible_committed_run_lane',meta:{targetId:p.id,targetSlot:p.slot,runLead:true,leadX:Number(lead.x.toFixed(3)),leadY:Number(lead.y.toFixed(3)),leadForward:Number(o.leadForward.toFixed(3)),receiverTravel:Number(receiverTravel.toFixed(3)),receiverPressure:Number(o.open.toFixed(3)),leadOpen:Number(leadOpen.toFixed(3)),leadBlockers:blockers.length,runnerTask:p.tacticalTask||null}});
  }
  return rows.sort((a,b)=>b.score-a.score).slice(0,2);
}

function shotAssessment(m,owner){
  const team=owner.team,gx=oppGoalX(team),dGoal=Math.hypot(gx-owner.x,34-owner.y),angle=Math.atan2(Math.abs(owner.y-34),Math.max(0.1,Math.abs(gx-owner.x))),goalAngle=Math.atan2(34-owner.y,gx-owner.x);
  const bodyAngle=Number.isFinite(owner.bodyAngle)?owner.bodyAngle:goalAngle,bodyAngleDiff=Math.abs(angleDiff(bodyAngle,goalAngle)),facingAlignment=clamp((Math.cos(bodyAngleDiff)+1)/2,0,1),turningRequired=bodyAngleDiff>=1.48,backToGoal=bodyAngleDiff>=2.10;
  const defenders=outfield(m,other(team)),pressure=ballCarrierPressureDistance(m,owner),inBox=inOppPenaltyArea(team,owner.x,owner.y),central=Math.abs(owner.y-34)<15;
  // Evaluate several plausible goal lanes. A defender blocking the centre does not erase an obviously open near/far-post window.
  const oppGK=teamPlayers(m,other(team)).find(p=>p.role==='GK');
  const lanes=[31.15,34.0,36.85].map(y=>({y,blockers:defenders.filter(p=>segmentPointDistance(owner.x,owner.y,gx,y,p.x,p.y)<1.25&&dist(owner,p)>1.0&&Math.hypot(gx-p.x,y-p.y)>1.8).sort((a,b)=>dist(owner,a)-dist(owner,b)),gkLineSeparation:oppGK?segmentPointDistance(owner.x,owner.y,gx,y,oppGK.x,oppGK.y):0}));
  // TT-0.47 finishing lane selection: when several lanes are equally unblocked, do not always
  // choose the first array entry. Prefer the lane whose actual shot path is farther from the
  // goalkeeper's current position. This is observable aim selection, not outcome preselection;
  // execution accuracy and live keeper movement still decide whether the shot scores or is saved.
  lanes.sort((a,b)=>a.blockers.length-b.blockers.length||b.gkLineSeparation-a.gkLineSeparation);const bestLane=lanes[0],blockers=bestLane.blockers;
  const goalSideDefenders=defenders.filter(p=>dir(team)*(p.x-owner.x)>0.15&&dist(owner,p)<17.0&&Math.abs(p.y-owner.y)<13.5);
  const keeperLaneDefenders=defenders.filter(p=>dir(team)*(p.x-owner.x)>0.10&&dist(owner,p)<19.5&&Math.abs(p.y-owner.y)<16.5);
  // A trailing defender does not cancel a visual breakaway, but a defender still occupying the broad
  // goal-side protection cone does. Keep this strict so ordinary box possession is not mislabeled 1v1.
  const oneVOne=inBox&&dGoal<=12.8&&Math.abs(owner.y-34)<=9.8&&blockers.length===0&&goalSideDefenders.length===0&&pressure>0.72;
  const openWindow=inBox&&dGoal<=20.5&&blockers.length===0&&pressure>1.65&&goalSideDefenders.filter(p=>dist(owner,p)<10.5).length===0;
  // A visually clear keeper-facing chance is broader than the strict engine 1v1 label.
  // It still requires an open shooting lane and no outfield defender sitting goal-side in the
  // immediate finishing corridor, but includes the 14-18m breakaway finishes users read as 1v1.
  const clearKeeperChance=inBox&&dGoal<=18.5&&Math.abs(owner.y-34)<=11.5&&blockers.length===0&&keeperLaneDefenders.length===0&&pressure>1.45;
  const cleanOneVOne=clearKeeperChance&&Math.abs(owner.y-34)<=10.5&&pressure>1.45;
  let score=(inBox?4.4:0)+(dGoal<12?5:dGoal<18?3.5:dGoal<24?1.8:0)+(central?1.4:0)-blockers.length*1.2-(pressure<1.2?1.4:pressure<2.2?0.55:0);
  if(owner.role==='ST')score+=1.6;if(owner.role==='WF')score+=0.8;if(owner.role==='CM'&&inBox)score+=0.45;if(oneVOne)score+=2.2;if(openWindow)score+=1.15;
  if(turningRequired)score-=1.15+(backToGoal?0.65:0)+(dGoal>20?0.55:0);
  return{dGoal,angle,goalAngle,bodyAngleDiff,facingAlignment,turningRequired,backToGoal,blockers,goalSideDefenders,keeperLaneDefenders,pressure,inBox,oneVOne,cleanOneVOne,openWindow,clearKeeperChance,bestAimY:bestLane.y,score};
}
function clearRunwayAssessment(m,owner,space,pressure){
  const local=worldToLocal(owner.team,owner.x,owner.y);
  if(!['ST','WF','CM'].includes(owner.role)||local.x<58||local.x>=93||space<4.8||pressure<1.15)return{clear:false,goalSide:[]};
  const goalSide=outfield(m,other(owner.team)).filter(q=>{
    const fwd=dir(owner.team)*(q.x-owner.x),lat=Math.abs(q.y-owner.y);
    return fwd>0.25&&fwd<17.0&&lat<6.3;
  });
  // This is not a guaranteed goal: it only means the carrier has a visibly open runway.
  // In that state a harmless recycle/back-pass is forbidden; the carrier must keep attacking
  // until a defender closes the lane or a real final action appears.
  return{clear:goalSide.length===0,goalSide};
}
function takeOnOpportunity(m,owner,shot,held){
  if(!TAKEON||!['WF','ST','CM','FB'].includes(owner.role)||held<0.36||m.time-(owner.lastTakeOnAt||-99)<17.0)return null;
  const l=worldToLocal(owner.team,owner.x,owner.y);if(l.x<42||l.x>94.5)return null;
  if(shot&&(shot.oneVOne||(shot.inBox&&shot.openWindow&&shot.dGoal<=15)))return null;
  // STEP75: after receiving a genuine through-ball in the attacking third, a defender who is
  // almost level / slightly goal-side is still a real 1v1 obstacle. The previous >0.75m
  // forward-only gate incorrectly hid the dribble option in cases like 44_1 and pushed the
  // receiver straight into a safety recycle. This is geometry, not a guaranteed attack.
  const recentThrough=owner.lastReceivedFlightKind==='THROUGH'&&m.time-(owner.lastReceivedPassAt||-99)<1.65&&l.x>=76;
  const minFront=recentThrough?0.05:0.75;
  const opps=outfield(m,other(owner.team)).map(p=>{const q=worldToLocal(owner.team,p.x,p.y),fwd=q.x-l.x,lat=Math.abs(q.y-l.y),d=dist(owner,p);return{p,q,fwd,lat,d};})
    .filter(o=>o.fwd>minFront&&o.fwd<5.3&&o.lat<3.4&&o.d<5.6).sort((a,b)=>a.d-b.d);
  if(!opps.length)return null;const d=opps[0],behind=outfield(m,other(owner.team)).filter(p=>p.id!==d.p.id).map(p=>{const q=worldToLocal(owner.team,p.x,p.y);return{f:q.x-d.q.x,lat:Math.abs(q.y-l.y)};}).filter(o=>o.f>0.4&&o.f<11&&o.lat<4.5).sort((a,b)=>a.f-b.f)[0];
  const spaceBehind=behind?behind.f:9.5;if(spaceBehind<2.2)return null;
  const atk=abilityValue(m,owner,'dribbling')*.34+abilityValue(m,owner,'ball_control')*.24+abilityValue(m,owner,'agility')*.16+abilityValue(m,owner,'acceleration')*.12+abilityValue(m,owner,'flair')*.14;
  const def=abilityValue(m,d.p,'tackling')*.34+abilityValue(m,d.p,'anticipation')*.23+abilityValue(m,d.p,'one_v_one_marking')*.20+abilityValue(m,d.p,'agility')*.11+abilityValue(m,d.p,'reaction')*.12;
  return{defenderId:d.p.id,defenderDistance:d.d,spaceBehind,attackerSkill:atk,defenderSkill:def,skillAdvantage:atk-def};
}

function finalThirdDelivery(m,owner){
  const l=worldToLocal(owner.team,owner.x,owner.y);if(l.x<80)return null;
  const wide=l.y<18.5||l.y>49.5;if(!wide)return null;
  const deepSource=l.x>=93.0,byline=l.x>=95.0;
  const raw=teamPlayers(m,owner.team).filter(p=>p.id!==owner.id&&p.role!=='GK'&&!isOffsideAtPass(m,p,owner.team)).map(p=>{
    const q=worldToLocal(p.team,p.x,p.y),open=nearestOppDistance(m,p),behind=Math.max(0,l.x-q.x);let score=0;
    if(q.x>82&&q.y>16&&q.y<52)score+=2.4;if(q.x>87)score+=0.55;if(p.role==='ST')score+=1.35;if(p.role==='WF')score+=0.60;if(p.role==='CM'&&['BOX_EDGE_ARRIVAL','ADVANCE_SUPPORT','LATE_BOX','PENALTY_SPOT_RUN','CUTBACK_RECEIVER','EDGE_SHOT','SECOND_BALL','BOX_EDGE_SUPPORT','CUTBACK_EDGE','SECOND_LINE_SUPPORT','SECOND_WAVE_8'].includes(p.tacticalTask))score+=0.85;score+=open*0.20-Math.abs(q.y-34)*0.03;return{p,q,open,score,behind};
  });
  // A real cross is aimed at the penalty area, not at a teammate tens of metres back up-field.
  // From the by-line the ball may naturally travel a few metres backwards to the penalty spot,
  // but anything beyond that belongs to a cut-back/reset decision rather than CROSS.
  const aerial=raw.filter(o=>o.q.x>=85.0&&o.q.y>14.5&&o.q.y<53.5&&o.behind<=13.5&&o.score>2.35&&o.open>1.05).sort((a,b)=>b.score-a.score);
  const cuts=raw.filter(o=>o.q.x>=80.0&&o.q.x<=l.x-2.0&&o.q.y>19&&o.q.y<49&&o.behind<=16.5&&o.score>2.15&&o.open>1.35).sort((a,b)=>b.score-a.score);
  if(!aerial.length&&!cuts.length)return null;
  const cross=aerial[0]||null,cut=cuts[0]||null;
  if(byline&&cut){
    // Near the goal-line, a clearly open square/pass-back into the penalty spot is a CUTBACK.
    // Otherwise retain the classic aerial near/far-post cross. Never label a long retreating
    // pass as a cross merely because the carrier happened to be wide.
    if(!cross||cut.score>cross.score+0.45||cut.open>cross.open+1.25)return{type:'PASS',target:cut.p,kind:'CUTBACK',option:{...cut,forward:dir(owner.team)*(cut.p.x-owner.x),block:0,running:false},deliveryIntent:'BYLINE_CUTBACK'};
  }
  const target=cross||cut;
  if(!target)return null;
  if(!cross)return{type:'PASS',target:target.p,kind:'CUTBACK',option:{...target,forward:dir(owner.team)*(target.p.x-owner.x),block:0,running:false},deliveryIntent:'DEEP_CUTBACK'};
  return{type:'PASS',target:target.p,kind:'CROSS',option:{...target,forward:dir(owner.team)*(target.p.x-owner.x),block:0,running:true},deliveryIntent:deepSource?'DEEP_CROSS':'WIDE_CROSS'};
}


function earlyCrossDelivery(m,owner){
  const l=worldToLocal(owner.team,owner.x,owner.y);if(l.x<74||l.x>=88.5)return null;
  const wide=l.y<18.8||l.y>49.2;if(!wide||!['WF','FB'].includes(owner.role))return null;
  const candidates=teamPlayers(m,owner.team).filter(p=>p.id!==owner.id&&p.role!=='GK'&&!isOffsideAtPass(m,p,owner.team)).map(p=>{
    const q=worldToLocal(owner.team,p.x,p.y),open=nearestOppDistance(m,p),forward=q.x-l.x;let score=0;
    if(q.x>82&&q.y>14&&q.y<54)score+=2.3;if(q.x>88)score+=0.75;if(p.role==='ST')score+=1.55;if(p.role==='WF')score+=0.72;if(p.role==='CM'&&q.x>80)score+=0.38;
    if(forward>3)score+=0.45;score+=Math.min(open,5)*0.25-Math.abs(q.y-34)*0.025;return{p,q,open,forward,score};
  }).filter(o=>o.score>2.55&&o.open>1.0&&o.forward>-1).sort((a,b)=>b.score-a.score);
  if(!candidates.length)return null;
  const target=candidates[0],boxTargets=candidates.filter(o=>o.q.x>82&&o.q.y>14&&o.q.y<54).length;
  const goalAngle=Math.atan2(34-owner.y,oppGoalX(owner.team)-owner.x),facing=Number.isFinite(owner.bodyAngle)?Math.max(0,(Math.cos(angleDiff(owner.bodyAngle,goalAngle))+1)/2):0.5;
  return{type:'PASS',target:target.p,kind:'CROSS',option:{...target,block:0,running:true,earlyCross:true},reason:'EARLY_CROSS',candidateMeta:{targetId:target.p.id,targetOpen:target.open,boxTargets,facingAlignment:facing}};
}
function candidateContext(m,owner,shot,opts,pressure,space,held,deepDelivery,early,takeOn){
  if(!CANDIDATES)return null;const l=worldToLocal(owner.team,owner.x,owner.y),runner=opts.find(o=>(o.running||['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p.tacticalTask))&&o.block===0&&((['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p.tacticalTask)&&owner.role==='ST'&&o.leadForward>2.5&&o.score>-1.25)||(o.leadForward>6&&o.score>1.55))),progressive=opts.find(o=>o.forward>5&&o.block===0&&o.score>1.20),switchOpt=opts.find(o=>Math.abs(o.p.y-owner.y)>23&&o.block===0&&o.score>1.0),safeAny=opts.find(o=>o.block===0&&o.open>1.8),safeForward=opts.find(o=>o.block===0&&o.open>1.35&&o.forward>-2&&['ST','WF','CM'].includes(o.p.role)),safe=l.x>=80?(safeForward||safeAny):safeAny,recycle=opts.find(o=>['CM','FB'].includes(o.p.role)&&o.block===0&&o.open>1.25&&o.forward<0&&o.forward>-16);
  const runway=clearRunwayAssessment(m,owner,space,pressure);
  const recentTakeOnWin=m.time-(owner.lastTakeOnWinAt||-99)<1.6,counterActive=(m.attackRhythm?.[owner.team]?.counterUntil||0)>m.time;
  // INTERNAL V0.6 deep-entry discipline: do not let a generic CARRY cross the top of the
  // penalty area as if the defender were not there. Genuine runway/counter/take-on wins stay
  // free; a crowded approach must first beat the defender or use a teammate.
  const boxApproach=l.x>=82&&l.x<88.5&&l.y>=12.8&&l.y<=55.2;
  const deepEntryRestricted=boxApproach&&!runway.clear&&!recentTakeOnWin&&!counterActive&&(pressure<2.8||space<4.5);
  const meta=o=>o?{targetId:o.p.id,targetSlot:o.p.slot,score:o.score,leadForward:o.leadForward,forward:o.forward,d:o.d,receiverPressure:o.open,offsideRisk:!!o.offsideRisk,offsideMargin:Number(o.offsideMargin||0),task:o.p.tacticalTask||null,running:!!o.running,leadX:o.lead&&Number.isFinite(o.lead.x)?Number(o.lead.x.toFixed(3)):null,leadY:o.lead&&Number.isFinite(o.lead.y)?Number(o.lead.y.toFixed(3)):null}:null;
  const attackingThroughReceive=owner.lastReceivedFlightKind==='THROUGH'&&m.time-(owner.lastReceivedPassAt||-99)<1.65&&l.x>=76&&['WF','ST','CM'].includes(owner.role);
  return{role:owner.role,localX:l.x,localY:l.y,wide:l.y<19||l.y>49,pressure,space,held,recentTakeOn:m.time-(owner.lastTakeOnAt||-99)<3.2,recentTakeOnWin,takeOn:takeOn||null,frontPassChain:m.frontPassChain[owner.team]||0,recycleActive:(m.attackRecycleUntil?.[owner.team]||0)>m.time,clearRunway:runway.clear,counterActive,boxApproach,deepEntryRestricted,attackingThroughReceive,recentTeamShot:m.time-(m.lastShotAt?.[owner.team]??-99)<2.4,boxCarryChain:(m.time-(owner.lastBoxCarryAt||-99)<3.0)?(owner.boxCarryChain||0):0,recentBoxCarry:m.time-(owner.lastBoxCarryAt||-99)<2.2,shot:{score:shot.score,dGoal:shot.dGoal,inBox:shot.inBox,oneVOne:shot.oneVOne,openWindow:shot.openWindow,blockers:shot.blockers.length,centrality:Math.abs(l.y-34),bodyAngleDiff:shot.bodyAngleDiff,facingAlignment:shot.facingAlignment,turningRequired:shot.turningRequired,backToGoal:shot.backToGoal},pass:{runner:meta(runner),progressive:meta(progressive),switch:meta(switchOpt),safe:meta(safe),recycle:meta(recycle)},earlyCross:early?early.candidateMeta:null,deepDelivery:deepDelivery?{kind:deepDelivery.kind,targetId:deepDelivery.target?.id,targetOpen:deepDelivery.option?.open||0,sourceX:l.x,sourceTouchline:Math.min(l.y,68-l.y)<=16.0,targetLocalX:deepDelivery.option?.q?.x??null,deliveryIntent:deepDelivery.deliveryIntent||null}:null};
}
function candidateRank(m,owner,ctx){
  if(!ctx||!CANDIDATES)return[];return CANDIDATES.generate(ctx).map(c=>{const h=hash32(`${m.seed}|CANDIDATE|${Math.floor(m.time*10)}|${owner.id}|${c.id}`),j=((h%10001)/10000-0.5)*0.42;return{...c,baseScore:c.score,score:Number((c.score+j).toFixed(3))};}).sort((a,b)=>b.score-a.score);
}
function optionById(opts,id){return id?opts.find(o=>o.p.id===id):null;}
function candidateToAction(m,owner,c,frame){
  if(!c)return null;const opts=frame.opts;
  if(c.id==='SHOT')return{type:'SHOT',reason:frame.shot.oneVOne?'ONE_V_ONE':frame.shot.inBox&&frame.shot.dGoal<=9.5&&frame.shot.blockers.length===0?'CLOSE_RANGE':'CANDIDATE_SHOT'};
  if(c.id==='AVAILABLE_PASS'){const o=optionById(opts,c.meta?.targetId);if(o&&o.block<=1)return{type:'PASS',target:o.p,kind:o.d>31?'LONG_PASS':'PASS',option:o,reason:'USER_AVAILABLE_PASS'};}
  if(c.id==='CARRY')return{type:'CARRY',reason:frame.ctx.clearRunway?'CLEAR_RUNWAY':'CANDIDATE_CARRY'};
  if(c.id==='TAKE_ON'&&frame.takeOn)return{type:'TAKE_ON',reason:'CANDIDATE_TAKE_ON',takeOn:frame.takeOn};
  if(c.id==='EARLY_CROSS'&&frame.early){m.stats.earlyCrosses=(m.stats.earlyCrosses||0)+1;return frame.early;}
  if((c.id==='DEEP_CROSS'||c.id==='CUTBACK')&&frame.deep){if((c.id==='CUTBACK')===(frame.deep.kind==='CUTBACK'))return{...frame.deep,reason:c.id};}
  if(c.id==='THROUGH_PASS'){const o=optionById(opts,c.meta?.targetId),committed=o&&(['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p.tacticalTask)||o.running);if(o&&(c.meta?.runLead||c.meta?.syntheticLead)){const lead={x:Number(c.meta.leadX),y:Number(c.meta.leadY)},forward=dir(owner.team)*(lead.x-owner.x),blocks=laneBlockers(m,owner,lead,other(owner.team)).length;if(Number.isFinite(lead.x)&&Number.isFinite(lead.y)&&forward>2.5&&blocks<=1)return{type:'PASS',target:o.p,kind:'THROUGH',option:{...o,running:true,lead,leadForward:forward},reason:'USER_OPEN_SPACE_THROUGH'};}if(o&&committed&&o.block===0&&o.leadForward>2.5)return{type:'PASS',target:o.p,kind:'THROUGH',option:o,reason:'CANDIDATE_THROUGH'};}
  if(c.id==='LOFTED_THROUGH_PASS'){const o=optionById(opts,c.meta?.targetId),committed=o&&(['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p.tacticalTask)||o.running||c.meta?.physicalCommittedRun);if(o&&(c.meta?.runLead||c.meta?.syntheticLead)&&Number.isFinite(Number(c.meta?.leadX))&&Number.isFinite(Number(c.meta?.leadY))){const lead={x:Number(c.meta.leadX),y:Number(c.meta.leadY)},forward=dir(owner.team)*(lead.x-owner.x);if(forward>2.5)return{type:'PASS',target:o.p,kind:'THROUGH',option:{...o,running:true,lead,leadForward:forward,forceAerial:true},reason:'USER_LOFTED_THROUGH'};}if(o&&committed&&o.leadForward>2.5)return{type:'PASS',target:o.p,kind:'THROUGH',option:{...o,forceAerial:true},reason:'USER_LOFTED_THROUGH'};}
  if(c.id==='LOFTED_PASS'){const o=optionById(opts,c.meta?.targetId);if(o&&o.d>=24&&o.d<=50)return{type:'PASS',target:o.p,kind:'LONG_PASS',option:{...o,forceAerial:true},reason:'USER_LOFTED_PASS'};}
  if(c.id==='PROGRESSIVE_PASS'){const o=optionById(opts,c.meta?.targetId);if(o&&o.block===0)return{type:'PASS',target:o.p,kind:o.d>31?'LONG_PASS':'PASS',option:o,reason:'CANDIDATE_PROGRESSIVE'};}
  if(c.id==='SWITCH_PASS'){const o=optionById(opts,c.meta?.targetId);if(o&&o.block===0){o.longDiagonal=o.d>31;o.switchPlay=true;return{type:'PASS',target:o.p,kind:o.d>31?'LONG_PASS':'PASS',option:o,reason:'CANDIDATE_SWITCH'};}}
  if(c.id==='SAFE_PASS'){const o=optionById(opts,c.meta?.targetId);if(o&&o.block===0)return{type:'PASS',target:o.p,kind:o.d>31?'LONG_PASS':'PASS',option:o,reason:'CANDIDATE_SAFE'};}
  if(c.id==='RECYCLE'){const o=optionById(opts,c.meta?.targetId);if(o&&o.block===0)return{type:'PASS',target:o.p,kind:'PASS',option:o,reason:'CANDIDATE_RECYCLE',recycle:true};}
  if(c.id==='HOLD')return{type:'HOLD',reason:'CANDIDATE_HOLD'};
  if(c.id==='TURN_BACK')return{type:'TURN_BACK',reason:'CANDIDATE_TURN_BACK'};
  return null;
}
function recordCandidateDecision(m,owner,shadow,selected,appliedNew){
  if(!shadow)return;m.actionCandidateTelemetry=m.actionCandidateTelemetry||{};const t=m.actionCandidateTelemetry;t.decisions=t.decisions||0;t.topCounts=t.topCounts||{};t.legacyCounts=t.legacyCounts||{};t.disagreements=t.disagreements||0;t.earlyCrossCandidates=t.earlyCrossCandidates||0;t.earlyCrossApplied=t.earlyCrossApplied||0;t.recent=t.recent||[];t.decisions++;t.topCounts[shadow.id]=(t.topCounts[shadow.id]||0)+1;
  const legacy=(selected?.reason||selected?.kind||selected?.type||'NONE');t.legacyCounts[legacy]=(t.legacyCounts[legacy]||0)+1;if(shadow.id==='EARLY_CROSS')t.earlyCrossCandidates++;if(appliedNew&&selected?.reason==='EARLY_CROSS')t.earlyCrossApplied++;
  const mapped=selected?.kind==='CROSS'?(selected.reason==='EARLY_CROSS'?'EARLY_CROSS':'DEEP_CROSS'):selected?.kind==='CUTBACK'?'CUTBACK':selected?.type==='SHOT'?'SHOT':selected?.type==='CARRY'?'CARRY':selected?.kind==='THROUGH'?'THROUGH_PASS':selected?.reason==='CANDIDATE_SWITCH'?'SWITCH_PASS':selected?.reason==='CANDIDATE_SAFE'?'SAFE_PASS':selected?.reason==='CANDIDATE_RECYCLE'?'RECYCLE':selected?.type==='PASS'?'PROGRESSIVE_PASS':selected?.type==='HOLD'?'HOLD':selected?.type==='TURN_BACK'?'TURN_BACK':selected?.type;
  if(mapped&&mapped!==shadow.id)t.disagreements++;t.recent.push({t:Number(m.time.toFixed(2)),playerId:owner.id,role:owner.role,top:shadow,selected:{type:selected?.type,kind:selected?.kind,reason:selected?.reason},appliedNew:!!appliedNew});if(t.recent.length>16)t.recent.shift();
}


function boxFinalAction(m,owner,shot,opts,delivery,pressure,space){
  if(!shot.inBox||!['ST','WF','CM'].includes(owner.role))return null;
  const local=worldToLocal(owner.team,owner.x,owner.y),centrality=Math.abs(local.y-34),clear=shot.blockers.length===0;
  // Real finishing windows beat harmless recycling. This is deterministic for clear close-range windows, not a 7-8% lottery.
  if(shot.oneVOne)return{type:'SHOT',reason:'ONE_V_ONE'};
  if(shot.dGoal<=9.5&&centrality<=13.0&&clear)return{type:'SHOT',reason:'CLOSE_RANGE'};
  const recentShot=m.time-(m.lastShotAt?.[owner.team]??-99)<2.3;
  if(!recentShot&&shot.openWindow&&shot.dGoal<=14.5&&owner.role==='ST'&&centrality<=14.0&&m.r()<0.46)return{type:'SHOT',reason:'OPEN_SHOOTING_WINDOW'};
  if(!recentShot&&shot.openWindow&&shot.dGoal<=13.5&&owner.role==='WF'&&centrality<=12.5&&m.r()<0.42)return{type:'SHOT',reason:'WINGER_SHOOTING_WINDOW'};
  if(!recentShot&&shot.openWindow&&shot.dGoal<=14.0&&owner.role==='CM'&&m.r()<0.24)return{type:'SHOT',reason:'MIDFIELD_ARRIVAL'};
  if(!recentShot&&shot.dGoal<=17.5&&clear&&shot.score>=7.8&&pressure>1.75&&m.r()<(owner.role==='ST'?0.09:0.09))return{type:'SHOT',reason:'GOOD_BOX_WINDOW'};
  if(!recentShot&&shot.dGoal<=15.5&&shot.blockers.length===1&&shot.score>=7.6&&pressure>2.0&&m.r()<(owner.role==='ST'?0.055:0.055))return{type:'SHOT',reason:'SHOOT_THROUGH_GAP'};
  // Wide entries prefer a cross/cut-back if a real box target exists.
  if(delivery&&['WF','FB'].includes(owner.role)&&(centrality>11.5||local.x>90.0)&&m.r()<0.72)return{...delivery,reason:'BOX_DELIVERY'};
  // If the lane is blocked, carry to change the angle before recycling.
  if((owner.boxCarryChain||0)<2&&space>2.0&&local.x<94.0&&(shot.blockers.length>=1||pressure<2.0)&&m.r()<0.64)return{type:'CARRY',reason:'CREATE_ANGLE'};
  if((owner.boxCarryChain||0)<2&&space>3.0&&local.x<93.0&&m.r()<0.40)return{type:'CARRY',reason:'BOX_CARRY'};
  // If the finish is not on, keep the attack alive around the box instead of habitually recycling to the defensive line.
  const layoff=opts.find(o=>o.block===0&&o.open>1.3&&o.forward>-3&&worldToLocal(owner.team,o.p.x,o.p.y).x>76);
  if(layoff&&m.r()<0.68)return{type:'PASS',target:layoff.p,kind:'PASS',option:layoff,reason:'BOX_LAYOFF'};
  if((owner.boxCarryChain||0)<2&&space>1.2&&local.x<94.5)return{type:'CARRY',reason:'PROTECT_BOX_POSSESSION'};
  return{type:'HOLD',reason:'BOX_SHIELD'};
}

function midfieldLongShotAction(m,owner,shot,pressure,held){
  if(owner.role!=='CM'||shot.inBox)return null;
  const local=worldToLocal(owner.team,owner.x,owner.y),centrality=Math.abs(local.y-34);
  const recentTeamShot=m.time-(m.lastShotAt?.[owner.team]??-99)<3.0;
  if(recentTeamShot||held<0.42||local.x<76.0||local.x>=88.5||centrality>18.0||shot.dGoal<18.0||shot.dGoal>30.0)return null;
  // INTERNAL V0.6 rhythm: declining the same long-shot window must be a decision, not
  // a fresh lottery every think cycle. Re-open it only when the geometry materially improves.
  if(owner.midfieldLongShotDecline){
    const d=owner.midfieldLongShotDecline,improved=shot.dGoal<=d.dGoal-1.8||centrality<=Math.max(5,d.centrality-2.6)||shot.blockers.length<d.blockers;
    if(m.time<(d.until||0)&&!improved)return null;
    owner.midfieldLongShotDecline=null;
  }
  // A midfielder should only try this when he has time to set himself and at least a plausible lane.
  // Distance and trajectory are independent: this is a shot decision, not a generic long-pass rule.
  if(pressure<1.85||shot.blockers.length>1)return null;
  m.stats.midfieldLongShotCandidates=(m.stats.midfieldLongShotCandidates||0)+1;
  let chance=0.125;
  if(shot.blockers.length===0)chance+=0.040;
  if(shot.dGoal<=25.0)chance+=0.026;
  if(shot.dGoal<=22.0)chance+=0.016;
  if(pressure>=2.8)chance+=0.016;
  if(pressure>=3.8)chance+=0.012;
  if(['EDGE_SHOT','SECOND_BALL','BOX_EDGE_SUPPORT','CUTBACK_EDGE','SECOND_LINE_SUPPORT','SECOND_WAVE_8','ADVANCE_SUPPORT','LATE_BOX'].includes(owner.tacticalTask))chance+=0.026;
  chance=clamp(chance,0.125,0.315);
  if(m.r()<chance){owner.midfieldLongShotDecline=null;return{type:'SHOT',reason:'MIDFIELD_LONG_SHOT'};}
  owner.midfieldLongShotDecline={until:m.time+2.1+(shot.dGoal>25?0.45:0),dGoal:shot.dGoal,centrality,blockers:shot.blockers.length};
  return null;
}

function flowFinalThirdDecision(m,owner,shot,opts,pressure,space){
  if(!FLOW)return null;
  const local=worldToLocal(owner.team,owner.x,owner.y);
  if(local.x<82||owner.role==='GK'||!['ST','WF','CM','FB'].includes(owner.role))return null;
  if(m.time-(owner.lastFlowDecisionAt||-99)<0.55)return null;
  owner.lastFlowDecisionAt=m.time;
  const defenders=outfield(m,other(owner.team)).map(p=>{const q=worldToLocal(owner.team,p.x,p.y);return{id:p.id,x:q.x,y:q.y,role:p.role};});
  const teammates=teamPlayers(m,owner.team).filter(p=>p.id!==owner.id&&p.role!=='GK').map(p=>{const q=worldToLocal(owner.team,p.x,p.y);return{id:p.id,x:q.x,y:q.y,role:p.role,slot:p.slot};});
  const o={id:owner.id,x:local.x,y:local.y,role:owner.role,slot:owner.slot};
  const state={owner:o,defenders,gk:(()=>{const g=teamPlayers(m,other(owner.team)).find(p=>p.role==='GK');const q=g?worldToLocal(owner.team,g.x,g.y):{x:102.5,y:34};return{x:q.x,y:q.y};})(),teammates,openThroughLane:true,foulPressure:pressure<3.0,boxDefenders:defenders.filter(d=>d.x>82).length};
  const seed=`${m.seed}|final|${Math.floor(m.time*20)}|${owner.id}`;
  const c=FLOW.chooseFinalThirdAction(seed,state);
  if(!c)return null;
  if(c.action==='SHOT')return null; // 90-minute shot volume stays governed by the continuous core's real spatial shot assessment.
  if(c.action==='DRIBBLE_EVADE')return null;
  if(c.action==='THROUGH_PASS'&&c.targetPlayer?.id){
    const op=opts.find(x=>x.p.id===c.targetPlayer.id&&x.forward>0.8&&x.block===0);
    // A FLOW through pass is only valid when the target already has a genuine
    // forward run/lead. Never manufacture a through-ball lead from a tactical
    // recovery target (e.g. REST_BALANCE), which can sit behind the ball carrier.
    if(op&&op.running&&op.lead&&op.leadForward>2.5)return{type:'PASS',target:op.p,kind:'THROUGH',option:op,reason:'FLOW_THROUGH'};
  }
  if(c.action==='CUTBACK'||c.action==='CROSS'){const d=finalThirdDelivery(m,owner);if(d)return{...d,reason:`FLOW_${c.action}`};}
  if(c.action==='LAYOFF_CM'){const cm=opts.find(x=>x.p.role==='CM'&&x.block===0&&x.open>1.1&&x.forward>-7);if(cm)return{type:'PASS',target:cm.p,kind:'PASS',option:cm,reason:'FLOW_LAYOFF_CM'};}
  if(c.action==='RECYCLE'&&m.time-(m.lastRecycleAt?.[owner.team]??-99)>6.5){
    const recycle=opts.find(x=>['CM','FB'].includes(x.p.role)&&x.block===0&&x.open>1.25&&x.forward<0&&x.forward>-16)
      ||opts.find(x=>x.block===0&&x.open>1.5&&x.forward>-10);
    if(recycle){recycle.flowRecycle=true;return{type:'PASS',target:recycle.p,kind:'PASS',option:recycle,reason:'FLOW_RECYCLE',recycle:true};}
  }
  if(c.action==='COMBINATION_PASS')return null;
  if(c.action==='FOUL_DRAWN')return null;
  return null;
}
function startRecyclePhase(m,team,owner,target){
  const ol=worldToLocal(team,owner.x,owner.y),tl=worldToLocal(team,target.x,target.y);
  m.attackRecycleUntil[team]=m.time+8.0;m.lastRecycleAt[team]=m.time;
  m.attackRecycleFloor[team]=clamp(Math.max(72,Math.min(80,ol.x-5),tl.x+5),70,80);
  m.stats.recycles=(m.stats.recycles||0)+1;
}
function executeDrawFoul(m,owner){
  const local=worldToLocal(owner.team,owner.x,owner.y);
  // Penalties are a later set-piece layer; this minimal flow only resolves fouls outside the box.
  if(local.x>=88.5&&local.y>=13.84&&local.y<=54.16){executeCarry(m,owner);return;}
  m.stats.fouls=(m.stats.fouls||0)+1;m.stats.freeKicks=(m.stats.freeKicks||0)+1;
  event(m,'FOUL',`${subjectName(owner.name)} 압박 과정에서 파울을 얻어냈습니다.`);
  startDeadRestart(m,'FREE_KICK',owner.team,owner.x,owner.y);
}

function chooseOwnerActionLegacy(m,owner,pre=null){
  const local=pre?.local||worldToLocal(owner.team,owner.x,owner.y),pressure=pre?.pressure??ballCarrierPressureDistance(m,owner),space=pre?.space??forwardSpace(m,owner,13),shot=pre?.shot||shotAssessment(m,owner),opts=pre?.opts||passOptions(m,owner),best=opts[0],held=pre?.held??Math.max(0,m.time-(owner.controlledSince||m.time)),sincePass=m.time-(m.lastPassAt[owner.team]??-99);
  if(owner.role==='GK'){
    const short=opts.find(o=>['CB','FB','CM'].includes(o.p.role)&&o.block===0&&o.open>2.0&&o.d<31);
    const safe=short||best;if(safe)return{type:'PASS',target:safe.p,kind:safe.d>29?'LONG_PASS':'PASS',option:safe};return{type:'GK_CLEAR'};
  }
  // Kick-offs should settle into a build-up shape instead of the front three tapping the ball forward at each other.
  if((m.kickoffBuildUntil||0)>m.time){
    const settle=opts.find(o=>['CM','CB','FB'].includes(o.p.role)&&o.forward<5&&o.block===0)||opts.find(o=>['CM','CB','FB'].includes(o.p.role)&&o.block===0);
    if(settle)return{type:'PASS',target:settle.p,kind:settle.d>30?'LONG_PASS':'PASS',option:settle};
  }
  // Finishing ownership comes before generic possession bookkeeping. A front-pass-chain or
  // recycle rule must never steal a real ST/WF/CM finishing window and turn it into an automatic
  // back-pass/carry. The box resolver can still choose a layoff/carry when the shot is genuinely poor.
  if(shot.oneVOne)return{type:'SHOT',reason:'ONE_V_ONE'};
  if(shot.inBox&&shot.dGoal<=9.5&&Math.abs(local.y-34)<=13.0&&shot.blockers.length===0)return{type:'SHOT',reason:'CLOSE_RANGE'};
  // Only ST gets the early finishing ownership. WF/CM keep their previous generic
  // final-third ordering so fixing the striker does not globally inflate shot volume.
  if(owner.role==='ST'&&shot.inBox){
    const stDelivery=pre&&Object.prototype.hasOwnProperty.call(pre,'delivery')?pre.delivery:finalThirdDelivery(m,owner);
    const stBoxAction=boxFinalAction(m,owner,shot,opts,stDelivery,pressure,space);
    if(stBoxAction)return stBoxAction;
  }

  // Central ST at the top of the box: recognize the shooting phase BEFORE clear-runway,
  // front-combination and FLOW recycle rules. Missing the shot roll means keep attacking the
  // goal (usually one more touch), not harmlessly reset to the back line.
  const recentEdgeShot=m.time-(m.lastShotAt?.[owner.team]??-99)<2.4;
  const edgeCentral=Math.abs(local.y-34);
  const stEdgeThreat=owner.role==='ST'&&!shot.inBox&&!recentEdgeShot&&local.x>=80&&local.x<=89.8&&shot.dGoal<=25&&edgeCentral<=15.5&&shot.blockers.length<=1&&pressure>1.15&&held>0.38;
  if(stEdgeThreat){
    let edgeP=shot.blockers.length===0?(shot.dGoal<=21.5?0.06:0.045):0.03;
    if(pressure>2.6)edgeP+=0.01;
    if(m.r()<edgeP)return{type:'SHOT',reason:'ST_EDGE_SHOOTING_WINDOW'};
    const combine=opts.find(o=>o.block===0&&o.open>1.2&&o.forward>-0.5&&worldToLocal(owner.team,o.p.x,o.p.y).x>78);
    // A defender already on the striker's shoulder requires a real take-on/combination;
    // generic carry must not walk through the box line just because the edge-shot roll failed.
    if(local.x<89.2&&space>1.8&&(pressure>=2.0||space>=4.5))return{type:'CARRY',reason:'ST_CREATE_SHOOTING_ANGLE'};
    if(combine)return{type:'PASS',target:combine.p,kind:'PASS',option:combine,reason:'ST_FORWARD_COMBINATION'};
    return{type:'HOLD',reason:'ST_PROTECT_SHOOTING_ZONE'};
  }

  const runway=clearRunwayAssessment(m,owner,space,pressure);
  if(runway.clear){m.stats.clearRunwayCarries=(m.stats.clearRunwayCarries||0)+1;return{type:'CARRY',reason:'CLEAR_RUNWAY'};}
  // Hard guard: after two front-three combinations, the next front player must carry, reconnect or protect the ball before another ST/WF pass.
  // This guard now applies only after genuine finishing windows have been resolved.
  if((m.frontPassChain[owner.team]||0)>=2&&['ST','WF'].includes(owner.role)){
    const outlet=opts.find(o=>['CM','FB'].includes(o.p.role)&&o.block===0&&o.open>1.4);
    if(local.x<93&&space>2.3)return{type:'CARRY'};
    if(outlet)return{type:'PASS',target:outlet.p,kind:outlet.d>31?'LONG_PASS':'PASS',option:outlet};
    return{type:'HOLD'};
  }
  const recycleNow=(m.attackRecycleUntil?.[owner.team]||0)>m.time;
  if(recycleNow&&local.x>58&&held>0.58){
    const rp=opts.find(o=>o.forward>5&&o.block===0&&o.open>1.2);
    const rs=opts.find(o=>Math.abs(o.p.y-owner.y)>18&&o.forward>-2&&o.block===0&&o.open>1.2);
    if(rp)return{type:'PASS',target:rp.p,kind:rp.running&&rp.leadForward>9?'THROUGH':'PASS',option:rp,reason:'RECYCLE_REATTACK'};
    if(rs&&held>0.90)return{type:'PASS',target:rs.p,kind:rs.d>31?'LONG_PASS':'PASS',option:rs,reason:'RECYCLE_SWITCH'};
    if(local.x<88&&space>2.8)return{type:'CARRY',reason:'RECYCLE_ADVANCE'};
  }
  const delivery=pre&&Object.prototype.hasOwnProperty.call(pre,'delivery')?pre.delivery:finalThirdDelivery(m,owner);
  const boxAction=boxFinalAction(m,owner,shot,opts,delivery,pressure,space);
  if(boxAction)return boxAction;
  // Penalty-area edge window for WF/CM remains selective; ST is handled by the dedicated
  // finishing-phase resolver above so generic possession rules cannot steal its shooting timing.
  if(owner.role==='WF'&&!shot.inBox&&!recentEdgeShot&&local.x>=80&&local.x<=89.8&&shot.dGoal<=25&&edgeCentral<=15.5&&shot.blockers.length<=1&&pressure>1.15&&held>0.48){
    let edgeP=0.022;
    if(shot.blockers.length===0&&shot.dGoal<=21.5)edgeP+=0.030;
    if(pressure>2.6)edgeP+=0.006;
    if(m.r()<edgeP)return{type:'SHOT',reason:'BOX_EDGE_WINDOW'};
  }
  const midfieldLongShot=midfieldLongShotAction(m,owner,shot,pressure,held);
  if(midfieldLongShot)return midfieldLongShot;
  const flowAction=flowFinalThirdDecision(m,owner,shot,opts,pressure,space);
  if(flowAction)return flowAction;
  // Outside the box, final actions remain selective so the engine does not become a shot/cross spammer.
  if(delivery&&(owner.role==='WF'||owner.role==='FB')&&held>0.70&&(pressure<2.6||local.x>88)&&m.r()<0.12)return delivery;
  const recentShot=m.time-(m.lastShotAt?.[owner.team]??-99)<2.4;
  if(shot.score>=8.6&&shot.blockers.length<=1&&shot.dGoal<20&&m.r()<0.08)return{type:'SHOT'};
  const runner=opts.find(o=>o.running&&o.block===0&&o.leadForward>9&&o.score>2.0);
  const wideThrough=opts.find(o=>o.wideChannel&&o.block===0&&o.leadForward>12&&o.d>18&&o.d<50&&o.score>1.75);
  const progressive=opts.find(o=>o.forward>6&&o.block===0&&o.score>1.35);
  const switchOpt=opts.find(o=>Math.abs(o.p.y-owner.y)>23&&o.block===0&&o.score>1.0);
  const safe=opts.find(o=>o.block===0&&o.open>1.8);
  const recentTakeOnWin=m.time-(owner.lastTakeOnWinAt||-99)<1.6,counterActive=(m.attackRhythm?.[owner.team]?.counterUntil||0)>m.time;
  const approachCentral=local.x>=82&&local.x<88.5&&local.y>=12.8&&local.y<=55.2;
  const disciplinedEntry=!approachCentral||runway.clear||recentTakeOnWin||counterActive||(pressure>=2.8&&space>=4.5);
  const canCarry=local.x<93&&space>1.8&&disciplinedEntry;
  if(held<0.55){if(pressure<1.10&&safe)return{type:'PASS',target:safe.p,kind:safe.d>30?'LONG_PASS':'PASS',option:safe};return canCarry?{type:'CARRY'}:{type:'HOLD'};}
  // Midfield/full-back can attack a moving wide channel with a longer through ball instead of always climbing by short combinations.
  if(wideThrough&&wideThrough.running&&wideThrough.lead&&wideThrough.leadForward>12&&['CM','FB','CB'].includes(owner.role)&&held>0.60&&pressure>1.05&&m.r()<0.18){wideThrough.longDiagonal=true;return{type:'PASS',target:wideThrough.p,kind:'THROUGH',option:wideThrough};}
  if(runner&&held>0.72&&(pressure<2.5||local.x>44)&&m.r()<0.38)return{type:'PASS',target:runner.p,kind:'THROUGH',option:runner};
  if(pressure<1.25){if(safe)return{type:'PASS',target:safe.p,kind:safe.d>29?'LONG_PASS':'PASS',option:safe};return canCarry?{type:'CARRY'}:{type:'HOLD'};}

  if(canCarry&&held<1.70&&space>3.0)return{type:'CARRY'};
  if(canCarry&&space>5.0&&pressure>2.8&&held<2.8&&m.r()<0.70)return{type:'CARRY'};
  if(local.x>72&&canCarry&&shot.dGoal<30&&pressure>2.2&&m.r()<0.55)return{type:'CARRY'};

  const recycleActive=(m.attackRecycleUntil?.[owner.team]||0)>m.time;
  if(recycleActive){
    if(progressive&&held>0.75)return{type:'PASS',target:progressive.p,kind:progressive.running&&progressive.leadForward>9?'THROUGH':'PASS',option:progressive};
    if(switchOpt&&held>0.90)return{type:'PASS',target:switchOpt.p,kind:switchOpt.d>31?'LONG_PASS':'PASS',option:switchOpt};
    if(canCarry&&space>2.4)return{type:'CARRY'};
  }
  if(progressive&&held>1.20&&progressive.score>(best===progressive?1.25:1.65))return{type:'PASS',target:progressive.p,kind:progressive.running&&progressive.leadForward>10?'THROUGH':'PASS',option:progressive};
  if(switchOpt&&held>1.65&&sincePass>1.05&&m.r()<0.08)return{type:'PASS',target:switchOpt.p,kind:switchOpt.d>31?'LONG_PASS':'PASS',option:switchOpt};
  if(safe&&held>2.55)return{type:'PASS',target:safe.p,kind:safe.d>31?'LONG_PASS':'PASS',option:safe};
  if(canCarry)return{type:'CARRY'};
  if(best&&held>1.55)return{type:'PASS',target:best.p,kind:best.d>31?'LONG_PASS':'PASS',option:best};
  return{type:'TURN_BACK'};
}


function chooseOwnerAction(m,owner){
  const local=worldToLocal(owner.team,owner.x,owner.y),pressure=ballCarrierPressureDistance(m,owner),space=forwardSpace(m,owner,13),shot=shotAssessment(m,owner),opts=passOptions(m,owner,true),held=Math.max(0,m.time-(owner.controlledSince||m.time)),deep=finalThirdDelivery(m,owner),early=earlyCrossDelivery(m,owner),takeOn=takeOnOpportunity(m,owner,shot,held);
  const pre={local,pressure,space,shot,opts,held,delivery:deep};
  // TT-0.48 decisive-receive finishing: NPC attackers should sometimes finish the chance
  // created by a teammate instead of automatically recycling until the ball returns to the
  // protagonist. This is still live/stochastic and uses the actual lane, pressure and body state.
  const receiveAge=m.time-(owner.lastReceivedAt||-99),throughReceiveFinalThird=owner.lastReceivedFlightKind==='THROUGH'&&receiveAge<=1.35&&local.x>=82&&shot.dGoal<=23.5&&shot.blockers.length===0,decisiveReceive=receiveAge>=.22&&receiveAge<=1.35&&(shot.inBox||throughReceiveFinalThird)&&shot.dGoal<=23.5&&(shot.oneVOne||shot.openWindow||(shot.blockers.length===0&&shot.dGoal<=15.8&&pressure>1.75))&&shot.facingAlignment>=.62&&['ST','WF','CM'].includes(owner.role);
  if(decisiveReceive){const open=shot.blockers.length===0,baseP=shot.oneVOne?.62:open?(shot.inBox?.32:.24):.16,roleP=owner.role==='ST'?0.06:owner.role==='WF'?0.02:-0.02,pressureP=pressure>=3.2?.08:pressure>=2.0?.03:pressure<1.2?-.10:0,p=clamp(baseP+roleP+pressureP,shot.inBox?.28:.22,.96),roll=(hash32(`${m.seed}|DECISIVE_RECEIVE_SHOT|${Math.floor((owner.controlledSince||m.time)*10)}|${owner.id}`)%10000)/10000;if(roll<p){m.stats.decisiveReceiveShots=(m.stats.decisiveReceiveShots||0)+1;return{type:'SHOT',reason:'DECISIVE_RECEIVE_FINISH'};}}
  const rhythmAction=rhythmBuildUpAction(m,owner,pre);if(rhythmAction)return rhythmAction;
  // Keep restart-sensitive goalkeeper and kick-off behaviour on the proven path. Candidate ownership begins once normal attacking play is established.
  if(owner.role==='GK'||(m.kickoffBuildUntil||0)>m.time)return chooseOwnerActionLegacy(m,owner,pre);
  // Preserve the calibrated CM long-shot window while the new candidate layer is calibrated around it.
  const longShot=midfieldLongShotAction(m,owner,shot,pressure,held);if(longShot)return longShot;
  // AI timing error: a marginally-offside runner can still look like the best lane to the passer.
  // The runner had to be within the narrow release-margin window already admitted by passOptions;
  // user-facing choice inspection uses strict onside options and is unaffected.
  const timingMistake=opts.find(o=>o.offsideRisk&&o.running&&o.block===0&&o.forward>4&&o.score>=(opts[0]?.score??o.score)-0.55);
  if(timingMistake&&held>=0.45&&local.x>=28&&local.x<=88){m.stats.offsideTimingWindows=(m.stats.offsideTimingWindows||0)+1;const timingRead=(abilityValue(m,owner,'vision')+abilityValue(m,timingMistake.p,'off_ball'))/2,pickP=clamp(0.36-(timingRead-60)*0.0020+Math.min(0.85,timingMistake.offsideMargin||0)*0.055,0.15,0.48),rr=(hash32(`${m.seed}|OFFSIDE_PICK|${Math.floor(m.time*4)}|${owner.id}|${timingMistake.p.id}`)%10000)/10000;if(rr<pickP){m.stats.offsideTimingPicks=(m.stats.offsideTimingPicks||0)+1;return{type:'PASS',target:timingMistake.p,kind:'THROUGH',option:timingMistake};}}
  const ctx=candidateContext(m,owner,shot,opts,pressure,space,held,deep,early,takeOn),ranked=candidateRank(m,owner,ctx);
  // V0.6 rhythm calibration: keep one persistent clock for the SAME genuinely open
  // finishing window. Repeated committed carries must not reset this clock; otherwise an
  // attacker can keep choosing another small carry forever while the goal remains open.
  const finishCentral=Math.abs(local.y-34),finishOpen=shot.inBox&&shot.openWindow&&shot.blockers.length===0&&shot.dGoal<=18.5&&finishCentral<=11.5&&['ST','WF','CM'].includes(owner.role);
  if(finishOpen){
    if(owner.openFinishingControlSince!==owner.controlledSince||!Number.isFinite(owner.openFinishingWindowSince)){owner.openFinishingControlSince=owner.controlledSince;owner.openFinishingWindowSince=m.time;}
  }else{owner.openFinishingWindowSince=null;owner.openFinishingControlSince=null;}
  const finishAge=finishOpen&&Number.isFinite(owner.openFinishingWindowSince)?m.time-owner.openFinishingWindowSince:0;
  const recentAngleCarry=(owner.boxCarryChain||0)>=1&&m.time-(owner.lastBoxCarryAt||-99)<1.5;
  const finishDeadline=recentAngleCarry?(owner.role==='ST'?0.40:(owner.role==='WF'?0.48:0.58)):(owner.role==='ST'?0.90:(owner.role==='WF'?0.88:1.00));
  const finishForceDistance=owner.role==='ST'?18.0:(owner.role==='WF'?16.8:16.0);
  // This is deliberately NOT a general shot quota. A striker should eventually finish a
  // sustained central lane; midfielders/wingers get the same deadline only much closer to goal.
  // This preserves decisive finishing without converting every marginal box entry into a shot.
  const finishCandidate=recentAngleCarry?ranked.find(c=>c.id==='SHOT'):ranked[0];
  if(finishOpen&&finishCandidate?.id==='SHOT'&&shot.dGoal<=finishForceDistance&&finishAge>=finishDeadline){
    const fc=finishCandidate,selected=candidateToAction(m,owner,fc,{...pre,deep,early,takeOn,ctx});
    if(selected){selected.reason='SUSTAINED_OPEN_FINISH';m.stats.sustainedOpenFinishShots=(m.stats.sustainedOpenFinishShots||0)+1;recordCandidateDecision(m,owner,fc,selected,true);return selected;}
  }
  // STEP39 V0.6: a genuine 1v1 take-on can happen before the final third. This is kept narrow: only the
  // explicit TAKE_ON candidate may take ownership here; normal pass/carry policy remains on the proven path.
  if(CANDIDATES&&takeOn&&local.x>=48){
    const tc=ranked.find(c=>c.id==='TAKE_ON');const top=ranked[0];
    if(tc&&tc.score>=(top?.score??tc.score)-0.12){const commit=CANDIDATES.commitment(tc,ctx),roll=(hash32(`${m.seed}|TAKEON_COMMIT|${Math.floor(m.time*10)}|${owner.id}`)%10000)/10000;if(roll<=commit){const selected=candidateToAction(m,owner,tc,{...pre,deep,early,takeOn,ctx});if(selected){recordCandidateDecision(m,owner,tc,selected,true);return selected;}}}
  }
  // STEP39 V0.2: in the attacking half the Candidate Engine is the primary decision owner, not a permanent shadow copy.
  if(CANDIDATES&&local.x>=70){
    const genuineOpenChance=shot.inBox&&shot.openWindow&&shot.blockers.length===0&&shot.dGoal<=18.5&&Math.abs(local.y-34)<=12.5&&['ST','WF','CM'].includes(owner.role);
    for(const c of ranked.slice(0,5)){
      if(c.id==='HOLD'||c.id==='TURN_BACK')continue;
      // STEP76 chance-preservation floor: when a real box lane is open, 'safest' back/recycle
      // options cannot win solely by possession security. Shot/carry/take-on/delivery are read first.
      if(genuineOpenChance&&['SAFE_PASS','RECYCLE'].includes(c.id))continue;
      if(c.id==='SHOT'&&owner.candidateShotDecline){
        const sd=owner.candidateShotDecline,central=Math.abs(local.y-34),improved=shot.oneVOne||shot.dGoal<=9.8||shot.dGoal<=sd.dGoal-1.8||central<=Math.max(6,sd.centrality-2.5);
        if(m.time<(sd.until||0)&&!improved)continue;
        if(improved||m.time>=(sd.until||0))owner.candidateShotDecline=null;
      }
      const commit=typeof CANDIDATES.commitment==='function'?CANDIDATES.commitment(c,ctx):1,roll=(hash32(`${m.seed}|COMMIT|${Math.floor(m.time*10)}|${owner.id}|${c.id}`)%10000)/10000;
      if(roll>commit){
        const openCentralShot=c.id==='SHOT'&&ranked[0]?.id==='SHOT'&&shot.blockers.length===0&&shot.dGoal<=22&&Math.abs(local.y-34)<=10&&['ST','WF','CM'].includes(owner.role);
        if(c.id==='SHOT'&&!shot.oneVOne&&shot.dGoal>9.8){const central=Math.abs(local.y-34),critical=shot.inBox&&shot.blockers.length===0&&shot.dGoal<=18.5&&central<=11.0;owner.candidateShotDecline={until:m.time+(critical?0.62:clamp(1.75+(shot.dGoal>17?0.55:0)+(central>12?0.50:0),1.75,2.90)),dGoal:shot.dGoal,centrality:central};}
        if(openCentralShot&&local.x<93&&space>1.8){const selected={type:'CARRY',reason:'OPEN_SHOT_CREATE_ANGLE'};recordCandidateDecision(m,owner,c,selected,true);return selected;}
        continue;
      }const selected=candidateToAction(m,owner,c,{...pre,deep,early,takeOn,ctx});
      if(selected){m.actionCandidateTelemetry=m.actionCandidateTelemetry||{};m.actionCandidateTelemetry.primaryDecisions=(m.actionCandidateTelemetry.primaryDecisions||0)+1;m.actionCandidateTelemetry.commitmentRejects=(m.actionCandidateTelemetry.commitmentRejects||0)+(ranked[0]?.id===c.id?0:1);recordCandidateDecision(m,owner,c,selected,true);return selected;}
    }
    m.actionCandidateTelemetry=m.actionCandidateTelemetry||{};m.actionCandidateTelemetry.primaryFallbacks=(m.actionCandidateTelemetry.primaryFallbacks||0)+1;
    // If every stochastic attacking commitment was declined while the goal lane is still open,
    // preserve the attack with a small forward/angle carry rather than falling through to a safe
    // backward pass. The sustained-open timer will reopen/finish the chance if it remains valid.
    if(genuineOpenChance){const selected={type:'CARRY',reason:'PRESERVE_OPEN_ATTACKING_CHANCE'};recordCandidateDecision(m,owner,ranked.find(c=>c.id==='CARRY')||ranked[0]||null,selected,true);return selected;}
  }
  const selected=chooseOwnerActionLegacy(m,owner,pre),shadow=ranked[0]||null;recordCandidateDecision(m,owner,shadow,selected,false);return selected;
}

function deterministicUnit(key){return(hash32(key)%1000000)/1000000;}
function chooseCrossVariant(m,owner,target,option,pd,pressureDist){
  const sl=worldToLocal(owner.team,owner.x,owner.y),tl=worldToLocal(owner.team,target.x,target.y);
  const byline=sl.x>=94.0,early=!!option?.earlyCross||sl.x<88.5,centralTarget=Math.abs(tl.y-34)<=13.5,boxTarget=tl.x>=86&&tl.x<=99;
  let lowP=early?0.12:byline?0.42:sl.x>=89?0.30:0.20;
  if(centralTarget&&boxTarget)lowP+=0.10;
  if(pd<=22)lowP+=0.06;
  if(pressureDist<1.7)lowP+=0.05;
  lowP=clamp(lowP,0.08,0.58);
  const bucket=Math.floor(m.time*4),roll=deterministicUnit(`${m.seed}|CROSS_VARIANT|${bucket}|${owner.id}|${target.id}`);
  return roll<lowP?'DRIVEN_LOW':'HIGH';
}
function choosePassDelivery(m,owner,target,kind,option,pd){
  if(option?.forceGround&&['PASS','LONG_PASS','THROUGH'].includes(kind))return'GROUND';
  if(option?.forceAerial&&['PASS','LONG_PASS','THROUGH'].includes(kind))return'AERIAL';
  if(kind==='CUTBACK')return'GROUND';
  if(kind==='CROSS')return option?.crossVariant==='DRIVEN_LOW'?'GROUND':'AERIAL';
  if(kind==='PASS')return'GROUND';
  if(kind==='THROUGH'){
    if(option?.forceAerial)return'AERIAL';
    // Most through-balls are slid into space. Only a genuine long diagonal/chipped lane may be lifted.
    if(option?.longDiagonal&&pd>27){const lateral=Math.abs(target.y-owner.y),p=clamp(0.28+(lateral>18?0.20:0)+(option?.block>0?0.16:0),0.18,0.64);return m.r()<p?'AERIAL':'GROUND';}
    return'GROUND';
  }
  if(kind==='LONG_PASS'){
    // Distance describes the pass family; trajectory is independent. A clean 30-35m lane can be
    // drilled along the floor, while switches, blocked lanes and GK clearances are more often lofted.
    const lateral=Math.abs(target.y-owner.y),block=option?.block??0,switchPlay=!!option?.switchPlay;
    let aerialP=0.26+(pd>35?0.17:0)+(pd>42?0.15:0)+(lateral>20?0.18:0)+(block>0?0.16:0)+(switchPlay?0.16:0)+(owner.role==='GK'?0.42:0);
    aerialP=clamp(aerialP,0.10,0.94);return m.r()<aerialP?'AERIAL':'GROUND';
  }
  return'GROUND';
}
function executePass(m,owner,target,kind,option=null,actionReason=null){
  const npcPassDecision=!(m.protagonistExplicitActionRequired===true&&m.protagonistControllerId===owner.id);
  if(npcPassDecision&&target){const ol=worldToLocal(owner.team,owner.x,owner.y),tl=worldToLocal(owner.team,target.x,target.y),backward=tl.x<ol.x-4.0;if(backward){const sa=shotAssessment(m,owner),blockers=Array.isArray(sa.blockers)?sa.blockers.length:Number(sa.blockers||0),central=Math.abs(ol.y-34),bodyReady=!!sa.oneVOne||(!sa.turningRequired&&Number(sa.facingAlignment??1)>=.38),strongFinish=!!sa.inBox&&!!sa.openWindow&&blockers===0&&sa.dGoal<=18.5&&central<=12.5&&bodyReady&&['ST','WF','CM'].includes(owner.role);if(strongFinish){m.stats.strongAttackBackpassGuards=(m.stats.strongAttackBackpassGuards||0)+1;return executeShot(m,owner,'STRONG_ATTACK_NO_HARMFUL_BACKPASS');}}}
  if(!target)return;const frontRoles=new Set(['ST','WF']),frontCombo=(kind==='PASS'||kind==='THROUGH')&&frontRoles.has(owner.role)&&frontRoles.has(target.role);if(frontCombo)m.frontPassChain[owner.team]=(m.frontPassChain[owner.team]||0)+1;else m.frontPassChain[owner.team]=0;m.stats.maxFrontPassChain=Math.max(m.stats.maxFrontPassChain,m.frontPassChain[owner.team]||0);
  const d=dist(owner,target),running=option?.running||(target.runUntil||0)>m.time,feetIntent=actionReason==='CANDIDATE_SAFE'||actionReason==='CANDIDATE_RECYCLE';let tp;
  if(kind==='THROUGH'&&running){tp=option?.lead?{x:option.lead.x,y:option.lead.y}:{x:target.runTx,y:target.runTy};}
  else if(kind==='THROUGH'){tp={x:clamp(target.x+target.vx*0.35,0,105),y:clamp(target.y+target.vy*0.35,0,68)};}
  else{const lead=feetIntent?0.06:(kind==='CROSS'?0.45:0.20);tp={x:clamp(target.x+target.vx*lead,0,105),y:clamp(target.y+target.vy*lead,0,68)};if(!feetIntent&&kind==='PASS'&&option&&option.forward>2&&option.open>3&&m.r()<0.34){const tl=worldToLocal(target.team,tp.x,tp.y),w=localToWorld(target.team,clamp(tl.x+2.0+m.r()*2.2,4,96),clamp(tl.y+(m.r()-0.5)*1.8,4,64));tp=w;}}
  let pd=dist(owner,tp);
  // A through-ball target must be far enough ahead that the receiver does not reach the
  // lead point and stand still while the ball is still 15-25m away. Extend only obviously
  // under-led passes; already well-timed runs are left untouched.
  if(kind==='THROUGH'){
    const receiverLead=dist(target,tp),targetSpeed=Math.hypot(target.vx,target.vy),roughArrival=clamp(pd/Math.max(13.2,Math.min(24.5,pd/1.10)),0.82,1.62),desiredLead=clamp((targetSpeed>1.6?targetSpeed:5.0)*roughArrival,4.8,14.5);
    // Extend an under-led pass along the runner's LIVE movement vector. The old X-only
    // extension could turn a diagonal/wide run into a hard straight ball toward goal.
    if(receiverLead<desiredLead*0.88){const baseDx=targetSpeed>1.6?target.vx:(tp.x-target.x),baseDy=targetSpeed>1.6?target.vy:(tp.y-target.y),nv=norm(baseDx,baseDy),extra=clamp(desiredLead-receiverLead,0,3.8),candidate={x:clamp(tp.x+nv.x*extra,1,104),y:clamp(tp.y+nv.y*extra,1,67)},oldBlocks=laneBlockers(m,owner,tp,other(owner.team)).length,newBlocks=laneBlockers(m,owner,candidate,other(owner.team)).length,oldOpen=outfield(m,other(owner.team)).reduce((best,q)=>Math.min(best,dist(q,tp)),99),newOpen=outfield(m,other(owner.team)).reduce((best,q)=>Math.min(best,dist(q,candidate)),99);if(newBlocks<=oldBlocks&&newOpen>=Math.min(1.25,oldOpen-.35))tp=candidate;pd=dist(owner,tp);}
  }
  const ownerSpeed=Math.hypot(owner.vx,owner.vy),pressureDist=ballCarrierPressureDistance(m,owner),underPressure=pressureDist<2.0;
  const passSkill=kind==='LONG_PASS'?abilityValue(m,owner,'long_pass'):kind==='CROSS'?abilityValue(m,owner,'crossing'):kind==='THROUGH'?(abilityValue(m,owner,'vision')+abilityValue(m,owner,'short_pass')+abilityValue(m,owner,'long_pass'))/3:abilityValue(m,owner,'short_pass');
  // Physical pass execution: keep the receiver's intended run separate from the actual strike.
  // Previously any pass error moved target.tx/ty to the same erroneous point, effectively giving
  // the receiver foreknowledge of the miss and erasing most real pass failures.
  const intendedTp={x:tp.x,y:tp.y};
  let receiverIntentLock=false;
  if(['PASS','LONG_PASS','THROUGH'].includes(kind)){
    const edge=Math.min(tp.y,68-tp.y),family=kind==='LONG_PASS'?0.52:kind==='THROUGH'?0.34:0;
    let aimErr=0.22+pd*0.011+family+(underPressure?0.72:pressureDist<3.0?0.18:0)-(passSkill-60)*0.008;
    if(edge<11)aimErr*=1.12;aimErr=clamp(aimErr,0.16,2.25);
    receiverIntentLock=(kind==='LONG_PASS'&&underPressure&&edge<4.0);const lateralStrikeScale=receiverIntentLock?3.30:2.00;
    tp={x:clamp(tp.x+(m.r()-0.5)*aimErr*1.30,-3.0,108.0),y:clamp(tp.y+(m.r()-0.5)*aimErr*lateralStrikeScale,-3.5,71.5)};pd=dist(owner,tp);
  }
  let crossVariant=null;if(kind==='CROSS'){crossVariant=chooseCrossVariant(m,owner,target,option,pd,pressureDist);option={...(option||{}),crossVariant};}
  if(kind==='CROSS'){
    const slErr=worldToLocal(owner.team,tp.x,tp.y),skill=passSkill,pressurePenalty=pressureDist<1.45?0.85:pressureDist<2.3?0.42:0,baseErr=clamp(0.42+pd*0.027+pressurePenalty-(skill-60)*0.014,0.28,2.80);
    const key=`${m.seed}|CROSS_ERROR|${Math.floor(m.time*5)}|${owner.id}|${target.id}|${crossVariant}`,r1=deterministicUnit(key+'|A'),r2=deterministicUnit(key+'|B'),r3=deterministicUnit(key+'|C'),r4=deterministicUnit(key+'|D'),depth=((r1+r2)-1)*baseErr*(crossVariant==='DRIVEN_LOW'?0.85:1.05),lateral=((r3+r4)-1)*baseErr*(crossVariant==='DRIVEN_LOW'?1.05:1.28),actualLocal={x:slErr.x+depth,y:slErr.y+lateral};
    tp=localToWorld(owner.team,actualLocal.x,actualLocal.y);tp={x:clamp(tp.x,-3.0,108.0),y:clamp(tp.y,-3.5,71.5)};pd=dist(owner,tp);m.stats.crossExecutionErrors=(m.stats.crossExecutionErrors||0)+1;
  }
  const longDiag=kind==='THROUGH'&&option?.longDiagonal&&pd>26,deliveryMode=choosePassDelivery(m,owner,target,kind,option,pd);
  const sl=worldToLocal(owner.team,owner.x,owner.y),strike=STRIKE&&typeof STRIKE.passPlan==='function'?STRIKE.passPlan({kind,distance:pd,deliveryMode,pressure:ballCarrierPressureDistance(m,owner),targetSpeed:Math.hypot(target.vx,target.vy),targetLeadDistance:dist(target,tp),forward:dir(owner.team)*(tp.x-owner.x),passSkill,sourceX:sl.x,crossVariant}):null;
  const speed=strike?.speed??(kind==='PASS'?clamp(12+pd*0.28,13,18):kind==='CUTBACK'?17:kind==='THROUGH'?clamp((deliveryMode==='AERIAL'?15.2:16)+pd*0.30,16.5,24):kind==='CROSS'?clamp(18+pd*0.24,19,24):clamp((deliveryMode==='AERIAL'?17:18.5)+pd*0.25,18.5,25));
  const loft=strike?.loft??(deliveryMode==='AERIAL'?(kind==='CROSS'?3.0:kind==='THROUGH'?1.55:2.25):0.10),passStyle=strike?.style||null,groundDragK=Number.isFinite(strike?.groundDragK)?strike.groundDragK:null;
  const reattacking=(m.attackRecycleUntil?.[owner.team]||0)>m.time&&dir(owner.team)*(tp.x-owner.x)>5;
  if(reattacking){m.stats.recycleReattacks=(m.stats.recycleReattacks||0)+1;m.attackRecycleUntil[owner.team]=0;}
  m.stats.passes++;if(ownerSpeed>1.25)m.stats.passesOnMove++;if(longDiag)m.stats.wideThroughPasses++;if(deliveryMode==='AERIAL')m.stats.aerialPasses=(m.stats.aerialPasses||0)+1;if(kind==='LONG_PASS'){if(deliveryMode==='AERIAL')m.stats.longAerialPasses=(m.stats.longAerialPasses||0)+1;else m.stats.longGroundPasses=(m.stats.longGroundPasses||0)+1;}if(inOppPenaltyArea(owner.team,owner.x,owner.y)&&['PASS','LONG_PASS'].includes(kind)&&dir(owner.team)*(target.x-owner.x)<-2)m.stats.boxBackPasses++;if(kind==='THROUGH'){m.stats.throughPasses++;if(dir(owner.team)*(tp.x-owner.x)<=0)m.stats.backwardThroughPasses=(m.stats.backwardThroughPasses||0)+1;}if(kind==='CROSS'){m.stats.crosses++;if(crossVariant==='DRIVEN_LOW')m.stats.drivenLowCrosses=(m.stats.drivenLowCrosses||0)+1;else m.stats.highCrosses=(m.stats.highCrosses||0)+1;m.stats.crossesByTeam[owner.team]=(m.stats.crossesByTeam[owner.team]||0)+1;const sk=['LW','RW','LB','RB'].includes(owner.slot)?owner.slot:'OTHER';m.stats.crossesBySourceSlot[sk]=(m.stats.crossesBySourceSlot[sk]||0)+1;if(target.role==='ST'){m.stats.crossesToST=(m.stats.crossesToST||0)+1;if(owner.role==='WF')m.stats.wfCrossesToST=(m.stats.wfCrossesToST||0)+1;}const sl=worldToLocal(owner.team,owner.x,owner.y);if(sl.x>=88.5)m.stats.deepWideCrosses=(m.stats.deepWideCrosses||0)+1;if(sl.x>=94.0){m.stats.bylineCrosses=(m.stats.bylineCrosses||0)+1;m.stats.bylineCrossesByTeam[owner.team]=(m.stats.bylineCrossesByTeam[owner.team]||0)+1;}}if(kind==='CUTBACK')m.stats.cutbacks++;if(((owner.y<20&&tp.y>48)||(owner.y>48&&tp.y<20))&&dir(owner.team)*(tp.x-owner.x)>-5)m.stats.switchesOfPlay++;if(dir(owner.team)*(tp.x-owner.x)>10)m.stats.progressivePasses++;m.lastPassAt[owner.team]=m.time;
  const receiveTp=(typeof intendedTp!=='undefined')?intendedTp:tp;target.tx=receiveTp.x;target.ty=receiveTp.y;target.action=kind==='THROUGH'?'CHASE_THROUGH':'MOVE_TO_RECEIVE';target.sprint=dist(target,receiveTp)>2.4;target.lockTargetUntil=m.time+clamp(pd/speed+0.45,0.8,2.8);
  const olx=worldToLocal(owner.team,owner.x,owner.y).x,tlx=worldToLocal(owner.team,target.x,target.y).x;const backwardFinalThird=!!option?.flowRecycle&&olx>80&&tlx>=66&&dir(owner.team)*(target.x-owner.x)<-4&&['PASS','LONG_PASS'].includes(kind)&&m.time-(m.lastRecycleAt?.[owner.team]??-99)>5.5;
  if(backwardFinalThird)startRecyclePhase(m,owner.team,owner,target);
  setBallFlight(m,{source:owner,target,kind,speed,loft,targetPoint:tp,deliveryMode,style:passStyle,groundDragK,crossVariant,intendedTargetPoint:intendedTp,receiverIntentLock});
  // STEP76: a forward pass creates a short complementary run for the passer. The source does
  // not collapse onto the receiver/ball lane immediately after release; it attacks a different
  // channel for the next tempo. This is current-state movement only and precomputes no outcome.
  const forwardRelease=dir(owner.team)*(tp.x-owner.x);
  const srcL=worldToLocal(owner.team,owner.x,owner.y),dstL=worldToLocal(owner.team,tp.x,tp.y);
  owner.postPassSupportUntil=0;owner.postPassSupportLocalX=null;owner.postPassSupportLocalY=null;owner.postPassSupportTask=null;
  if(['ST','WF','CM'].includes(owner.role)&&(kind==='THROUGH'||forwardRelease>4.0)){
    const sep=dstL.y<34?1:-1;let runY=srcL.y;
    if(owner.role==='ST')runY=34+sep*6.5;
    else if(owner.role==='WF')runY=clamp(srcL.y+sep*4.0,8,60);
    else runY=34+sep*9.0;
    const runX=safeRunLocalX(m,owner,clamp(Math.max(srcL.x+7.0,dstL.x+1.5),5,95.5));
    owner.postPassLocalX=runX;owner.postPassLocalY=runY;owner.postPassContinueUntil=m.time+(kind==='THROUGH'?2.0:1.7);
  }else{
    owner.postPassContinueUntil=0;owner.postPassLocalX=null;owner.postPassLocalY=null;
    // STEP78: a safe/reset pass must not make the passer collapse back onto the receiver
    // and chase the same ball. Hold a complementary support lane for one tempo instead.
    if(['CANDIDATE_SAFE','CANDIDATE_RECYCLE'].includes(actionReason)&&['ST','WF','CM'].includes(owner.role)){
      const targetL=worldToLocal(owner.team,target.x,target.y),awaySign=Math.abs(srcL.y-targetL.y)>1?Math.sign(srcL.y-targetL.y):(srcL.y<34?-1:1);
      const supportX=clamp(srcL.x+(owner.role==='ST'?1.6:0.8),5,94.5),supportY=clamp(srcL.y+awaySign*(owner.role==='ST'?5.5:4.2),6,62);
      owner.postPassSupportLocalX=supportX;owner.postPassSupportLocalY=supportY;owner.postPassSupportTask=actionReason==='CANDIDATE_SAFE'?'POST_SAFE_PASS_SUPPORT':'POST_RECYCLE_SUPPORT';owner.postPassSupportUntil=m.time+1.55;
    }
  }
  if(['PASS','LONG_PASS','THROUGH'].includes(kind)){const errP=underPressure?(kind==='PASS'?0.048:kind==='THROUGH'?0.072:0.088):(kind==='PASS'?0.006:kind==='THROUGH'?0.020:0.030);m.ball.passMiscontrol=m.r()<errP;}
  if(passStyle)m.stats.passStyles[passStyle]=(m.stats.passStyles[passStyle]||0)+1;
  owner.nextThink=m.time+0.55;const passLabel=kind==='CROSS'?'크로스':kind==='CUTBACK'?'컷백':kind==='THROUGH'?(deliveryMode==='AERIAL'?'띄운 공간 패스':'공간 패스'):kind==='LONG_PASS'?(deliveryMode==='AERIAL'?'공중 롱패스':'긴 땅볼패스'):passStyle==='SHORT_GROUND'?'짧은 패스':passStyle==='FIRM_GROUND'?'강한 지상 패스':backwardFinalThird?'재순환 패스':'패스';event(m,'PASS',`${subjectName(owner.name)} ${target.name} 쪽으로 ${passLabel}했습니다.`,{actorId:owner.id,team:owner.team,targetId:target.id,passKind:kind});
}
function executeShot(m,owner,reason='GENERAL',exec={}){
  const incomingOneTouch=['ONE_TOUCH_DIRECT','ONE_TOUCH_VOLLEY'].includes(reason),strikeContactGap=controlContactGap(m,owner);if(!incomingOneTouch&&!materialControlReady(m,owner)){m.stats.materialShotContactRejects=(m.stats.materialShotContactRejects||0)+1;return{blocked:true,reason:'BALL_CONTACT_REQUIRED',contactGap:Number(strikeContactGap.toFixed(3))};}
  const team=owner.team;m.frontPassChain[team]=0;const gx=oppGoalX(team),assess=shotAssessment(m,owner),local=worldToLocal(team,owner.x,owner.y);
  if(assess.turningRequired&&!exec.releaseNow){
    const turnDelay=clamp(0.24+assess.bodyAngleDiff*0.135+(assess.backToGoal?0.05:0),0.30,0.66);
    owner.pendingShot={reason,releaseAt:m.time+turnDelay,decisionOrientation:{bodyAngleDiff:assess.bodyAngleDiff,facingAlignment:assess.facingAlignment,turningRequired:true,backToGoal:assess.backToGoal}};
    owner.faceTargetAngle=assess.goalAngle;owner.tx=owner.x;owner.ty=owner.y;owner.action='TURNING_SHOT_PREP';owner.tacticalTask='TURNING_SHOT_PREP';owner.sprint=false;owner.lockTargetUntil=owner.pendingShot.releaseAt;owner.nextThink=owner.pendingShot.releaseAt+0.08;
    event(m,'SHOT_PREP',`${subjectName(owner.name)} 몸을 돌려 터닝 슛 자세를 만듭니다.`,{actorId:owner.id,team:owner.team,turningShot:true});
    return{pending:true,releaseAt:owner.pendingShot.releaseAt,turningShot:true};
  }
  const orientation=exec.decisionOrientation||assess;
  const oppGK=teamPlayers(m,other(team)).find(p=>p.role==='GK'),gkLocal=oppGK?worldToLocal(team,oppGK.x,oppGK.y):{x:104},gkAdvance=Math.max(0,105-gkLocal.x);
  const stylePlan=STRIKE&&typeof STRIKE.shotPlan==='function'?STRIKE.shotPlan({dGoal:assess.dGoal,oneVOne:assess.oneVOne,openWindow:assess.openWindow,centrality:Math.abs(local.y-34),pressure:assess.pressure,gkAdvance,finishing:abilityValue(m,owner,'finishing'),longShots:abilityValue(m,owner,'long_shots'),flair:abilityValue(m,owner,'flair'),ballControl:abilityValue(m,owner,'ball_control'),turningRequired:!!orientation.turningRequired,backToGoal:!!orientation.backToGoal,facingAlignment:Number(orientation.facingAlignment),roll:m.r()}):{style:orientation.turningRequired?'TURNING':'POWER',speed:clamp(24+assess.dGoal*0.17,24,30),loft:.20,curve:0};
  const finishing=abilityValue(m,owner,'finishing'),keeperBeaten=!!oppGK&&gkLocal.x<local.x-0.55&&assess.blockers.length===0;
  let onTargetP=clamp(0.20+assess.score*0.023-assess.dGoal*0.0040+(finishing-60)*0.0022,0.18,0.52);
  if(stylePlan.style==='PLACED')onTargetP+=0.035;if(stylePlan.style==='CURLED')onTargetP+=0.020;if(stylePlan.style==='CHIP')onTargetP-=0.015;
  // TT-0.47: a genuine breakaway should primarily resolve as goal vs goalkeeper save, not as
  // a coin-flip between goal and a shot five metres wide. Keep a real execution miss tail and
  // preserve finishing/pressure/distance influence; do not guarantee the result.
  if(assess.oneVOne){
    const floor=clamp(0.755+(finishing-60)*0.0025-Math.max(0,assess.dGoal-9)*0.007-(assess.pressure<1.20?0.030:0),0.70,0.82);
    onTargetP=Math.max(onTargetP,floor);
  }else if(assess.clearKeeperChance){
    const floor=clamp(0.748+(finishing-60)*0.0023-Math.max(0,assess.dGoal-14)*0.010-(assess.pressure<1.30?0.030:0),0.69,0.82);
    onTargetP=Math.max(onTargetP,floor);
  }
  if(orientation.turningRequired){let orientFactor=clamp(0.54+(Number(orientation.facingAlignment)||0)*0.24,0.54,0.76);if(orientation.backToGoal&&assess.dGoal>20)orientFactor*=0.78;onTargetP*=orientFactor;}
  // An empty goal is still missable, but it must fail because of execution quality rather
  // than the normal goalkeeper-present ceiling. Keep a real miss tail for poor finishing/balance.
  if(keeperBeaten)onTargetP=Math.max(onTargetP,clamp(0.90+(finishing-60)*0.0025-Math.max(0,assess.dGoal-16)*0.008-(assess.pressure<1.1?0.10:0),0.76,0.97));
  const highQualityKeeperChance=assess.oneVOne||assess.clearKeeperChance;
  const onTarget=m.r()<clamp(onTargetP,0.16,keeperBeaten?0.93:(highQualityKeeperChance?0.91:0.56));let aimY;
  if(onTarget){
    const base=assess.bestAimY??34;
    if(stylePlan.style==='CURLED')aimY=clamp(base+Math.sign(34-owner.y)*(1.35+m.r()*0.65),30.65,37.35);
    else if(stylePlan.style==='PLACED'||stylePlan.style==='CHIP')aimY=clamp(base+(m.r()-0.5)*1.05,30.65,37.35);
    else aimY=clamp(base+(m.r()-0.5)*1.9,30.65,37.35);
  }else{const missMargin=highQualityKeeperChance?(0.38+m.r()*1.85):(1.2+m.r()*5.0);aimY=m.r()<0.5?FIELD.GOAL_Y1-missMargin:FIELD.GOAL_Y2+missMargin;}
  const d=Math.hypot(gx-owner.x,aimY-owner.y),speed=stylePlan.speed||clamp(24+d*0.17,24,30);
  // Curve sign is defined in world-space relative to the actual shot direction. Using only
  // owner.y made away-team curls bend the wrong way because their attacking x direction flips.
  // Inside-foot curl: start slightly outside the final lane, then bend back toward it.
  // V0.8 used the opposite sign, which visually read as an outside-of-the-foot bend.
  const curveSign=-(Math.sign((gx-owner.x)*(aimY-owner.y))||1),curve=stylePlan.style==='CURLED'?stylePlan.curve*curveSign:0;
  m.stats.shots++;m.stats.shotsByTeam[team]=(m.stats.shotsByTeam[team]||0)+1;m.stats.shotReasons[reason]=(m.stats.shotReasons[reason]||0)+1;m.stats.shotStyles[stylePlan.style]=(m.stats.shotStyles[stylePlan.style]||0)+1;m.lastShotAt[team]=m.time;if(assess.oneVOne)m.stats.strictOneVOneShots=(m.stats.strictOneVOneShots||0)+1;if(assess.cleanOneVOne)m.stats.cleanOneVOneShots=(m.stats.cleanOneVOneShots||0)+1;if(assess.clearKeeperChance)m.stats.cleanKeeperChanceShots=(m.stats.cleanKeeperChanceShots||0)+1;if(owner.role==='CM'){m.stats.midfieldShots=(m.stats.midfieldShots||0)+1;if(assess.inBox)m.stats.midfieldBoxShots=(m.stats.midfieldBoxShots||0)+1;else m.stats.midfieldLongShots=(m.stats.midfieldLongShots||0)+1;}if(assess.inBox)m.stats.boxShots++;
  if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.onShot==='function')TELEMETRY.onShot(m,{team,ownerId:owner.id,role:owner.role,inBox:assess.inBox,dGoal:Number(assess.dGoal.toFixed(2)),reason,style:stylePlan.style});
  // Aim at the ACTUAL goal line. The old 1.8m behind-goal target made diagonal shots
  // cross the goal line at a different y-coordinate than the selected lane.
  const tp={x:gx,y:aimY};setBallFlight(m,{source:owner,target:null,kind:'SHOT',speed,loft:stylePlan.loft??0.20,targetPoint:tp,curve,style:stylePlan.style});m.ball.shotTargetY=aimY;m.ball.shotTeam=team;m.ball.onTarget=onTarget;m.ball.keeperBeatenAtStrike=keeperBeaten;m.ball.shotOneVOne=!!assess.oneVOne;m.ball.shotClearKeeperChance=!!assess.clearKeeperChance;m.ball.shotDistance=assess.dGoal;owner.nextThink=m.time+0.45;
  // A shooter cannot know the result at ball contact. Keep a short follow-through facing the
  // shot path before tactical repositioning is allowed to rotate the body away.
  owner.postShotHoldUntil=m.time+0.62;owner.faceTargetAngle=Math.atan2(aimY-owner.y,gx-owner.x);owner.action='POST_SHOT_FOLLOW';owner.tacticalTask='POST_SHOT_FOLLOW';owner.sprint=false;owner.tx=owner.x;owner.ty=owner.y;
  const label=stylePlan.style==='TURNING'?'터닝 슛':stylePlan.style==='CURLED'?'감아차기':stylePlan.style==='CHIP'?'칩슛':stylePlan.style==='PLACED'?'정교한 슈팅':reason==='MIDFIELD_LONG_SHOT'?'중거리슛':'슈팅';event(m,'SHOT',`${subjectName(owner.name)} ${label}을 시도합니다.`,{actorId:owner.id,team:owner.team,turningShot:stylePlan.style==='TURNING',contactGapAtStrike:Number(strikeContactGap.toFixed(3)),contactAuthority:incomingOneTouch?'INCOMING_ONE_TOUCH':'CONTROLLED_CONTACT'});
}

function updatePendingShots(m){
  for(const p of m.players){
    const ps=p.pendingShot;if(!ps)continue;
    if(m.ball.mode!=='CONTROLLED'||m.ball.ownerId!==p.id){p.pendingShot=null;p.lockTargetUntil=0;if(m.userChoiceControl?.playerId===p.id&&m.userChoiceControl?.mode==='SHOT_PREP')m.userChoiceControl=null;continue;}
    if(m.time+1e-6<ps.releaseAt)continue;if(!materialControlReady(m,p)){ps.releaseAt=m.time+0.06;p.lockTargetUntil=Math.max(p.lockTargetUntil||0,ps.releaseAt);m.stats.materialActionContactDeferrals=(m.stats.materialActionContactDeferrals||0)+1;continue;}
    p.pendingShot=null;p.lockTargetUntil=0;if(m.userChoiceControl?.playerId===p.id&&m.userChoiceControl?.mode==='SHOT_PREP')m.userChoiceControl=null;
    executeShot(m,p,ps.reason||'GENERAL',{releaseNow:true,decisionOrientation:ps.decisionOrientation||null});
  }
}

function executeCarry(m,owner,opts={}){
  m.frontPassChain[owner.team]=0;
  if((m.attackRecycleUntil?.[owner.team]||0)>m.time){m.stats.recycleReattacks=(m.stats.recycleReattacks||0)+1;m.attackRecycleUntil[owner.team]=0;}
  const l=worldToLocal(owner.team,owner.x,owner.y),pressure=ballCarrierPressureDistance(m,owner),space=forwardSpace(m,owner,13),laneBias=(34-l.y)*0.055,inBox=inOppPenaltyArea(owner.team,owner.x,owner.y);
  const recentShieldScan=m.time-Number(owner.lastShieldScanAt||-99)<1.20;
  if(!opts.userCommitted&&!recentShieldScan&&!inBox&&l.x>=70&&l.x<88&&['ST','WF','CM'].includes(owner.role)&&pressure<3.0){owner.lastShieldScanAt=m.time;owner.action=owner.tacticalTask='SHIELD_SCAN';owner.sprint=false;owner.lockTargetUntil=0;owner.nextThink=m.time+0.48;owner.lastDecision='HOLD';return;}
  const base=owner.role==='WF'?4.8:owner.role==='ST'?4.3:owner.role==='CM'?3.8:owner.role==='FB'?3.5:2.8,stride=clamp(Math.min(base+space*0.19,space-0.45),1.2,7.2);
  let tx,ty;
  if(inBox){
    // STEP38 V0.5 approved box-carry flow: a box carry is a short committed action,
    // not a sequence of tiny stop -> rethink -> stop steps.  Keep the current shoulder
    // for the commitment window and use a target far enough away that normal braking
    // does not bring the carrier to a full stop before the next meaningful decision.
    const previousCommit=(owner.boxCarryCommittedUntil||0)>m.time&&owner.boxCarrySide;
    let side=previousCommit?owner.boxCarrySide:Math.sign((owner.vy||0)*(owner.team===HOME?1:-1));
    if(!side)side=Math.sign(34-l.y);if(!side)side=(m.r()<0.5?-1:1);
    owner.boxCarrySide=side;
    const central=(34-l.y),centralPull=clamp(central*0.10,-0.70,0.70);
    // Keep V0.4's forward ambition.  The fix is continuity, not a stronger dribble.
    // Around 90.5~92m the old target could be only ~0.5m away, causing the carrier
    // to brake to zero while the action lock was still active.  Add a modest same-
    // shoulder lateral component instead of pushing several metres closer to goal.
    const angleTouch=!!owner.openShotAngleCarry;owner.openShotAngleCarry=false;
    const lateral=side*(angleTouch?0.82:(pressure<2.2?1.48:1.12))+centralPull;
    const forward=angleTouch?0.18:(l.x<90.5?Math.min(2.10,stride):l.x>92.0?-0.45:0.65);
    tx=clamp(l.x+forward,87.5,94.0);ty=clamp(l.y+lateral,15,53);
  }else{
    const trueWide=['WF','FB'].includes(owner.role)&&Math.min(l.y,68-l.y)<=15.5&&l.x>=80;
    if(trueWide){
      // A winger/full-back outside the penalty-area width must still be able to attack the
      // by-line. The old 91.5m cap made classic flank dribbles physically impossible.
      const evade=(m.r()-0.5)*(pressure<4?0.9:0.45);tx=clamp(l.x+stride,4,98.8);ty=clamp(l.y+evade,3.5,64.5);
    }else{
      const evade=pressure<4?(m.r()-0.5)*2.4:(m.r()-0.5)*1.0;tx=clamp(l.x+stride,4,91.5);ty=clamp(l.y+laneBias+evade,4,64);
    }
  }
  const w=localToWorld(owner.team,tx,ty);
  owner.tx=w.x;owner.ty=w.y;owner.action=inBox?'COMMITTED_BOX_CARRY':(pressure<2.4?'DRIBBLE_EVADE':'CARRY_FORWARD');owner.tacticalTask=owner.action;owner.sprint=!inBox&&space>7&&l.x<82;const pressured=pressure<1.45;
  if(inBox){
    const prevBoxCarry=owner.lastBoxCarryAt||-99;owner.boxCarryChain=m.time-prevBoxCarry<3.0?Math.min(4,(owner.boxCarryChain||0)+1):1;owner.lastBoxCarryAt=m.time;m.stats.maxBoxCarryChain=Math.max(m.stats.maxBoxCarryChain||0,owner.boxCarryChain);
    const duration=pressured?0.68:0.98;owner.boxCarryStartedAt=m.time;owner.boxCarryCommittedUntil=m.time+duration;owner.lockTargetUntil=owner.boxCarryCommittedUntil;owner.nextThink=owner.lockTargetUntil;m.stats.boxCommittedCarries=(m.stats.boxCommittedCarries||0)+1;
  }else{if(m.time-(owner.lastBoxCarryAt||-99)>=3.0)owner.boxCarryChain=0;
    owner.lockTargetUntil=m.time+(pressured?0.62:1.32)+(owner.sprint?0.42:0.20);owner.nextThink=Math.max(owner.lockTargetUntil,m.time+0.72+m.r()*0.18);
  }
  owner.lastDecision='CARRY';m.stats.carries++;
}
function extendCommittedBoxCarry(m,owner){
  if(owner.action!=='COMMITTED_BOX_CARRY'||(owner.boxCarryCommittedUntil||0)<=m.time)return false;
  const remain=dist(owner,{x:owner.tx,y:owner.ty});if(remain>0.56||owner.boxCarryCommittedUntil-m.time<0.18)return false;
  const l=worldToLocal(owner.team,owner.x,owner.y),tl=worldToLocal(owner.team,owner.tx,owner.ty),side=owner.boxCarrySide||1;
  let dx=tl.x-l.x,dy=tl.y-l.y,n=Math.hypot(dx,dy);if(n<0.12){dx=1.0;dy=side*0.42;n=Math.hypot(dx,dy);}
  const ext=Math.min(0.90,Math.max(0.48,(owner.boxCarryCommittedUntil-m.time)*1.45));
  const nx=clamp(l.x+dx/n*ext,87.5,94.2),ny=clamp(l.y+dy/n*ext,15,53),w=localToWorld(owner.team,nx,ny);
  owner.tx=w.x;owner.ty=w.y;m.stats.boxCarryExtensions=(m.stats.boxCarryExtensions||0)+1;return true;
}
function executeTakeOn(m,owner,opp){
  const defender=playerById(m,opp?.defenderId);if(!defender){executeCarry(m,owner);return;}
  const l=worldToLocal(owner.team,owner.x,owner.y),insideSign=l.y<34?1:-1,wide=Math.min(l.y,68-l.y)<19;
  const feint=(m.r()<0.68?insideSign:-insideSign)*(wide?1.65:1.25),advance=clamp(5.8+(opp.spaceBehind||4)*0.24,5.8,8.2),w=localToWorld(owner.team,clamp(l.x+advance,4,97.2),clamp(l.y+feint,3.5,64.5));
  owner.tx=w.x;owner.ty=w.y;owner.action='TAKE_ON';owner.tacticalTask='TAKE_ON';owner.sprint=true;owner.lastTakeOnAt=m.time;owner.lockTargetUntil=m.time+1.25;owner.nextThink=owner.lockTargetUntil;owner.takeOnState={defenderId:defender.id,resolveAt:m.time+clamp((opp.defenderDistance||2.5)/5.0,0.30,0.62),startedAt:m.time,startX:owner.x,startY:owner.y,attackerSkill:opp.attackerSkill||60,defenderSkill:opp.defenderSkill||60,spaceBehind:opp.spaceBehind||4,wide};m.stats.takeOnAttempts=(m.stats.takeOnAttempts||0)+1;m.stats.takeOnAttemptsByRole[owner.role]=(m.stats.takeOnAttemptsByRole[owner.role]||0)+1;m.stats.carries++;event(m,'TAKE_ON',`${subjectName(owner.name)} ${defender.name}을 상대로 돌파를 시도합니다.`);
}
function updateTakeOnDuels(m){
  if(m.ball.mode!=='CONTROLLED')return;const owner=playerById(m,m.ball.ownerId);if(!owner?.takeOnState||m.time<owner.takeOnState.resolveAt)return;const st=owner.takeOnState,defender=playerById(m,st.defenderId);owner.takeOnState=null;
  if(!defender||defender.team===owner.team)return;
  const result=TAKEON.resolve({attackerSkill:st.attackerSkill,defenderSkill:st.defenderSkill,distance:dist(owner,defender),spaceBehind:st.spaceBehind,wide:st.wide,roll:m.r()});
  if(result.outcome==='BEAT_DEFENDER'){
    m.stats.takeOnWins=(m.stats.takeOnWins||0)+1;owner.lastTakeOnWinAt=m.time;owner.takeOnAttackIntentUntil=m.time+1.65;
    defender.beatenRecoveryTargetId=owner.id;defender.beatenRecoveryUntil=m.time+1.85;defender.pressRecoverUntil=Math.max(defender.pressRecoverUntil||0,m.time+0.58);m.stats.takeOnRecoveryChases=(m.stats.takeOnRecoveryChases||0)+1;m.nextShape=Math.min(m.nextShape||m.time,m.time);
    setPairCooldown(m,defender,owner,1.0);const l=worldToLocal(owner.team,owner.x,owner.y),tl=worldToLocal(owner.team,owner.tx,owner.ty),extra=clamp(3.2+(st.spaceBehind||4)*0.20,3.4,5.2),dx=tl.x-l.x,dy=tl.y-l.y,n=Math.hypot(dx,dy)||1,w=localToWorld(owner.team,clamp(l.x+dx/n*extra,4,98),clamp(l.y+dy/n*extra,3.5,64.5));owner.tx=w.x;owner.ty=w.y;owner.lockTargetUntil=Math.max(owner.lockTargetUntil,m.time+0.72);owner.nextThink=owner.lockTargetUntil;event(m,'DRIBBLE_BEAT',`${subjectName(owner.name)} ${defender.name}을 제치고 전진합니다.`);return;
  }
  owner.lockTargetUntil=0;owner.nextThink=m.time+0.25;
  if(result.outcome==='TACKLED'){
    m.stats.takeOnTackled=(m.stats.takeOnTackled||0)+1;m.stats.turnovers++;m.stats.tacklesWon++;defender.pressRecoverUntil=m.time+0.75;setControlled(m,defender,false);defender.nextThink=m.time+0.45;m.transitionUntil=m.time+1.8;event(m,'TAKE_ON_TACKLED',`${subjectName(defender.name)} ${owner.name}의 돌파를 막고 공을 빼앗았습니다.`);return;
  }
  m.stats.takeOnLoose=(m.stats.takeOnLoose||0)+1;m.stats.looseBalls++;const n=norm(dir(owner.team)*1.0,(m.r()-0.5)*0.9);setLoose(m,m.ball.x,m.ball.y,n.x*(3.5+m.r()*2.5),n.y*(3.5+m.r()*2.5),owner.team,owner.id);event(m,'TAKE_ON_LOOSE',`${owner.name}의 돌파 과정에서 공이 흘렀습니다.`);
}

function executeGKClear(m,owner){
  const targets=teamPlayers(m,owner.team).filter(p=>p.role!=='GK').sort((a,b)=>dir(owner.team)*(b.x-a.x)-dir(owner.team)*(a.x-b.x));
  const target=targets.find(p=>p.role==='ST')||targets[0];if(!target)return;
  executePass(m,owner,target,'LONG_PASS',null);owner.lastDecision='GK_CLEAR';
}
function ownerThink(m,owner){
  if(m.ball.mode!=='CONTROLLED'||m.ball.ownerId!==owner.id)return;
  // A controller-owned protagonist action is already the user's explicit current-state input.
  // Maintain that physical action BEFORE the generic interactive-ownership lock below.  R15
  // returned too early here, so a chosen CARRY could reach its initial ~1m target and then
  // freeze while the controller still owned another ~2s of carry time.  This maintenance may
  // extend only the already-selected carry trajectory; it never chooses a new action/result.
  const userControl=m.userChoiceControl;
  if(userControl&&userControl.playerId===owner.id&&userControl.controllerOwned){
    if(userControl.mode==='CARRY'&&m.time<Number(userControl.until||0)-0.05){
      const remain=dist(owner,{x:owner.tx,y:owner.ty});
      if(remain<0.72){const l=worldToLocal(owner.team,owner.x,owner.y),tl=worldToLocal(owner.team,owner.tx,owner.ty),dx=tl.x-l.x,dy=tl.y-l.y,n=Math.hypot(dx,dy),ux=n>0.18?dx/n:1,uy=n>0.18?dy/n:0,step=clamp((Number(userControl.until)-m.time)*2.25,1.15,3.2),w=localToWorld(owner.team,clamp(l.x+ux*step,4,96.2),clamp(l.y+uy*step,4,64));owner.tx=w.x;owner.ty=w.y;owner.action=inOppPenaltyArea(owner.team,owner.x,owner.y)?'COMMITTED_BOX_CARRY':'CARRY_FORWARD';owner.tacticalTask=owner.action;owner.sprint=!inOppPenaltyArea(owner.team,owner.x,owner.y)&&step>2.4;m.stats.userCarryIntentExtensions=(m.stats.userCarryIntentExtensions||0)+1;}
    }
    return;
  }
  // STEP76 canonical interactive-ownership lock: once a user-play episode has opened a
  // protagonist choice, owner AI may NEVER choose a pass/shot/carry for that protagonist.
  // Physics, movement, pressure and challenges keep running; the controller must reopen the
  // next real choice state. FULL_SKIP / pre-choice simulation remains unaffected because this
  // lock is only armed by the protagonist controller when an interactive checkpoint exists.
  if(m.protagonistInteractiveEpisode?.active&&m.protagonistInteractiveEpisode.playerId===owner.id)return;
  // TT-0.51 meaningful-choice defer: suppressing a one-option checkpoint reserves the ball
  // carrier for the user without selecting that sole action. Pressure/challenges and team
  // movement continue; owner AI stays out until a meaningful choice emerges or possession ends.
  if(m.protagonistDeferredChoice?.playerId===owner.id)return;
  // TT-0.47 permanent authority floor: in a playable high-resolution window the protagonist
  // never receives owner-AI action authority at all. A user choice is applied directly through
  // applyChoiceCandidate/applyResolvedOwnerAction, so blocking ownerThink here cannot replace or
  // precompute the chosen action. It only prevents an unchosen SHOT/PASS/TAKE_ON/CARRY/HOLD
  // between the Hybrid hand-off and the next explicit checkpoint.
  if(m.protagonistExplicitActionRequired===true&&m.protagonistControllerId===owner.id)return;
  // STEP40 V0.4: a protagonist choice owns the NEXT decision until the controller
  // finishes that choice window. Movement/duels/challenges still run in the normal
  // engine, but owner AI may not silently replace CARRY/HOLD/TAKE_ON with a pass/shot.
  if(userControl&&userControl.playerId===owner.id){
    if(m.time<=Number(userControl.until||0)+0.001)return;
    m.userChoiceControl=null;owner.nextThink=Math.max(owner.nextThink||0,m.time);return;
  }
  // A committed carry/evasion/turn has a short execution window. Pressure may accelerate the NEXT decision,
  // but must not redraw the movement target every simulation tick while the action is still being executed.
  if((owner.lockTargetUntil||0)>m.time&&['DRIBBLE_EVADE','CARRY_FORWARD','COMMITTED_BOX_CARRY','TAKE_ON','TURN_BACK','DUEL_ESCAPE','FIRST_TOUCH_FLOW','TURNING_SHOT_PREP'].includes(owner.action)){
    // A clean shooting picture after a successful through break can exist for only a fraction
    // of the generic carry-interrupt cadence. Inspect this narrow, current-state condition on
    // every controlled frame so the previous animation lock cannot hide that new decision.
    // This only releases the lock; chooseOwnerAction still decides whether to shoot or carry.
    if(['DRIBBLE_EVADE','CARRY_FORWARD','COMMITTED_BOX_CARRY'].includes(owner.action)){
      const throughAge=m.time-(owner.lastReceivedPassAt||-99);
      if(owner.lastReceivedFlightKind==='THROUGH'&&throughAge>=0.55&&throughAge<=2.75&&m.time-(owner.lastThroughBreakDecisionReopenAt||-99)>=0.34){
        const tsi=shotAssessment(m,owner),tsl=worldToLocal(owner.team,owner.x,owner.y);
        const throughDecisionOpen=tsi.inBox&&tsi.blockers.length===0&&tsi.dGoal<=22.5&&Number(tsi.facingAlignment??0)>=0.55&&Math.abs(tsl.y-34)<=18.5&&['ST','WF','CM'].includes(owner.role);
        if(throughDecisionOpen){owner.lockTargetUntil=0;owner.boxCarryCommittedUntil=0;owner.nextThink=m.time;owner.lastThroughBreakDecisionReopenAt=m.time;m.stats.throughBreakDecisionReopens=(m.stats.throughBreakDecisionReopens||0)+1;}
      }
    }
    if(['DRIBBLE_EVADE','CARRY_FORWARD','COMMITTED_BOX_CARRY','TAKE_ON','FIRST_TOUCH_FLOW'].includes(owner.action)&&m.time-(owner.lastCarryInterruptCheck||-99)>=(owner.action==='TAKE_ON'?0.14:0.22)){
      owner.lastCarryInterruptCheck=m.time;
      // Do not shoot *during* an unresolved take-on duel. Once the defender has actually been
      // beaten, immediately reopen the real shot state so a genuine GK 1v1 is not delayed by
      // the remainder of the dribble animation/target lock.
      if(owner.action!=='TAKE_ON'||!owner.takeOnState){
        const si=shotAssessment(m,owner),takeOnBreak=(owner.takeOnAttackIntentUntil||0)>m.time,slOpen=worldToLocal(owner.team,owner.x,owner.y);
        const carryCriticalOpen=si.inBox&&si.openWindow&&si.blockers.length===0&&si.dGoal<=18.5&&Math.abs(slOpen.y-34)<=11.5&&['ST','WF','CM'].includes(owner.role);
        if(carryCriticalOpen){
          if(owner.openFinishingControlSince!==owner.controlledSince||!Number.isFinite(owner.openFinishingWindowSince)){owner.openFinishingControlSince=owner.controlledSince;owner.openFinishingWindowSince=m.time;}
        }else{owner.openFinishingWindowSince=null;owner.openFinishingControlSince=null;}
        const openCarryAge=carryCriticalOpen&&Number.isFinite(owner.openFinishingWindowSince)?m.time-owner.openFinishingWindowSince:0;
        const reopenDeadline=owner.role==='ST'?0.54:(owner.role==='WF'?0.64:0.72);
        // A good lane that appears WHILE an ordinary carry is still locked is a new football
        // state. Reopen the decision before the animation/target lock can drag the attacker
        // through several seconds of an already-finished chance. Unresolved TAKE_ON remains protected.
        if(carryCriticalOpen&&openCarryAge>=reopenDeadline&&owner.action!=='TAKE_ON'){owner.lockTargetUntil=0;owner.boxCarryCommittedUntil=0;owner.nextThink=m.time;m.stats.openFinishDecisionReopens=(m.stats.openFinishDecisionReopens||0)+1;}
        const takeOnFinish=takeOnBreak&&si.inBox&&si.blockers.length===0&&si.dGoal<=15.5&&(si.oneVOne||si.openWindow||Math.abs(slOpen.y-34)<=10.5),firstTouchFlow=owner.action==='FIRST_TOUCH_FLOW';
        const instantOpenFinish=!firstTouchFlow&&si.openWindow&&si.dGoal<=13.2&&si.blockers.length===0&&m.r()<(takeOnBreak?0.72:0.28);
        if(si.inBox&&((si.oneVOne)||(takeOnFinish&&m.r()<(si.dGoal<=11.5?0.98:0.82))||(si.dGoal<=9.5&&si.blockers.length===0)||instantOpenFinish)){owner.lockTargetUntil=0;owner.boxCarryCommittedUntil=0;if(takeOnBreak)m.stats.takeOnBreakawayShots=(m.stats.takeOnBreakawayShots||0)+1;applyResolvedOwnerAction(m,owner,{type:'SHOT',reason:takeOnBreak?(si.oneVOne?'TAKE_ON_ONE_V_ONE':'TAKE_ON_SHOT_WINDOW'):(si.oneVOne?'ONE_V_ONE':'CARRY_SHOT_WINDOW')});return;}
      }
      if(owner.action==='COMMITTED_BOX_CARRY'){
        const age=m.time-(owner.boxCarryStartedAt||m.time),pressure=ballCarrierPressureDistance(m,owner),sl=worldToLocal(owner.team,owner.x,owner.y),carryShot=shotAssessment(m,owner);
        const carryFinishOpen=carryShot.inBox&&carryShot.openWindow&&carryShot.blockers.length===0&&carryShot.dGoal<=18.5&&Math.abs(sl.y-34)<=11.5&&['ST','WF','CM'].includes(owner.role);
        if(carryFinishOpen){
          if(owner.openFinishingControlSince!==owner.controlledSince||!Number.isFinite(owner.openFinishingWindowSince)){owner.openFinishingControlSince=owner.controlledSince;owner.openFinishingWindowSince=m.time;}
        }else{owner.openFinishingWindowSince=null;owner.openFinishingControlSince=null;}
        const persistentOpenAge=carryFinishOpen&&Number.isFinite(owner.openFinishingWindowSince)?m.time-owner.openFinishingWindowSince:0;
        const shotReady=age>=0.48&&carryFinishOpen;
        // A genuinely new pressure state OR a sustained newly-open finishing lane ends the
        // committed carry early. The persistent timer survives subsequent carry choices.
        if(shotReady||persistentOpenAge>=0.58||age>=0.48&&pressure<1.18){owner.lockTargetUntil=0;owner.boxCarryCommittedUntil=0;owner.nextThink=m.time;if(pressure<1.18)m.stats.boxCarryPressureReleases=(m.stats.boxCarryPressureReleases||0)+1;if(persistentOpenAge>=0.58)m.stats.openFinishCarryReleases=(m.stats.openFinishCarryReleases||0)+1;}
        else extendCommittedBoxCarry(m,owner);
      }
    }
    if((owner.lockTargetUntil||0)>m.time)return;
  }
  const pressure=ballCarrierPressureDistance(m,owner),held=Math.max(0,m.time-(owner.controlledSince||m.time));
  if(owner.role==='GK'&&held>0.75)owner.nextThink=Math.min(owner.nextThink,m.time);
  else if(pressure<1.65&&held>0.22)owner.nextThink=Math.min(owner.nextThink,m.time);
  if(m.time<owner.nextThink)return;
  const action=chooseOwnerAction(m,owner);
  if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.onDecision==='function'&&(!m.telemetry.focusPlayerId||owner.id===m.telemetry.focusPlayerId)){
    const local=worldToLocal(owner.team,owner.x,owner.y),shot=shotAssessment(m,owner),space=forwardSpace(m,owner,13),passCount=passOptions(m,owner).length;
    TELEMETRY.onDecision(m,{playerId:owner.id,name:owner.name,team:owner.team,role:owner.role,slot:owner.slot,phase:phaseName(m),localX:Number(local.x.toFixed(2)),localY:Number(local.y.toFixed(2)),pressure:Number(pressure.toFixed(2)),held:Number(held.toFixed(2)),space:Number(space.toFixed(2)),passCount,deliveryAvailable:local.x>=80&&(local.y<18.5||local.y>49.5),shot:{dGoal:Number(shot.dGoal.toFixed(2)),inBox:shot.inBox,oneVOne:shot.oneVOne,openWindow:shot.openWindow,blockers:shot.blockers.length},action:action.type,reason:action.reason||null});
  }
  applyResolvedOwnerAction(m,owner,action);
}


function activePresserNearOwner(m,owner,radius=2.2){
  if(!owner)return null;
  const cands=outfield(m,other(owner.team)).map(p=>({p,d:dist(p,owner)}))
    .filter(o=>o.d<=radius)
    .sort((a,b)=>a.d-b.d);
  return cands[0]||null;
}
function setPairCooldown(m,defender,owner,duration=1.8){
  defender.pressCommitUntil=0;
  defender.duelPairCooldownOwnerId=owner.id;
  defender.duelPairCooldownUntil=m.time+duration;
  defender.duelContainUntil=Math.max(defender.duelContainUntil||0,defender.duelPairCooldownUntil);
}
function executeDuelEscape(m,owner,defender){
  const ol=worldToLocal(owner.team,owner.x,owner.y),dl=worldToLocal(owner.team,defender.x,defender.y);
  let side=Math.sign(ol.y-dl.y);
  if(side===0)side=(hash32(owner.id+'|'+defender.id)&1)?1:-1;
  const forward=ol.x<90?2.8:ol.x<94?1.4:-1.1;
  let tx=clamp(ol.x+forward,4,94.0),ty=clamp(ol.y+side*4.2,4,64);
  const opps=outfield(m,other(owner.team));
  const crowdAt=(yy)=>opps.filter(p=>{const q=worldToLocal(owner.team,p.x,p.y);return Math.hypot(q.x-tx,q.y-yy)<3.0;}).length;
  const alt=clamp(ol.y-side*4.2,4,64);
  if(crowdAt(alt)<crowdAt(ty))ty=alt;
  const w=localToWorld(owner.team,tx,ty);
  owner.tx=w.x;owner.ty=w.y;owner.action='DUEL_ESCAPE';owner.tacticalTask='DUEL_ESCAPE';owner.sprint=false;
  owner.lockTargetUntil=m.time+0.95;
  owner.nextThink=owner.lockTargetUntil;
  owner.lastDecision='DUEL_ESCAPE';
  m.stats.carries++;
}
function forceResolveDuel(m,owner,defender){
  if(!owner||!defender||m.ball.mode!=='CONTROLLED'||m.ball.ownerId!==owner.id)return;
  // TT-0.47 authority closure: prolonged-duel fallback is an AI resolver just like ownerThink.
  // In a playable protagonist window it may not turn the hero's live possession into an
  // automatic shot/pass/carry. Leave the duel state alive so the protagonist controller can
  // expose the next explicit choice instead.
  if(m.protagonistExplicitActionRequired===true&&m.protagonistControllerId===owner.id)return;
  setPairCooldown(m,defender,owner,1.9);
  // After one defender has completed a prolonged box duel, make that defender recover shape briefly.
  // This creates a real hand-off instead of the same marker shadowing the carrier forever.
  if(inOppPenaltyArea(owner.team,owner.x,owner.y))defender.pressRecoverUntil=Math.max(defender.pressRecoverUntil||0,m.time+0.95);
  const shot=shotAssessment(m,owner);
  if(shot.inBox&&(shot.oneVOne||(shot.dGoal<=11.5&&shot.blockers.length===0&&shot.pressure>0.9))){
    applyResolvedOwnerAction(m,owner,{type:'SHOT',reason:shot.oneVOne?'DUEL_ONE_V_ONE':'DUEL_SHOT_WINDOW'});
    m.stats.duelForcedResolves++;
    return;
  }
  const opts=passOptions(m,owner);
  const outlet=opts.find(o=>o.block===0&&o.open>1.35&&(o.forward>-5||worldToLocal(owner.team,o.p.x,o.p.y).x>74));
  if(outlet){
    executePass(m,owner,outlet.p,outlet.running&&outlet.leadForward>8?'THROUGH':(outlet.d>31?'LONG_PASS':'PASS'),outlet);
    m.stats.duelForcedResolves++;
    return;
  }
  const space=forwardSpace(m,owner,10);
  if(space>1.4){
    executeDuelEscape(m,owner,defender);
    m.stats.duelForcedResolves++;
    return;
  }
  const n=norm(owner.x-defender.x,owner.y-defender.y);
  setLoose(m,m.ball.x,m.ball.y,n.x*(2.2+m.r()*1.8)+(m.r()-0.5)*1.2,n.y*(2.2+m.r()*1.8)+(m.r()-0.5)*1.2,owner.team,owner.id);
  m.stats.looseBalls++;m.stats.duelForcedResolves++;
  event(m,'DUEL_BREAK',`${owner.name}과 ${defender.name}의 경합에서 공이 흘렀습니다.`);
}
function updateDuelEpisode(m){
  if(m.ball.mode!=='CONTROLLED'){m.activeDuel=null;return;}
  const owner=playerById(m,m.ball.ownerId);if(!owner){m.activeDuel=null;return;}
  const near=activePresserNearOwner(m,owner,2.2);
  if(!near){m.activeDuel=null;return;}
  const defender=near.p;
  if((defender.duelPairCooldownUntil||0)>m.time&&defender.duelPairCooldownOwnerId===owner.id){m.activeDuel=null;return;}
  let ep=m.activeDuel;
  if(!ep||ep.ownerId!==owner.id||ep.defenderId!==defender.id){
    ep=m.activeDuel={ownerId:owner.id,defenderId:defender.id,totalStartedAt:m.time,stationaryStartedAt:m.time,boxStartedAt:null,startX:owner.x,startY:owner.y};
    m.stats.duelEpisodes++;
    return;
  }
  let stationaryDur=m.time-ep.stationaryStartedAt,net=Math.hypot(owner.x-ep.startX,owner.y-ep.startY);
  const totalDur=m.time-ep.totalStartedAt;
  m.stats.maxDuelDuration=Math.max(m.stats.maxDuelDuration,totalDur);
  m.stats.maxPairedDuel=Math.max(m.stats.maxPairedDuel||0,totalDur);
  const currentlyInBox=inOppPenaltyArea(owner.team,owner.x,owner.y);
  if(currentlyInBox&&ep.boxStartedAt==null)ep.boxStartedAt=m.time;
  if(!currentlyInBox)ep.boxStartedAt=null;
  const boxPairDur=currentlyInBox&&ep.boxStartedAt!=null?m.time-ep.boxStartedAt:0;
  if(currentlyInBox)m.stats.maxBoxPairedDuel=Math.max(m.stats.maxBoxPairedDuel||0,boxPairDur);
  // Moving together is not a new duel. Reset only the stationary sub-window, never the total pair timer.
  // This catches the visual failure where an attacker and one marker run through the box glued together.
  if(net>=2.6){ep.stationaryStartedAt=m.time;ep.startX=owner.x;ep.startY=owner.y;stationaryDur=0;net=0;}
  m.stats.maxStationaryDuel=Math.max(m.stats.maxStationaryDuel,stationaryDur);
  const local=worldToLocal(owner.team,owner.x,owner.y),inBox=inOppPenaltyArea(owner.team,owner.x,owner.y);
  const stationaryLimit=inBox?1.85:(local.x>75?2.80:4.00);
  const pairedLimit=inBox?2.20:(local.x>80?3.25:5.50);
  if(stationaryDur>=stationaryLimit||totalDur>=pairedLimit){
    forceResolveDuel(m,owner,defender);
    m.activeDuel=null;
  }
}


function tryChallenges(m,dt){
  if(m.ball.mode!=='CONTROLLED'||m.time-m.lastChallengeAt<2.20)return;const owner=playerById(m,m.ball.ownerId);if(!owner||owner.role==='GK'&&inPenaltyArea(owner.team,owner.x,owner.y)||owner.takeOnState)return;
  const opps=outfield(m,other(owner.team)).map(p=>({p,d:dist(p,owner)})).filter(x=>x.d<1.18&&(x.p.nextChallengeAt||0)<=m.time&&['ENGAGE','CLOSE_DOWN','CHASE_LOOSE'].includes(x.p.tacticalTask||x.p.action)&&!(m.protagonistDeferredChoice?.playerId===x.p.id)).sort((a,b)=>a.d-b.d);if(!opps.length)return;
  const ch=opps[0].p;m.stats.challenges++;m.lastChallengeAt=m.time;const dangerBox=inOppPenaltyArea(owner.team,owner.x,owner.y);ch.nextChallengeAt=m.time+(dangerBox?2.1:3.2)+m.r()*2.0;ch.duelContainUntil=ch.nextChallengeAt;const rel=Math.hypot(ch.vx-owner.vx,ch.vy-owner.vy),ownerMoving=Math.hypot(owner.vx,owner.vy),chance=clamp(0.09+(1.18-opps[0].d)*0.16+rel*0.004+(ownerMoving<1.5?0.02:0)+(dangerBox?0.08:0),0.08,dangerBox?0.30:0.22);
  if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.onDefensiveDecision==='function'&&(!m.telemetry.focusPlayerId||ch.id===m.telemetry.focusPlayerId)){
    const ol=worldToLocal(owner.team,owner.x,owner.y);
    TELEMETRY.onDefensiveDecision(m,{playerId:ch.id,name:ch.name,team:ch.team,role:ch.role,slot:ch.slot,phase:phaseName(m),distance:Number(opps[0].d.toFixed(2)),ownerId:owner.id,ownerRole:owner.role,ownerLocalX:Number(ol.x.toFixed(2)),dangerBox,relativeSpeed:Number(rel.toFixed(2))});
  }
  if(m.r()>chance){
    // A close press is not always a ghost interaction. Near the touchline, body pressure can
    // nick the ball out even when nobody wins a clean tackle; centrally, mistimed contact can
    // become a foul. These are live contact outcomes, not restart quotas.
    const edge=Math.min(owner.y,68-owner.y),tackling=abilityValue(m,ch,'tackling');
    if(!dangerBox&&m.time-m.lastFoulAt>20){const foulP=clamp(0.014+Math.max(0,rel-1.5)*0.004+Math.max(0,58-tackling)*0.0006+(opps[0].d<0.85?0.006:0),0.012,0.050);if(m.r()<foulP){m.lastFoulAt=m.time;m.stats.fouls=(m.stats.fouls||0)+1;m.stats.freeKicks=(m.stats.freeKicks||0)+1;event(m,'FOUL',`${ch.name}의 압박이 파울로 끊겼습니다.`);startDeadRestart(m,'FREE_KICK',owner.team,owner.x,owner.y);return;}}
    if(edge<=10.5){const outP=clamp(0.20+(10.5-edge)*0.025+Math.max(0,ownerMoving-2.0)*0.015,0.20,0.52);if(m.r()<outP){const ownerControl=abilityValue(m,owner,'ball_control'),defLastP=clamp(0.52+(tackling-ownerControl)*0.002,0.40,0.64),last=m.r()<defLastP?ch:owner,targetY=owner.y<34?-1.0:69.0,targetX=clamp(owner.x+owner.vx*0.22+(m.r()-0.5)*2.2,1,104);setBallFlight(m,{source:last,target:null,kind:'DUEL_DEFLECTION',speed:clamp(10.5+ownerMoving*0.55,10.5,14.5),loft:0.05,targetPoint:{x:targetX,y:targetY},deliveryMode:'GROUND'});m.ball.noCaptureIds=[owner.id,ch.id];m.ball.noCaptureUntil=0.42;m.stats.duelBoundaryDeflections=(m.stats.duelBoundaryDeflections||0)+1;event(m,'DUEL_DEFLECTION',`${ch.name}의 압박에 공이 터치라인 쪽으로 튑니다.`);return;}}
    ch.pressCommitUntil=0;setPairCooldown(m,ch,owner,dangerBox?1.35:1.05);
    if(dangerBox)ch.pressRecoverUntil=Math.max(ch.pressRecoverUntil||0,m.time+0.65);
    m.stats.duelDisengages=(m.stats.duelDisengages||0)+1;return;
  }
  const outcome=m.r();if(outcome<0.48){
    const edge=Math.min(owner.y,68-owner.y);if(edge<=10.5&&m.r()<0.30){const last=m.r()<0.58?ch:owner,targetY=owner.y<34?-1.0:69.0,targetX=clamp(owner.x+owner.vx*0.20+(m.r()-0.5)*2.0,1,104);setBallFlight(m,{source:last,target:null,kind:'DUEL_DEFLECTION',speed:clamp(11.0+ownerMoving*0.55,11.0,15.0),loft:0.05,targetPoint:{x:targetX,y:targetY},deliveryMode:'GROUND'});m.ball.noCaptureIds=[owner.id,ch.id];m.ball.noCaptureUntil=0.42;m.stats.duelBoundaryDeflections=(m.stats.duelBoundaryDeflections||0)+1;event(m,'TACKLE_DEFLECTION',`${ch.name}의 태클에 공이 터치라인 쪽으로 튑니다.`);return;}
    ch.pressRecoverUntil=m.time+1.35;const oldTeam=owner.team;setControlled(m,ch,false);m.stats.turnovers++;m.stats.tacklesWon++;m.transitionUntil=m.time+2.2;ch.nextThink=m.time+0.55;ch.tacticalTask='WIN_BALL';event(m,'TACKLE',`${subjectName(ch.name)} ${owner.name}에게서 공을 빼앗았습니다.`);if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.onChallengeOutcome==='function')TELEMETRY.onChallengeOutcome(m,{team:ch.team,playerId:ch.id,outcome:'TACKLE_WON'});if(oldTeam!==ch.team)m.possession=ch.team;}
  else if(outcome<0.59&&!inOppPenaltyArea(owner.team,owner.x,owner.y)&&m.time-m.lastFoulAt>42){m.lastFoulAt=m.time;m.stats.fouls=(m.stats.fouls||0)+1;m.stats.freeKicks=(m.stats.freeKicks||0)+1;event(m,'FOUL',`${ch.name}의 압박이 파울로 끊겼습니다.`);if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.onChallengeOutcome==='function')TELEMETRY.onChallengeOutcome(m,{team:ch.team,playerId:ch.id,outcome:'FOUL'});startDeadRestart(m,'FREE_KICK',owner.team,owner.x,owner.y);}
  else{const edge=Math.min(owner.y,68-owner.y);if(edge<=10.5&&m.r()<0.42){const last=m.r()<0.52?ch:owner,targetY=owner.y<34?-1.0:69.0,targetX=clamp(owner.x+(m.r()-0.5)*2.4,1,104);setBallFlight(m,{source:last,target:null,kind:'DUEL_DEFLECTION',speed:10.5+m.r()*3.2,loft:0.05,targetPoint:{x:targetX,y:targetY},deliveryMode:'GROUND'});m.ball.noCaptureIds=[owner.id,ch.id];m.ball.noCaptureUntil=0.40;m.stats.duelBoundaryDeflections=(m.stats.duelBoundaryDeflections||0)+1;event(m,'DUEL_DEFLECTION',`${ch.name}과 ${owner.name}의 경합에서 공이 터치라인 쪽으로 튑니다.`);return;}const n=norm(ch.x-owner.x,ch.y-owner.y);setLoose(m,m.ball.x,m.ball.y,-n.x*(3.0+m.r()*3)+(m.r()-0.5)*2.2,-n.y*(3.0+m.r()*3)+(m.r()-0.5)*2.2,owner.team,owner.id);m.stats.looseBalls++;event(m,'LOOSE',`${ch.name}과 ${owner.name}의 경합으로 공이 흘렀습니다.`);}
}
function tryCrossReleaseBlock(m,prev){
  if(m.ball.mode!=='FLIGHT'||m.ball.kind!=='CROSS'||m.ball.age>0.34)return false;
  const source=playerById(m,m.ball.lastTouchPlayer);if(!source)return false;
  const fromOrigin=Math.hypot(m.ball.x-(m.ball.originX??m.ball.x),m.ball.y-(m.ball.originY??m.ball.y));if(fromOrigin>6.5)return false;
  const incomingSpeed=Math.hypot(m.ball.vx||0,m.ball.vy||0);if(incomingSpeed<6)return false;
  const defenders=outfield(m,other(source.team));let best=null;
  for(const p of defenders){
    const dseg=segmentPointDistance(prev.x,prev.y,m.ball.x,m.ball.y,p.x,p.y),reaction=abilityValue(m,p,'reaction'),tackling=abilityValue(m,p,'tackling'),reach=clamp(0.82+(reaction-60)*0.0025+(tackling-60)*0.0030,0.68,1.00),maxZ=clamp(1.58+(reaction-60)*0.004,1.42,1.78);
    if(dseg>reach||(m.ball.z||0)>maxZ)continue;
    const dSource=Math.hypot(p.x-(m.ball.originX??source.x),p.y-(m.ball.originY??source.y));if(dSource>7.0)continue;
    if(!best||dseg<best.dseg)best={p,dseg,reach};
  }
  if(!best)return false;
  const p=best.p,oldVx=m.ball.vx||0,oldVy=m.ball.vy||0,sp=Math.hypot(oldVx,oldVy)||1,px=-oldVy/sp,py=oldVx/sp,relX=p.x-m.ball.x,relY=p.y-m.ball.y,side=Math.sign(relX*px+relY*py)||1,awayX=-side*px,awayY=-side*py,deflectSpeed=clamp(incomingSpeed*0.40,7.0,11.5),vx=oldVx*0.12+awayX*deflectSpeed,vy=oldVy*0.12+awayY*deflectSpeed,z=clamp(Number(m.ball.z)||0,0,1.65),vz=z>0.18?Math.max(-0.8,Math.min(1.2,(m.ball.vz||0)*0.18)):0;
  for(const q of m.players)q.hasBall=false;
  m.ball={mode:'FLIGHT',x:m.ball.x,y:m.ball.y,z,vx,vy,vz,ownerId:null,intendedReceiverId:null,kind:'CROSS_DEFLECTION',deliveryMode:z>0.18?'AERIAL':'GROUND',airborne:z>0.18,lastTouchTeam:p.team,lastTouchPlayer:p.id,age:0,originX:m.ball.x,originY:m.ball.y};m.ball.noCaptureIds=[p.id,source.id];m.ball.noCaptureUntil=0.20;m.ballOwner=null;m.lastTouchTeam=p.team;m.lastTouchPlayer=p.id;
  m.stats.crossesDefended=(m.stats.crossesDefended||0)+1;m.stats.passDeflections=(m.stats.passDeflections||0)+1;m.stats.crossReleaseBlocks=(m.stats.crossReleaseBlocks||0)+1;m.stats.looseBalls=(m.stats.looseBalls||0)+1;
  event(m,'CROSS_BLOCK',`${subjectName(p.name)} 크로스가 올라오자 몸을 던져 바로 막아냈습니다.`);p.pressRecoverUntil=Math.max(p.pressRecoverUntil||0,m.time+0.45);return true;
}

function trySegmentInterception(m,prev){
  if(m.ball.mode!=='FLIGHT'||m.ball.kind==='SHOT'||m.ball.kind==='CROSS_DEFLECTION'||m.ball.z>1.25||m.ball.age<0.12)return false;
  if(m.ball.interceptResolved)return false;const passTeam=m.ball.lastTouchTeam,cands=[];
  for(const p of outfield(m,other(passTeam))){const dseg=segmentPointDistance(prev.x,prev.y,m.ball.x,m.ball.y,p.x,p.y);if(dseg<0.72){const along=dist(prev,p)+dist(p,m.ball);cands.push({p,dseg,along});}}
  if(!cands.length)return false;cands.sort((a,b)=>a.dseg-b.dseg||a.along-b.along);const c=cands[0],p=c.p;m.ball.interceptResolved=true;const travel=Math.hypot((m.ball.targetX??m.ball.x)-(m.ball.originX??m.ball.x),(m.ball.targetY??m.ball.y)-(m.ball.originY??m.ball.y));const chance=clamp(0.18+(0.72-c.dseg)*0.28+(travel>28?0.05:0),0.16,0.38);if(m.r()>chance)return false;
  const cleanTake=clamp(0.38+(0.72-c.dseg)*0.35-(travel>30?0.08:0),0.34,0.68);
  if(m.r()<cleanTake){const tr=m.lastUserDirectedPassTrace;if(tr&&tr.outcome==='IN_FLIGHT'&&tr.sourceId===m.ball.lastTouchPlayer){tr.firstControllerId=p.id;tr.outcome='OPPONENT_INTERCEPT';tr.resolvedAt=Number(m.time.toFixed(3));}setControlled(m,p,false);p.nextThink=m.time+0.75;m.stats.turnovers++;m.stats.interceptions++;m.transitionUntil=m.time+1.8;event(m,'INTERCEPT',`${subjectName(p.name)} 패스 길을 읽고 가로챘습니다.`);if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.onInterception==='function')TELEMETRY.onInterception(m,{team:p.team,playerId:p.id});return true;}
  const oldVx=m.ball.vx,oldVy=m.ball.vy,n=norm((m.r()-0.5)*1.3,-oldVx*0.08+(m.r()-0.5)*0.7);setLoose(m,m.ball.x,m.ball.y,oldVx*0.18+n.x*(3.0+m.r()*2.5),oldVy*0.18+n.y*(3.0+m.r()*2.5),p.team,p.id);m.stats.passDeflections=(m.stats.passDeflections||0)+1;m.stats.passLooseBalls=(m.stats.passLooseBalls||0)+1;m.stats.looseBalls++;event(m,'PASS_DEFLECT',`${subjectName(p.name)} 패스에 발을 대 공이 루즈볼이 됐습니다.`);return true;
}
function tryShotBlock(m,prev){
  if(m.ball.mode!=='FLIGHT'||m.ball.kind!=='SHOT'||m.ball.age<0.035||m.ball.z>1.65)return false;
  const defending=outfield(m,other(m.ball.shotTeam||m.ball.lastTouchTeam));
  const cands=[];for(const p of defending){const dseg=segmentPointDistance(prev.x,prev.y,m.ball.x,m.ball.y,p.x,p.y);if(dseg<1.28)cands.push({p,dseg});}
  if(!cands.length)return false;cands.sort((a,b)=>a.dseg-b.dseg);const c=cands[0];
  const chance=clamp(0.50+(1.28-c.dseg)*0.30,0.50,0.82);if(m.r()>chance)return false;
  const blockLocal=worldToLocal(c.p.team,m.ball.x,m.ball.y);if(blockLocal.x<15&&m.r()<0.22){
    // A blocked shot that becomes a corner must still be seen travelling over the goal-line.
    // Previously the corner state was created at the impact point, visually teleporting the ball.
    const atk=m.ball.shotTeam||other(c.p.team),goalX=oppGoalX(atk),outsideY=m.ball.y<34?Math.min(m.ball.y,FIELD.GOAL_Y1-1.6):Math.max(m.ball.y,FIELD.GOAL_Y2+1.6),target={x:goalX+dir(atk)*1.2,y:clamp(outsideY,3.5,64.5)},n=norm(target.x-m.ball.x,target.y-m.ball.y),deflectSpeed=clamp(11.5+Math.hypot(m.ball.vx||0,m.ball.vy||0)*0.18,12.0,17.5);
    const z=Math.min(0.75,Math.max(0,m.ball.z||0));
    for(const q of m.players)q.hasBall=false;
    m.ball={mode:'FLIGHT',x:m.ball.x,y:m.ball.y,z,vx:n.x*deflectSpeed,vy:n.y*deflectSpeed,vz:0,ownerId:null,intendedReceiverId:null,kind:'DEFLECTION_OUT',deliveryMode:'GROUND',lastTouchTeam:c.p.team,lastTouchPlayer:c.p.id,age:0,originX:m.ball.x,originY:m.ball.y,targetX:target.x,targetY:target.y,airborne:false,shotTeam:null,shotTargetY:null};
    m.ballOwner=null;m.lastTouchTeam=c.p.team;m.lastTouchPlayer=c.p.id;m.stats.blocks++;m.stats.shotBlocks++;event(m,'BLOCK',`${subjectName(c.p.name)} 슈팅을 막았고 공이 골라인 밖으로 향합니다.`);c.p.pressRecoverUntil=m.time+0.55;return true;
  }
  const oldVx=m.ball.vx,oldVy=m.ball.vy;setLoose(m,m.ball.x,m.ball.y,-oldVx*(0.15+m.r()*0.18)+(m.r()-0.5)*3.0,-oldVy*(0.15+m.r()*0.18)+(m.r()-0.5)*3.0,c.p.team,c.p.id);m.stats.blocks++;m.stats.shotBlocks++;m.stats.looseBalls++;event(m,'BLOCK',`${subjectName(c.p.name)} 슈팅 코스에 몸을 던져 막았습니다.`);c.p.pressRecoverUntil=m.time+0.55;return true;
}
function tryChipGKIntervention(m,prev){
  if(m.ball.mode!=='FLIGHT'||m.ball.kind!=='SHOT'||m.ball.strikeStyle!=='CHIP'||m.ball.chipKeeperResolved)return false;
  const shotTeam=m.ball.shotTeam||m.ball.lastTouchTeam,defTeam=other(shotTeam),gk=teamPlayers(m,defTeam).find(p=>p.role==='GK');if(!gk)return false;
  const reaction=abilityValue(m,gk,'reaction'),aerial=abilityValue(m,gk,'aerial'),handling=abilityValue(m,gk,'handling'),positioning=abilityValue(m,gk,'gk_positioning');
  const dseg=segmentPointDistance(prev.x,prev.y,m.ball.x,m.ball.y,gk.x,gk.y),interventionRange=clamp(1.85+(reaction-60)*0.020,1.85,2.50);if(dseg>interventionRange)return false;
  const z=Number(m.ball.z)||0;if(z<1.15||z>3.45)return false;
  const reach=clamp(2.78+(aerial-60)*0.006+(reaction-60)*0.0035,2.55,3.34);if(z>reach)return false;
  // Do not permanently mark the chip resolved while it is still above the keeper's
  // reachable height. The same flight may become contestable a fraction later on descent.
  m.ball.chipKeeperResolved=true;
  const saveP=clamp(0.24+(reaction-60)*0.0030+(aerial-60)*0.0032+(positioning-60)*0.0023+(reach-z)*0.22+(interventionRange-dseg)*0.10,0.14,0.72);
  // Keep the keeper-vs-chip contest stable for the same shot state. Unrelated tactical RNG
  // calls earlier in the frame must not decide whether the keeper suddenly reacts or not.
  const shotKey=`${m.seed}|CHIP_SAVE|${m.ball.lastTouchPlayer||'-'}|${Number(m.lastShotAt?.[shotTeam]??m.time).toFixed(1)}`;
  const saveRoll=(hash32(shotKey)%10000)/10000;if(saveRoll>saveP)return false;if(m.ball.shotOneVOne)m.stats.strictOneVOneSaves=(m.stats.strictOneVOneSaves||0)+1;if(m.ball.shotClearKeeperChance)m.stats.cleanKeeperChanceSaves=(m.stats.cleanKeeperChanceSaves||0)+1;m.stats.saves=(m.stats.saves||0)+1;m.stats.chipSaves=(m.stats.chipSaves||0)+1;
  const catchP=clamp(0.24+(handling-60)*0.004+(2.82-z)*0.16,0.12,0.58),catchRoll=(hash32(`${shotKey}|CATCH`)%10000)/10000;
  if(z<=2.92&&catchRoll<catchP){setControlled(m,gk);gk.nextThink=m.time+0.72;event(m,'CHIP_SAVE','골키퍼가 전진한 위치에서 칩슛을 잡아냈습니다.');return true;}
  const clearDir=dir(gk.team);setLoose(m,m.ball.x,m.ball.y,clearDir*(5.2+m.r()*2.0),(m.r()-0.5)*5.0,gk.team,gk.id);m.stats.looseBalls=(m.stats.looseBalls||0)+1;gk.nextThink=m.time+0.40;event(m,'CHIP_PARRY','골키퍼가 손을 뻗어 칩슛을 쳐냈습니다.');return true;
}

function executeCrossHeaderShot(m,p,defenderDistance=9){
  const l=worldToLocal(p.team,p.x,p.y),gx=oppGoalX(p.team),dGoal=Math.hypot(gx-p.x,34-p.y),heading=abilityValue(m,p,'heading'),finishing=abilityValue(m,p,'finishing'),anticipation=abilityValue(m,p,'anticipation');
  let onTargetP=0.16+heading*0.0021+finishing*0.0007+anticipation*0.00035-(Math.max(0,dGoal-9))*0.008-(Math.max(0,4-defenderDistance))*0.018;
  onTargetP=clamp(onTargetP,0.20,0.46);const onTarget=m.r()<onTargetP;let aimY;
  if(onTarget)aimY=clamp(34+(m.r()-0.5)*4.8,30.65,37.35);else aimY=m.r()<0.5?FIELD.GOAL_Y1-(1.0+m.r()*4.5):FIELD.GOAL_Y2+(1.0+m.r()*4.5);
  const x=m.ball.x,y=m.ball.y,z=clamp(m.ball.z||1.55,1.05,1.85),dx=gx-x,dy=aimY-y,n=norm(dx,dy),speed=clamp(19.0+(18-dGoal)*0.22,18.5,23.0);
  for(const q of m.players)q.hasBall=false;
  m.ball={mode:'FLIGHT',x,y,z,vx:n.x*speed,vy:n.y*speed,vz:-0.65,ownerId:null,intendedReceiverId:null,kind:'SHOT',deliveryMode:'AERIAL_HEADER',lastTouchTeam:p.team,lastTouchPlayer:p.id,age:0,originX:x,originY:y,targetX:gx,targetY:aimY,airborne:true,shotTargetY:aimY,shotTeam:p.team,onTarget};
  m.ballOwner=null;m.possession=p.team;m.stats.shots++;m.stats.shotsByTeam[p.team]=(m.stats.shotsByTeam[p.team]||0)+1;m.stats.boxShots++;m.stats.crossHeaderAttempts=(m.stats.crossHeaderAttempts||0)+1;m.stats.headerShotsByTeam[p.team]=(m.stats.headerShotsByTeam[p.team]||0)+1;if(onTarget)m.stats.crossHeaderShotsOnTarget=(m.stats.crossHeaderShotsOnTarget||0)+1;m.stats.shotReasons.CROSS_HEADER=(m.stats.shotReasons.CROSS_HEADER||0)+1;m.lastShotAt[p.team]=m.time;
  if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.onShot==='function')TELEMETRY.onShot(m,{team:p.team,ownerId:p.id,role:p.role,inBox:true,dGoal:Number(dGoal.toFixed(2)),reason:'CROSS_HEADER'});
  p.nextThink=m.time+0.45;event(m,'HEADER_SHOT',`${subjectName(p.name)} 크로스를 헤더 슈팅으로 연결했습니다.`,{actorId:p.id,team:p.team});return true;
}
function resolveCrossLanding(m){
  if(m.ball.mode!=='FLIGHT'||m.ball.kind!=='CROSS'||m.ball.deliveryMode!=='AERIAL')return false;
  const td=m.ball.targetX==null?99:Math.hypot(m.ball.x-m.ball.targetX,m.ball.y-m.ball.targetY);if(td>2.6||m.ball.z>3.5)return false;
  const atkTeam=m.ball.lastTouchTeam,near=m.players.filter(p=>p.id!==m.ball.lastTouchPlayer&&dist(p,m.ball)<6.0).map(p=>({p,d:dist(p,m.ball)}));if(!near.length)return false;
  const atk=near.filter(o=>o.p.team===atkTeam).sort((a,b)=>a.d-b.d)[0],def=near.filter(o=>o.p.team!==atkTeam).sort((a,b)=>a.d-b.d)[0],intended=playerById(m,m.ball.intendedReceiverId);
  // An offside intended receiver contesting an aerial cross is already involved in active play.
  // Enforce the frozen release decision before the specialized aerial resolver can replace the
  // FLIGHT state with a header/control/loose-ball outcome.
  if(atk?.p&&intended&&atk.p.id===intended.id&&callFrozenOffsideOnReceiverInvolvement(m,atk.p,'AERIAL_CROSS_CHALLENGE'))return true;
  let outcome='LOOSE';
  if(AERIAL&&typeof AERIAL.resolve==='function'){const ar=AERIAL.resolve(m,{attacker:atk?.p||null,defender:def?.p||null,attackerDistance:atk?.d??9,defenderDistance:def?.d??9,intendedId:intended?.id||null,roll:m.r()});outcome=ar.outcome;m.stats.aerialDuels=(m.stats.aerialDuels||0)+((atk&&def)?1:0);if((atk&&def)&&outcome==='ATK')m.stats.aerialDuelsWonByAttack=(m.stats.aerialDuelsWonByAttack||0)+1;else if((atk&&def)&&outcome==='DEF')m.stats.aerialDuelsWonByDefence=(m.stats.aerialDuelsWonByDefence||0)+1;}
  else if(def&&!atk)outcome='DEF';
  else if(atk&&!def)outcome=m.r()<0.72?'ATK':'LOOSE';
  else if(atk&&def){
    const atkScore=(6-atk.d)+(intended&&atk.p.id===intended.id?0.35:0),defScore=(6-def.d)+0.45,diff=defScore-atkScore,r=m.r();
    if(diff>1.0)outcome=r<0.76?'DEF':r<0.90?'LOOSE':'ATK';
    else if(diff<-1.0)outcome=r<0.52?'ATK':r<0.80?'DEF':'LOOSE';
    else outcome=r<0.52?'DEF':r<0.80?'ATK':'LOOSE';
  }
  if(outcome==='DEF'&&def){const p=def.p,l=worldToLocal(p.team,p.x,p.y),w=localToWorld(p.team,clamp(l.x+13+m.r()*7,8,88),clamp(l.y+(m.r()-0.5)*16,5,63)),n=norm(w.x-m.ball.x,w.y-m.ball.y);setLoose(m,m.ball.x,m.ball.y,n.x*(11+m.r()*4),n.y*(11+m.r()*4),p.team,p.id);m.stats.crossesDefended++;m.stats.clearances++;m.stats.looseBalls++;event(m,'CLEARANCE',`${subjectName(p.name)} 크로스를 먼저 걷어냈습니다.`);p.pressRecoverUntil=m.time+0.45;return true;}
  if(outcome==='ATK'&&atk){const p=atk.p,l=worldToLocal(p.team,p.x,p.y),dGoal=Math.hypot(105-l.x,34-l.y),central=Math.abs(l.y-34),heading=abilityValue(m,p,'heading');m.stats.crossesCompleted++;
    const incomingResolution=consumeIncomingIntent(m,p,'CROSS',m.ball.lastTouchPlayer,atkTeam,{defenderDistance:def?.d??9});if(incomingResolution.handled)return true;
    const headerWindow=l.x>=86.0&&dGoal<=19.5&&central<=17.0&&['ST','WF','CM'].includes(p.role);let headerP=p.role==='ST'?0.72:p.role==='WF'?0.56:0.42;headerP+=(heading-60)*0.0028;if(dGoal<=11.5)headerP+=0.11;if(central>13)headerP-=0.08;if(def)headerP-=0.05;headerP=clamp(headerP,0.28,0.84);
    const protagonistAerialChoice=incomingResolution.trap||(m.protagonistExplicitActionRequired===true&&p.id===m.protagonistControllerId);if(headerWindow&&!protagonistAerialChoice&&m.r()<headerP)return executeCrossHeaderShot(m,p,def?.d??9);
    setControlled(m,p,false);if(p.role==='CM')m.stats.midfieldFinalReceipts=(m.stats.midfieldFinalReceipts||0)+1;p.nextThink=m.time+0.45+m.r()*0.35;p.lastReceivedFromId=m.ball.lastTouchPlayer;event(m,'CROSS_RECEIVE',`${subjectName(p.name)} 박스 안에서 크로스를 받아냈습니다.`);return true;}
  const lastTeam=m.ball.lastTouchTeam,lastPlayer=m.ball.lastTouchPlayer,x=m.ball.x,y=m.ball.y;setLoose(m,x,y,m.ball.vx*0.22+(m.r()-0.5)*4,m.ball.vy*0.22+(m.r()-0.5)*4,lastTeam,lastPlayer);m.stats.looseBalls++;event(m,'AERIAL_DUEL','크로스 경합 뒤 공이 세컨드 볼로 흘렀습니다.');return true;
}


function resolveLongPassAerialContest(m){
  if(m.ball.mode!=='FLIGHT'||m.ball.kind!=='LONG_PASS'||(m.ball.deliveryMode||'GROUND')!=='AERIAL')return false;
  if(m.ball.age<0.35||m.ball.vz>=0||(m.ball.z||0)>2.80)return false;
  const passTeam=m.ball.lastTouchTeam,near=m.players.filter(p=>p.role!=='GK'&&p.id!==m.ball.lastTouchPlayer&&dist(p,m.ball)<6.2).map(p=>({p,d:dist(p,m.ball)}));
  if(!near.length)return false;
  const atk=near.filter(o=>o.p.team===passTeam).sort((a,b)=>a.d-b.d)[0],def=near.filter(o=>o.p.team!==passTeam).sort((a,b)=>a.d-b.d)[0];
  if(!atk&&!def||Math.min(atk?.d??99,def?.d??99)>1.55)return false;
  const intended=playerById(m,m.ball.intendedReceiverId);
  // Same Law 11 guard for the dedicated long-aerial contest path. A challenge by the frozen
  // offside intended receiver is involvement even if the following duel would have produced
  // a knockdown/miscontrol instead of clean control.
  if(atk?.p&&intended&&atk.p.id===intended.id&&callFrozenOffsideOnReceiverInvolvement(m,atk.p,'AERIAL_LONG_CHALLENGE'))return true;
  const strikeTick=Math.floor((m.time-(m.ball.age||0))*20),baseKey=`${m.seed}|LONG_AERIAL|${strikeTick}|${m.ball.lastTouchPlayer||'-'}|${m.ball.intendedReceiverId||'-'}`,u=(tag)=>deterministicUnit(`${baseKey}|${tag}`),ar=AERIAL&&typeof AERIAL.resolve==='function'?AERIAL.resolve(m,{attacker:atk?.p||null,defender:def?.p||null,attackerDistance:atk?.d??9,defenderDistance:def?.d??9,intendedId:intended?.id||null,roll:u('CONTEST')}):{outcome:def?'DEF':atk?'ATK':'LOOSE'};
  if(atk&&def){m.stats.aerialDuels=(m.stats.aerialDuels||0)+1;if(ar.outcome==='ATK')m.stats.aerialDuelsWonByAttack=(m.stats.aerialDuelsWonByAttack||0)+1;else if(ar.outcome==='DEF')m.stats.aerialDuelsWonByDefence=(m.stats.aerialDuelsWonByDefence||0)+1;}
  m.stats.longAerialContests=(m.stats.longAerialContests||0)+1;
  const incomingVx=m.ball.vx||0,incomingVy=m.ball.vy||0,incomingSpeed=Math.hypot(incomingVx,incomingVy),contactZ=m.ball.z||0;
  if(ar.outcome==='ATK'&&atk){
    const p=atk.p,control=(abilityValue(m,p,'ball_control')+abilityValue(m,p,'heading')+abilityValue(m,p,'strength')+abilityValue(m,p,'anticipation'))/4,pressure=def?.d??7;
    m.stats.longAerialWonByAttack=(m.stats.longAerialWonByAttack||0)+1;
    m.stats.completedPasses=(m.stats.completedPasses||0)+1;
    const controlP=clamp(0.54+(control-60)*0.0040+(pressure-2.0)*0.035-(incomingSpeed-18)*0.010-(contactZ-1.25)*0.055,0.28,0.76);
    if(u('CONTROL')<controlP){
      const sourceId=m.ball.lastTouchPlayer;setControlled(m,p,false,{flow:true,flightKind:'LONG_PASS',deliveryMode:'AERIAL',sourceId,incomingVx,incomingVy,incomingZ:contactZ,incomingSpeed});p.lastReceivedFromId=sourceId;p.lastReceivedFlightKind='LONG_PASS';p.lastReceivedPassAt=m.time;event(m,'AERIAL_LONG_CONTROL',`${subjectName(p.name)} 공중 롱패스 첫 공을 이겨내고 받아냈습니다.`,{actorId:p.id,team:p.team,contactDistance:Number((atk?.d??0).toFixed(3))});return true;
    }
    const attackDir=dir(p.team),carry=norm(incomingVx*.26+attackDir*(6.3+u('FWD')*2.0),incomingVy*.24+(u('LAT')-.5)*5.2),spd=6.5+u('SPD')*3.2;
    setLoose(m,m.ball.x,m.ball.y,carry.x*spd,carry.y*spd,p.team,p.id);m.ball.noCaptureIds=[p.id,...(def?[def.p.id]:[])];m.ball.noCaptureUntil=0.22;m.stats.looseBalls++;m.stats.longAerialKnockdowns=(m.stats.longAerialKnockdowns||0)+1;event(m,'AERIAL_LONG_KNOCKDOWN',`${subjectName(p.name)} 공중 롱패스 첫 공을 따내 세컨드볼로 떨궜습니다.`);return true;
  }
  if(ar.outcome==='DEF'&&def){
    const p=def.p,quality=(abilityValue(m,p,'heading')+abilityValue(m,p,'defensive_positioning')+abilityValue(m,p,'anticipation')+abilityValue(m,p,'strength'))/4,pressure=atk?.d??7;
    m.stats.longAerialWonByDefence=(m.stats.longAerialWonByDefence||0)+1;
    const cleanP=clamp(0.10+(quality-60)*0.0030+(pressure-2.0)*0.020-(incomingSpeed-18)*0.007,0.06,0.34);
    if(contactZ<1.28&&u('DEF_CONTROL')<cleanP){setControlled(m,p,false);p.nextThink=m.time+0.62;m.stats.turnovers++;m.stats.interceptions++;m.transitionUntil=m.time+1.6;event(m,'AERIAL_LONG_INTERCEPT',`${subjectName(p.name)} 공중 롱패스를 먼저 읽고 소유했습니다.`);return true;}
    const l=worldToLocal(p.team,p.x,p.y),edge=Math.min(l.y,68-l.y),lateralBias=edge<13?(l.y<34?3.8:-3.8):(u('DEF_LAT')-.5)*5.8,n=norm(dir(p.team)*(7.8+u('DEF_FWD')*2.0)+incomingVx*.14,lateralBias+incomingVy*.14),spd=7.5+u('DEF_SPD')*4.0;
    setLoose(m,m.ball.x,m.ball.y,n.x*spd,n.y*spd,p.team,p.id);m.ball.noCaptureIds=[p.id,...(atk?[atk.p.id]:[])];m.ball.noCaptureUntil=0.24;m.stats.clearances++;m.stats.looseBalls++;event(m,'AERIAL_LONG_CLEAR',`${subjectName(p.name)} 공중 롱패스를 먼저 따내 걷어냈습니다.`);return true;
  }
  const lastTeam=m.ball.lastTouchTeam,lastPlayer=m.ball.lastTouchPlayer,n=norm(incomingVx*.20+(u('LOOSE_X')-.5)*5.0,incomingVy*.20+(u('LOOSE_Y')-.5)*5.0),spd=5.0+u('LOOSE_SPD')*3.2;
  setLoose(m,m.ball.x,m.ball.y,n.x*spd,n.y*spd,lastTeam,lastPlayer);m.ball.noCaptureIds=[...(atk?[atk.p.id]:[]),...(def?[def.p.id]:[])];m.ball.noCaptureUntil=0.20;m.stats.looseBalls++;m.stats.longAerialLoose=(m.stats.longAerialLoose||0)+1;event(m,'AERIAL_LONG_LOOSE','공중 롱패스 첫 경합에서 공이 세컨드볼로 흘렀습니다.');return true;
}

function resolveGoalKickAerialContest(m){
  if(m.ball.mode!=='FLIGHT'||m.ball.kind!=='GOAL_KICK'||(m.ball.deliveryMode||'AERIAL')!=='AERIAL')return false;
  const td=m.ball.targetX==null?99:Math.hypot(m.ball.x-m.ball.targetX,m.ball.y-m.ball.targetY);if(td>2.7||m.ball.z>2.55||m.ball.vz>=0)return false;
  const kickTeam=m.ball.lastTouchTeam,near=m.players.filter(p=>p.role!=='GK'&&p.id!==m.ball.lastTouchPlayer&&dist(p,m.ball)<6.2).map(p=>({p,d:dist(p,m.ball)}));if(!near.length)return false;
  const atk=near.filter(o=>o.p.team===kickTeam).sort((a,b)=>a.d-b.d)[0],def=near.filter(o=>o.p.team!==kickTeam).sort((a,b)=>a.d-b.d)[0];if(!atk&&!def)return false;
  const ar=AERIAL&&typeof AERIAL.resolve==='function'?AERIAL.resolve(m,{attacker:atk?.p||null,defender:def?.p||null,attackerDistance:atk?.d??9,defenderDistance:def?.d??9,intendedId:m.ball.intendedReceiverId,roll:m.r()}):{outcome:def?'DEF':atk?'ATK':'LOOSE'};
  if(atk&&def){m.stats.aerialDuels=(m.stats.aerialDuels||0)+1;if(ar.outcome==='ATK')m.stats.aerialDuelsWonByAttack=(m.stats.aerialDuelsWonByAttack||0)+1;else if(ar.outcome==='DEF')m.stats.aerialDuelsWonByDefence=(m.stats.aerialDuelsWonByDefence||0)+1;}
  const winner=ar.outcome==='ATK'?atk?.p:ar.outcome==='DEF'?def?.p:null,lastTeam=winner?.team||kickTeam,lastPlayer=winner?.id||m.ball.lastTouchPlayer;
  const baseDir=winner?dir(winner.team):dir(kickTeam),lateral=(m.r()-0.5)*7.0,n=norm(baseDir*8.5,lateral);setLoose(m,m.ball.x,m.ball.y,n.x*(8.0+m.r()*3.5),n.y*(8.0+m.r()*3.5),lastTeam,lastPlayer);m.stats.looseBalls++;m.stats.goalKickAerialContests=(m.stats.goalKickAerialContests||0)+1;event(m,'AERIAL_DUEL',winner?`${winner.name} 선수가 롱 골킥 첫 공중볼을 따내 세컨드볼로 연결했습니다.`:'롱 골킥 경합 뒤 세컨드볼이 발생했습니다.');return true;
}

function tryNpcOneTouchPass(m,p,flightKind,sourceId,passTeam,incomingSpeed){
  // NPC-only live first-touch action. This runs at the actual contact frame, after
  // miscontrol/receive-contest resolution and before normal FIRST_TOUCH_FLOW control.
  // The protagonist is never eligible: their incoming touch remains an explicit user choice.
  if(!p||p.role==='GK'||p.id===m.protagonistControllerId||p.team!==passTeam)return false;
  if(!['PASS','LONG_PASS','THROUGH','CUTBACK'].includes(flightKind)||(m.ball.z||0)>.72||incomingSpeed>24.5)return false;
  if((m.npcOneTouchChainUntil||0)>m.time)return false;
  const skill=(abilityValue(m,p,'short_pass')+abilityValue(m,p,'vision')+abilityValue(m,p,'ball_control'))/3,pressure=nearestOppDistance(m,p);
  if(skill<44)return false;
  const opts=passOptions(m,p,false).filter(o=>o.p.id!==sourceId&&o.block===0&&o.d>=3&&o.d<=29&&o.open>=1.20&&o.forward>=-4.5);
  if(!opts.length)return false;
  const targetOpt=opts.sort((a,b)=>(b.forward-a.forward)+(b.open-a.open)*.18+(a.d-b.d)*.025)[0];
  const chance=clamp(.075+(skill-50)*.0022+(pressure<2.0?.035:0)+(p.role==='CM'?.025:0),.055,.21),roll=(hash32(`${m.seed}|NPC_ONE_TOUCH|${Math.floor(m.time*10)}|${p.id}|${sourceId}`)%10000)/10000;
  if(roll>=chance)return false;
  recordInboundCompletion(m,p,flightKind,sourceId,passTeam);p.x=clamp(p.x,1,104);p.y=clamp(p.y,1,67);p.hasBall=false;m.ballOwner=null;m.lastTouchTeam=p.team;m.lastTouchPlayer=p.id;
  executePass(m,p,targetOpt.p,'PASS',{...targetOpt,running:false},'NPC_ONE_TOUCH');p.lastDecision='NPC_ONE_TOUCH_PASS';m.stats.npcOneTouchPasses=(m.stats.npcOneTouchPasses||0)+1;m.npcOneTouchChainUntil=m.time+.72;return true;
}

function callFrozenOffsideOnReceiverInvolvement(m,p,reason='TOUCH'){
  // Law 11 position is frozen at release. If that frozen-offside intended receiver is the
  // player who actually reaches/touches the pass, the offence must be enforced before any
  // control, one-touch, bobble or miscontrol transition can replace the FLIGHT ball state.
  // This is intentionally receiver-specific: an opponent interception or another team-mate
  // touching the ball does not trigger the intended receiver's frozen offside offence.
  if(m.ball.mode!=='FLIGHT'||m.ball.offsideAtRelease!==true||m.ball.offsideCalled||!p||m.ball.intendedReceiverId!==p.id)return false;
  const source=playerById(m,m.ball.lastTouchPlayer);if(!source||source.team!==p.team)return false;
  const involvementGap=dist(p,m.ball),flightAge=Number(m.ball.age)||0;
  m.ball.offsideCalled=true;m.stats.offsides++;
  event(m,'OFFSIDE',`${subjectName(p.name)} 오프사이드 위치에 있었습니다.`,{actorId:p.id,team:p.team,releaseFrozen:true,involvementGap:Number(involvementGap.toFixed(3)),flightAge:Number(flightAge.toFixed(3)),involvementType:reason});
  startDeadRestart(m,'OFFSIDE',other(p.team),p.x,p.y);return true;
}
function captureLooseOrFlight(m){
  if(!['LOOSE','FLIGHT'].includes(m.ball.mode))return;
  // A committed shot deflection headed over the goal-line is the visible continuation of
  // the block outcome. Do not let a nearby player magnetically collect it before it exits.
  if(m.ball.mode==='FLIGHT'&&m.ball.kind==='DEFLECTION_OUT')return;
  const isShot=m.ball.mode==='FLIGHT'&&m.ball.kind==='SHOT',flightKind=m.ball.kind,passFlight=['PASS','LONG_PASS','THROUGH','CUTBACK','CROSS'].includes(flightKind),restartFlight=['THROW_IN','GOAL_KICK'].includes(flightKind),transferFlight=passFlight||restartFlight,speed=Math.hypot(m.ball.vx||0,m.ball.vy||0),td=m.ball.targetX==null?99:Math.hypot(m.ball.x-m.ball.targetX,m.ball.y-m.ball.targetY),candidates=[];
  for(const p of m.players){
    if(m.ball.mode==='FLIGHT'&&m.ball.lastTouchPlayer===p.id&&m.ball.age<0.28)continue;
    if(Array.isArray(m.ball.noCaptureIds)&&m.ball.age<(m.ball.noCaptureUntil||0)&&m.ball.noCaptureIds.includes(p.id))continue;
    const intended=m.ball.intendedReceiverId===p.id,opponentPass=transferFlight&&m.ball.lastTouchTeam!==p.team,otherMate=transferFlight&&m.ball.lastTouchTeam===p.team&&!intended;
    // Mid-flight opponent interceptions are handled by the segment lane check. General capture is only allowed near the receiving zone / after the ball slows.
    if(opponentPass&&(m.ball.age<0.28||(speed>12.5&&td>3.2)))continue;
    // GK reach is geometric, not a post-hoc save roll. Keep the calibrated level-60 radius,
    // but distribute above/below-average lateral reach across the actual physical/read inputs.
    // The coefficients still sum to the previous 0.010, so an all-45/60/80 GK keeps the same
    // aggregate radius while diving/agility now matter independently instead of being dead inputs.
    const shotSaveBase=m.ball.shotClearKeeperChance&&!m.ball.shotOneVOne?1.70:1.46,shotSaveRadius=isShot&&p.role==='GK'?(m.ball.onTarget===false?1.10:clamp(shotSaveBase+(abilityValue(m,p,'reaction')-60)*0.0025+(abilityValue(m,p,'gk_positioning')-60)*0.0025+(abilityValue(m,p,'agility')-60)*0.0015+(abilityValue(m,p,'diving')-60)*0.0035,1.30,2.02)):null;
    const d=dist(p,m.ball),base=(isShot&&p.role==='GK'?shotSaveRadius:(CONTROL_RADIUS[p.role]||1.05)),recv=intended?(flightKind==='CROSS'?0.20:0.72):0,opp=opponentPass?(flightKind==='CROSS'?0.14:-0.08):0,matePenalty=otherMate?-0.22:0,r=base+recv+opp+matePenalty+(m.ball.mode==='LOOSE'?0.25:0);
    if(d>r)continue;if(m.ball.z>(p.role==='GK'?2.5:1.45))continue;if(isShot&&p.team===m.ball.shotTeam)continue;candidates.push({p,d});
  }
  if(!candidates.length)return;candidates.sort((a,b)=>a.d-b.d);const p=candidates[0].p;
  // Receiver touch is involvement under Law 11. Enforce the frozen release decision before
  // any receive outcome can erase intendedReceiverId/offsideAtRelease from the ball object.
  if(passFlight&&p.team===m.ball.lastTouchTeam&&callFrozenOffsideOnReceiverInvolvement(m,p,'RECEIVER_TOUCH'))return;
  const incomingSourceId=m.ball.lastTouchPlayer,incomingPassTeam=m.ball.lastTouchTeam;if(passFlight&&flightKind!=='CROSS'&&p.team===incomingPassTeam){const ir=consumeIncomingIntent(m,p,flightKind,incomingSourceId,incomingPassTeam);if(ir.handled)return;}
  if(passFlight&&flightKind!=='CROSS'&&m.ball.passMiscontrol&&m.ball.intendedReceiverId===p.id){
    const oldVx=m.ball.vx,oldVy=m.ball.vy;setLoose(m,m.ball.x,m.ball.y,oldVx*0.28+(m.r()-0.5)*3.8,oldVy*0.28+(m.r()-0.5)*3.8,m.ball.lastTouchTeam,m.ball.lastTouchPlayer);m.stats.passLooseBalls=(m.stats.passLooseBalls||0)+1;m.stats.looseBalls++;event(m,'PASS_MISCONTROL',`${subjectName(p.name)} 패스를 완전히 잡지 못해 공이 흘렀습니다.`);return;
  }
  if(passFlight&&flightKind!=='CROSS'){
    const rival=m.players.filter(q=>q.team!==p.team&&q.role!=='GK').map(q=>({q,d:dist(q,m.ball)})).sort((a,b)=>a.d-b.d)[0];
    const contested=rival&&rival.d<1.75&&candidates[0].d<1.45;
    if(contested&&m.r()<0.25){const oldVx=m.ball.vx,oldVy=m.ball.vy;setLoose(m,m.ball.x,m.ball.y,oldVx*0.22+(m.r()-0.5)*4.0,oldVy*0.22+(m.r()-0.5)*4.0,m.ball.lastTouchTeam,m.ball.lastTouchPlayer);m.stats.passLooseBalls=(m.stats.passLooseBalls||0)+1;m.stats.looseBalls++;event(m,'PASS_BOBBLE','패스 경합에서 공이 완전히 소유되지 않고 흘렀습니다.');return;}
  }
  if(isShot){if(p.role==='GK'){const strict=!!m.ball.shotOneVOne,clean=!!m.ball.shotClearKeeperChance;if(strict)m.stats.strictOneVOneSaves=(m.stats.strictOneVOneSaves||0)+1;if(clean)m.stats.cleanKeeperChanceSaves=(m.stats.cleanKeeperChanceSaves||0)+1;const incomingSpeed=Math.hypot(m.ball.vx||0,m.ball.vy||0),z=Number(m.ball.z)||0,handling=abilityValue(m,p,'handling'),reaction=abilityValue(m,p,'reaction'),positioning=abilityValue(m,p,'gk_positioning'),catchP=clamp(0.66+(handling-60)*0.0060+(reaction-60)*0.0022+(positioning-60)*0.0015-(incomingSpeed-22)*0.025-Math.max(0,z-1.0)*0.12,0.28,0.91),key=`${m.seed}|GK_HANDLE|${m.ball.lastTouchPlayer||'-'}|${Number(m.lastShotAt?.[m.ball.shotTeam]??m.time).toFixed(2)}|${p.id}`,roll=deterministicUnit(key);m.stats.saves++;if(roll<catchP){setControlled(m,p);m.stats.gkCatches=(m.stats.gkCatches||0)+1;event(m,'SAVE',`${subjectName(p.name)} 슈팅을 안정적으로 잡아냈습니다.`);p.nextThink=m.time+0.75;return;}const lvx=p.team===HOME?(m.ball.vx||0):-(m.ball.vx||0),lvy=p.team===HOME?(m.ball.vy||0):-(m.ball.vy||0),bl=worldToLocal(p.team,m.ball.x,m.ball.y),side=Math.abs(lvy)>1.0?Math.sign(lvy):(bl.y<34?-1:1),parrySpeed=clamp(incomingSpeed*0.42,8.0,14.5),pvx=parrySpeed*(0.30+Math.max(0,handling-55)*0.0025),pvy=side*parrySpeed*0.78,wx=p.team===HOME?pvx:-pvx,wy=p.team===HOME?pvy:-pvy;setLoose(m,m.ball.x,m.ball.y,wx,wy,p.team,p.id);m.ball.noCaptureIds=[p.id];m.ball.noCaptureUntil=0.30;m.stats.gkParries=(m.stats.gkParries||0)+1;m.stats.looseBalls++;event(m,'PARRY',`${subjectName(p.name)} 슈팅을 옆으로 쳐냈습니다.`);p.nextThink=m.time+0.55;return;}setLoose(m,m.ball.x,m.ball.y,-m.ball.vx*0.28+(m.r()-0.5)*3,-m.ball.vy*0.28+(m.r()-0.5)*3,p.team,p.id);m.stats.blocks++;m.stats.looseBalls++;event(m,'BLOCK',`${subjectName(p.name)} 슈팅을 몸으로 막았습니다.`);return;}
  const oldTeam=m.possession,sourceId=m.ball.lastTouchPlayer,passTeam=m.ball.lastTouchTeam,deliveryMode=m.ball.deliveryMode||((m.ball.z||0)>0.2?'AERIAL':'GROUND'),incomingVx=m.ball.vx||0,incomingVy=m.ball.vy||0,incomingZ=m.ball.z||0,incomingSpeed=Math.hypot(incomingVx,incomingVy);
  if(passFlight&&flightKind!=='CROSS'&&tryNpcOneTouchPass(m,p,flightKind,sourceId,passTeam,incomingSpeed))return;
  const trace=m.lastUserDirectedPassTrace;if(passFlight&&trace&&trace.outcome==='IN_FLIGHT'&&trace.sourceId===sourceId){trace.firstControllerId=p.id;trace.outcome=p.team===passTeam?(p.id===trace.resolvedTargetId?'SELECTED_TARGET_CONTROL':'OTHER_TEAMMATE_CONTROL'):'OPPONENT_CONTROL';trace.resolvedAt=Number(m.time.toFixed(3));}
  const sameTeamFlow=transferFlight&&flightKind!=='CROSS'&&p.team===passTeam;
  setControlled(m,p,false,sameTeamFlow?{flow:true,flightKind,deliveryMode,sourceId,incomingVx,incomingVy,incomingZ,incomingSpeed}:null);p.lastReceivedFromId=sourceId;p.lastReceivedFlightKind=sameTeamFlow?flightKind:null;p.lastReceivedPassAt=sameTeamFlow?m.time:-99;if(passFlight&&flightKind==='CROSS'){if(p.team===passTeam)m.stats.crossesCompleted++;else m.stats.crossesDefended++;}if(oldTeam!==p.team){m.stats.turnovers++;m.stats.interceptions++;m.transitionUntil=m.time+1.8;event(m,'INTERCEPT',`${subjectName(p.name)} 공을 가로챘습니다.`);if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.onInterception==='function')TELEMETRY.onInterception(m,{team:p.team,playerId:p.id});}else if(passFlight){m.stats.completedPasses++;if(p.role==='CM'&&['CUTBACK','CROSS'].includes(flightKind))m.stats.midfieldFinalReceipts=(m.stats.midfieldFinalReceipts||0)+1;}
  p.runUntil=0;p.runType=null;const recvLocalX=worldToLocal(p.team,p.x,p.y).x,finalAttacker=(p.role==='ST'||p.role==='WF')&&recvLocalX>70;if(!sameTeamFlow)p.nextThink=m.time+(p.role==='GK'?0.65+m.r()*0.35:finalAttacker?0.55+m.r()*0.45:0.80+m.r()*0.65);
}
function boundaryCross(prev,b){
  if(b.x<0)return{side:'GOAL_LEFT',x:0,y:prev.y+(b.y-prev.y)*((0-prev.x)/((b.x-prev.x)||1))};
  if(b.x>105)return{side:'GOAL_RIGHT',x:105,y:prev.y+(b.y-prev.y)*((105-prev.x)/((b.x-prev.x)||1))};
  if(b.y<0)return{side:'TOUCH_TOP',x:prev.x+(b.x-prev.x)*((0-prev.y)/((b.y-prev.y)||1)),y:0};
  if(b.y>68)return{side:'TOUCH_BOTTOM',x:prev.x+(b.x-prev.x)*((68-prev.y)/((b.y-prev.y)||1)),y:68};
  return null;
}
function goalDescription(m,team,cross){
  const b=m.ball,scorer=playerById(m,b.lastTouchPlayer),styleMap={CURLED:'감아찬 슈팅',CHIP:'칩슛',PLACED:'정교하게 깔아 찬 슈팅',POWER:'강하게 때린 슈팅',LONG:'중거리 슈팅',HEADER:'헤더'};
  const style=b.deliveryMode==='AERIAL_HEADER'||b.strikeStyle==='HEADER'?'헤더':(styleMap[b.strikeStyle]||'슈팅');
  const ox=Number.isFinite(b.originX)?b.originX:(scorer?.x??b.x),oy=Number.isFinite(b.originY)?b.originY:(scorer?.y??b.y),g=team===HOME?{x:105,y:34}:{x:0,y:34},d=Math.hypot(g.x-ox,g.y-oy);
  const side=cross.y<33.0?'골문 왼쪽':cross.y>35.0?'골문 오른쪽':'골문 중앙';
  const range=d>=20?'박스 바깥에서':d>=12?'페널티지역 앞쪽에서':'골문 가까운 곳에서';
  return `${subjectName(scorer?.name||'공격수')} ${range} 시도한 ${subjectName(style)} ${side} 골망 안으로 들어갑니다.`;
}
function settleGoalBallInNet(m,team,cross){
  m.ball.x=team===HOME?105.72:-0.72;m.ball.y=clamp(cross.y,FIELD.GOAL_Y1+0.28,FIELD.GOAL_Y2-0.28);m.ball.z=0;m.ball.vx=m.ball.vy=m.ball.vz=0;
}
function handleOut(m,cross){
  const last=m.ball.lastTouchTeam||m.lastTouchTeam,attackingGoal=cross.side==='GOAL_RIGHT'?HOME:AWAY;
  if((cross.side==='GOAL_LEFT'||cross.side==='GOAL_RIGHT')&&cross.y>=FIELD.GOAL_Y1&&cross.y<=FIELD.GOAL_Y2&&m.ball.kind==='SHOT'){
    const team=m.ball.shotTeam,description=goalDescription(m,team,cross);if(m.ball.shotOneVOne)m.stats.strictOneVOneGoals=(m.stats.strictOneVOneGoals||0)+1;if(m.ball.shotClearKeeperChance)m.stats.cleanKeeperChanceGoals=(m.stats.cleanKeeperChanceGoals||0)+1;m.score[team]++;m.stats.goals++;event(m,'GOAL',`${description} ${m.score.HOME}-${m.score.AWAY}`,{actorId:m.ball.lastTouchPlayer,team});settleGoalBallInNet(m,team,cross);startGoalCelebration(m,team);return;
  }
  if(cross.side.startsWith('TOUCH')){
    const team=other(last),passKinds=new Set(['PASS','LONG_PASS','THROUGH','CUTBACK','CROSS']);
    if(passKinds.has(m.ball.kind)&&m.ball.lastTouchPlayer){
      const passer=playerById(m,m.ball.lastTouchPlayer),kindLabel=m.ball.kind==='THROUGH'?'공간 패스':m.ball.kind==='CROSS'?'크로스':'패스';
      event(m,'PASS_OUT',`${passer?.name||'패서'}의 ${kindLabel}가 동료에게 닿지 못하고 터치라인을 벗어났습니다. 패스 미스입니다.`,{actorId:m.ball.lastTouchPlayer,team:last,passMiss:true});
    }
    m.stats.throwIns++;event(m,'THROW_IN',`공이 터치라인을 넘어 ${teamDisplayName(team)}의 스로인이 됩니다.`);startDeadRestart(m,'THROW_IN',team,clamp(cross.x,4,101),cross.y===0?1.2:66.8,cross);return;
  }
  if((cross.side==='GOAL_LEFT'||cross.side==='GOAL_RIGHT')&&m.ball.kind==='SHOT'){if(m.ball.shotOneVOne)m.stats.strictOneVOneMisses=(m.stats.strictOneVOneMisses||0)+1;if(m.ball.shotClearKeeperChance)m.stats.cleanKeeperChanceMisses=(m.stats.cleanKeeperChanceMisses||0)+1;}
  const defendingGoalTeam=cross.side==='GOAL_LEFT'?HOME:AWAY;
  if(last===defendingGoalTeam){const team=other(defendingGoalTeam);m.stats.corners++;event(m,'CORNER',`${teamDisplayName(team)}의 코너킥입니다.`);startDeadRestart(m,'CORNER',team,cross.side==='GOAL_LEFT'?1.2:103.8,cross.y<34?1.2:66.8,cross);}
  else{m.stats.goalKicks++;event(m,'GOAL_KICK',`${teamDisplayName(defendingGoalTeam)}의 골킥입니다.`);startDeadRestart(m,'GOAL_KICK',defendingGoalTeam,defendingGoalTeam===HOME?6:99,34,cross);}
}
function startDeadRestart(m,kind,team,x,y,cross=null){const deferredOffside=kind==='OFFSIDE';if(!deferredOffside)consumeCompressedDeadClock(m,kind);for(const p of m.players){p.hasBall=false;p.runUntil=0;p.runType=null;p.pressCommitUntil=0;p.markTargetId=null;p.faceTargetAngle=null;}
  // A dead-ball is a new defensive phase. Transition hand-offs and press/mark locks from
  // open play must not survive through the restart setup and reappear after the kick/throw.
  m._transitionWideVacancies={HOME:{},AWAY:{}};m._defenceRoleLocks={};m._markLocks={};
  let bx=x,by=y,ballReturn=null;
  if(cross&&(kind==='CORNER'||kind==='GOAL_KICK')){
    const outX=cross.side==='GOAL_LEFT'?-0.85:cross.side==='GOAL_RIGHT'?105.85:cross.x,outY=clamp(cross.y,0.3,67.7);bx=outX;by=outY;
    ballReturn={phase:'OUT_HOLD',startedAt:m.time,holdUntil:m.time+0.34,returnUntil:m.time+1.08,from:{x:outX,y:outY},to:{x,y}};
  }else if(kind==='OFFSIDE'){
    const fromX=Number.isFinite(m.ball?.x)?m.ball.x:x,fromY=Number.isFinite(m.ball?.y)?m.ball.y:y;bx=fromX;by=fromY;
    // Preserve only presentation inertia. Interaction is already dead, so this cannot change
    // the offside result or create a future outcome; it simply avoids a ball freezing mid-flight.
    const v0={x:Number(m.ball?.vx)||0,y:Number(m.ball?.vy)||0,z:Number(m.ball?.z)||0,vz:Number(m.ball?.vz)||0};
    ballReturn={phase:'OUT_HOLD',startedAt:m.time,holdUntil:m.time+0.28,returnUntil:m.time+1.18,from:{x:fromX,y:fromY},to:{x,y}};
    m._pendingOffsideCoast={startedAt:m.time,from:{x:fromX,y:fromY,z:v0.z},vx:v0.x,vy:v0.y,vz:v0.vz,duration:0.72};
  }
  m.ball={mode:'DEAD',x:bx,y:by,z:0,vx:0,vy:0,vz:0,ownerId:null,kind,lastTouchTeam:m.lastTouchTeam,lastTouchPlayer:m.lastTouchPlayer};m.ballOwner=null;m.possession=team;m.phase=kind;
  m.restart={kind,team,x,y,until:m.time+(kind==='THROW_IN'?1.35:0.9),stage:deferredOffside?'CALL_REVIEW':'SETUP',setupStartedAt:m.time,ballReturn,deferredDeadClock:deferredOffside,callReviewUntil:deferredOffside?m.time+3.60:null,offsideCoast:deferredOffside?(m._pendingOffsideCoast||null):null};m._pendingOffsideCoast=null;m.nextShape=m.time;
  if(deferredOffside){
    // Hold the actual positions for a 3-4 second review beat so the pass/run and referee call are readable before
    // the dead-clock jump. This is presentation continuity, not delayed result computation.
    for(const p of m.players){p.tx=p.x;p.ty=p.y;p.vx*=.25;p.vy*=.25;p.action='OFFSIDE_CALL_REVIEW';p.tacticalTask='OFFSIDE_CALL_REVIEW';p.sprint=false;if(Number.isFinite(m.ball.x)&&Number.isFinite(m.ball.y))p.faceTargetAngle=Math.atan2(m.ball.y-p.y,m.ball.x-p.x);}
  }else if(RESTARTS&&typeof RESTARTS.begin==='function'){
    // R16 feedback: restart setup owns targets, not player coordinates. The thrower now
    // walks/runs from the live out-of-play position to the touchline instead of teleporting.
    RESTARTS.begin(m);
  }}
function updateDeadBallReturn(m,r){
  const br=r?.ballReturn;if(!br)return true;
  if(br.phase==='OUT_HOLD'){if(m.time<br.holdUntil)return false;br.phase='RETURNING';}
  if(br.phase==='RETURNING'){
    const u=clamp((m.time-br.holdUntil)/Math.max(.01,br.returnUntil-br.holdUntil),0,1);
    let tx=br.to.x,ty=br.to.y;
    if(r.kind==='GOAL_KICK'){const gk=teamPlayers(m,r.team).find(p=>p.role==='GK');if(gk){tx=gk.x;ty=gk.y;}}
    const e=u*u*(3-2*u);m.ball.mode='DEAD';m.ball.x=lerp(br.from.x,tx,e);m.ball.y=lerp(br.from.y,ty,e);m.ball.z=0;
    if(u<1)return false;
    if(r.kind==='GOAL_KICK'){const gk=teamPlayers(m,r.team).find(p=>p.role==='GK');if(gk){setControlled(m,gk);gk.nextThink=Number.POSITIVE_INFINITY;br.phase='KEEPER_CARRY';return false;}}
    m.ball.mode='DEAD';m.ball.x=r.x;m.ball.y=r.y;br.phase='SETUP_READY';return true;
  }
  if(br.phase==='KEEPER_CARRY'){
    const gk=teamPlayers(m,r.team).find(p=>p.role==='GK');if(!gk){br.phase='SETUP_READY';return true;}
    m.ball.mode='CONTROLLED';m.ball.ownerId=gk.id;m.ballOwner=gk.id;gk.hasBall=true;m.ball.x=gk.x+dir(gk.team)*0.42;m.ball.y=gk.y;m.ball.z=0;
    const setup=RESTARTS&&typeof RESTARTS.readiness==='function'?RESTARTS.readiness(m):null;
    if(setup?.kickerReady){br.phase='SETUP_READY';m.ball.mode='DEAD';m.ball.ownerId=null;m.ballOwner=null;gk.hasBall=false;m.ball.x=r.x;m.ball.y=r.y;return true;}
    return false;
  }
  return true;
}
function performRestart(m){
  const r=m.restart;if(!r)return false;
  if(r.kind==='OFFSIDE'&&r.stage==='CALL_REVIEW'){
    const coast=r.offsideCoast;if(coast){const age=Math.max(0,m.time-coast.startedAt),dur=Math.max(.15,coast.duration||.72),u=clamp(age/dur,0,1),travel=(1-Math.pow(1-u,3))*dur/3;
      m.ball.mode='DEAD';m.ball.x=clamp(coast.from.x+coast.vx*travel,-1.2,106.2);m.ball.y=clamp(coast.from.y+coast.vy*travel,-1.2,69.2);m.ball.z=Math.max(0,(coast.from.z||0)+(coast.vz||0)*age-4.905*age*age);
      if(u>=1)r.offsideCoast=null;}
    if(m.time<(r.callReviewUntil||m.time))return false;
    if(r.deferredDeadClock){consumeCompressedDeadClock(m,'OFFSIDE');r.deferredDeadClock=false;}
    r.stage='SETUP';r.setupStartedAt=m.time;r.until=m.time+.90;
    r.ballReturn={phase:'OUT_HOLD',startedAt:m.time,holdUntil:m.time+.18,returnUntil:m.time+.92,from:{x:m.ball.x,y:m.ball.y},to:{x:r.x,y:r.y}};
    if(RESTARTS&&typeof RESTARTS.begin==='function')RESTARTS.begin(m);
  }
  if(!updateDeadBallReturn(m,r))return false;
  const approachStage=['RUN_UP','APPROACH'].includes(r.stage),ready=approachStage?true:(r.kind==='KICKOFF'?m.time>=r.until:(RESTARTS&&typeof RESTARTS.isReady==='function'?RESTARTS.isReady(m):m.time>=r.until));if(!ready)return false;
  if(r.kind==='KICKOFF'){if(m.ball.mode==='DEAD'||!m.ball.ownerId)placeKickoff(m,r.team);const owner=playerById(m,m.ball.ownerId);if(owner)owner.nextThink=m.time+(owner.role==='GK'?0.70:1.10);m.kickoffBuildUntil=m.time+5.5;m.phase='OPEN_PLAY';m.restart=null;return true;}
  if(r.kind==='THROW_IN'){
    const plan=RESTARTS&&typeof RESTARTS.chooseThrowPlan==='function'?RESTARTS.chooseThrowPlan(m):null;
    const thrower=plan?playerById(m,plan.throwerId):outfield(m,r.team).sort((a,b)=>dist(a,{x:r.x,y:r.y})-dist(b,{x:r.x,y:r.y}))[0];
    const receiver=plan?playerById(m,plan.receiverId):null;
    if(!thrower||!receiver)return false;
    thrower.vx=thrower.vy=0;
    m.ball.x=r.x;m.ball.y=r.y;m.ball.z=0;
    const d=Math.max(1,dist(thrower,receiver));
    setBallFlight(m,{source:thrower,target:receiver,kind:'THROW_IN',speed:clamp(8.8+d*0.24,9.2,12.4),loft:clamp(0.75+d*0.055,0.85,1.45),targetPoint:plan.targetPoint,deliveryMode:'AERIAL'});
    m.stats.throwInFlights=(m.stats.throwInFlights||0)+1;m.phase='OPEN_PLAY';m.restart=null;m.nextShape=m.time;return true;
  }
  if(r.kind==='GOAL_KICK'){
    const plan=RESTARTS&&typeof RESTARTS.chooseGoalKickPlan==='function'?RESTARTS.chooseGoalKickPlan(m):null;
    const keeper=plan?playerById(m,plan.kickerId):teamPlayers(m,r.team).find(p=>p.role==='GK');
    if(!keeper||!plan)return false;
    keeper.vx=keeper.vy=0;m.ball.x=r.x;m.ball.y=r.y;m.ball.z=0;
    setBallFlight(m,{source:keeper,target:null,kind:'GOAL_KICK',speed:plan.speed,loft:plan.loft,targetPoint:plan.targetPoint,deliveryMode:'AERIAL'});
    keeper.faceTargetAngle=null;if(RESTARTS&&typeof RESTARTS.beginGoalKickFlight==='function')RESTARTS.beginGoalKickFlight(m,plan);
    m.stats.longGoalKicks=(m.stats.longGoalKicks||0)+1;keeper.nextThink=m.time+1.0;
    event(m,'GOAL_KICK_LONG',`${subjectName(keeper.name)} 전방으로 길게 골킥을 보냅니다.`);
    m.phase='OPEN_PLAY';m.restart=null;m.nextShape=m.time+(plan.airTime||2.4)+0.20;return true;
  }
  if(r.kind==='CORNER'||r.kind==='FREE_KICK'||r.kind==='OFFSIDE'){
    const plannedId=RESTARTS&&typeof RESTARTS.kickerId==='function'?RESTARTS.kickerId(m):null,kicker=plannedId?playerById(m,plannedId):null;if(!kicker)return false;
    if(r.kind==='CORNER'&&r.stage==='SETUP'){r.stage='SET_HOLD';r.setHoldUntil=m.time+0.80;kicker.action='CORNER_SET_WAIT';kicker.tacticalTask='CORNER_SET_WAIT';kicker.sprint=false;return false;}
    if(r.kind==='CORNER'&&r.stage==='SET_HOLD'){kicker.action='CORNER_SET_WAIT';kicker.tacticalTask='CORNER_SET_WAIT';kicker.sprint=false;if(m.time<(r.setHoldUntil||m.time))return false;r.stage='RUN_UP';r.runUpStartedAt=m.time;kicker.tx=r.x;kicker.ty=r.y;kicker.action='CORNER_RUN_UP';kicker.tacticalTask='CORNER_RUN_UP';return false;}
    if(r.kind==='CORNER'&&r.stage==='RUN_UP'){kicker.tx=r.x;kicker.ty=r.y;kicker.action='CORNER_RUN_UP';kicker.tacticalTask='CORNER_RUN_UP';kicker.sprint=false;if(dist(kicker,{x:r.x,y:r.y})>.42)return false;}
    if(r.kind!=='CORNER'&&r.stage!=='APPROACH'){r.stage='APPROACH';kicker.tx=r.x;kicker.ty=r.y;kicker.action=r.kind==='OFFSIDE'?'OFFSIDE_RESTART_APPROACH':'FREE_KICK_APPROACH';kicker.tacticalTask=kicker.action;kicker.sprint=false;return false;}
    if(r.kind!=='CORNER'&&r.stage==='APPROACH'&&dist(kicker,{x:r.x,y:r.y})>.42){kicker.tx=r.x;kicker.ty=r.y;kicker.action=r.kind==='OFFSIDE'?'OFFSIDE_RESTART_APPROACH':'FREE_KICK_APPROACH';kicker.tacticalTask=kicker.action;kicker.sprint=false;return false;}
    if(dist(kicker,{x:r.x,y:r.y})>.35){kicker.x=r.x;kicker.y=r.y;}kicker.tx=r.x;kicker.ty=r.y;kicker.vx=kicker.vy=0;kicker.hasBall=false;m.ball.x=r.x;m.ball.y=r.y;m.ball.z=0;m.ball.mode='DEAD';m.ball.ownerId=null;m.ballOwner=null;
    const mates=teamPlayers(m,r.team).filter(p=>p.id!==kicker.id&&p.role!=='GK');let target=null;
    if(r.kind==='CORNER')target=mates.filter(p=>['ST','WF','CM'].includes(p.role)).sort((a,b)=>{const la=worldToLocal(r.team,a.x,a.y),lb=worldToLocal(r.team,b.x,b.y);return ((105-la.x)+Math.abs(la.y-34)*.10)-((105-lb.x)+Math.abs(lb.y-34)*.10);})[0]||mates[0];
    else target=mates.sort((a,b)=>worldToLocal(r.team,b.x,b.y).x-worldToLocal(r.team,a.x,a.y).x)[0]||mates[0];if(!target)return false;
    const d=Math.max(1,dist(kicker,target)),advanced=worldToLocal(r.team,r.x,r.y).x>=68,flightKind=r.kind==='CORNER'?'CROSS':(advanced?'CROSS':'PASS'),loft=flightKind==='CROSS'?(r.kind==='CORNER'?clamp(3.0+d*.012,3.25,3.85):clamp(3.7+d*.018,4.0,4.8)):0,speed=flightKind==='CROSS'?clamp(18.5+d*.10,19,23):clamp(12+d*.16,13,18);
    if(flightKind==='CROSS'){target.tx=target.x;target.ty=target.y;target.lockTargetUntil=Math.max(target.lockTargetUntil||0,m.time+3.2);target.nextThink=Math.max(target.nextThink||0,m.time+3.2);target.action='ATTACK_CROSS_ZONE';target.tacticalTask='ATTACK_CROSS_ZONE';m.stats.crosses=(m.stats.crosses||0)+1;m.stats.crossesByTeam[r.team]=(m.stats.crossesByTeam[r.team]||0)+1;}
    // TT-0.51 1_3: capture the actual wall membership before the restart object disappears.
    // After the strike, each wall member is released toward its own defensive role-zone instead
    // of remaining as one central set-piece cluster or receiving a blanket spread command.
    const freeKickWallIds=r.kind==='FREE_KICK'?Object.entries(r.setup?.targets||{}).filter(([,t])=>t?.task==='FREE_KICK_WALL').map(([id])=>id):[];
    setBallFlight(m,{source:kicker,target,targetPoint:{x:target.x,y:target.y},kind:flightKind,speed,loft,deliveryMode:flightKind==='CROSS'?'AERIAL':'GROUND'});
    if(freeKickWallIds.length){
      const wallTeam=other(r.team);m.setPieceWallRecovery={team:wallTeam,wallIds:freeKickWallIds,startedAt:m.time,until:m.time+2.6};
      for(const id of freeKickWallIds){const wp=playerById(m,id);if(!wp)continue;wp.pressCommitUntil=0;wp.markTargetId=null;wp.pressRecoverUntil=Math.max(wp.pressRecoverUntil||0,m.time+1.35);}
    }
    event(m,r.kind==='CORNER'?'CORNER_KICK':r.kind==='OFFSIDE'?'OFFSIDE_RESTART':'FREE_KICK_TAKEN',`${subjectName(kicker.name)} ${r.kind==='CORNER'?'뒤로 물러난 뒤 도움닫기해 코너킥 크로스를 올립니다.':r.kind==='OFFSIDE'?'오프사이드 지점에서 동료들이 자리를 잡은 뒤 프리킥으로 재개합니다.':'정지된 공 앞에서 준비한 뒤 경기를 재개합니다.'}`);
    m.phase='OPEN_PLAY';m.restart=null;m.nextShape=m.time+.12;kicker.nextThink=m.time+.75;return true;
  }
  let owner;
  const plannedId=RESTARTS&&typeof RESTARTS.kickerId==='function'?RESTARTS.kickerId(m):null;
  if(plannedId)owner=playerById(m,plannedId);else if(r.kind==='GOAL_KICK')owner=teamPlayers(m,r.team).find(p=>p.role==='GK');
  else owner=outfield(m,r.team).sort((a,b)=>dist(a,{x:r.x,y:r.y})-dist(b,{x:r.x,y:r.y}))[0];
  if(!owner)return false;owner.vx=owner.vy=0;setControlled(m,owner);owner.nextThink=m.time+(owner.role==='GK'?0.70:1.35);m.phase='OPEN_PLAY';m.restart=null;m.nextShape=m.time+0.20;return true;
}
function updateBall(m,dt){
  if(m.ball.mode==='FLIGHT'&&Math.abs(m.ball.curveAccel||0)>0.01&&m.ball.age<1.35){const sp=Math.hypot(m.ball.vx,m.ball.vy);if(sp>0.5){const nx=m.ball.vx/sp,ny=m.ball.vy/sp,px=-ny,py=nx,a=m.ball.curveAccel;m.ball.vx+=px*a*dt;m.ball.vy+=py*a*dt;const ns=Math.hypot(m.ball.vx,m.ball.vy)||sp;m.ball.vx*=sp/ns;m.ball.vy*=sp/ns;}}
  if(m.ball.mode==='CONTROLLED'){
    const p=playerById(m,m.ball.ownerId);if(!p){m.ball.mode='LOOSE';return;}m.ballOwner=p.id;const tx=p.x+dir(p.team)*0.42,ty=p.y;if((m.ball.attachBlend||0)>0){const dx=tx-m.ball.x,dy=ty-m.ball.y,d=Math.hypot(dx,dy),step=Math.min(d,9*dt);if(d>0.001){m.ball.x+=dx/d*step;m.ball.y+=dy/d*step;}m.ball.attachBlend=Math.max(0,m.ball.attachBlend-dt);}else{m.ball.x=tx;m.ball.y=ty;}m.ball.z=0;return;
  }
  if(m.ball.mode==='DEAD')return;
  const prev={x:m.ball.x,y:m.ball.y};m.ball.age=(m.ball.age||0)+dt;
  m.ball.x+=m.ball.vx*dt;m.ball.y+=m.ball.vy*dt;
  if(m.ball.mode==='FLIGHT'){
    if(m.ball.airborne){
      if(m.ball.arcProfile==='CHIP_LOB'&&m.ball.arcDuration>0){
        const u=clamp(m.ball.age/m.ball.arcDuration,0,1),h=m.ball.arcHeight||3.65;
        m.ball.z=Math.max(0,4*h*u*(1-u));m.ball.vz=(4*h*(1-2*u))/m.ball.arcDuration;
        if(u>=1){m.ball.z=0;m.ball.vz=0;m.ball.airborne=false;m.ball.vx*=0.88;m.ball.vy*=0.88;}
      }else{
        m.ball.z=Math.max(0,m.ball.z+m.ball.vz*dt);m.ball.vz-=9.81*dt;
        if(m.ball.z<=0&&m.ball.vz<0){m.ball.z=0;m.ball.vz=0;m.ball.airborne=false;m.ball.vx*=0.88;m.ball.vy*=0.88;}
      }
    }else{m.ball.z=0;const drag=Number.isFinite(m.ball.groundDragK)?Math.max(0,Number(m.ball.groundDragK)):0.11,f=Math.exp(-drag*dt);m.ball.vx*=f;m.ball.vy*=f;}
  }else{const f=Math.max(0,1-0.55*dt);m.ball.vx*=f;m.ball.vy*=f;if(Math.hypot(m.ball.vx,m.ball.vy)<0.4){m.ball.vx=m.ball.vy=0;}}
  const cross=boundaryCross(prev,m.ball);if(cross){handleOut(m,cross);return;}
  if(m.ball.mode==='FLIGHT'&&m.ball.kind==='CROSS_DEFLECTION'&&!m.ball.airborne){const x=m.ball.x,y=m.ball.y,vx=m.ball.vx,vy=m.ball.vy,lastTeam=m.ball.lastTouchTeam,lastPlayer=m.ball.lastTouchPlayer;setLoose(m,x,y,vx,vy,lastTeam,lastPlayer);m.ball.noCaptureIds=[lastPlayer];m.ball.noCaptureUntil=0.14;return;}
  if(tryShotBlock(m,prev))return;
  if(tryCrossReleaseBlock(m,prev))return;
  if(tryChipGKIntervention(m,prev))return;
  if(trySegmentInterception(m,prev))return;
  if(resolveCrossLanding(m))return;
  if(resolveLongPassAerialContest(m))return;
  if(resolveGoalKickAerialContest(m))return;
  captureLooseOrFlight(m);
  if(m.ball.mode==='FLIGHT'&&m.ball.kind!=='SHOT'){
    const td=m.ball.targetX==null?99:Math.hypot(m.ball.x-m.ball.targetX,m.ball.y-m.ball.targetY),targetOutside=Number.isFinite(m.ball.targetX)&&Number.isFinite(m.ball.targetY)&&(m.ball.targetX<0||m.ball.targetX>105||m.ball.targetY<0||m.ball.targetY>68),preserveBoundaryContinuity=!!m.ball.receiverIntentLock&&targetOutside;
    // A qualifying pressured-wide long pass whose physical strike target is already outside the
    // field must be allowed to cross the line. Do not terminate its flight merely because it has
    // entered the generic 0.70m target-arrival radius while still centimetres inside the pitch.
    if((td<0.70&&m.ball.age>0.18&&!preserveBoundaryContinuity)||m.ball.age>4.2){const vx=m.ball.vx*0.58,vy=m.ball.vy*0.58,lastTeam=m.ball.lastTouchTeam,lastPlayer=m.ball.lastTouchPlayer,x=m.ball.x,y=m.ball.y;setLoose(m,x,y,vx,vy,lastTeam,lastPlayer);m.stats.looseBalls++;}
  }
}
function updateLooseChasers(m){
  if(m.ball.mode!=='LOOSE')return;
  for(const team of [HOME,AWAY]){
    const nearest=teamPlayers(m,team).map(p=>({p,d:dist(p,m.ball)})).sort((a,b)=>a.d-b.d)[0];if(!nearest)continue;const p=nearest.p;p.tx=m.ball.x;p.ty=m.ball.y;p.action=p.role==='GK'?'GK_RUSH':'CHASE_LOOSE';p.sprint=true;
  }
}
function maybeOffside(m){
  // Law 11 reference is still frozen at RELEASE. HF3 changes only when the referee call becomes
  // visible: let the real pass/run develop until the intended receiver is involved with the ball.
  if(m.ball.mode!=='FLIGHT'||!m.ball.intendedReceiverId||m.ball.offsideCalled||m.ball.age<0.24||m.ball.age>1.90)return;
  const t=playerById(m,m.ball.intendedReceiverId),source=playerById(m,m.ball.lastTouchPlayer);if(!t||!source||source.team!==t.team)return;
  if(m.ball.offsideAtRelease===true){
    const involvementGap=dist(t,m.ball),involved=involvementGap<=2.55||m.ball.age>=1.65;
    if(!involved)return;
    m.ball.offsideCalled=true;m.stats.offsides++;event(m,'OFFSIDE',`${subjectName(t.name)} 오프사이드 위치에 있었습니다.`,{actorId:t.id,team:t.team,releaseFrozen:true,involvementGap:Number(involvementGap.toFixed(3)),flightAge:Number(m.ball.age.toFixed(3))});startDeadRestart(m,'OFFSIDE',other(t.team),t.x,t.y);
  }
}
function updatePossessionClock(m,dt){
  if(m.ball.mode==='DEAD'||!m.possession)return;
  const team=m.possession,st=m.stats;
  st.possessionSeconds[team]+=dt;
  if(m.time<=2700)st.firstHalfPossession[team]+=dt;else st.secondHalfPossession[team]+=dt;
  if(st.currentPossessionTeam!==team){
    if(st.currentPossessionTeam){const old=st.currentPossessionTeam,dur=Math.max(0,m.time-st.currentPossessionStartedAt);st.longestPossession[old]=Math.max(st.longestPossession[old],dur);}
    st.currentPossessionTeam=team;st.currentPossessionStartedAt=m.time;
  }
}
function updateBoxEntryStats(m){
  for(const p of m.players){
    if(p.role==='GK')continue;const inside=inOppPenaltyArea(p.team,p.x,p.y);
    if(inside&&!p.wasInOppBox&&m.time-(p.lastBoxEntryAt||-99)>6.0){if(p.role==='ST')m.stats.boxEntriesST++;else if(p.role==='WF')m.stats.boxEntriesWF++;else if(p.role==='CM')m.stats.boxEntriesCM++;p.lastBoxEntryAt=m.time;}
    p.wasInOppBox=inside;
  }
}
function possessionPct(obj){const total=(obj.HOME||0)+(obj.AWAY||0);return total?{HOME:(obj.HOME||0)/total*100,AWAY:(obj.AWAY||0)/total*100}:{HOME:50,AWAY:50};}
function phaseName(m){
  if(m.completed)return'FULL_TIME';if(m.ball.mode==='DEAD')return m.phase;
  const x=worldToLocal(m.possession,m.ball.x,m.ball.y).x;if(m.transitionUntil>m.time)return'TRANSITION';if(x<28)return'BUILD_UP';if(x<60)return'PROGRESSION';if(x<80)return'FINAL_THIRD';return'CHANCE';
}
function finalWhistleDanger(m){
  if(m.restart&&['CORNER','FREE_KICK','THROW_IN'].includes(m.restart.kind))return true;
  if(m.ball.mode==='FLIGHT'&&['SHOT','CROSS','THROUGH'].includes(m.ball.kind))return true;
  const team=m.possession,lp=worldToLocal(team,m.ball.x,m.ball.y).x;
  if(lp>=84&&(m.phase==='CHANCE'||m.phase==='FINAL_THIRD'||inOppPenaltyArea(team,m.ball.x,m.ball.y)))return true;
  if(m.ball.mode==='LOOSE'&&lp>=86)return true;
  return false;
}
function step(m,dt=m.dt){
  if(m.completed)return m;dt=clamp(Number(dt)||m.dt,0.02,0.15);m.time+=dt;
  if(m.time>=5400){
    if(!Number.isFinite(m.fullTimeGraceUntil))m.fullTimeGraceUntil=5408;
    if(!(finalWhistleDanger(m)&&m.time<m.fullTimeGraceUntil)){
      m.completed=true;m.phase='FULL_TIME';m.ball.mode='DEAD';for(const p of m.players){p.vx=p.vy=0;p.tx=p.x;p.ty=p.y;}event(m,'FULL_TIME',`경기 종료 ${m.score.HOME}-${m.score.AWAY}`);if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.tick==='function')TELEMETRY.tick(m);return m;
    }
  }
  if(m.restart){performRestart(m);if(m.restart){if(m.phase==='GOAL_CELEBRATION')updateGoalCelebrationTargets(m);else if(m.restart.kind!=='KICKOFF'&&RESTARTS&&typeof RESTARTS.assign==='function'&&m.time>=m.nextShape){RESTARTS.assign(m);m.nextShape=m.time+0.20;}movePlayers(m,dt);if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.tick==='function')TELEMETRY.tick(m);return m;}}
  if(RESTARTS&&typeof RESTARTS.updateGoalKickFlight==='function')RESTARTS.updateGoalKickFlight(m);
  if(m.time>=m.nextShape){assignShape(m);m.nextShape=m.time+0.25;}
  // V18 GK reach V1: once a shot is in flight, refresh only the defending goalkeeper's
  // physical shot-path response every physics tick. Generic team shape remains on the existing
  // 0.25s cadence, so this does not accelerate pressing/marking or alter shot generation.
  if(m.ball.mode==='FLIGHT'&&m.ball.kind==='SHOT'&&TACTICS&&typeof TACTICS.updateGoalkeeperShotReaction==='function'){
    for(const p of m.players)if(p.role==='GK'&&p.team!==m.ball.shotTeam)TACTICS.updateGoalkeeperShotReaction(m,p);
  }
  if(m.ball.mode==='LOOSE')updateLooseChasers(m);
  movePlayers(m,dt);updateTakeOnDuels(m);updateBall(m,dt);maybeOffside(m);updateDuelEpisode(m);tryChallenges(m,dt);updatePendingShots(m);updatePossessionClock(m,dt);updateBoxEntryStats(m);
  if(m.ball.mode==='CONTROLLED'){const owner=playerById(m,m.ball.ownerId);if(owner&&materialControlReady(m,owner)){
    let controllerPreempt=false;
    if(m.protagonistControllerId===owner.id){const si=shotAssessment(m,owner),controlAge=m.time-(owner.controlledSince||m.time),newlyControlled=controlAge<=0.34,sl=worldToLocal(owner.team,owner.x,owner.y),decisiveReceive=['ST','WF','CM'].includes(owner.role)&&sl.x>=79.5&&si.dGoal<=27&&Math.abs(sl.y-34)<=17&&si.blockers.length<=1;
      // STEP75: the protagonist controller owns the first decision beat after EVERY fresh
      // reception. TT-0.40 could let owner AI schedule SHOT_PREP on the same frame and then
      // show the user HOLD, producing HOLD -> turning shot. The grace is only 0.34s and does
      // not force a pause; if no user checkpoint is warranted, normal AI resumes immediately.
      controllerPreempt=newlyControlled;if(controllerPreempt)owner.nextThink=Math.max(owner.nextThink||0,m.time+(decisiveReceive?0.30:0.24));}
    if(!controllerPreempt)ownerThink(m,owner);
  }}
  let crowd=0;for(const p of m.players)if(dist(p,m.ball)<=8)crowd++;m.stats.maxCrowd=Math.max(m.stats.maxCrowd,crowd);
  for(let i=0;i<m.players.length;i++)for(let j=i+1;j<m.players.length;j++)m.stats.minSpacing=Math.min(m.stats.minSpacing,dist(m.players[i],m.players[j]));
  if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.tick==='function')TELEMETRY.tick(m);
  return m;
}

function applyResolvedOwnerAction(m,owner,action){
  if(!owner||!action)return false;owner.receiveRunContinuationUntil=0;
  const npcDecision=!(m.protagonistExplicitActionRequired===true&&m.protagonistControllerId===owner.id);
  if(npcDecision&&action.type==='PASS'&&action.target){
    const ol=worldToLocal(owner.team,owner.x,owner.y),tl=worldToLocal(owner.team,action.target.x,action.target.y),backward=tl.x<ol.x-4.0;
    if(backward){
      const sa=shotAssessment(m,owner),blockers=Array.isArray(sa.blockers)?sa.blockers.length:Number(sa.blockers||0),central=Math.abs(ol.y-34),bodyReady=!!sa.oneVOne||(!sa.turningRequired&&Number(sa.facingAlignment??1)>=.38),strongFinish=!!sa.inBox&&!!sa.openWindow&&blockers===0&&sa.dGoal<=18.5&&central<=12.5&&bodyReady&&['ST','WF','CM'].includes(owner.role);
      if(strongFinish){action={type:'SHOT',reason:'STRONG_ATTACK_NO_HARMFUL_BACKPASS'};m.stats.strongAttackBackpassGuards=(m.stats.strongAttackBackpassGuards||0)+1;}
      else{
        const recentThroughBreak=owner.lastReceivedFlightKind==='THROUGH'&&m.time-(owner.lastReceivedPassAt||-99)<=1.45&&ol.x>=82&&sa.dGoal<=25&&blockers===0&&Number(sa.facingAlignment??0)>=.58&&['ST','WF','CM'].includes(owner.role);
        if(recentThroughBreak){action={type:'CARRY',reason:'THROUGH_RECEIVE_NO_HARMFUL_BACKPASS'};m.stats.strongAttackBackpassGuards=(m.stats.strongAttackBackpassGuards||0)+1;}
        else{const opts=passOptions(m,owner,true),runner=opts.filter(o=>o?.p?.role==='ST'&&!o.offsideRisk&&o.block===0&&o.open>=1.2&&o.forward>=2.5&&(o.running||['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p?.tacticalTask))&&o.leadForward>=2.5).sort((a,b)=>b.leadForward-a.leadForward)[0]||null;
        if(runner){action={type:'PASS',target:runner.p,kind:'THROUGH',option:runner,reason:'COMMITTED_RUNNER_NO_HARMFUL_BACKPASS'};m.stats.strongAttackBackpassGuards=(m.stats.strongAttackBackpassGuards||0)+1;}}
      }
    }
  }
  owner.lastActionAt=m.time;owner.lastDecision=action.type;if(inOppPenaltyArea(owner.team,owner.x,owner.y)&&['ST','WF','CM'].includes(owner.role))m.stats.boxFinalActions++;
  if(action.type==='SHOT')executeShot(m,owner,action.reason||'GENERAL');
  else if(action.type==='DRAW_FOUL')executeDrawFoul(m,owner);
  else if(action.type==='PASS')executePass(m,owner,action.target,action.kind,action.option||null,action.reason||null);
  else if(action.type==='GK_CLEAR')executeGKClear(m,owner);
  else if(action.type==='TAKE_ON')executeTakeOn(m,owner,action.takeOn);
  else if(action.type==='HOLD'){owner.action='SHIELD_SCAN';owner.tacticalTask='SHIELD_SCAN';owner.sprint=false;owner.nextThink=m.time+0.55;owner.lockTargetUntil=0;}
  else if(action.type==='TURN_BACK'){
    const l=worldToLocal(owner.team,owner.x,owner.y),w=localToWorld(owner.team,Math.max(76,l.x-8),clamp(lerp(l.y,34,0.22),4,64));owner.tx=w.x;owner.ty=w.y;owner.action='TURN_BACK';owner.sprint=false;owner.nextThink=m.time+0.95;owner.lockTargetUntil=owner.nextThink;
  }else if(action.type==='CARRY')executeCarry(m,owner,{userCommitted:action.reason==='CANDIDATE_CARRY'||action.reason==='CLEAR_RUNWAY'});
  else executeCarry(m,owner);
  return true;
}
function incomingBallChoiceState(m,owner){
  if(!owner||m.ball.mode!=='FLIGHT'||m.ball.intendedReceiverId!==owner.id||m.ball.lastTouchTeam!==owner.team)return null;
  const kind=m.ball.kind,eligible=new Set(['PASS','LONG_PASS','THROUGH','CUTBACK','CROSS']);if(!eligible.has(kind))return null;
  const rx=owner.x-m.ball.x,ry=owner.y-m.ball.y,d=Math.hypot(rx,ry);if(d<0.05)return null;
  const rvx=(m.ball.vx||0)-(owner.vx||0),rvy=(m.ball.vy||0)-(owner.vy||0),closing=(rx*rvx+ry*rvy)/d;
  if(closing<=0.45)return null;const receiveRadius=(CONTROL_RADIUS[owner.role]||1.05)+(kind==='CROSS'?.20:.72),eta=Math.max(.055,(d-receiveRadius)/closing);if(eta>0.92)return null;
  const contactX=clamp(m.ball.x+(m.ball.vx||0)*eta,1,104),contactY=clamp(m.ball.y+(m.ball.vy||0)*eta,1,67);
  let contactZ;if(m.ball.airborne){contactZ=Math.max(0,(m.ball.z||0)+(m.ball.vz||0)*eta-4.905*eta*eta);}else contactZ=0;
  contactZ=Number(contactZ.toFixed(3));const local=worldToLocal(owner.team,contactX,contactY),goalX=oppGoalX(owner.team),dGoal=Math.hypot(goalX-contactX,34-contactY),central=Math.abs(local.y-34),incomingSpeed=Math.hypot(m.ball.vx||0,m.ball.vy||0),pressure=nearestOppDistance(m,owner);
  const contact={x:contactX,y:contactY},line=offsideLine(m,owner.team),isTargetOffside=t=>owner.team===HOME?(t.x>52.5&&t.x>contactX+.25&&t.x>line+.25):(t.x<52.5&&t.x<contactX-.25&&t.x<line-.25);
  const targets=teamPlayers(m,owner.team).filter(t=>t.id!==owner.id&&t.role!=='GK'&&dist(contact,t)>=3&&dist(contact,t)<=30&&!isTargetOffside(t)&&laneBlockers(m,contact,t,other(owner.team)).length===0)
    .map(t=>({t,d:dist(contact,t),open:nearestOppDistance(m,t),forward:dir(owner.team)*(t.x-contactX)})).filter(o=>o.open>=1.15).sort((a,b)=>(b.forward-a.forward)+(b.open-a.open)*.22+(a.d-b.d)*.025);
  const candidates=[{id:'TRAP_CONTROL',score:0,reason:'live_receive_control',targetId:null,targetName:null,meta:{eta,contactZ,incomingSpeed,pressure,flightKind:kind}}];
  const passSkill=(abilityValue(m,owner,'short_pass')+abilityValue(m,owner,'vision')+abilityValue(m,owner,'ball_control'))/3;
  if(contactZ<=0.72&&incomingSpeed<=24.5&&passSkill>=45){for(const o of targets.slice(0,2))candidates.push({id:'ONE_TOUCH_PASS',score:1.0+o.forward*.025+o.open*.05,reason:'live_one_touch_lane',targetId:o.t.id,targetName:o.t.name,meta:{targetId:o.t.id,targetSlot:o.t.slot,eta,contactZ,incomingSpeed,forward:o.forward,d:o.d,receiverPressure:o.open,flightKind:kind}});}
  const shotGeometry=dGoal<=27.5&&central<=19.0&&local.x>=76,airborne=contactZ>=0.38;
  if(shotGeometry&&contactZ<=0.78)candidates.push({id:'DIRECT_SHOT',score:2.2,reason:'live_direct_finish',targetId:null,targetName:null,meta:{eta,contactZ,incomingSpeed,dGoal,flightKind:kind}});
  if(shotGeometry&&airborne&&contactZ>=0.42&&contactZ<=1.38&&incomingSpeed<=25)candidates.push({id:'VOLLEY_SHOT',score:2.35,reason:'live_volley_finish',targetId:null,targetName:null,meta:{eta,contactZ,incomingSpeed,dGoal,flightKind:kind}});
  const headHeight=contactZ>=0.88&&contactZ<=1.95&&incomingSpeed<=25.5,headingSkill=(abilityValue(m,owner,'heading')+abilityValue(m,owner,'anticipation'))/2;
  if(headHeight&&headingSkill>=42){for(const o of targets.slice(0,2))candidates.push({id:'HEADER_PASS',score:.95+o.forward*.02+o.open*.04,reason:'live_header_redirect',targetId:o.t.id,targetName:o.t.name,meta:{targetId:o.t.id,targetSlot:o.t.slot,eta,contactZ,incomingSpeed,forward:o.forward,d:o.d,receiverPressure:o.open,flightKind:kind}});if(dGoal<=20&&central<=18&&local.x>=84)candidates.push({id:'HEADER_SHOT',score:2.55,reason:'live_header_finish',targetId:null,targetName:null,meta:{eta,contactZ,incomingSpeed,dGoal,flightKind:kind}});}
  return{kind:'INCOMING_BALL',playerId:owner.id,team:owner.team,role:owner.role,slot:owner.slot,time:m.time,localX:local.x,localY:local.y,eta:Number(eta.toFixed(3)),contactX:Number(contactX.toFixed(3)),contactY:Number(contactY.toFixed(3)),contactZ,incomingSpeed:Number(incomingSpeed.toFixed(3)),pressure,flightKind:kind,sourceId:m.ball.lastTouchPlayer,candidates};
}
function matchingIncomingIntent(m,p,flightKind,sourceId){
  const x=m.userIncomingIntent;if(!x||x.playerId!==p.id)return null;if(m.time>(x.expiresAt||0)||x.sourceId!==sourceId||x.flightKind!==flightKind||Math.abs(Number(x.originX)-Number(m.ball.originX))>.02||Math.abs(Number(x.originY)-Number(m.ball.originY))>.02){if(x.playerId===p.id)m.userIncomingIntent=null;return null;}return x;
}
function recordInboundCompletion(m,p,flightKind,sourceId,passTeam){
  const trace=m.lastUserDirectedPassTrace;if(trace&&trace.outcome==='IN_FLIGHT'&&trace.sourceId===sourceId){trace.firstControllerId=p.id;trace.outcome=p.id===trace.resolvedTargetId?'SELECTED_TARGET_CONTROL':'OTHER_TEAMMATE_CONTROL';trace.resolvedAt=Number(m.time.toFixed(3));}
  if(['PASS','LONG_PASS','THROUGH','CUTBACK'].includes(flightKind)&&p.team===passTeam)m.stats.completedPasses++;
  p.lastReceivedFromId=sourceId;p.lastReceivedFlightKind=flightKind;p.lastReceivedPassAt=m.time;p.runUntil=0;p.runType=null;m.possession=p.team;
}
function executeHeaderPass(m,p,target){
  const d=dist(p,target),speed=clamp(10.5+d*.18,10.8,15.5),loft=clamp(0.55+d*.025,.60,1.20),forward=dir(p.team)*(target.x-p.x);m.stats.passes++;if(forward>10)m.stats.progressivePasses++;m.lastPassAt[p.team]=m.time;target.tx=target.x;target.ty=target.y;target.action='MOVE_TO_RECEIVE';target.sprint=false;target.lockTargetUntil=m.time+clamp(d/speed+.40,.65,2.2);setBallFlight(m,{source:p,target,kind:'PASS',speed,loft,targetPoint:{x:target.x,y:target.y},deliveryMode:'AERIAL',style:'HEADER_REDIRECT'});event(m,'PASS',`${subjectName(p.name)} 헤더로 ${target.name} 쪽에 연결했습니다.`,{actorId:p.id,team:p.team,targetId:target.id,passKind:'HEADER_PASS'});return true;
}
function consumeIncomingIntent(m,p,flightKind,sourceId,passTeam,extra={}){
  const x=matchingIncomingIntent(m,p,flightKind,sourceId);if(!x)return{selected:false,handled:false,trap:false};m.userIncomingIntent=null;
  if(x.choiceId==='TRAP_CONTROL')return{selected:true,handled:false,trap:true};
  const target=x.targetId?playerById(m,x.targetId):null;if(x.targetId&&(!target||target.team!==p.team||target.id===p.id))return{selected:true,handled:false,trap:true,invalidTarget:true};
  recordInboundCompletion(m,p,flightKind,sourceId,passTeam);
  p.x=clamp(p.x,1,104);p.y=clamp(p.y,1,67);p.hasBall=false;m.ballOwner=null;m.lastTouchTeam=p.team;m.lastTouchPlayer=p.id;
  if(x.choiceId==='ONE_TOUCH_PASS'){executePass(m,p,target,'PASS',{running:false,block:0,forward:dir(p.team)*(target.x-p.x),open:nearestOppDistance(m,target)},'USER_ONE_TOUCH');return{selected:true,handled:true,trap:false};}
  if(x.choiceId==='DIRECT_SHOT'){executeShot(m,p,'ONE_TOUCH_DIRECT',{releaseNow:true});return{selected:true,handled:true,trap:false};}
  if(x.choiceId==='VOLLEY_SHOT'){executeShot(m,p,'ONE_TOUCH_VOLLEY',{releaseNow:true});return{selected:true,handled:true,trap:false};}
  if(x.choiceId==='HEADER_PASS'){executeHeaderPass(m,p,target);return{selected:true,handled:true,trap:false};}
  if(x.choiceId==='HEADER_SHOT'){executeCrossHeaderShot(m,p,extra.defenderDistance??nearestOppDistance(m,p));return{selected:true,handled:true,trap:false};}
  return{selected:true,handled:false,trap:true};
}
function inspectChoiceState(m,playerId){
  const owner=playerById(m,playerId);if(!owner)return null;
  const incoming=incomingBallChoiceState(m,owner);if(incoming)return incoming;
  if(materialControlReady(m,owner)){
    const local=worldToLocal(owner.team,owner.x,owner.y),pressure=ballCarrierPressureDistance(m,owner),space=forwardSpace(m,owner,13),shot=shotAssessment(m,owner),opts=passOptions(m,owner,'PLAYER'),held=Math.max(0,m.time-(owner.controlledSince||m.time)),deep=finalThirdDelivery(m,owner),early=earlyCrossDelivery(m,owner),takeOn=takeOnOpportunity(m,owner,shot,held),ctx=candidateContext(m,owner,shot,opts,pressure,space,held,deep,early,takeOn),ranked=candidateRank(m,owner,ctx);
    const nameById=id=>playerById(m,id)?.name||id||null,represented=new Set(ranked.filter(c=>['THROUGH_PASS','PROGRESSIVE_PASS','SWITCH_PASS','SAFE_PASS','RECYCLE'].includes(c.id)&&c.meta?.targetId).map(c=>c.meta.targetId));
    const oRisk=o=>(o.offsideRisk?3:0)+(o.running?1.5:0)+(['ST','WF'].includes(o.p.role)?1:0)+(o.block>0?0.5:0);
    const physicalPasses=opts.filter(o=>o.block<=1&&!represented.has(o.p.id)&&o.d<=42&&o.forward>-6.0&&o.open>=0.35&&['ST','WF','CM','FB'].includes(o.p.role)).sort((a,b)=>{const ar=oRisk(a),br=oRisk(b);return br-ar||(b.forward-a.forward)||(b.score-a.score)}).slice(0,3).map(o=>({id:'AVAILABLE_PASS',score:Number((o.score-0.45).toFixed(3)),reason:'physically_available_receiver',meta:{targetId:o.p.id,targetSlot:o.p.slot,forward:o.forward,d:o.d,receiverPressure:o.open,contested:o.open<1.8||o.block>0,laneBlockers:o.block,offsideRisk:!!o.offsideRisk,offsideMargin:Number(o.offsideMargin||0)}}));
    const existingThroughTargets=new Set(ranked.filter(c=>c.id==='THROUGH_PASS'&&c.meta?.targetId).map(c=>c.meta.targetId)),openSpacePasses=syntheticLeadPassCandidates(m,owner,opts,existingThroughTargets);
    const existingSafeTargets=new Set(ranked.filter(c=>c.id==='SAFE_PASS'&&c.meta?.targetId).map(c=>c.meta.targetId));
    const directSafePasses=opts.filter(o=>!existingSafeTargets.has(o.p.id)&&o.block===0&&o.d<=30&&o.open>=2.35&&o.forward<=5.5&&o.forward>=-20&&['CM','FB','WF','ST'].includes(o.p.role)).sort((a,b)=>(b.open-a.open)||(a.d-b.d)).slice(0,2).map(o=>({id:'SAFE_PASS',score:Number((1.15+Math.min(5,o.open)*.18-o.d*.018).toFixed(3)),reason:'user_visible_safe_feet',meta:{targetId:o.p.id,targetSlot:o.p.slot,forward:o.forward,d:o.d,receiverPressure:o.open,directSafe:true}}));
    const userCandidates=[...ranked,...openSpacePasses,...directSafePasses,...physicalPasses];
    return{kind:'ON_BALL',playerId:owner.id,team:owner.team,role:owner.role,slot:owner.slot,time:m.time,nextThink:owner.nextThink,lockedUntil:owner.lockTargetUntil||0,localX:local.x,localY:local.y,pressure,space,held,shot:{score:shot.score,dGoal:shot.dGoal,inBox:shot.inBox,oneVOne:shot.oneVOne,openWindow:shot.openWindow,blockers:shot.blockers.length,bodyAngleDiff:shot.bodyAngleDiff,facingAlignment:shot.facingAlignment,turningRequired:shot.turningRequired,backToGoal:shot.backToGoal},context:ctx,candidates:userCandidates.map(c=>({...c,targetId:c.meta?.targetId||null,targetName:nameById(c.meta?.targetId)})),_frame:{owner,shot,opts,pressure,space,held,deep,early,takeOn,ctx}};
  }
  const ballOwner=playerById(m,m.ball.ownerId);if(ballOwner&&ballOwner.team!==owner.team&&m.ball.mode==='CONTROLLED'){
    const d=dist(owner,ballOwner),att=worldToLocal(ballOwner.team,ballOwner.x,ballOwner.y),own=worldToLocal(owner.team,ballOwner.x,ballOwner.y),goalSideMargin=dir(ballOwner.team)*(owner.x-ballOwner.x),threats=teamPlayers(m,ballOwner.team).filter(q=>q.id!==ballOwner.id&&q.role!=='GK').map(q=>({id:q.id,name:q.name,role:q.role,d:dist(ballOwner,q),forward:dir(ballOwner.team)*(q.x-ballOwner.x)})).filter(q=>q.forward>1).sort((a,b)=>b.forward-a.forward||a.d-b.d),threatShot=shotAssessment(m,ballOwner);
    return{kind:'DEFENDING',playerId:owner.id,team:owner.team,role:owner.role,slot:owner.slot,time:m.time,opponentId:ballOwner.id,opponentName:ballOwner.name,distance:d,opponentAttackX:att.x,ownViewX:own.x,goalSideMargin,threatTarget:threats[0]||null,threatShot:{dGoal:threatShot.dGoal,inBox:threatShot.inBox,oneVOne:threatShot.oneVOne,openWindow:threatShot.openWindow,blockers:threatShot.blockers.length}};
  }
  return{kind:'OFF_BALL',playerId:owner.id,team:owner.team,role:owner.role,slot:owner.slot,time:m.time};
}
function applyChoiceCandidate(m,playerId,candidateId,targetId=null,inputSource='DIRECT_API',frozenCandidate=null){
  const frame=inspectChoiceState(m,playerId);if(!frame)return{ok:false,reason:'NO_CHOICE_STATE'};
  if(frame.kind==='INCOMING_BALL'){
    const same=frame.candidates.filter(x=>x.id===candidateId);let c=null;if(targetId!=null){c=same.find(x=>x.targetId===targetId||x.meta?.targetId===targetId)||null;if(!c)return{ok:false,reason:'CHOICE_TARGET_NOT_AVAILABLE',requestedTargetId:targetId};}else{if(same.length>1&&same.some(x=>(x.targetId||x.meta?.targetId)!=null))return{ok:false,reason:'AMBIGUOUS_CHOICE_TARGET'};c=same[0]||null;}if(!c)return{ok:false,reason:'CANDIDATE_NOT_AVAILABLE'};
    const resolvedTargetId=c.targetId||c.meta?.targetId||null,target=resolvedTargetId?playerById(m,resolvedTargetId):null;if(resolvedTargetId&&(!target||target.team!==frame.team||target.id===playerId))return{ok:false,reason:'CHOICE_TARGET_NOT_AVAILABLE',requestedTargetId:targetId};
    m.userIncomingIntent={playerId,choiceId:c.id,targetId:resolvedTargetId,sourceId:frame.sourceId,flightKind:frame.flightKind,originX:Number(m.ball.originX),originY:Number(m.ball.originY),setAt:m.time,expiresAt:m.time+frame.eta+.48,futureOutcomePrecomputed:false};
    m.userChoiceLog=m.userChoiceLog||[];m.userChoiceLog.push({at:Number(m.time.toFixed(3)),playerId,team:frame.team,role:frame.role,choice:c.id,requestedTargetId:targetId||null,targetId:resolvedTargetId,inputSource,result:'INCOMING_INTENT_ARMED_CURRENT_STATE',futureOutcomePrecomputed:false});event(m,'USER_CHOICE',`${playerId}: ${c.id}${resolvedTargetId?` -> ${resolvedTargetId}`:''}`);
    return{ok:true,kind:'INCOMING_BALL',choice:c.id,requestedTargetId:targetId||null,targetId:resolvedTargetId,inputSource,action:{type:'INCOMING_INTENT',kind:c.id},intentUntil:m.userIncomingIntent.expiresAt,intentProtected:true,futureOutcomePrecomputed:false};
  }
  if(frame.kind!=='ON_BALL'||!frame._frame)return{ok:false,reason:'NO_ON_BALL_CHOICE_STATE'};
  const owner=frame._frame.owner,same=frame.candidates.filter(x=>x.id===candidateId);let c=null;
  const frozenTarget=frozenCandidate?(frozenCandidate.targetId||frozenCandidate.meta?.targetId||null):null,frozenMatches=!!(frozenCandidate&&frozenCandidate.id===candidateId&&frozenTarget===(targetId||null));
  if(frozenMatches){
    if(targetId!=null){const target=playerById(m,targetId);if(!target||target.team!==owner.team||target.id===owner.id)return{ok:false,reason:'FROZEN_CHOICE_TARGET_PHYSICALLY_INVALID',requestedTargetId:targetId};}
    c=frozenCandidate;m.stats.frozenUserChoiceExecutions=(m.stats.frozenUserChoiceExecutions||0)+1;
  }else if(targetId!=null){c=same.find(x=>x.targetId===targetId||x.meta?.targetId===targetId)||null;if(!c)return{ok:false,reason:'CHOICE_TARGET_NOT_AVAILABLE',requestedTargetId:targetId};}
  else{if(same.length>1&&same.some(x=>(x.targetId||x.meta?.targetId)!=null))return{ok:false,reason:'AMBIGUOUS_CHOICE_TARGET'};c=same[0]||null;}
  if(!c)return{ok:false,reason:'CANDIDATE_NOT_AVAILABLE'};
  const action=candidateToAction(m,owner,c,frame._frame);if(!action)return{ok:false,reason:'CANDIDATE_NOT_EXECUTABLE'};
  // Player-facing trajectory semantics: when both a ground pass and an explicit lofted variant
  // exist, the labels must describe visibly different actions. Keep NPC long-pass variation
  // untouched; only an explicit protagonist ground-pass choice forces a ground trajectory.
  const explicitGroundPassChoices=new Set(['THROUGH_PASS','PROGRESSIVE_PASS','AVAILABLE_PASS','SWITCH_PASS','SAFE_PASS','RECYCLE']);
  if(action.type==='PASS'&&explicitGroundPassChoices.has(c.id))action.option={...(action.option||{}),forceGround:true};
  // STEP75 hard ownership guard: a non-shot user choice invalidates any automatic shot
  // preparation that may have been queued before the checkpoint. User input is the current
  // state input; an older pendingShot can never fire through HOLD/PASS/CARRY.
  if(c.id!=='SHOT'&&owner.pendingShot){owner.pendingShot=null;owner.faceTargetAngle=null;owner.lockTargetUntil=0;if(owner.action==='TURNING_SHOT_PREP'){owner.action='HOLD_BALL';owner.tacticalTask='HOLD_BALL';}}
  applyResolvedOwnerAction(m,owner,action);
  let intentUntil=null;
  if(c.id==='CARRY'){
    // R19: CARRY means advance into space, not spend a fixed 3.2s wrestling through a closed
    // lane. When the frozen current-state candidate itself says the runway is tight, shorten
    // only the execution window and reopen the next user decision sooner. No result odds change.
    const carrySpace=Number(c.meta?.space),carryPressure=Number(c.meta?.pressure),clearRunway=!!c.meta?.clearRunway;
    const congested=!clearRunway&&((Number.isFinite(carrySpace)&&carrySpace<1.6)||(Number.isFinite(carryPressure)&&carryPressure<1.55));
    const carryWindow=clearRunway?3.20:(congested?1.65:2.35);
    intentUntil=Math.max(Number(owner.lockTargetUntil||0),m.time+carryWindow);owner.nextThink=intentUntil;
    m.userChoiceControl={playerId:owner.id,choice:c.id,mode:'CARRY',startedAt:m.time,until:intentUntil,controllerOwned:true,futureOutcomePrecomputed:false,congestedAtChoice:congested};
  }else if(c.id==='HOLD'){
    intentUntil=m.time+2.35;owner.nextThink=intentUntil;owner.lockTargetUntil=Math.max(owner.lockTargetUntil||0,intentUntil);
    m.userChoiceControl={playerId:owner.id,choice:c.id,mode:'HOLD',startedAt:m.time,until:intentUntil,controllerOwned:true,futureOutcomePrecomputed:false};
  }else if(c.id==='TAKE_ON'){
    intentUntil=Math.max(Number(owner.lockTargetUntil||0),Number(owner.takeOnState?.resolveAt||0)+0.55,m.time+1.05);owner.nextThink=Math.max(owner.nextThink||0,intentUntil);
    m.userChoiceControl={playerId:owner.id,choice:c.id,mode:'TAKE_ON',startedAt:m.time,until:intentUntil,controllerOwned:true,futureOutcomePrecomputed:false};
  }else if(c.id==='SHOT'&&owner.pendingShot){intentUntil=owner.pendingShot.releaseAt;m.userChoiceControl={playerId:owner.id,choice:c.id,mode:'SHOT_PREP',startedAt:m.time,until:intentUntil,controllerOwned:true,futureOutcomePrecomputed:false};}
  else m.userChoiceControl=null;
  const resolvedTargetId=c.meta?.targetId||c.targetId||null;
  const directedPassChoices=new Set(['THROUGH_PASS','LOFTED_THROUGH_PASS','LOFTED_PASS','PROGRESSIVE_PASS','AVAILABLE_PASS','SWITCH_PASS','SAFE_PASS','RECYCLE','EARLY_CROSS','DEEP_CROSS','CUTBACK']);
  if(directedPassChoices.has(c.id)&&resolvedTargetId){m.lastUserDirectedPassTrace={at:Number(m.time.toFixed(3)),sourceId:owner.id,choiceId:c.id,requestedTargetId:targetId||resolvedTargetId,resolvedTargetId,intendedReceiverId:m.ball.intendedReceiverId||null,firstControllerId:null,outcome:'IN_FLIGHT'};}
  m.userChoiceLog=m.userChoiceLog||[];m.userChoiceLog.push({at:Number(m.time.toFixed(3)),playerId:owner.id,team:owner.team,role:owner.role,choice:c.id,requestedTargetId:targetId||null,targetId:resolvedTargetId,inputSource,result:'APPLIED_CURRENT_STATE',futureOutcomePrecomputed:false});event(m,'USER_CHOICE',`${owner.id}: ${c.id}${resolvedTargetId?` -> ${resolvedTargetId}`:''}`);
  return{ok:true,kind:'ON_BALL',choice:c.id,requestedTargetId:targetId||null,targetId:resolvedTargetId,inputSource,action:{type:action.type,kind:action.kind||null,reason:action.reason||null},intentUntil,intentProtected:!!intentUntil,futureOutcomePrecomputed:false};
}
function choiceStateBridge(){return{inspect:inspectChoiceState,applyCandidate:applyChoiceCandidate};}
function choiceActionBridge(){
  // Narrow current-state action bridge for the separate STEP37 resolver. This exposes the
  // existing action executors without adding a second simulation path or choice policy here.
  return{
    playerById,teamPlayers,other,dir,ownGoalX,clamp,norm,dist,laneBlockers,nearestOppDistance,passOptions,
    executeShot,executeCarry,executeTakeOn,takeOnOpportunity,executePass,setControlled,setLoose,startDeadRestart,event,materialControlReady,controlContactGap
  };
}

function snapshot(m){const longest={...m.stats.longestPossession};if(m.stats.currentPossessionTeam){const t=m.stats.currentPossessionTeam;longest[t]=Math.max(longest[t]||0,Math.max(0,m.time-m.stats.currentPossessionStartedAt));}const stats={...m.stats,possessionSeconds:{...m.stats.possessionSeconds},firstHalfPossession:{...m.stats.firstHalfPossession},secondHalfPossession:{...m.stats.secondHalfPossession},longestPossession:longest,possessionPct:possessionPct(m.stats.possessionSeconds),firstHalfPossessionPct:possessionPct(m.stats.firstHalfPossession),secondHalfPossessionPct:possessionPct(m.stats.secondHalfPossession)};return{time:m.time,score:{...m.score},phase:phaseName(m),possession:m.possession,ball:{...m.ball},players:m.players.map(p=>({id:p.id,name:p.name,team:p.team,role:p.role,slot:p.slot,x:p.x,y:p.y,vx:p.vx,vy:p.vy,tx:p.tx,ty:p.ty,action:p.action,tacticalTask:p.tacticalTask,markTargetId:p.markTargetId||null,hasBall:p.hasBall,bodyAngle:Number.isFinite(p.bodyAngle)?p.bodyAngle:null,faceTargetAngle:Number.isFinite(p.faceTargetAngle)?p.faceTargetAngle:null})),actionCandidates:m.actionCandidateTelemetry?JSON.parse(JSON.stringify(m.actionCandidateTelemetry)):null,userDirectedPassTrace:m.lastUserDirectedPassTrace?JSON.parse(JSON.stringify(m.lastUserDirectedPassTrace)):null,tactical:m.tactical?JSON.parse(JSON.stringify(m.tactical)):null,events:m.events.slice(-20),stats,telemetry:(TELEMETRY&&m.telemetry&&typeof TELEMETRY.summary==='function')?TELEMETRY.summary(m.telemetry):null,completed:m.completed};}
function runToEnd(seed='perf',opts={}){const m=createMatch(seed,opts),dt=opts.dt||m.dt,max=Math.ceil(5410/dt)+100;let steps=0;while(!m.completed&&steps++<max)step(m,dt);return{match:m,snapshot:snapshot(m),steps};}
return{createMatch,step,snapshot,runToEnd,choiceActionBridge,choiceStateBridge,FIELD,HOME,AWAY,DEFAULT_DT};
});
