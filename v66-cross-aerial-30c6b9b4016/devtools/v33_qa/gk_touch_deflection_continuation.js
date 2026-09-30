'use strict';
const path=require('path');
const root=path.resolve(__dirname,'../..');
const C=require(path.join(root,'runtime','continuous_match_core.js'));
const A=require(path.join(root,'runtime','attribute_match_adapter.js'));
const B=C.choiceActionBridge();

const cases=[
  {id:'A-LEFT-GOAL',seed:'SEARCH--0.75-34-24',offset:-1.5,gkY:34,speed:24,distance:19},
  {id:'B-RIGHT-GOAL',seed:'SEARCH-1.5-34-23',offset:1.5,gkY:34,speed:23,distance:19},
  {id:'C-OUTSIDE-CORNER',seed:'TOUCH-GOAL-013',offset:2.5,gkY:34.5,speed:23,distance:19}
];

function setup(s){
  const m=C.createMatch(s.seed,{dt:.05});m.time=100;m.restart=null;m.phase='OPEN_PLAY';m.nextShape=999;m.events=[];m.score={HOME:0,AWAY:0};m.possession='HOME';m.playerAbilityProfiles={};
  m.v34TestOnlyVisualFixture=true;
  const st=m.playersById['H-ST'],gk=m.playersById['A-GK'];
  for(const p of m.players){p.hasBall=false;p.nextThink=9999;p.vx=p.vy=0;if(p.role!=='GK'){p.x=70;p.y=7;p.tx=p.x;p.ty=p.y;}}
  Object.assign(st,{x:83,y:34,tx:83,ty:34,bodyAngle:0,faceTargetAngle:0});
  Object.assign(gk,{x:100.5,y:s.gkY,tx:100.5,ty:s.gkY,action:'GK_SAVE_SET',tacticalTask:'GK_SAVE_SET',nextThink:9999});
  m.playerAbilityProfiles[gk.id]=A.withOverrides(A.baseProfile(60),{reaction:40,gk_positioning:40,diving:40,handling:40});B.setControlled(m,st);
  B.executeShot(m,st,'TOUCH_DEFLECT_FORCED',{releaseNow:true});
  Object.assign(m.ball,{x:83,y:34+s.offset,z:.08,vx:s.speed,vy:0,vz:0,age:0,originX:83,originY:34,targetX:105,targetY:34+s.offset,shotTargetY:34+s.offset,shotTeam:'HOME',onTarget:true,shotDistance:s.distance,shotOneVOne:false,shotClearKeeperChance:false,airborne:false,strikeStyle:'POWER',arcProfile:null});
  return{m,gk};
}

