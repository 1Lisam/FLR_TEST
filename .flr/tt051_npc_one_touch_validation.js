'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]||process.argv[1]||'.'),E=require(path.join(root,'runtime/continuous_match_core.js'));
const checks=[];const add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
const core=fs.readFileSync(path.join(root,'runtime/continuous_match_core.js'),'utf8');
const iBob=core.indexOf("event(m,'PASS_BOBBLE'");const iNpc=core.indexOf("tryNpcOneTouchPass(m,p,flightKind,sourceId,passTeam,incomingSpeed)",iBob);
add('npc-touch-after-miscontrol-contest',iBob>=0&&iNpc>iBob,{iBob,iNpc});
add('protagonist-excluded',core.includes("p.id===m.protagonistControllerId"));
add('anti-pingpong-cooldown',core.includes('m.npcOneTouchChainUntil=m.time+.72'));
function setup(seed,receiverId='H-CM',sourceId='H-LCM',hero='H-ST',miscontrol=false){const m=E.createMatch(seed,{});m.time=1200;m.phase='OPEN_PLAY';m.restart=null;m.completed=false;m.possession='HOME';m.protagonistControllerId=hero;for(const p of m.players){p.hasBall=false;p.vx=p.vy=0;p.runUntil=0;p.nextThink=9999;p.lockTargetUntil=0;if(p.team==='HOME'){p.x=52;p.y=p.slot==='RW'?52:p.slot==='LW'?16:34;}else{p.x=84;p.y=p.slot==='RW'?54:p.slot==='LW'?14:60;}}
 const r=m.playersById[receiverId],src=m.playersById[sourceId],target=m.playersById['H-RW'];r.x=70;r.y=34;src.x=62;src.y=34;target.x=78;target.y=46;target.nextThink=9999;m.ball={...m.ball,mode:'FLIGHT',x:68.8,y:34,z:0,vx:13,vy:0,vz:0,ownerId:null,intendedReceiverId:r.id,kind:'PASS',lastTouchTeam:'HOME',lastTouchPlayer:src.id,age:.35,originX:62,originY:34,targetX:r.x,targetY:r.y,deliveryMode:'GROUND',airborne:false,passMiscontrol:miscontrol,interceptResolved:true};m.ballOwner=null;m.lastTouchTeam='HOME';m.lastTouchPlayer=src.id;return m;}
let observed=0,examples=[];for(let n=0;n<80;n++){const m=setup('NPC-OT-'+n);for(let k=0;k<6&&m.ball.mode==='FLIGHT';k++)E.step(m,.05);if((m.stats.npcOneTouchPasses||0)>0){observed++;if(examples.length<3)examples.push({seed:n,time:m.time,ball:m.ball.kind,source:m.ball.lastTouchPlayer,target:m.ball.intendedReceiverId});}}
add('npc-one-touch-observed',observed>0&&observed<45,{observed,examples});
let heroAuto=0;for(let n=0;n<25;n++){const m=setup('HERO-NO-OT-'+n,'H-CM','H-LCM','H-CM');for(let k=0;k<6&&m.ball.mode==='FLIGHT';k++)E.step(m,.05);heroAuto+=m.stats.npcOneTouchPasses||0;}add('hero-never-npc-one-touch',heroAuto===0,{heroAuto});
let mis=0;for(let n=0;n<15;n++){const m=setup('MISCONTROL-'+n,'H-CM','H-LCM','H-ST',true);for(let k=0;k<6&&m.ball.mode==='FLIGHT';k++)E.step(m,.05);mis+=m.stats.npcOneTouchPasses||0;}add('miscontrol-preempts-one-touch',mis===0,{mis});
let chainOk=false;for(let n=0;n<100&&!chainOk;n++){const m=setup('CHAIN-'+n);for(let k=0;k<10;k++)E.step(m,.05);if((m.stats.npcOneTouchPasses||0)>0){const first=m.stats.npcOneTouchPasses;for(let k=0;k<12;k++)E.step(m,.05);chainOk=(m.stats.npcOneTouchPasses||0)===first;}}
add('no-immediate-one-touch-chain',chainOk);
const failures=checks.filter(x=>!x.ok);console.log(JSON.stringify({schemaVersion:'FLR_TT051_NPC_ONE_TOUCH_VALIDATION_1.0',pass:!failures.length,checks,failures},null,2));process.exit(failures.length?1:0);
