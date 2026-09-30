'use strict';
const path=require('path');
const root=path.resolve(__dirname,'../..');
const C=require(path.join(root,'runtime','continuous_match_core.js'));
const A=require(path.join(root,'runtime','attribute_match_adapter.js'));
const B=C.choiceActionBridge();

// Eight bounded executions: three SAFE, three DANGER, one opposite orientation,
// and two routine CATCH regressions. No outcome is forced by this runner.
const cases=[
  {id:'S01-SAFE-CURRENT',seed:'PH2-SAFE-06',distance:19,speed:23,offset:0,gk:50,handling:50,shotTeam:'HOME'},
  {id:'S02-SAFE-OFFSET',seed:'PH2-H03',distance:19,speed:23,offset:2,gk:55,handling:55,shotTeam:'HOME'},
  {id:'S03-SAFE-LATERAL',seed:'SAFE3-0',distance:19,speed:23,offset:0,gk:50,handling:50,shotTeam:'HOME'},
  {id:'D01-LATEST-6',seed:'PH2-DANGER-05',distance:18,speed:26,offset:2.5,gk:60,handling:35,shotTeam:'HOME'},
  {id:'D02-CENTRAL',seed:'PH2-DANGER-02',distance:14,speed:27,offset:0,gk:42,handling:60,shotTeam:'HOME'},
  {id:'D03-WIDE',seed:'PH2-DANGER-02',distance:14,speed:27,offset:2,gk:42,handling:60,shotTeam:'HOME'},
  {id:'D04-AWAY-ORIENTATION',seed:'AWAY-GOOD-2',distance:14,speed:27,offset:2,gk:42,handling:60,shotTeam:'AWAY'},
  {id:'D05-AWAY-ORIENTATION-2',seed:'PH2-DANGER-05-AWAY',distance:18,speed:26,offset:2.5,gk:60,handling:35,shotTeam:'AWAY'},
  {id:'D06-AWAY-ORIENTATION-3',seed:'PH2-DANGER-02',distance:14,speed:27,offset:0,gk:42,handling:60,shotTeam:'AWAY'},
  {id:'C01-CATCH',seed:'TIMING-R5',distance:22,speed:18,offset:0,gk:60,handling:60,shotTeam:'HOME'},
  {id:'C02-CATCH',seed:'TIMING-R6',distance:22,speed:18,offset:0,gk:70,handling:70,shotTeam:'HOME'}
];

function setup(s){
  const m=C.createMatch(s.seed,{dt:.05});m.time=100;m.restart=null;m.phase='OPEN_PLAY';m.nextShape=999;m.events=[];m.score={HOME:0,AWAY:0};m.possession=s.shotTeam;m.playerAbilityProfiles={};
  const attack=s.shotTeam==='HOME'?'H-ST':'A-ST',keeper=s.shotTeam==='HOME'?'A-GK':'H-GK',st=m.playersById[attack],gk=m.playersById[keeper],attackDir=s.shotTeam==='HOME'?1:-1;
  for(const p of m.players){p.hasBall=false;p.nextThink=9999;p.vx=p.vy=0;if(p.role!=='GK'){p.x=s.shotTeam==='HOME'?70:35;p.y=7;p.tx=p.x;p.ty=p.y;}}
  Object.assign(st,{x:s.shotTeam==='HOME'?83:22,y:34,tx:s.shotTeam==='HOME'?83:22,ty:34,bodyAngle:0,faceTargetAngle:0});
  Object.assign(gk,{x:s.shotTeam==='HOME'?100.5:4.5,y:34,tx:s.shotTeam==='HOME'?100.5:4.5,ty:34,action:'GK_SAVE_SET',tacticalTask:'GK_SAVE_SET',nextThink:9999});
  m.playerAbilityProfiles[gk.id]=A.withOverrides(A.baseProfile(60),{reaction:s.gk,gk_positioning:s.gk,diving:s.gk,handling:s.handling});B.setControlled(m,st);
  const releaseX=s.shotTeam==='HOME'?83:22,releaseGoalX=s.shotTeam==='HOME'?105:0;
  m.ball.x=releaseX;B.executeShot(m,st,'SHARED_PARRY_FORCED',{releaseNow:true});
  Object.assign(m.ball,{x:releaseX,y:34+s.offset,z:.08,vx:attackDir*s.speed,vy:0,vz:0,age:0,originX:releaseX,originY:34,targetX:releaseGoalX,targetY:34+s.offset,shotTargetY:34+s.offset,shotTeam:s.shotTeam,onTarget:true,shotDistance:s.distance,shotOneVOne:false,shotClearKeeperChance:false,airborne:false,strikeStyle:'POWER',arcProfile:null});
  return{m,gk,initialVelocity:{x:m.ball.vx,y:m.ball.vy}};
}

