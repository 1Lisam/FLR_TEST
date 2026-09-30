'use strict';
const path=require('path');
const root=path.resolve(__dirname,'..');
const E=require(path.join(root,'runtime','continuous_match_core.js'));

function fixture(seed='V34-RUSH-15M-20'){
  const m=E.createMatch(seed,{dt:.05});m.restart=null;m.phase='OPEN_PLAY';m.nextShape=.20;m.events=[];
  for(const p of m.players){p.nextThink=99999;p.vx=p.vy=0;p.hasBall=false;}
  const st=m.playersById['H-ST'],gk=m.playersById['A-GK'],primary=m.playersById['A-LCB'],cover=m.playersById['A-RCB'];
  Object.assign(st,{x:88,y:34,tx:88,ty:34,bodyAngle:0,faceTargetAngle:0,postShotHoldUntil:.90,lockTargetUntil:.80,nextThink:99999,runUntil:4,runType:'POST_SHOT_RUN',action:'POST_SHOT_FOLLOW',tacticalTask:'POST_SHOT_FOLLOW'});
  Object.assign(gk,{x:101,y:34,tx:101,ty:34,action:'GK_SAVE_SET',tacticalTask:'GK_SAVE_SET'});
  Object.assign(primary,{x:92,y:38,tx:92,ty:38,action:'DEFEND_SHAPE',tacticalTask:'COVER'});
  Object.assign(cover,{x:88,y:27,tx:88,ty:27,action:'DEFEND_SHAPE',tacticalTask:'COVER'});
  m.playerAbilityProfiles={'A-GK':{handling:45,reaction:60,gk_positioning:60,agility:60,diving:60},'H-ST':{finishing:75,pace:60,acceleration:60}};
  m.ball={mode:'FLIGHT',kind:'SHOT',x:90,y:34,z:0,vx:20,vy:0,vz:0,age:.4,ownerId:null,intendedReceiverId:null,lastTouchTeam:'HOME',lastTouchPlayer:'H-ST',shotTeam:'HOME',shotTargetY:34,onTarget:true,shotOneVOne:true,shotClearKeeperChance:true,shotDistance:15,originX:90,originY:34,targetX:105,targetY:34,airborne:false};
  return{m,st,gk,primary,cover};
}

function runRush(){
  const {m,st,gk,primary,cover}=fixture(),frames=[];let block=null;
  for(let i=0;i<25;i++){
    E.step(m,.05);
    const f=m.events.find(e=>e.type==='RUSH_BLOCK');
    if(f&&!block)block=f;
    if(block&&m.time>=block.t+.80){
      frames.push(frame(m,st,gk,primary,cover,block));
      break;
    }
    if(block)frames.push(frame(m,st,gk,primary,cover,block));
  }
  const post=frames.filter(f=>f.t>=block?.t&&f.t<=block?.t+.80);
  const firstChase=post.find(f=>f.st.action==='CHASE_LOOSE');
  const firstGkControl=post.find(f=>f.ball.mode==='CONTROLLED'&&f.ball.ownerId==='A-GK');
  const stDisplacement=post.length?post[post.length-1].st.x-post[0].st.x:0;
  const stSpeeds=post.map(f=>f.st.speed);
  const checks={
    blockExists:!!block,
    stEntersChaseBeforeKeeperPossession:!!firstChase&&(!firstGkControl||firstChase.t<firstGkControl.t),
    stClearsPostShotState:!!firstChase&&firstChase.st.postShotHoldUntil===0&&firstChase.st.lockTargetUntil===0&&firstChase.st.runUntil===0,
    stHasNormalAccelerationRamp:stSpeeds.length>=4&&stSpeeds[0]<stSpeeds[stSpeeds.length-1]&&stSpeeds[stSpeeds.length-1]>=1.0,
    onePrimaryDefenderAndCover:post.some(f=>f.primary.action==='CHASE_LOOSE'&&['COVER','SHOT_LANE_COVER'].includes(f.cover.task)),
    noImmediateGkRecapture:!firstGkControl||firstGkControl.t>=block.t+.60,
    looseWindowAtLeast800ms:post.length>=15&&post[post.length-1].t>=block.t+.80-.001
  };
  return{fixture:'RUSH-15M-20',block:block?{time:block.t,contact:block.contact,velocity:block.ballVelocityAfter}:null,postBlockFrames:post,summary:{stDisplacement:Number(stDisplacement.toFixed(3)),stSpeedRange:[Number(Math.min(...stSpeeds).toFixed(3)),Number(Math.max(...stSpeeds).toFixed(3))]},checks};
}

