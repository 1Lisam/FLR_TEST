'use strict';
const path=require('path'); const src=path.resolve(process.argv[2]); const trials=Number(process.argv[3]||400),gkv=Number(process.argv[4]||60),stv=Number(process.argv[5]||70);
const C=require(path.join(src,'runtime/continuous_match_core.js')); const A=require(path.join(src,'runtime/attribute_match_adapter.js')); const bridge=C.choiceActionBridge();
function profile(v){return A.withOverrides(A.baseProfile(60),{finishing:v,reaction:v,balance:v,ball_control:v,agility:v,diving:v,gk_positioning:v,handling:v});}
const rows=[];
for(let i=0;i<trials;i++){
 const m=C.createMatch(`GKCLR-${String(i+1).padStart(4,'0')}`,{dt:.05}); m.restart=null;m.phase='OPEN_PLAY';m.nextShape=0; const st=m.playersById['H-ST'],gk=m.playersById['A-GK'];
 for(const p of m.players){p.vx=p.vy=0;p.sprint=false;p.nextThink=9999;if(p.team==='AWAY'&&p.role!=='GK'){p.x=78+(p.slot.includes('L')?0:1);p.y=p.slot.includes('L')?8:p.slot.includes('R')?60:54;p.tx=p.x;p.ty=p.y;}}
 st.x=92;st.y=34;st.tx=92;st.ty=34;st.bodyAngle=0;st.faceTargetAngle=0;gk.x=102.5;gk.y=34;gk.tx=102.5;gk.ty=34;gk.bodyAngle=Math.PI;A.assign(m,st.id,profile(stv));A.assign(m,gk.id,profile(gkv));bridge.setControlled(m,st);m.ball.x=92.45;m.ball.y=34;st.nextThink=9999;
 bridge.executeShot(m,st,'FORCED_CLEAR',{releaseNow:true}); const initial={targetY:m.ball.shotTargetY,onTarget:m.ball.onTarget,speed:Math.hypot(m.ball.vx,m.ball.vy),originX:m.ball.originX,originY:m.ball.originY}; let out='TIMEOUT',endAge=null,endGK=null;
 for(let k=0;k<90;k++){C.step(m,.05);const es=m.events.slice(-5);if(es.some(e=>e.type==='GOAL')){out='GOAL';endAge=m.ball.age;endGK={x:gk.x,y:gk.y,action:gk.action};break;} if(es.some(e=>e.type==='SAVE'||e.type==='PARRY')){out='SAVE';endAge=m.ball.age;endGK={x:gk.x,y:gk.y,action:gk.action};break;} if(m.restart&&m.restart.kind==='GOAL_KICK'){out='MISS';endAge=m.ball.age;endGK={x:gk.x,y:gk.y,action:gk.action};break;}}
 rows.push({i:i+1,...initial,targetOffset:initial.targetY==null?null:Math.abs(initial.targetY-34),out,endAge,endGK});
}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:null} const on=rows.filter(r=>r.onTarget!==false),by={};for(const o of ['SAVE','GOAL','MISS','TIMEOUT']){const rr=rows.filter(r=>r.out===o);by[o]={n:rr.length,targetOffsetAvg:avg(rr.map(r=>r.targetOffset).filter(Number.isFinite)),ageAvg:avg(rr.map(r=>r.endAge).filter(Number.isFinite)),gkLateralAvg:avg(rr.map(r=>r.endGK?Math.abs(r.endGK.y-34):null).filter(Number.isFinite))};}
const bins={};for(const r of on){const b=Math.min(5,Math.floor((r.targetOffset||0)/.5)*.5).toFixed(1);(bins[b]??={n:0,save:0,goal:0}).n++; if(r.out==='SAVE')bins[b].save++;if(r.out==='GOAL')bins[b].goal++;}
console.log(JSON.stringify({src,trials,gkv,stv,onTarget:on.length,by,bins,rows},null,2));
