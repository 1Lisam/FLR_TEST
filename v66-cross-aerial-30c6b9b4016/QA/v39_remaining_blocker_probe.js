'use strict';
const path=require('path');
const TRUTH=require('./v39_validation_truth_guards.js');
require('./v39_runtime_candidate_loader.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');
const runtimeDir=path.resolve(__dirname,'../runtime');
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dist=(a,b)=>Math.hypot(n(a?.x)-n(b?.x),n(a?.y)-n(b?.y));
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const byId=(f,id)=>(f?.players||[]).find(p=>p.id===id)||null;
const snap=p=>p&&({id:p.id,role:p.role,slot:p.slot,x:+n(p.x).toFixed(2),y:+n(p.y).toFixed(2),tx:+n(p.tx,p.x).toFixed(2),ty:+n(p.ty,p.y).toFixed(2),task:task(p),markTargetId:p.markTargetId||null,targetId:p.targetId||null});
function kickTime(r){const e=(r.actualEvents||[]).find(x=>/CORNER_KICK|FREE_KICK|RESTART_KICK|SET_PIECE_KICK/.test(String(x.type||'')));if(e)return n(e.t);const f=(r.frames||[]).find(x=>String(x?.ball?.mode||'').toUpperCase()==='FLIGHT');return f?n(f.time):null;}
function around(r,time,ids,span=.25){return (r.frames||[]).filter(f=>Math.abs(n(f.time)-time)<=span).map(f=>({time:+n(f.time).toFixed(2),ball:{mode:f.ball?.mode,kind:f.ball?.kind,x:+n(f.ball?.x).toFixed(2),y:+n(f.ball?.y).toFixed(2)},players:ids.map(id=>snap(byId(f,id))).filter(Boolean)}));}
function caseProbe(scenario,seed,focusIds){const r=H.run(scenario,seed,{runtimeDir}),hits=TRUTH.evaluateValidationTruth(r),kt=kickTime(r);return{scenario,seed,kickTime:kt,hits:hits.map(h=>({id:h.id,metric:h.metric,rationale:h.rationale})),traces:hits.map(h=>{const t=n(h.metric?.firstTime,h.metric?.time);return{id:h.id,around:around(r,t,focusIds,.3)}})};}
function corner13(){const r=H.run('CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-13',{runtimeDir}),kt=kickTime(r),rows=[];for(const f of r.frames||[]){if(n(f.time)<kt+.1||n(f.time)>kt+3)continue;const passive=(f.players||[]).filter(p=>p.role!=='GK'&&/REST_DEFENCE|ZONE_HOLD|EDGE.*HOLD|SECOND_BALL.*HOLD|SUPPORT.*HOLD/.test(task(p))&&Math.hypot(n(p.vx),n(p.vy))<.25&&!p.markTargetId&&!p.targetId).map(snap);rows.push({time:+n(f.time).toFixed(2),ballMode:f.ball?.mode,ballKind:f.ball?.kind,passiveCount:passive.length,passive});}rows.sort((a,b)=>b.passiveCount-a.passiveCount);return{kickTime:kt,worstLivePassive:rows[0]||null,top:rows.slice(0,5)};}
console.log(JSON.stringify({module:'V39_REMAINING_BLOCKER_PROBE',fkLeft21:caseProbe('FREE_KICK_ATTACK_LEFT','FINAL-MATCH-TEST-21',['H-ST','A-LCB','A-RCB','A-LB','A-RB']),cornerLeft4:caseProbe('CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-4',['A-RW','H-LB','H-RB','H-LCB','H-RCB']),cornerLeft1:caseProbe('CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-1',['A-ST','A-LW','A-RW','H-LB','H-RB','A-CM']),cornerRight13:corner13()},null,2));
