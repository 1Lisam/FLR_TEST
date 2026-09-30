'use strict';
const path=require('path');
const root=process.argv[2],seed=process.argv[3];
if(!root||!seed){console.error('usage: node stage_c_shot_diag.js ROOT SEED');process.exit(2);}
const E=require(path.join(root,'runtime','continuous_match_core.js'));
const m=E.createMatch(seed,{telemetry:{}}),dt=.05;let steps=0,current=null,shots=[];
const other=t=>t==='HOME'?'AWAY':'HOME';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const seg=(ax,ay,bx,by,px,py)=>{const vx=bx-ax,vy=by-ay,wx=px-ax,wy=py-ay,c1=vx*wx+vy*wy,c2=vx*vx+vy*vy,t=c2?Math.max(0,Math.min(1,c1/c2)):0,qx=ax+vx*t,qy=ay+vy*t;return Math.hypot(px-qx,py-qy)};
let prev={shots:0,goals:0,saves:0,blocks:0,shotBlocks:0,gkCatches:0,gkParries:0};
function closeOutcome(){if(!current)return;const st=m.stats;let out=null;if(st.goals>current.base.goals)out='GOAL';else if((st.gkCatches||0)>current.base.gkCatches)out='CATCH';else if((st.gkParries||0)>current.base.gkParries)out='PARRY';else if(st.saves>current.base.saves)out='SAVE';else if(st.shotBlocks>current.base.shotBlocks||st.blocks>current.base.blocks)out='BLOCK';else if(!(m.ball?.mode==='FLIGHT'&&m.ball?.kind==='SHOT'))out='MISS';if(out){current.outcome=out;shots.push(current);current=null;}}
while(!m.completed&&steps++<220000){
  E.step(m,dt);
  closeOutcome();
  if(m.stats.shots>prev.shots && m.ball?.mode==='FLIGHT'&&m.ball?.kind==='SHOT'){
    const shooter=m.playersById[m.ball.lastTouchPlayer];
    if(shooter){
      const defenders=m.players.filter(p=>p.team===other(shooter.team)&&p.role!=='GK');
      const nearest=defenders.map(p=>({id:p.id,role:p.role,d:dist(p,shooter)})).sort((a,b)=>a.d-b.d)[0]||null;
      const tx=Number.isFinite(m.ball.targetX)?m.ball.targetX:(shooter.team==='HOME'?105:0),ty=Number.isFinite(m.ball.shotTargetY)?m.ball.shotTargetY:34;
      const lane=defenders.map(p=>({id:p.id,role:p.role,dseg:seg(shooter.x,shooter.y,tx,ty,p.x,p.y),d:dist(p,shooter)})).filter(x=>x.dseg<1.6).sort((a,b)=>a.dseg-b.dseg);
      current={t:Number(m.time.toFixed(2)),team:shooter.team,shooter:shooter.id,role:shooter.role,dGoal:Number((m.ball.shotDistance??0).toFixed(2)),onTarget:!!m.ball.onTarget,oneVOne:!!m.ball.shotOneVOne,clearKeeper:!!m.ball.shotClearKeeperChance,style:m.ball.strikeStyle||null,nearestDefender:nearest?Number(nearest.d.toFixed(2)):null,laneDefenders:lane.length,minLaneDseg:lane.length?Number(lane[0].dseg.toFixed(2)):null,base:{goals:m.stats.goals,saves:m.stats.saves,gkCatches:m.stats.gkCatches||0,gkParries:m.stats.gkParries||0,blocks:m.stats.blocks,shotBlocks:m.stats.shotBlocks}};
    }
  }
  prev={shots:m.stats.shots,goals:m.stats.goals,saves:m.stats.saves,gkCatches:m.stats.gkCatches||0,gkParries:m.stats.gkParries||0,blocks:m.stats.blocks,shotBlocks:m.stats.shotBlocks};
}
closeOutcome();
console.log(JSON.stringify({seed,completed:m.completed,score:m.score,stats:{shots:m.stats.shots,goals:m.stats.goals,saves:m.stats.saves,gkCatches:m.stats.gkCatches||0,gkParries:m.stats.gkParries||0,blocks:m.stats.blocks,shotBlocks:m.stats.shotBlocks,looseBalls:m.stats.looseBalls},shots},null,0));
