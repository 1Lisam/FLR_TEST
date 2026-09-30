'use strict';
const path=require('path');
require('./v39_runtime_candidate_loader.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');
const runtimeDir=path.resolve(__dirname,'../runtime');
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dist=(a,b)=>Math.hypot(n(a?.x)-n(b?.x),n(a?.y)-n(b?.y));
const byId=(f,id)=>(f?.players||[]).find(p=>p.id===id)||null;
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const localX=p=>p?.team==='AWAY'?105-n(p?.x):n(p?.x);
const round=v=>Number(n(v).toFixed(3));
function snap(p){return p&&{id:p.id,role:p.role,slot:p.slot,x:round(p.x),y:round(p.y),localX:round(localX(p)),tx:round(p.tx),ty:round(p.ty),task:task(p),targetId:p.targetId||null,markTargetId:p.markTargetId||null,vx:round(p.vx),vy:round(p.vy)};}
function optionSnap(o){return o&&{id:o.id||null,targetId:o.targetId||null,label:o.label||o.text||o.title||null,type:o.type||o.kind||null,action:o.action||null};}
function kickTime(r){const e=(r.actualEvents||[]).find(x=>/CORNER_KICK|FREE_KICK|RESTART_KICK|SET_PIECE_KICK/.test(String(x.type||'')));if(e)return n(e.t);const f=(r.frames||[]).find(x=>String(x?.ball?.mode||'').toUpperCase()==='FLIGHT');return f?n(f.time):null;}
function pickAdvance(pending){const opts=Array.isArray(pending?.options)?pending.options:[];return opts.find(o=>/^(SPACE|ADVANCE|CARRY|DRIBBLE)$/i.test(String(o?.id||'')))||opts.find(o=>/전진|공간으로|몰고|드리블/i.test(String(o?.label||o?.text||'')))||null;}
function breakaway98(){
  let r=H.run('ST_BREAKAWAY','FINAL-MATCH-TEST-98',{runtimeDir}),choices=[],decisionOptions=[];
  for(let i=0;i<2;i++){
    const available=(Array.isArray(r.pending?.options)?r.pending.options:[]).map(optionSnap);decisionOptions.push({decision:i+1,options:available});
    const c=pickAdvance(r.pending);if(!c)return{error:`ADVANCE_UNAVAILABLE_${i+1}`,choices,decisionOptions,advanceUnavailableAt:i+1,pendingType:r.pending?.type||r.pending?.kind||null};
    const before=(r.frames||[]).length,out=H.applyForcedChoice(c.id,c.targetId||null);r=out?.result||r;choices.push({id:c.id,targetId:c.targetId||null,beforeFrames:before,afterFrames:(r.frames||[]).length,cursor:r.replayStartFrameIndex,continuation:!!r.pending});
  }
  const start=Math.max(0,Number(r.replayStartFrameIndex)||0),fs=(r.frames||[]).slice(start);let closest=null,shadowFrames=[];
  for(const f of fs){const st=byId(f,'H-ST'),cm=byId(f,'H-RCM');if(!st||!cm)continue;const d=dist(st,cm),dx=n(st.x)-n(cm.x),dy=Math.abs(n(st.y)-n(cm.y)),targetSep=Math.hypot(n(st.tx,st.x)-n(cm.tx,cm.x),n(st.ty,st.y)-n(cm.ty,cm.y));if(!closest||d<closest.d)closest={f,st,cm,d,dx,dy,targetSep};if(d<1.8&&dx>=-.5&&dx<=2.8&&dy<1.6)shadowFrames.push({time:round(f.time),distance:round(d),behindX:round(dx),lateralGap:round(dy),targetSeparation:round(targetSep),st:snap(st),rcm:snap(cm)});}
  return{choices,decisionOptions,continuationStart:start,frameCount:fs.length,closest:closest&&{time:round(closest.f.time),distance:round(closest.d),behindX:round(closest.dx),lateralGap:round(closest.dy),targetSeparation:round(closest.targetSep),st:snap(closest.st),rcm:snap(closest.cm)},shadowFrameCount:shadowFrames.length,shadowDuration:shadowFrames.length>1?round(shadowFrames.at(-1).time-shadowFrames[0].time):0,shadowSamples:shadowFrames.slice(0,10)};
}
function fkRight27(){
  const r=H.run('FREE_KICK_ATTACK_RIGHT','FINAL-MATCH-TEST-27',{runtimeDir}),kt=kickTime(r),fs=(r.frames||[]).filter(f=>kt==null||n(f.time)<=kt+3.2),rows=[];for(const f of fs){const x=byId(f,'A-RCM'),l=byId(f,'A-LCM'),lb=byId(f,'A-LB');if(x)rows.push({f,x,l,lb});}
  const minY=rows.reduce((a,b)=>!a||b.x.y<a.x.y?b:a,null),maxY=rows.reduce((a,b)=>!a||b.x.y>a.x.y?b:a,null),minLX=rows.reduce((a,b)=>!a||localX(b.x)<localX(a.x)?b:a,null),maxLX=rows.reduce((a,b)=>!a||localX(b.x)>localX(a.x)?b:a,null);let orderFlips=0,last=null;for(const q of rows){if(!q.l)continue;const s=Math.sign(n(q.x.y)-n(q.l.y));if(last&&s&&last!==s)orderFlips++;if(s)last=s;}
  const fmt=q=>q&&{time:round(q.f.time),rcm:snap(q.x),lcm:snap(q.l),lb:snap(q.lb)};return{kickTime:round(kt),orderFlips,minY:fmt(minY),maxY:fmt(maxY),minLocalX:fmt(minLX),maxLocalX:fmt(maxLX),ySpan:rows.length?round(Math.max(...rows.map(q=>n(q.x.y)))-Math.min(...rows.map(q=>n(q.x.y)))):null,localXSpan:rows.length?round(Math.max(...rows.map(q=>localX(q.x)))-Math.min(...rows.map(q=>localX(q.x)))):null,tasks:[...new Set(rows.map(q=>task(q.x)))]};
}
function fkLeft21(){
  const r=H.run('FREE_KICK_ATTACK_LEFT','FINAL-MATCH-TEST-21',{runtimeDir}),kt=kickTime(r);let worst=null;for(const f of r.frames||[]){if(kt!=null&&(n(f.time)<kt-.1||n(f.time)>kt+3.2))continue;const st=byId(f,'H-ST');if(!st)continue;const defs=(f.players||[]).filter(p=>p.team==='AWAY'&&p.role!=='GK'),near=defs.map(p=>({p,d:dist(p,st)})).sort((a,b)=>a.d-b.d)[0],owners=defs.filter(p=>p.markTargetId===st.id||p.targetId===st.id);if(!near)continue;if(!worst||near.d>worst.near.d)worst={f,st,near,owners,defs};}
  return{kickTime:round(kt),worst:worst&&{time:round(worst.f.time),st:snap(worst.st),nearest:snap(worst.near.p),nearestDistance:round(worst.near.d),explicitOwners:worst.owners.map(snap),defenders:worst.defs.filter(p=>['CB','FB','CM'].includes(p.role)).map(snap)}};
}
function cornerRight13(){
  const r=H.run('CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-13',{runtimeDir}),kt=kickTime(r),rows=[];for(const f of r.frames||[]){if(kt!=null&&(n(f.time)<kt-.1||n(f.time)>kt+2.5))continue;const passive=(f.players||[]).filter(p=>p.role!=='GK'&&/REST_DEFENCE|ZONE_HOLD|EDGE.*HOLD|SECOND_BALL.*HOLD|SUPPORT.*HOLD/.test(task(p))&&Math.hypot(n(p.vx),n(p.vy))<.25&&!p.markTargetId&&!p.targetId).map(snap),threats=(f.players||[]).filter(p=>['ST','WF'].includes(p.role)&&!/REST_DEFENCE/.test(task(p))).map(snap);rows.push({time:round(f.time),possession:f.possession||null,ballOwnerId:f.ball?.ownerId||null,ballMode:f.ball?.mode||null,ballKind:f.ball?.kind||null,ballX:round(f.ball?.x),ballY:round(f.ball?.y),passiveCount:passive.length,passive,threats});}
  const worst=[...rows].sort((a,b)=>b.passiveCount-a.passiveCount)[0]||null;return{kickTime:round(kt),worstPassive:worst,counts:[...new Set(rows.map(x=>x.passiveCount))].sort((a,b)=>a-b),liveTimeline:rows.filter(x=>x.ballMode!=='DEAD').slice(0,30)};
}
console.log(JSON.stringify({module:'V39_RECENT_PENDING_TRUTH_PROBE',breakaway98:breakaway98(),freeKickAttackRight27:fkRight27(),freeKickAttackLeft21:fkLeft21(),cornerAttackRight13:cornerRight13()},null,2));
