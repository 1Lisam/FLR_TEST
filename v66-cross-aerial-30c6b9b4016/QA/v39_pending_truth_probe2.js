'use strict';
const path=require('path');
require('./v37_movement_gate_luna_calibration.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');
const runtimeDir=path.resolve(__dirname,'../runtime');
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dist=(a,b)=>Math.hypot(n(a?.x)-n(b?.x),n(a?.y)-n(b?.y));
const byId=(f,id)=>(f?.players||[]).find(p=>p.id===id)||null;
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const round=v=>Number(n(v).toFixed(3));
function kickTime(r){const e=(r.actualEvents||[]).find(x=>/CORNER_KICK|FREE_KICK|RESTART_KICK|SET_PIECE_KICK/.test(String(x.type||'')));if(e)return n(e.t);const f=(r.frames||[]).find(x=>String(x?.ball?.mode||'').toUpperCase()==='FLIGHT');return f?n(f.time):null;}
function snap(p){return p&&{id:p.id,role:p.role,slot:p.slot,x:round(p.x),y:round(p.y),tx:round(p.tx),ty:round(p.ty),task:task(p),targetId:p.targetId||null,markTargetId:p.markTargetId||null};}
function nearest(p,ps){let best=null;for(const q of ps){const d=dist(p,q);if(!best||d<best.d)best={id:q.id,d,player:q};}return best;}
function fkSeed10(){
 const r=H.run('FREE_KICK_ATTACK_LEFT','FINAL-MATCH-TEST-10',{runtimeDir}),kt=kickTime(r),ids=['A-LCM','A-CM','A-RCM','A-ST'];let best=null;
 for(const f of r.frames||[]){if(kt!=null&&n(f.time)>kt+.05)continue;const ds=ids.map(id=>byId(f,id)).filter(Boolean),attackers=(f.players||[]).filter(p=>p.team==='HOME'&&p.role!=='GK');if(ds.length!==4)continue;
  const nearestRows=ds.map(p=>({defender:p,near:nearest(p,attackers)})),counts=new Map();for(const x of nearestRows){if(x.near)counts.set(x.near.id,(counts.get(x.near.id)||0)+1);}const top=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]||[null,0];
  const same=top[1],avgNear=nearestRows.reduce((s,x)=>s+(x.near?.d||99),0)/nearestRows.length,leftBias=[byId(f,'A-RCM'),byId(f,'A-CM')].filter(Boolean).map(p=>p.y);
  const score=same*100-avgNear-Math.abs((leftBias[0]||34)-(leftBias[1]||34))*.1;
  if(!best||score>best.score)best={score,time:round(f.time),sameNearestCount:same,sharedAttackerId:top[0],avgNearestDistance:round(avgNear),defenders:nearestRows.map(x=>({...snap(x.defender),nearestAttacker:x.near&&x.near.id,nearestDistance:x.near&&round(x.near.d)})),sharedAttacker:snap(attackers.find(p=>p.id===top[0])),rcmY:round(byId(f,'A-RCM')?.y),cmY:round(byId(f,'A-CM')?.y),lcmY:round(byId(f,'A-LCM')?.y),stY:round(byId(f,'A-ST')?.y)};
 }
 if(best)delete best.score;return{kickTime:kt,best};
}
function minPair(frames,a,b){let best=null;for(const f of frames){const p=byId(f,a),q=byId(f,b);if(!p||!q)continue;const d=dist(p,q);if(!best||d<best.d)best={time:round(f.time),d,s1:snap(p),s2:snap(q)};}if(best)best.d=round(best.d);return best;}
function triad(frames,ids){let best=null;for(const f of frames){const ps=ids.map(id=>byId(f,id)).filter(Boolean);if(ps.length!==ids.length)continue;let max=0;for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)max=Math.max(max,dist(ps[i],ps[j]));if(!best||max<best.d)best={time:round(f.time),d:max,players:ps.map(snap)};}if(best)best.d=round(best.d);return best;}
function lwCb(frames,lwId,cbIds){let deepest=null,closest=null;for(const f of frames){const lw=byId(f,lwId),cbs=cbIds.map(id=>byId(f,id)).filter(Boolean);if(!lw||!cbs.length)continue;const near=nearest(lw,cbs);const localX=lw.team==='AWAY'?105-lw.x:lw.x;if(!deepest||localX<deepest.localX)deepest={time:round(f.time),localX:round(localX),lw:snap(lw),nearestCB:snap(near.player),distance:round(near.d)};if(!closest||near.d<closest.distance)closest={time:round(f.time),localX:round(localX),lw:snap(lw),nearestCB:snap(near.player),distance:round(near.d)};}return{deepest,closest};}
function cornerSeed1(){const r=H.run('CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-1',{runtimeDir}),fs=r.frames||[];return{homeCmRcm:minPair(fs,'H-CM','H-RCM'),awayCmRcm:minPair(fs,'A-CM','A-RCM'),homeRwRcmRb:triad(fs,['H-RW','H-RCM','H-RB']),awayRwRcmRb:triad(fs,['A-RW','A-RCM','A-RB']),homeLwVsAwayCb:lwCb(fs,'H-LW',['A-LCB','A-RCB']),awayLwVsHomeCb:lwCb(fs,'A-LW',['H-LCB','H-RCB'])};}
console.log(JSON.stringify({module:'V39_PENDING_TRUTH_PROBE2',fkAttackLeftSeed10:fkSeed10(),cornerAttackLeftSeed1:cornerSeed1()},null,2));
