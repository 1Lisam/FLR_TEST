'use strict';
const E=require('../runtime/continuous_match_core.js');
const B=E.choiceStateBridge();
function setOwner(m,id,x,y,vx,vy=0){const p=m.playersById[id];m.possession=p.team;m.ball.mode='CONTROLLED';m.ball.ownerId=id;m.ball.x=x;m.ball.y=y;m.ball.z=0;m.ball.vx=0;m.ball.vy=0;m.ball.vz=0;p.x=x;p.y=y;p.vx=vx;p.vy=vy;p.hasBall=true;p.controlledSince=m.time;for(const q of m.players)if(q.id!==id)q.hasBall=false;return p;}
function moveOppAway(m,team){for(const p of m.players){if(p.team===team&&p.role!=='GK'){p.x=team==='AWAY'?70:35;p.y=5+(p.slot.length*7)%58;p.tx=p.x;p.ty=p.y;}}}
const m=E.createMatch('G3-ST-RUN',{telemetry:{}});moveOppAway(m,'AWAY');const st=setOwner(m,'H-ST',92.75,34,5.4,0);st.bodyAngle=0;
const s=B.inspect(m,'H-ST');
const results=[
 {id:'G3_ST_RUNNING_SHOT_VISIBLE',pass:s?.kind==='ON_BALL'&&s.candidates.some(c=>c.id==='SHOT'),detail:{kind:s?.kind,speed:Math.hypot(st.vx,st.vy),shot:s?.shot,candidates:s?.candidates.map(c=>c.id)}},
 {id:'G3_NO_SCENE_REPLACEMENT',pass:Math.abs(st.x-92.75)<1e-9&&Math.abs(st.vx-5.4)<1e-9,detail:{x:st.x,vx:st.vx}}
];
const pass=results.every(x=>x.pass);console.log(JSON.stringify({pass,results},null,2));if(!pass)process.exit(1);
