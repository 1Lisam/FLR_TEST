'use strict';
const path=require('path'); const root=process.argv[2],seed=process.argv[3]; if(!root||!seed)process.exit(2);
const E=require(path.resolve(root,'runtime/continuous_match_core.js')); const m=E.createMatch(seed,{dt:.05,telemetry:{}}); let steps=0,prevShots=0,rows=[];
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
while(!m.completed&&steps++<110000){E.step(m,.05); if((m.stats.shots||0)>prevShots){
 const ev=[...m.events].reverse().find(e=>(e.type==='SHOT'||e.type==='HEADER_SHOT')&&e.actorId); const actor=ev?m.players.find(p=>p.id===ev.actorId):null;
 if(actor){const opp=m.players.filter(p=>p.team!==actor.team);const ds=opp.map(p=>({id:p.id,role:p.role,slot:p.slot,d:dist(actor,p)})).sort((a,b)=>a.d-b.d); const localX=actor.team==='HOME'?actor.x:105-actor.x;const localY=actor.team==='HOME'?actor.y:68-actor.y; const dGoal=Math.hypot((actor.team==='HOME'?105:0)-actor.x,34-actor.y); const inBox=actor.team==='HOME'?(actor.x>=88&&Math.abs(actor.y-34)<=20):(actor.x<=17&&Math.abs(actor.y-34)<=20); const reason=Object.entries(m.stats.shotReasons||{}).find(([k,v])=>v>((rows.filter(r=>r.reason===k).length)||0))?.[0]||null;
 rows.push({at:+m.time.toFixed(2),actorId:actor.id,role:actor.role,slot:actor.slot,inBox,localX:+localX.toFixed(2),localY:+localY.toFixed(2),dGoal:+dGoal.toFixed(2),reason,nearest:ds[0],within2:ds.filter(x=>x.d<=2).length,within3:ds.filter(x=>x.d<=3).length,within4:ds.filter(x=>x.d<=4).length,within6:ds.filter(x=>x.d<=6).length});}
 prevShots=m.stats.shots||0;}}
console.log(JSON.stringify({seed,completed:m.completed,score:m.score,totalShots:rows.length,boxShots:rows.filter(r=>r.inBox).length,rows},null,2));