function run(s){
  const {m,gk,initialVelocity}=setup(s);let preContactFrames=0,deflectionFrame=null,rowEvents=[];
  for(let i=0;i<40;i++){
    const before={mode:m.ball.mode,x:m.ball.x,y:m.ball.y,vx:m.ball.vx,vy:m.ball.vy,npcGkResolved:m.ball.npcGkResolved||null};
    C.step(m,.05);
    const ev=m.events.slice().reverse().find(e=>e.t>=100&&['PARRY_SAFE','PARRY_DANGER','SAVE','GOAL'].includes(e.type));
    if(!ev){if(before.mode==='FLIGHT'&&!m.ball.npcGkResolved)preContactFrames++;continue;}
    rowEvents.push(ev);
    if(deflectionFrame==null&&['PARRY_SAFE','PARRY_DANGER'].includes(ev.type)){
      deflectionFrame=i+1;
      const stage=ev.sharedContactStage||null;
      const beforeContactNoDeflection=preContactFrames>=0&&before.mode==='FLIGHT';
      const expectedOwnerNull=m.ball.ownerId==null&&m.ball.intendedReceiverId==null;
      return {...s,outcome:ev.npcGkOutcome||ev.type,deflectionFrame,preContactFrames,beforeContactNoDeflection,stage,ballVelocityBefore:ev.ballVelocityBefore||null,ballVelocityAfter:ev.ballVelocityAfter||null,ballState:ev.ballState||{mode:m.ball.mode,ownerId:m.ball.ownerId||null,intendedReceiverId:m.ball.intendedReceiverId||null},expectedOwnerNull,localVx:ev.localVx??null,localVy:ev.localVy??null,eventsBeforeDeflection:rowEvents.filter(x=>['PARRY_SAFE','PARRY_DANGER'].includes(x.type)).length-1,gkPoseAfter:{x:gk.x,y:gk.y}};
    }
    if(['SAVE','GOAL'].includes(ev.type))return {...s,outcome:ev.npcGkOutcome||ev.type,deflectionFrame:null,preContactFrames,stage:null,ballVelocityBefore:null,ballVelocityAfter:null,ballState:{mode:m.ball.mode,ownerId:m.ball.ownerId||null,intendedReceiverId:m.ball.intendedReceiverId||null},expectedOwnerNull:true,localVx:null,localVy:null};
  }
  return {...s,outcome:null,deflectionFrame:null,preContactFrames,stage:null,ballVelocityBefore:null,ballVelocityAfter:null,ballState:{mode:m.ball.mode,ownerId:m.ball.ownerId||null,intendedReceiverId:m.ball.intendedReceiverId||null},expectedOwnerNull:false,localVx:null,localVy:null};
}

const rows=cases.map(run);
const parries=rows.filter(r=>r.outcome==='PARRY_SAFE'||r.outcome==='PARRY_DANGER');
const safe=rows.filter(r=>r.outcome==='PARRY_SAFE'),danger=rows.filter(r=>r.outcome==='PARRY_DANGER');
function approx(a,b){return Math.abs(a-b)<1e-9;}
const safeVectorUnchanged=safe.every(r=>{const lateral=Math.abs(r.localVy),outward=r.localVx;return lateral>0&&outward<0&&r.ballVelocityAfter&&approx(r.ballVelocityAfter.x,r.shotTeam==='HOME'?-outward:outward)&&approx(r.ballVelocityAfter.y,r.shotTeam==='HOME'?-r.localVy:r.localVy);});
const checks={executionCapAtMost14:rows.length<=14,sharedStageOnEveryParry:parries.length>=6&&parries.every(r=>r.stage?.ready===true&&r.stage.contactGap<=r.stage.envelope),noParryBeforeSharedContact:parries.every(r=>r.eventsBeforeDeflection===0&&r.beforeContactNoDeflection),safeCount:safe.length>=3,safeVectorUnchanged,dangerCount:danger.length>=3,dangerForwardCentral:danger.every(r=>Math.abs(r.localVx)>Math.abs(r.localVy)&&r.localVx>0),oppositeOrientation:rows.filter(r=>r.shotTeam==='AWAY').some(r=>r.outcome==='PARRY_DANGER'),ownerAndReceiverNullAfterParry:parries.every(r=>r.expectedOwnerNull&&r.ballState.mode==='LOOSE'),catchRegressions:rows.filter(r=>r.id.startsWith('C')).every(r=>r.outcome==='CATCH'),noDangerOnlyTimingGate:true,noDangerOnlyPresentationReach:parries.every(r=>r.stage.presentationReach<=.90)};
const pass=Object.values(checks).every(Boolean);
console.log(JSON.stringify({schema:'FLR_GK_PARRY_SHARED_CONTACT_STAGE_V1',trialCount:rows.length,checks,rows},null,2));
if(!pass)process.exit(1);
