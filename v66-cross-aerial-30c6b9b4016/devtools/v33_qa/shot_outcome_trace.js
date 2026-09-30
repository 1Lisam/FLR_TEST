'use strict';
const path=require('path');
const root=process.argv[2],seed=process.argv[3];if(!root||!seed){console.error('usage: node shot_outcome_trace.js <source> <seed>');process.exit(2)}
const E=require(path.resolve(root,'runtime/continuous_match_core.js'));
const m=E.createMatch(seed,{dt:.05,telemetry:{}}),dt=.05;
let steps=0,prevShots=0,prevReasons={},pending=null,rows=[];
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function changedReason(){const cur=m.stats.shotReasons||{};for(const [k,v] of Object.entries(cur)){if(v>(prevReasons[k]||0))return k;}return null;}
function finish(outcome){if(!pending)return;pending.outcome=outcome;pending.outcomeAt=Number(m.time.toFixed(2));rows.push(pending);pending=null;}
function counters(){return{goals:m.stats.goals||0,saves:m.stats.saves||0,catches:m.stats.gkCatches||0,parries:m.stats.gkParries||0,blocks:m.stats.shotBlocks||0,goalKicks:m.stats.goalKicks||0};}
while(!m.completed&&steps++<110000){
  const before=counters();
  E.step(m,dt);
  const after=counters();
  if(pending){
    if(after.goals>before.goals)finish('GOAL');
    else if(after.saves>before.saves)finish(after.parries>before.parries?'SAVE_PARRY':'SAVE_CATCH');
    else if(after.blocks>before.blocks)finish('BLOCK');
    else if(after.goalKicks>before.goalKicks)finish('MISS');
  }
  if((m.stats.shots||0)>prevShots){
    if(pending)finish(pending.onTarget?'UNRESOLVED_ON_TARGET':'MISS');
    const shotEv=[...m.events].reverse().find(e=>(e.type==='SHOT'||e.type==='HEADER_SHOT')&&e.actorId),actor=shotEv?m.players.find(p=>p.id===shotEv.actorId):null;
    let nearest=null,within2=0,within3=0;if(actor){const ds=m.players.filter(p=>p.team!==actor.team).map(p=>dist(actor,p)).sort((a,b)=>a-b);nearest=ds.length?Number(ds[0].toFixed(2)):null;within2=ds.filter(d=>d<=2).length;within3=ds.filter(d=>d<=3).length;}
    pending={index:rows.length+1,at:Number(m.time.toFixed(2)),team:actor?.team||m.ball.shotTeam||null,actorId:actor?.id||null,role:actor?.role||null,reason:changedReason(),distance:Number((m.ball.shotDistance||0).toFixed(2)),onTarget:!!m.ball.onTarget,oneVOne:!!m.ball.shotOneVOne,clearKeeperChance:!!m.ball.shotClearKeeperChance,style:m.ball.strikeStyle||null,nearestDefender:nearest,within2,within3};
  }
  prevShots=m.stats.shots||0;prevReasons={...(m.stats.shotReasons||{})};
}
if(pending)finish(pending.onTarget?'UNRESOLVED_ON_TARGET':'MISS');
const counts={};for(const r of rows)counts[r.outcome]=(counts[r.outcome]||0)+1;
console.log(JSON.stringify({seed,completed:m.completed,score:m.score,totalShots:rows.length,outcomeCounts:counts,rows},null,2));
