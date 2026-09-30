'use strict';
const path=require('path');
const src=path.resolve(process.argv[2]||'SOURCE/STAGE_F_SET_PIECE_GK_REACTION_WIP');
const trials=Number(process.argv[3]||160);
const C=require(path.join(src,'runtime/continuous_match_core.js'));
const A=require(path.join(src,'runtime/attribute_match_adapter.js'));
const bridge=C.choiceActionBridge();
function profile(v){return A.withOverrides(A.baseProfile(60),{finishing:v,reaction:v,balance:v,ball_control:v,agility:v,diving:v,gk_positioning:v,handling:v});}
function runTier(stVal,gkVal,label){let goals=0,saves=0,misses=0,shots=0,clean=0;for(let i=0;i<trials;i++){
 const m=C.createMatch(`GKCLR-${String(i+1).padStart(4,'0')}`,{dt:0.05});m.restart=null;m.phase='OPEN_PLAY';m.nextShape=0;
 const st=m.playersById['H-ST'],gk=m.playersById['A-GK'];
 // fixed 13m central current-state chance; remove outfield lane interference.
 for(const p of m.players){p.vx=p.vy=0;p.sprint=false;p.nextThink=9999;if(p.team==='AWAY'&&p.role!=='GK'){p.x=78+(p.slot.includes('L')?0:1);p.y=p.slot.includes('L')?8:p.slot.includes('R')?60:54;p.tx=p.x;p.ty=p.y;} }
 st.x=92;st.y=34;st.tx=92;st.ty=34;st.bodyAngle=0;st.faceTargetAngle=0;gk.x=102.5;gk.y=34;gk.tx=102.5;gk.ty=34;gk.bodyAngle=Math.PI;
 A.assign(m,st.id,profile(stVal));A.assign(m,gk.id,profile(gkVal));bridge.setControlled(m,st);m.ball.x=92.45;m.ball.y=34;st.nextThink=9999;
 bridge.executeShot(m,st,'FORCED_CLEAR',{releaseNow:true});shots++;
 let done=false;for(let k=0;k<90&&!done;k++){C.step(m,0.05);const es=m.events.slice(-4);if(es.some(e=>e.type==='GOAL')){goals++;done=true;}else if(es.some(e=>e.type==='SAVE'||e.type==='PARRY')){saves++;done=true;}else if(m.restart&&m.restart.kind==='GOAL_KICK'){misses++;done=true;}}
 clean+=m.stats.cleanKeeperChanceShots||0;
 }
 return{label,stVal,gkVal,trials,shots,cleanKeeperChanceShots:clean,goals,saves,misses,goalRate:goals/trials,saveRate:saves/trials,missRate:misses/trials};}
const out={source:src,trials,tiers:[runTier(40,60,'LOW_ST_BASE_GK'),runTier(60,60,'BASE_ST_BASE_GK'),runTier(80,60,'HIGH_ST_BASE_GK')],gkGradient:[runTier(70,40,'ST70_GK40'),runTier(70,60,'ST70_GK60'),runTier(70,80,'ST70_GK80')]};
out.pass=out.tiers.every(x=>x.cleanKeeperChanceShots===trials)&&out.tiers[1].goals>0&&out.tiers[2].goals>out.tiers[0].goals&&out.gkGradient[0].saveRate<out.gkGradient[1].saveRate&&out.gkGradient[1].saveRate<out.gkGradient[2].saveRate&&out.gkGradient[2].goals>0;
console.log(JSON.stringify(out,null,2));process.exit(out.pass?0:1);
