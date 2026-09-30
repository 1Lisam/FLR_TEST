'use strict';
const fs=require('fs'),path=require('path');const root=process.argv[2],file=process.argv[3];if(!root||!file){console.error('usage: node stage_c_frozen_gk_interaction_replay.js TARGET_ROOT FROZEN_STATES.json');process.exit(2)}
const E=require(path.join(root,'runtime','continuous_match_core.js')),states=JSON.parse(fs.readFileSync(file,'utf8')),results=[];
for(let i=0;i<states.length;i++){
 const st=states[i],m=E.createMatch(`FROZEN-${i}`,{telemetry:{}}),t0=100;m.time=t0;m.completed=false;m.restart=null;m.phase='CHANCE';m.possession=st.shotTeam;m.score={HOME:0,AWAY:0};m.stats.goals=0;m.stats.saves=0;m.stats.blocks=0;m.stats.shotBlocks=0;m.stats.gkCatches=0;m.stats.gkParries=0;m.lastShotAt[st.shotTeam]=t0;m.nextShape=t0+st.shapeDelta;m.ballOwner=null;
 let k=0;for(const p of m.players){p.hasBall=false;if(p.role!=='GK'){p.x=52.5;p.y=4+(k++%10)*6;p.tx=p.x;p.ty=p.y;p.vx=p.vy=0;p.action=p.tacticalTask='HOLD_SHAPE';p.nextThink=999;}}
 const gk=m.playersById[st.gk.id];Object.assign(gk,st.gk);gk.hasBall=false;m.ball=JSON.parse(JSON.stringify(st.ball));m.ball.mode='FLIGHT';m.ball.kind='SHOT';m.ball.ownerId=null;m.ball.age=Number(m.ball.age)||0;m.ball.shotTeam=st.shotTeam;
 let steps=0,outcome=null,minD=99;while(!outcome&&steps++<80){E.step(m,.05);minD=Math.min(minD,Math.hypot(gk.x-m.ball.x,gk.y-m.ball.y));if(m.stats.goals>0)outcome='GOAL';else if((m.stats.gkCatches||0)>0)outcome='CATCH';else if((m.stats.gkParries||0)>0)outcome='PARRY';else if(m.stats.saves>0)outcome='SAVE_OTHER';else if(m.stats.blocks>0||m.stats.shotBlocks>0)outcome='BLOCK';else if(!(m.ball.mode==='FLIGHT'&&m.ball.kind==='SHOT'))outcome='MISS';}
 results.push({i,sourceSeed:st.seed,t:st.t,dGoal:st.dGoal,nearestDefender:st.nearestDefender,outcome:outcome||'UNRESOLVED',minGkBall:Number(minD.toFixed(3)),steps,postBallMode:m.ball.mode,postOwnerId:m.ball.ownerId||null});
}
const counts={};for(const r of results)counts[r.outcome]=(counts[r.outcome]||0)+1;
console.log(JSON.stringify({schema:'FLR_STAGE_C_FROZEN_GK_INTERACTION_V1',root,n:results.length,counts,results},null,2));
