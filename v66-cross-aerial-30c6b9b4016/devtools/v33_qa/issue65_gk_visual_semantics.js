'use strict';
const path=require('path');
const root=path.resolve(__dirname,'../..');
const C=require(path.join(root,'runtime/continuous_match_core.js'));
const A=require(path.join(root,'runtime/attribute_match_adapter.js'));
const B=C.choiceActionBridge();

// Issue #65 fixtures. #8 is intentionally byte-for-byte equivalent in its
// gameplay inputs to the accepted RIGHT fixture; only #7 is tightened.
const cases=[
  {id:'#7-LEFT-LIVE-DEFLECTION',seed:'SEARCH--0.75-34-24',offset:-1.7,gkY:34,speed:24,distance:19},
  {id:'#8-RIGHT-USER-PASS',seed:'SEARCH-1.5-34-23',offset:1.5,gkY:34,speed:23,distance:19},
  {id:'#9-CORNER-NO-STUTTER',seed:'TOUCH-GOAL-013',offset:2.5,gkY:34.5,speed:23,distance:19}
];
const GOAL_Y1=30.34,GOAL_Y2=37.66,GOAL_CENTRE=34,GOAL_WIDTH=7.32;
const OLD={left:33.0,right:35.0,centreHalf:1.0};
const NEW={left:GOAL_CENTRE-(GOAL_WIDTH/2)*.68,right:GOAL_CENTRE+(GOAL_WIDTH/2)*.68,centreHalf:(GOAL_WIDTH/2)*.68};
function classify(y){return y<NEW.left?'LEFT':y>NEW.right?'RIGHT':'CENTRE';}
function setup(s){
  const m=C.createMatch(s.seed,{dt:.05});m.time=100;m.restart=null;m.phase='OPEN_PLAY';m.nextShape=999;m.events=[];m.score={HOME:0,AWAY:0};m.possession='HOME';m.playerAbilityProfiles={};m.v34TestOnlyVisualFixture=true;
  const st=m.playersById['H-ST'],gk=m.playersById['A-GK'];
  for(const p of m.players){p.hasBall=false;p.nextThink=9999;p.vx=p.vy=0;if(p.role!=='GK'){p.x=70;p.y=7;p.tx=p.x;p.ty=p.y;}}
  Object.assign(st,{x:83,y:34,tx:83,ty:34,bodyAngle:0,faceTargetAngle:0});
  Object.assign(gk,{x:100.5,y:s.gkY,tx:100.5,ty:s.gkY,action:'GK_SAVE_SET',tacticalTask:'GK_SAVE_SET',nextThink:9999});
  m.playerAbilityProfiles[gk.id]=A.withOverrides(A.baseProfile(60),{reaction:40,gk_positioning:40,diving:40,handling:40});B.setControlled(m,st);
  B.executeShot(m,st,'ISSUE65_GK_VISUAL_FIXTURE',{releaseNow:true});
  Object.assign(m.ball,{x:83,y:34+s.offset,z:.08,vx:s.speed,vy:0,vz:0,age:0,originX:83,originY:34,targetX:105,targetY:34+s.offset,shotTargetY:34+s.offset,shotTeam:'HOME',onTarget:true,shotDistance:s.distance,shotOneVOne:false,shotClearKeeperChance:false,airborne:false,strikeStyle:'POWER'});
  return {m,st,gk};
}
function run(s){
  const {m,gk}=setup(s);let contact=null,boundary=null,pre=[],post=[],terminalSeen=false;
  for(let i=0;i<100;i++){
    const before={time:m.time,visualTime:m.visualReplayTime||0,x:m.ball.x,y:m.ball.y,vx:m.ball.vx,vy:m.ball.vy,mode:m.ball.mode};
    if(!terminalSeen&&before.x<105)pre.push(before);
    C.step(m,.05);
    const touch=m.events.find(e=>e.t>=100&&e.type==='TOUCH_DEFLECT');
    if(touch&&!contact){
      const current=touch.sharedContactStage.current,previous=touch.sharedContactStage.previous;
      const dtToGoal=(105-current.x)/Math.max(.0001,touch.ballVelocityBefore.x);
      contact={time:touch.t,contactY:current.y,preContactY:previous.y,preProjectedY:current.y+touch.ballVelocityBefore.y*dtToGoal,velocityBefore:touch.ballVelocityBefore,velocityAfter:touch.ballVelocityAfter,mode:touch.ballState.mode,kind:touch.ballState.kind,lastTouchTeam:touch.ballState.lastTouchTeam,lastTouchPlayer:touch.ballState.lastTouchPlayer,npcGkOutcome:touch.npcGkOutcome,scoreAtContact:touch.scoreAtContact,goalsAtContact:touch.goalsAtContact};
    }
    const ev=m.events.find(e=>e.t>=100&&['GOAL','CORNER','GOAL_KICK'].includes(e.type));
    if(ev&&!boundary){boundary={time:ev.t,visualTime:m.visualReplayTime||0,eventType:ev.type,text:ev.text,actorId:ev.actorId||null,crossing:ev.crossing||null,score:{...m.score},lastTouchTeam:m.ball.lastTouchTeam,lastTouchPlayer:m.ball.lastTouchPlayer};terminalSeen=true;}
    if(terminalSeen&&m.restart?.kind==='CORNER'&&m.restart.ballReturn?.phase==='OUT_FOLLOW_THROUGH'&&m.ball.x>105&&post.length<5)post.push({time:m.time,visualTime:m.visualReplayTime||0,x:m.ball.x,y:m.ball.y,phase:m.restart.ballReturn.phase});
    if(boundary&&s.id!=='#9-CORNER-NO-STUTTER'&&contact)break;
    if(boundary&&s.id==='#9-CORNER-NO-STUTTER'&&post.length>=5)break;
  }
  const crossing=boundary?.crossing||null,preLast=pre.slice(-3),xs=post.map(f=>f.x),vel=post.map((f,i)=>i?((f.x-post[i-1].x)/.05):null).slice(1),boundaryVisualTime=boundary?.visualTime??null;
  const preProjectedY=contact?.preProjectedY??null,deltaY=contact&&crossing?preProjectedY-crossing.y:null;
  const safeInside=!!crossing&&crossing.y>GOAL_Y1+.25&&crossing.y<GOAL_Y2-.25;
  return {...s,contact,boundary,preBoundaryFrames:preLast,postBoundaryFrames:post,crossing,metrics:{contactY:contact?.contactY??null,preProjectedY,deltaY,preVy:contact?.velocityBefore?.y??null,postVy:contact?.velocityAfter?.y??null,safeInside},cornerContinuity:{window:post.every(f=>f.visualTime-boundaryVisualTime<=.30+.051),xMonotonic:xs.length===5&&xs.every((x,i)=>i===0||x>xs[i-1]),noX105Repeat:xs.length===5&&xs.every(x=>x>105),speedNoCollapse:vel.length===4&&vel.every(v=>v>0.5),cadence:post.length===5}};
}
const rows=cases.map(run),left=rows[0],right=rows[1],corner=rows[2];
const thresholdUnits={oldThresholds:OLD,newThresholds:{left:NEW.left,right:NEW.right,centre:[NEW.left,NEW.right]},goalWidthM:GOAL_WIDTH,exactCentre:classify(34)==='CENTRE',borderlineLeft:classify(NEW.left)==='CENTRE',borderlineRight:classify(NEW.right)==='CENTRE',clearLeft:classify(NEW.left-.01)==='LEFT',clearRight:classify(NEW.right+.01)==='RIGHT',mouthEdges:GOAL_Y1<NEW.left&&NEW.right<GOAL_Y2};
const checks={
  leftLiveContact:left.contact?.npcGkOutcome==='TOUCH_CONTINUE'&&left.contact.mode==='FLIGHT'&&left.contact.kind==='SHOT',
  leftCentralPreContact:left.metrics.preProjectedY>=NEW.left&&left.metrics.preProjectedY<=NEW.right,
  leftRealNegativePostVy:left.metrics.postVy<0,
  leftLaterGoal:left.boundary?.eventType==='GOAL'&&left.boundary.time>left.contact?.time,
  leftSafeInsidePost:left.metrics.safeInside,
  leftVisibleDisplacement:(left.metrics.deltaY||0)>=1.0,
  leftTelemetry:['contactY','preProjectedY','deltaY','preVy','postVy'].every(k=>Number.isFinite(left.contact?.[k==='preVy'?'velocityBefore':k])||Number.isFinite(left.metrics[k])),
  rightInputsUnchanged:JSON.stringify({seed:right.seed,offset:right.offset,gkY:right.gkY,speed:right.speed,distance:right.distance})===JSON.stringify({seed:'SEARCH-1.5-34-23',offset:1.5,gkY:34,speed:23,distance:19}),
  rightUserPass:right.boundary?.eventType==='GOAL'&&right.boundary.text.includes('골문 오른쪽'),
  rightContact:right.contact?.npcGkOutcome==='TOUCH_CONTINUE',
  thresholdUnits:Object.values(thresholdUnits).every(Boolean),
  cornerPhysicalAuthority:corner.contact?.npcGkOutcome==='TOUCH_CONTINUE'&&corner.boundary?.eventType==='CORNER'&&corner.boundary.time>corner.contact?.time&&corner.boundary.lastTouchPlayer==='A-GK',
  cornerNoStutter:Object.values(corner.cornerContinuity).every(Boolean)
};
// Replace the compact telemetry check with explicit named fields in the report.
checks.leftTelemetry=Number.isFinite(left.contact?.contactY)&&Number.isFinite(left.contact?.preProjectedY)&&Number.isFinite(left.metrics.deltaY)&&Number.isFinite(left.metrics.preVy)&&Number.isFinite(left.metrics.postVy);
const pass=Object.values(checks).every(Boolean);
console.log(JSON.stringify({schema:'FLR_ISSUE65_GK_VISUAL_SEMANTICS_NO_STUTTER_V1',dt:.05,verdict:pass?'PASS_FOR_VISUAL_RETEST':'FAIL',thresholdUnits,checks,rows},null,2));
if(!pass)process.exit(1);
