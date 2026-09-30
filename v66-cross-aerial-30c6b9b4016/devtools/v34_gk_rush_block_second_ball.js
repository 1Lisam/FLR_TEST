'use strict';
const path=require('path');
const root=path.resolve(__dirname,'..');
const E=require(path.join(root,'runtime','continuous_match_core.js'));

function rushFixture(){
  const m=E.createMatch('V34-RUSH-15M-20',{dt:.05});m.restart=null;m.phase='OPEN_PLAY';m.nextShape=99999;m.events=[];
  for(const p of m.players){p.nextThink=99999;p.vx=p.vy=0;p.hasBall=false;}
  const st=m.playersById['H-ST'],gk=m.playersById['A-GK'],primary=m.playersById['A-LCB'],cover=m.playersById['A-RCB'];
  Object.assign(st,{x:88,y:34,tx:88,ty:34,bodyAngle:0,faceTargetAngle:0});
  Object.assign(gk,{x:101,y:34,tx:101,ty:34,action:'GK_SAVE_SET',tacticalTask:'GK_SAVE_SET'});
  Object.assign(primary,{x:92,y:38,tx:92,ty:38,action:'DEFEND_SHAPE',tacticalTask:'COVER'});
  Object.assign(cover,{x:88,y:27,tx:88,ty:27,action:'DEFEND_SHAPE',tacticalTask:'COVER'});
  m.playerAbilityProfiles={'A-GK':{handling:45,reaction:60,gk_positioning:60,agility:60,diving:60},'H-ST':{finishing:75}};
  m.ball={mode:'FLIGHT',kind:'SHOT',x:90,y:34,z:0,vx:20,vy:0,vz:0,age:.4,ownerId:null,intendedReceiverId:null,lastTouchTeam:'HOME',lastTouchPlayer:'H-ST',shotTeam:'HOME',shotTargetY:34,onTarget:true,shotOneVOne:true,shotClearKeeperChance:true,shotDistance:15,originX:90,originY:34,targetX:105,targetY:34,airborne:false};
  return{m,st,gk,primary,cover};
}

function runRush(){
  const {m,st,gk,primary,cover}=rushFixture(),frames=[];let block=null;
  for(let i=0;i<30;i++){
    const before={t:m.time,mode:m.ball.mode,x:m.ball.x,y:m.ball.y,owner:m.ball.ownerId,stX:st.x,stAction:st.action,stTx:st.tx,primaryAction:primary.action,primaryTask:primary.tacticalTask,primaryTx:primary.tx,coverX:cover.x,coverY:cover.y,coverTask:cover.tacticalTask,coverTx:cover.tx,gkX:gk.x};
    E.step(m,.05);
    frames.push({...before,afterMode:m.ball.mode,afterOwner:m.ball.ownerId,afterX:m.ball.x,afterStX:st.x,afterGkX:gk.x});
    if(!block)m.events.find(e=>e.type==='RUSH_BLOCK'&&(block=e));
    if(block&&m.ball.mode==='CONTROLLED')break;
  }
  const post=frames.filter(f=>block&&f.t>=block.t&&f.t<=block.t+1.0),firstLoose=post.find(f=>f.afterMode==='LOOSE'),firstGkControl=post.find(f=>f.afterMode==='CONTROLLED'&&f.afterOwner==='A-GK');
  const stChase=post.some(f=>f.afterMode==='LOOSE'&&f.stAction==='CHASE_LOOSE'&&f.stTx>=f.x-0.01);
  const cbPrimary=post.some(f=>f.afterMode==='LOOSE'&&f.primaryAction==='CHASE_LOOSE'&&f.primaryTx>=f.x-0.01);
  const coverHeld=post.some(f=>f.afterMode==='LOOSE'&&f.coverTask==='COVER'&&Math.abs(f.coverTx-f.x)>2.0);
  return{fixture:'RUSH-15M-20',block:block?{time:block.t,contact:block.contact,ballState:block.ballState,velocity:block.ballVelocityAfter}:null,postBlockFrames:post.slice(0,16),firstLoose:firstLoose?{time:firstLoose.t,age:firstLoose.age,mode:firstLoose.afterMode}:null,firstGkControl:firstGkControl?{time:firstGkControl.t,age:firstGkControl.age}:null,checks:{blockExists:!!block,looseBeatAtLeast600ms:!!block&&post.some(f=>f.t>=block.t+.60&&f.afterMode==='LOOSE'),stChasesBeforeGkControl:stChase&&(!firstGkControl||post.find(f=>f.stAction==='CHASE_LOOSE')?.t<firstGkControl.t),primaryCbReacts:cbPrimary,coverDefenderHolds:coverHeld,gkNotFirstGenericCapture:!firstGkControl||firstGkControl.t>=block.t+.60}};
}

function runNaturalRecapture(){
  const m=E.createMatch('V34-RUSH-NATURAL-RECAPTURE',{dt:.05});m.restart=null;m.phase='OPEN_PLAY';m.nextShape=99999;m.events=[];
  for(const p of m.players){p.nextThink=99999;p.vx=p.vy=0;p.hasBall=false;p.x=50;p.y=8;p.tx=p.x;p.ty=p.y;}
  const gk=m.playersById['A-GK'];Object.assign(gk,{x:101,y:34,tx:101,ty:34,action:'GK_SAVE_RECOVER',tacticalTask:'GK_SAVE_RECOVER'});
  m.ball={mode:'LOOSE',kind:'LOOSE',x:100.55,y:34,z:0,vx:.10,vy:0,vz:0,age:.90,ownerId:null,intendedReceiverId:null,lastTouchTeam:'AWAY',lastTouchPlayer:'A-GK',rushBlock:{contactAt:99,recoveryUntil:99.78,keeperId:gk.id},noCaptureIds:[],noCaptureUntil:0};
  E.step(m,.05);
  return{mode:m.ball.mode,ownerId:m.ball.ownerId,keeperId:gk.id,naturalRecapture:m.ball.mode==='CONTROLLED'&&m.ball.ownerId===gk.id,events:m.events.map(e=>e.type)};
}

const rush=runRush(),natural=runNaturalRecapture();
const checks={...rush.checks,naturalRecaptureRemainsPossible:natural.naturalRecapture,postBlockCausalState:rush.block?.ballState?.mode==='LOOSE'&&rush.block.ballState.ownerId==null&&rush.block.ballState.intendedReceiverId==null};
const pass=Object.values(checks).every(Boolean);
console.log(JSON.stringify({schema:'FLR_V34_GK_RUSH_BLOCK_SECOND_BALL_V1',dt:.05,verdict:pass?'PASS_FOR_VISUAL_RETEST':'FAIL',checks,rush,natural},null,2));
if(!pass)process.exit(1);
