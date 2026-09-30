'use strict';
const path=require('path');
require('./v39_runtime_candidate_loader.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');
const runtimeDir=path.resolve(__dirname,'../runtime');
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dist=(a,b)=>Math.hypot(n(a?.x)-n(b?.x),n(a?.y)-n(b?.y));
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const byId=(f,id)=>(f?.players||[]).find(p=>p.id===id)||null;
const snap=p=>p&&({id:p.id,role:p.role,slot:p.slot,x:+n(p.x).toFixed(2),y:+n(p.y).toFixed(2),tx:+n(p.tx,p.x).toFixed(2),ty:+n(p.ty,p.y).toFixed(2),task:task(p),targetId:p.targetId||null,markTargetId:p.markTargetId||null,sprint:!!p.sprint});
function crossRight(){
 const r=H.run('CROSS_RIGHT','FINAL-MATCH-TEST-12',{runtimeDir});let worst=null;const trace=[];
 for(const f of r.frames||[]){const rw=byId(f,'H-RW'),lb=byId(f,'A-LB');if(!rw||!lb||rw.x<68)continue;const defs=(f.players||[]).filter(p=>p.team==='AWAY'&&p.role!=='GK'&&p.id!==lb.id);let comp=null;for(const p of defs){const d=dist(p,rw);if(!comp||d<comp.d)comp={p,d};}const score=Math.min(dist(lb,rw),comp?.d??99);if(trace.length<14)trace.push({time:+n(f.time).toFixed(2),ballMode:f.ball?.mode,ballKind:f.ball?.kind,lbThreatDistance:+dist(lb,rw).toFixed(2),compDistance:+(comp?.d??99).toFixed(2),lb:snap(lb),rw:snap(rw)});if(!worst||score>worst.score)worst={score,time:+n(f.time).toFixed(2),possession:f.possession||f.ball?.ownerTeam||null,ball:{x:+n(f.ball?.x).toFixed(2),y:+n(f.ball?.y).toFixed(2),mode:f.ball?.mode},rw:snap(rw),lb:snap(lb),nearestCompensator:snap(comp?.p),lbThreatDistance:+dist(lb,rw).toFixed(2),compDistance:+(comp?.d??99).toFixed(2)};}
 if(worst)delete worst.score;return{worst,trace};
}
function crossLeft(){
 const r=H.run('CROSS_LEFT','FINAL-MATCH-TEST-12',{runtimeDir});let deepest=null;
 for(const f of r.frames||[]){const st=byId(f,'H-ST');if(!st)continue;const poss=f.possession||f.ball?.ownerTeam;if(poss!=='AWAY')continue;const lx=st.x;if(!deepest||lx<deepest.localX){const mates=(f.players||[]).filter(p=>p.team==='HOME'&&p.role!=='GK'&&p.id!==st.id);const front=[...mates].sort((a,b)=>b.x-a.x).slice(0,4);deepest={time:+n(f.time).toFixed(2),localX:+lx.toFixed(2),possession:poss,ball:{x:+n(f.ball?.x).toFixed(2),y:+n(f.ball?.y).toFixed(2),mode:f.ball?.mode},st:snap(st),frontOccupants:front.map(snap)};}}
 return deepest;
}
console.log(JSON.stringify({module:'V39_CROSS_CAUSAL_PROBE',crossRightSeed12:crossRight(),crossLeftSeed12:crossLeft()},null,2));
