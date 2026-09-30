'use strict';
const path=require('path');
const {evaluatePlausibility}=require('./v39_plausibility_guards.js');
require('./v39_runtime_candidate_loader.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');
const runtimeDir=path.resolve(__dirname,'../runtime');
const cases=[
  ['FREE_KICK_ATTACK_LEFT','FINAL-MATCH-TEST-10'],
  ['FREE_KICK_ATTACK_RIGHT','FINAL-MATCH-TEST-12'],
  ['FREE_KICK_DEFEND_LEFT','FINAL-MATCH-TEST-10'],
  ['FREE_KICK_DEFEND_RIGHT','FINAL-MATCH-TEST-12']
];
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const rows=[];
for(const [scenario,seed] of cases){
  const r=H.run(scenario,seed,{runtimeDir}),team=r?.boundary?.setPiece?.team;
  const trace={};
  for(const f of r.frames||[]){
    for(const p of (f.players||[]).filter(x=>x.team===team&&x.role==='FB')){
      const k=p.id;trace[k]=trace[k]||{first:null,last:null,tasks:new Set(),minSpeed:Infinity,maxSpeed:0,minTargetGap:Infinity,maxTargetGap:0};
      const q=trace[k],spd=Math.hypot(n(p.vx),n(p.vy)),gap=Math.hypot(n(p.tx,p.x)-n(p.x),n(p.ty,p.y)-n(p.y));
      if(q.first==null)q.first={time:n(f.time),x:n(p.x),y:n(p.y),tx:n(p.tx,p.x),ty:n(p.ty,p.y),task:task(p)};
      q.last={time:n(f.time),x:n(p.x),y:n(p.y),tx:n(p.tx,p.x),ty:n(p.ty,p.y),task:task(p)};
      q.tasks.add(task(p));q.minSpeed=Math.min(q.minSpeed,spd);q.maxSpeed=Math.max(q.maxSpeed,spd);q.minTargetGap=Math.min(q.minTargetGap,gap);q.maxTargetGap=Math.max(q.maxTargetGap,gap);
    }
  }
  const fullbacks=Object.fromEntries(Object.entries(trace).map(([id,q])=>[id,{...q,tasks:[...q.tasks],minSpeed:Number(q.minSpeed.toFixed(3)),maxSpeed:Number(q.maxSpeed.toFixed(3)),minTargetGap:Number(q.minTargetGap.toFixed(3)),maxTargetGap:Number(q.maxTargetGap.toFixed(3))}]));
  rows.push({scenario,seed,attackingTeam:team,guards:evaluatePlausibility(r),fullbacks});
}
console.log(JSON.stringify({module:'V39_FULLBACK_RESPONSIBILITY_PROBE',rows},null,2));
