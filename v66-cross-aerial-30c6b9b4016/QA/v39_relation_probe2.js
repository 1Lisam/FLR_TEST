'use strict';
const path=require('path');
require('./v37_movement_gate_luna_calibration.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');
const runtimeDir=path.resolve(__dirname,'../runtime');
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dist=(a,b)=>Math.hypot(n(a?.x)-n(b?.x),n(a?.y)-n(b?.y));
const byId=(f,id)=>(f.players||[]).find(p=>p.id===id)||null;
const round=v=>Number(n(v).toFixed(3));
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const lx=(p,t)=>t==='AWAY'?105-n(p?.x):n(p?.x);
function kickTime(r){const e=(r.actualEvents||[]).find(x=>/CORNER_KICK|FREE_KICK|RESTART_KICK|SET_PIECE_KICK/.test(String(x.type||'')));if(e)return n(e.t);const f=(r.frames||[]).find(x=>String(x?.ball?.mode||'').toUpperCase()==='FLIGHT');return f?n(f.time):null;}
function framesAfterKick(r){const kt=kickTime(r);return kt==null?(r.frames||[]):(r.frames||[]).filter(f=>n(f.time)>=kt-.051);}
function diameter(f,ids){const ps=ids.map(id=>byId(f,id)).filter(Boolean);if(ps.length<2)return null;let d=0;for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)d=Math.max(d,dist(ps[i],ps[j]));return d;}
function minDiameter(frames,ids){let best=null;for(const f of frames){const d=diameter(f,ids);if(d==null)continue;if(!best||d<best.d)best={time:round(f.time),d:round(d),players:ids.map(id=>{const p=byId(f,id);return p?{id,x:round(p.x),y:round(p.y),task:task(p)}:null;}).filter(Boolean)};}return best;}
function wideOwner(frames,attackerId,fbId,defTeam){let worst=null;for(const f of frames){const a=byId(f,attackerId),fb=byId(f,fbId);if(!a||!fb)continue;const others=(f.players||[]).filter(p=>p.team===defTeam&&p.id!==fb.id&&p.role!=='GK'),cover=Math.min(...others.map(p=>dist(p,a)),99),gap=dist(fb,a),score=gap+Math.max(0,cover-8)*.5;if(!worst||score>worst.score)worst={time:round(f.time),score:round(score),attacker:{id:a.id,x:round(a.x),y:round(a.y),localX:round(lx(a,a.team)),task:task(a)},fb:{id:fb.id,x:round(fb.x),y:round(fb.y),localX:round(lx(fb,defTeam)),task:task(fb)},gap:round(gap),nearestCover:round(cover)};}return worst;}
function gkDepth(frames,id,team){let worst=null;for(const f of frames){const g=byId(f,id);if(!g)continue;const x=lx(g,team);if(!worst||x>worst.localX)worst={time:round(f.time),localX:round(x),x:round(g.x),y:round(g.y),task:task(g)};}return worst;}
function pairMin(frames,a,b){let best=null;for(const f of frames){const pa=byId(f,a),pb=byId(f,b);if(!pa||!pb)continue;const d=dist(pa,pb);if(!best||d<best.d)best={time:round(f.time),d:round(d),a:{id:a,x:round(pa.x),y:round(pa.y),task:task(pa)},b:{id:b,x:round(pb.x),y:round(pb.y),task:task(pb)}};}return best;}
function depthRange(frames,ids,team){const out={};for(const id of ids){let min=Infinity,max=-Infinity,atMin=null,atMax=null;for(const f of frames){const p=byId(f,id);if(!p)continue;const x=lx(p,team);if(x<min){min=x;atMin={time:round(f.time),task:task(p)}}if(x>max){max=x;atMax={time:round(f.time),task:task(p)}}}out[id]={min:round(min),max:round(max),atMin,atMax};}return out;}
const CASES=[
 ['FREE_KICK_DEFEND_LEFT','FINAL-MATCH-TEST-10'],
 ['FREE_KICK_ATTACK_LEFT','FINAL-MATCH-TEST-10'],
 ['FREE_KICK_ATTACK_LEFT','FINAL-MATCH-TEST-6'],
 ['CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-6']
];
const rows=[];
for(const [key,seed] of CASES){const r=H.run(key,seed,{runtimeDir}),all=r.frames||[],live=framesAfterKick(r),row={key,seed,kickTime:kickTime(r),allFrames:all.length,liveFrames:live.length};
 row.homeMidAll=minDiameter(all,['H-LCM','H-CM','H-RCM']);row.homeMidLive=minDiameter(live,['H-LCM','H-CM','H-RCM']);
 row.awayMidAll=minDiameter(all,['A-LCM','A-CM','A-RCM']);row.awayMidLive=minDiameter(live,['A-LCM','A-CM','A-RCM']);
 row.homeMidStAll=minDiameter(all,['H-LCM','H-CM','H-RCM','H-ST']);row.homeMidStLive=minDiameter(live,['H-LCM','H-CM','H-RCM','H-ST']);
 row.awayMidStAll=minDiameter(all,['A-LCM','A-CM','A-RCM','A-ST']);row.awayMidStLive=minDiameter(live,['A-LCM','A-CM','A-RCM','A-ST']);
 row.homeLWvsLB=pairMin(all,'H-LW','H-LB');row.homeRWvsRB=pairMin(all,'H-RW','H-RB');row.awayLWvsLB=pairMin(all,'A-LW','A-LB');row.awayRWvsRB=pairMin(all,'A-RW','A-RB');
 row.homeWideOwner=wideOwner(all,'H-LW','A-RB','AWAY');row.awayWideOwner=wideOwner(all,'A-LW','H-RB','HOME');
 row.awayGkDepth=gkDepth(all,'A-GK','AWAY');row.homeGkDepth=gkDepth(all,'H-GK','HOME');
 row.homeAttackDepth=depthRange(all,['H-LW','H-ST','H-RW'],'HOME');row.awayAttackDepth=depthRange(all,['A-LW','A-ST','A-RW'],'AWAY');
 rows.push(row);}
console.log(JSON.stringify({module:'V39_RELATION_PROBE2',rows},null,2));
