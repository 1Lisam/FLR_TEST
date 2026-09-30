'use strict';
const path=require('path');
const root=path.resolve(__dirname,'../..');
const C=require(path.join(root,'runtime','continuous_match_core.js'));
const A=require(path.join(root,'runtime','attribute_match_adapter.js'));
const B=C.choiceActionBridge();

const cases=[
  {id:'T01-SPEED24-OFFSET2',seed:'TOUCH-GOAL-013',distance:18,speed:24,offset:2,gk:40,handling:40,shotTeam:'HOME'},
  {id:'T02-SPEED23-CENTRAL',seed:'TOUCH-GOAL-086',distance:19,speed:23,offset:0,gk:40,handling:40,shotTeam:'HOME'}
];

function setup(s){
  const m=C.createMatch(s.seed,{dt:.05});m.time=100;m.restart=null;m.phase='OPEN_PLAY';m.nextShape=999;m.events=[];m.score={HOME:0,AWAY:0};m.possession=s.shotTeam;m.playerAbilityProfiles={};
  const attack=s.shotTeam==='HOME'?'H-ST':'A-ST',keeper=s.shotTeam==='HOME'?'A-GK':'H-GK',st=m.playersById[attack],gk=m.playersById[keeper],attackDir=s.shotTeam==='HOME'?1:-1;
  for(const p of m.players){p.hasBall=false;p.nextThink=9999;p.vx=p.vy=0;if(p.role!=='GK'){p.x=s.shotTeam==='HOME'?70:35;p.y=7;p.tx=p.x;p.ty=p.y;}}
  Object.assign(st,{x:s.shotTeam==='HOME'?83:22,y:34,tx:s.shotTeam==='HOME'?83:22,ty:34,bodyAngle:0,faceTargetAngle:0});
  Object.assign(gk,{x:s.shotTeam==='HOME'?100.5:4.5,y:34,tx:s.shotTeam==='HOME'?100.5:4.5,ty:34,action:'GK_SAVE_SET',tacticalTask:'GK_SAVE_SET',nextThink:9999});
  m.playerAbilityProfiles[gk.id]=A.withOverrides(A.baseProfile(60),{reaction:s.gk,gk_positioning:s.gk,diving:s.gk,handling:s.handling});B.setControlled(m,st);
  const releaseX=s.shotTeam==='HOME'?83:22,releaseGoalX=s.shotTeam==='HOME'?105:0;
  m.ball.x=releaseX;B.executeShot(m,st,'TOUCH_GOAL_FORCED',{releaseNow:true});
  Object.assign(m.ball,{x:releaseX,y:34+s.offset,z:.08,vx:attackDir*s.speed,vy:0,vz:0,age:0,originX:releaseX,originY:34,targetX:releaseGoalX,targetY:34+s.offset,shotTargetY:34+s.offset,shotTeam:s.shotTeam,onTarget:true,shotDistance:s.distance,shotOneVOne:false,shotClearKeeperChance:false,airborne:false,strikeStyle:'POWER',arcProfile:null});
  return{m,gk};
}