function frame(m,st,gk,primary,cover,block){
  return{t:Number(m.time.toFixed(2)),sinceBlock:Number((m.time-block.t).toFixed(2)),ball:{mode:m.ball.mode,ownerId:m.ball.ownerId||null,x:Number(m.ball.x.toFixed(3)),y:Number(m.ball.y.toFixed(3))},st:{x:Number(st.x.toFixed(3)),y:Number(st.y.toFixed(3)),vx:Number(st.vx.toFixed(3)),vy:Number(st.vy.toFixed(3)),speed:Number(Math.hypot(st.vx,st.vy).toFixed(3)),action:st.action,task:st.tacticalTask,postShotHoldUntil:st.postShotHoldUntil||0,lockTargetUntil:st.lockTargetUntil||0,nextThink:st.nextThink,runUntil:st.runUntil||0,runType:st.runType||null},primary:{x:Number(primary.x.toFixed(3)),speed:Number(Math.hypot(primary.vx,primary.vy).toFixed(3)),action:primary.action,task:primary.tacticalTask},cover:{x:Number(cover.x.toFixed(3)),y:Number(cover.y.toFixed(3)),speed:Number(Math.hypot(cover.vx,cover.vy).toFixed(3)),action:cover.action,task:cover.tacticalTask},gk:{x:Number(gk.x.toFixed(3)),speed:Number(Math.hypot(gk.vx,gk.vy).toFixed(3)),action:gk.action,task:gk.tacticalTask}};
}

function chaseBaseline(){
  const m=E.createMatch('V34-CHASE-BASELINE',{dt:.05});m.restart=null;m.phase='OPEN_PLAY';m.nextShape=99999;m.possession='AWAY';
  const st=m.playersById['H-ST'];Object.assign(st,{x:88,y:34,tx:98.8,ty:34,bodyAngle:0,action:'CHASE_LOOSE',tacticalTask:'CHASE_LOOSE',sprint:true});
  m.ball={mode:'LOOSE',kind:'LOOSE',x:98.8,y:34,z:0,vx:0,vy:0,vz:0,age:.1,ownerId:null,intendedReceiverId:null,lastTouchTeam:'AWAY',lastTouchPlayer:'A-GK'};
  const rows=[];for(let i=0;i<16;i++){E.step(m,.05);rows.push({t:Number(m.time.toFixed(2)),x:st.x,speed:Math.hypot(st.vx,st.vy),action:st.action});}
  return rows;
}

const rush=runRush(),baseline=chaseBaseline(),lastRush=rush.postBlockFrames.at(-1),lastBase=baseline.at(-1);
const baselineDisplacement=lastBase.x-baseline[0].x;
rush.comparison={baseline:{frames:baseline,displacement:Number(baselineDisplacement.toFixed(3)),maxSpeed:Number(Math.max(...baseline.map(x=>x.speed)).toFixed(3))},checks:{noArtificialSuppression:rush.summary.stDisplacement>=baselineDisplacement*.70&&rush.summary.stSpeedRange[1]>=Math.max(1.0,Math.max(...baseline.map(x=>x.speed))*.70)}};
const pass=Object.values(rush.checks).every(Boolean)&&rush.comparison.checks.noArtificialSuppression;
console.log(JSON.stringify({schema:'FLR_V34_GK_RUSH_BLOCK_CHASE_PACE_V1',dt:.05,verdict:pass?'PASS_FOR_VISUAL_RETEST':'FAIL',checks:{...rush.checks,...rush.comparison.checks},rush,comparison:rush.comparison},null,2));
if(!pass)process.exit(1);
