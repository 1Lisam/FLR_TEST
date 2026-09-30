'use strict';
const path=require('path');
require('./v39_runtime_candidate_loader.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');
const runtimeDir=path.resolve(__dirname,'../runtime');
const cases=[
 ['CORNER_DEFEND_RIGHT','FINAL-MATCH-TEST-6'],
 ['CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-6'],
 ['CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-4'],
 ['CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-4'],
 ['CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-1']
];
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const dist=(a,b)=>Math.hypot(n(a?.x)-n(b?.x),n(a?.y)-n(b?.y));
const byId=(f,id)=>(f?.players||[]).find(p=>p.id===id)||null;
function kickTime(r){const e=(r.actualEvents||[]).find(x=>/CORNER_KICK|RESTART_KICK|SET_PIECE_KICK/.test(String(x.type||'')));if(e)return n(e.t);const f=(r.frames||[]).find(x=>String(x?.ball?.mode||'').toUpperCase()==='FLIGHT');return f?n(f.time):null;}
function snapshotPlayers(f){return(f?.players||[]).map(p=>({id:p.id,team:p.team,role:p.role,slot:p.slot,x:+n(p.x).toFixed(2),y:+n(p.y).toFixed(2),tx:+n(p.tx,p.x).toFixed(2),ty:+n(p.ty,p.y).toFixed(2),task:task(p),markTargetId:p.markTargetId||null,targetId:p.targetId||null}));}
function clusters(f,radius=2.4){const out=[];for(const team of ['HOME','AWAY']){const ps=(f?.players||[]).filter(p=>p.team===team&&p.role!=='GK'),seen=new Set();for(let i=0;i<ps.length;i++){if(seen.has(i))continue;const q=[i],g=[];seen.add(i);while(q.length){const a=q.shift();g.push(ps[a]);for(let j=0;j<ps.length;j++){if(seen.has(j))continue;if(dist(ps[a],ps[j])<=radius){seen.add(j);q.push(j);}}}if(g.length>=3)out.push({team,count:g.length,players:g.map(p=>({id:p.id,task:task(p),markTargetId:p.markTargetId||null})),diameter:+Math.max(...g.flatMap((a,i)=>g.slice(i+1).map(b=>dist(a,b))),0).toFixed(2)});}}return out;}
function sameTargetGroups(f){const out=[];for(const team of ['HOME','AWAY']){const m=new Map();for(const p of(f?.players||[]).filter(p=>p.team===team&&p.role!=='GK')){const k=`${n(p.tx).toFixed(1)}|${n(p.ty).toFixed(1)}`;if(!m.has(k))m.set(k,[]);m.get(k).push(p);}for(const [target,g] of m){if(g.length>=2)out.push({team,target,players:g.map(p=>({id:p.id,role:p.role,task:task(p),markTargetId:p.markTargetId||null}))});}}return out;}
function kickerTrace(r,kt){const rows=[];for(const f of r.frames||[]){if(kt!=null&&Math.abs(n(f.time)-kt)>2.5)continue;const p=(f.players||[]).find(x=>/CORNER_(KICKER_RUNUP_START|RUN_UP|SET_WAIT)/.test(task(x)));if(!p||!f.ball)continue;const bx=n(f.ball.x),by=n(f.ball.y),dx=bx-n(p.x),dy=by-n(p.y),vx=n(p.vx),vy=n(p.vy),dot=dx*vx+dy*vy,mag=Math.hypot(dx,dy)*Math.hypot(vx,vy);rows.push({time:+n(f.time).toFixed(2),id:p.id,task:task(p),distance:+Math.hypot(dx,dy).toFixed(2),velocity:+Math.hypot(vx,vy).toFixed(2),towardBallCos:mag>1e-6?+(dot/mag).toFixed(3):null,x:+n(p.x).toFixed(2),y:+n(p.y).toFixed(2),tx:+n(p.tx).toFixed(2),ty:+n(p.ty).toFixed(2),ballMode:f.ball.mode});}return rows;}
const rows=[];
for(const [scenario,seed] of cases){const r=H.run(scenario,seed,{runtimeDir}),kt=kickTime(r),fs=r.frames||[],pre=fs.filter(f=>kt==null||n(f.time)<=kt+.001),atKick=pre.at(-1)||fs[0],post=kt==null?null:fs.find(f=>n(f.time)>=kt+.8)||fs.at(-1);const gk=(atKick?.players||[]).filter(p=>p.role==='GK').map(p=>({id:p.id,team:p.team,x:+n(p.x).toFixed(2),y:+n(p.y).toFixed(2),tx:+n(p.tx).toFixed(2),ty:+n(p.ty).toFixed(2),task:task(p)}));rows.push({scenario,seed,kickTime:kt,atKick:{time:n(atKick?.time),clusters:clusters(atKick),sameTargetGroups:sameTargetGroups(atKick),gk,players:snapshotPlayers(atKick)},postKick:post?{time:n(post.time),clusters:clusters(post),sameTargetGroups:sameTargetGroups(post)}:null,kickerTrace:kickerTrace(r,kt)});}
console.log(JSON.stringify({module:'V39_CORNER_CAUSAL_PROBE',rows},null,2));