function run(s){
  const {m,gk}=setup(s);let contact=null,crossing=null,postContactLive=null,approachFrames=0;
  for(let i=0;i<100;i++){
    const before={time:m.time,mode:m.ball.mode,x:m.ball.x,y:m.ball.y,vx:m.ball.vx,vy:m.ball.vy,score:{...m.score},goals:m.stats.goals};
    C.step(m,.05);
    if(m.ball.mode==='FLIGHT'&&m.ball.kind==='SHOT'&&!contact)approachFrames++;
    const touch=m.events.find(e=>e.t>=100&&e.type==='TOUCH_DEFLECT');
    if(touch&&!contact){
      contact={time:touch.t,frame:i+1,contactGap:touch.sharedContactStage.contactGap,contactEnvelope:touch.sharedContactStage.envelope,contactStage:touch.sharedContactStage,velocityBefore:touch.ballVelocityBefore,velocityAfter:touch.ballVelocityAfter,preSpeed:touch.preSpeed,postSpeed:touch.postSpeed,localVelocityBefore:touch.localVelocityBefore,localVelocityAfter:touch.localVelocityAfter,gloveDeflection:touch.gloveDeflection,modeAtContact:touch.ballState.mode,kindAtContact:touch.ballState.kind,ownerAtContact:touch.ballState.ownerId,intendedReceiverAtContact:touch.ballState.intendedReceiverId,scoreBefore:{...before.score},scoreAfter:{...m.score},goalsBefore:before.goals,goalsAfter:m.stats.goals,scoreTelemetry:touch.scoreAtContact,goalsTelemetry:touch.goalsAtContact};
    }
    if(contact&&!postContactLive)postContactLive={time:m.time,mode:m.ball.mode,kind:m.ball.kind,x:m.ball.x,y:m.ball.y,score:{...m.score},goals:m.stats.goals};
    const goal=m.events.find(e=>e.t>=100&&e.type==='GOAL');
    if(goal&&!crossing)crossing={time:goal.t,frame:i+1,scoreAfter:{...m.score},goalsAfter:m.stats.goals,modeAfter:m.ball.mode};
    if(contact&&crossing)break;
    if(m.ball.mode!=='FLIGHT'&&m.ball.mode!=='DEAD'&&!contact)break;
  }
  return {...s,outcome:contact&&crossing?'TOUCH_CONTINUE_THEN_GOAL':contact?'TOUCH_CONTINUE_NO_CROSSING':(m.events.find(e=>e.type==='SAVE')?'CATCH_OR_SAVE':'NO_TOUCH'),approachFrames,contact,postContactLive,crossing,final:{time:m.time,mode:m.ball.mode,x:m.ball.x,y:m.ball.y,score:m.score,goals:m.stats.goals},unusedStateChecks:{scoreSnapshotsStableBeforeContact:!!contact&&contact.scoreBefore.HOME===contact.scoreAfter.HOME&&contact.scoreBefore.AWAY===contact.scoreAfter.AWAY,goalSnapshotStableBeforeContact:!!contact&&contact.goalsBefore===contact.goalsAfter,liveFlightAfterContact:!!postContactLive&&postContactLive.mode==='FLIGHT'&&postContactLive.kind==='SHOT',crossingIsLater:!!contact&&!!crossing&&crossing.time>contact.time,physicalGoalEvent:!!crossing,neutralContact:!!contact&&contact.scoreTelemetry.HOME===contact.scoreBefore.HOME&&contact.goalsTelemetry===contact.goalsBefore}};
}

const rows=cases.map(run);
const checks={twoFixtures:rows.length>=2,distinctSpeedOrOffset:new Set(rows.map(r=>`${r.speed}|${r.offset}`)).size>=2,allTouchThenGoal:rows.every(r=>r.outcome==='TOUCH_CONTINUE_THEN_GOAL'),sharedContact:rows.every(r=>r.contact&&r.contact.contactGap<=r.contact.contactEnvelope),approachBeforeContact:rows.every(r=>r.approachFrames>=2),liveFlightAfterContact:rows.every(r=>r.unusedStateChecks.liveFlightAfterContact),contactScoreUnchanged:rows.every(r=>r.unusedStateChecks.scoreSnapshotsStableBeforeContact&&r.unusedStateChecks.goalSnapshotStableBeforeContact),crossingLater:rows.every(r=>r.unusedStateChecks.crossingIsLater),physicalGoalEvent:rows.every(r=>r.unusedStateChecks.physicalGoalEvent),neutralContact:rows.every(r=>r.unusedStateChecks.neutralContact),noCachedFutureGoalOutcome:rows.every(r=>r.contact&&!('TOUCH_GOAL'===r.contact.npcGkOutcome))};
const report={schema:'FLR_GK_TOUCH_GOAL_CAUSAL_CONTINUATION_V1',dt:.05,checks,rows};
console.log(JSON.stringify(report,null,2));
if(!Object.values(checks).every(Boolean))process.exit(1);