function run(s){
  const {m,gk}=setup(s);let contact=null,boundary=null,contactScore=null,contactMode=null,previousBall={x:m.ball.x,y:m.ball.y},crossing=null,followThrough=[],replayFrames=[];
  for(let i=0;i<100;i++){
    const before={time:m.time,x:m.ball.x,y:m.ball.y,vx:m.ball.vx,vy:m.ball.vy,mode:m.ball.mode,kind:m.ball.kind,score:{...m.score},restart:m.restart,goals:m.stats.goals};
    C.step(m,.05);
    if(s.id==='C-OUTSIDE-CORNER'){const frame=C.snapshot(m);frame.visualPhase=m.restart?.ballReturn?.phase||frame.phase;replayFrames.push(frame);}
    if(s.id==='C-OUTSIDE-CORNER'&&m.restart?.kind==='CORNER'&&m.restart.ballReturn&&(m.restart.ballReturn.phase==='OUT_FOLLOW_THROUGH'||m.restart.ballReturn.phase==='RETURNING')&&m.time<=m.restart.ballReturn.returnUntil)followThrough.push({time:m.time,x:m.ball.x,y:m.ball.y,phase:m.restart.ballReturn.phase});
    const terminalEvent=m.events.find(e=>e.t>=100&&['GOAL','CORNER','GOAL_KICK','THROW_IN'].includes(e.type));
    if(!crossing&&terminalEvent){crossing={...(terminalEvent.crossing||{x:m.restart?.ballReturn?.from?.x??m.ball.x,y:m.restart?.ballReturn?.from?.y??m.ball.y}),time:terminalEvent.t};}
    const touch=m.events.find(e=>e.t>=100&&e.type==='TOUCH_DEFLECT');
    if(touch&&!contact){
      contact={time:touch.t,ball:{x:touch.sharedContactStage.current.x,y:touch.sharedContactStage.current.y},gk:{...touch.sharedContactStage.gkAfter},velocityBefore:touch.ballVelocityBefore,velocityAfter:touch.ballVelocityAfter,contactOffset:touch.contactOffset,lateralImpulse:touch.lateralImpulse,scoreAtContact:touch.scoreAtContact,goalsAtContact:touch.goalsAtContact,modeAtContact:touch.ballState.mode,kindAtContact:touch.ballState.kind,lastTouchTeamAtContact:touch.ballState.lastTouchTeam,lastTouchPlayerAtContact:touch.ballState.lastTouchPlayer,shotSourcePlayerIdAtContact:m.ball.shotSourcePlayerId||null,npcGkOutcomeAtContact:touch.npcGkOutcome,neutralState:m.ball.npcGkResolved,postTouchLive:m.ball.mode==='FLIGHT'&&m.ball.kind==='SHOT'};
      contactScore={...m.score};contactMode=m.ball.mode;
    }
    const terminal=m.events.find(e=>e.t>=100&&['GOAL','CORNER','GOAL_KICK','THROW_IN'].includes(e.type));
    if(terminal&&!boundary)boundary={time:terminal.t,eventType:terminal.type,text:terminal.text,actorId:terminal.actorId||null,restart:m.restart?.kind||null,score:{...m.score},lastTouchTeam:m.ball.lastTouchTeam,lastTouchPlayer:m.ball.lastTouchPlayer,ballMode:m.ball.mode,ballKind:m.ball.kind};
    const followStart=followThrough.find(f=>f.phase==='OUT_FOLLOW_THROUGH');
    if(contact&&boundary&&(s.id!=='C-OUTSIDE-CORNER'||(followStart&&followThrough.some(f=>f.phase==='OUT_FOLLOW_THROUGH'&&f.time-followStart.time>=.50))))break;
    if(before.mode==='DEAD'&&m.ball.mode==='DEAD'&&!contact)break;
  }
  const outsideBeat=followThrough.filter(f=>f.phase==='OUT_FOLLOW_THROUGH');
  const visualFrames=replayFrames.filter(f=>f.visualPhase==='OUT_FOLLOW_THROUGH'),replayDeltas=visualFrames.slice(1).map((f,i)=>Number((f.visualTime-replayFrames.filter(x=>x.visualPhase==='OUT_FOLLOW_THROUGH')[i].visualTime).toFixed(3)));
  return{...s,contact,boundary,crossing,followThrough,replayFrames:replayFrames.map(f=>({time:f.time,visualTime:f.visualTime,x:f.ball.x,y:f.ball.y,phase:f.visualPhase})),replayDeltas,final:{time:m.time,score:m.score,mode:m.ball.mode,restart:m.restart?.kind||null,lastTouchTeam:m.ball.lastTouchTeam,lastTouchPlayer:m.ball.lastTouchPlayer},assertions:{scoreUnchangedAtContact:!!contact&&contactScore.HOME===0&&contactScore.AWAY===0, noRestartAtContact:!!contact&&contactMode==='FLIGHT'&&contact.postTouchLive, laterBoundary:!!contact&&!!boundary&&boundary.time>contact.time,neutralContact:!!contact&&contact.neutralState==='TOUCH_CONTINUE'&&contact.npcGkOutcomeAtContact==='TOUCH_CONTINUE',gkLastTouch:!!contact&&contact.lastTouchTeamAtContact==='AWAY'&&contact.lastTouchPlayerAtContact==='A-GK',velocityChanged:!!contact&&JSON.stringify(contact.velocityBefore)!==JSON.stringify(contact.velocityAfter),cornerFollowThrough: s.id!=='C-OUTSIDE-CORNER'||(crossing&&outsideBeat.length>0&&outsideBeat.some(f=>f.x>105)&&outsideBeat.at(-1).time-outsideBeat[0].time>=.50),cornerRestartPreserved:s.id!=='C-OUTSIDE-CORNER'||(boundary?.eventType==='CORNER'&&boundary.restart==='CORNER'&&boundary.score?.HOME===0&&boundary.score?.AWAY===0),replayCadence:s.id!=='C-OUTSIDE-CORNER'||(visualFrames.length>=2&&replayDeltas.every(d=>d<=.051)&&visualFrames.at(-1).visualTime-visualFrames[0].visualTime>=.50)}};
}

const rows=cases.map(run);
const checks={threeFixtures:rows.length===3,leftGoal:rows[0].boundary?.eventType==='GOAL',rightGoal:rows[1].boundary?.eventType==='GOAL',leftCrossingBand:rows[0].crossing?.y>=31.0&&rows[0].crossing?.y<=32.0,rightCrossingBand:rows[1].crossing?.y>35.0,oppositePostVy:Math.sign(rows[0].contact?.velocityAfter?.y||0)!==Math.sign(rows[1].contact?.velocityAfter?.y||0),leftDescription:!rows[0].boundary?.text?.includes('A-GK')&&rows[0].boundary?.text?.includes('중앙'),rightDescription:!rows[1].boundary?.text?.includes('A-GK')&&rows[1].boundary?.text?.includes('오른쪽'),goalActorIsShooter:rows.slice(0,2).every(r=>r.boundary?.actorId==='H-ST'),sourceCapturedAtContact:rows.slice(0,2).every(r=>r.contact?.shotSourcePlayerIdAtContact==='H-ST'),lastTouchRemainsGkAtContact:rows.slice(0,2).every(r=>r.contact?.lastTouchPlayerAtContact==='A-GK'),outsidePostCorner:rows[2].boundary?.eventType==='CORNER',allContact:rows.every(r=>r.contact),allCausal:rows.every(r=>Object.entries(r.assertions).filter(([k])=>k!=='replayCadence').every(([,v])=>v)),goalTimesLater:rows.slice(0,2).every(r=>r.boundary&&r.contact&&r.boundary.time>r.contact.time),cornerTimeLater:!!rows[2].boundary&&!!rows[2].contact&&rows[2].boundary.time>rows[2].contact.time,cornerKeepsGkLastTouch:rows[2].boundary?.lastTouchTeam==='AWAY'&&rows[2].boundary?.lastTouchPlayer==='A-GK',replayCadence:rows[2].assertions.replayCadence};
const pass=Object.values(checks).every(Boolean);
const report={schema:'FLR_GK_TOUCH_DEFLECTION_CONTINUATION_V1',dt:.05,verdict:pass?'PASS_FOR_VISUAL_RETEST':'FAIL',checks,rows};
console.log(JSON.stringify(report,null,2));
if(!pass)process.exit(1);
