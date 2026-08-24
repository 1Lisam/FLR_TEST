'use strict';
const path=require('path');
const root=path.resolve(process.argv[2]);
const E=require(path.join(root,'runtime/continuous_match_core.js'));
const seed=process.argv[3]||'DEV-RECENT-1787573272419-1',dt=.05,m=E.createMatch(seed,{dt});
const local=(team,p)=>team==='HOME'?{x:p.x,y:p.y}:{x:105-p.x,y:68-p.y};
const other=t=>t==='HOME'?'AWAY':'HOME';
let nextSample=0,samples=0,sumSpread=0,over4=0,over6=0,maxSpread=0,lastShots=0;const deepest={},shotRows=[];
for(let guard=0;!m.completed&&guard<120000;guard++){
 E.step(m,dt);
 if(m.time+1e-6<nextSample)continue;nextSample=m.time+.25;
 const def=other(m.possession),ps=['LB','LCB','RCB','RB'].map(slot=>m.players.find(p=>p.team===def&&p.slot===slot)).filter(Boolean),rows=ps.map(p=>({id:p.id,slot:p.slot,x:local(def,p).x,task:p.tacticalTask||p.action||''}));
 if(rows.length===4){const xs=rows.map(r=>r.x),spread=Math.max(...xs)-Math.min(...xs),deep=rows.slice().sort((a,b)=>a.x-b.x)[0];samples++;sumSpread+=spread;maxSpread=Math.max(maxSpread,spread);if(spread>4)over4++;if(spread>6)over6++;const k=deep.slot+'|'+deep.task;deepest[k]=(deepest[k]||0)+1;
   if((m.stats.shots||0)>lastShots){shotRows.push({t:+m.time.toFixed(2),spread:+spread.toFixed(2),deepest:deep,ball:local(def,m.ball),possession:m.possession});lastShots=m.stats.shots||0;}
 }
}
const topDeep=Object.entries(deepest).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([key,count])=>({key,count}));
console.log(JSON.stringify({schemaVersion:'FLR_V054_BACKLINE_PROBE_1.0',seed,completed:m.completed,shots:m.stats.shots,goals:m.stats.goals,samples,avgSpread:+(sumSpread/Math.max(1,samples)).toFixed(3),maxSpread:+maxSpread.toFixed(3),over4Pct:+(over4/Math.max(1,samples)*100).toFixed(2),over6Pct:+(over6/Math.max(1,samples)*100).toFixed(2),topDeep,shotRows:shotRows.slice(-60)}));
if(!m.completed)process.exitCode=1;
