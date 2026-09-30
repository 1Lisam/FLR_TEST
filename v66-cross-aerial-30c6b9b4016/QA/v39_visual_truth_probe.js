'use strict';
const path=require('path');
require('./v37_movement_gate_luna_calibration.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');

const runtimeDir=path.resolve(__dirname,'../runtime');
const FAIL_REPORTS=[
 ['GK_SHOT_CLOSE','FINAL-MATCH-TEST-30'],
 ['GK_SHOT_BOX','FINAL-MATCH-TEST-12'],
 ['CROSS_RIGHT','FINAL-MATCH-TEST-12'],
 ['CROSS_LEFT','FINAL-MATCH-TEST-12'],
 ['FREE_KICK_DEFEND_LEFT','FINAL-MATCH-TEST-10'],
 ['FREE_KICK_ATTACK_LEFT','FINAL-MATCH-TEST-10'],
 ['FREE_KICK_ATTACK_LEFT','FINAL-MATCH-TEST-6'],
 ['CORNER_DEFEND_RIGHT','FINAL-MATCH-TEST-6'],
 ['CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-6'],
 ['CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-4'],
 ['CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-4'],
 ['CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-1']
];
const LEGACY_DEAD=new Set(['SET_PIECE_SETUP','GOAL_CELEBRATION','KICKOFF','RESTART','DEAD_BALL']);
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dist=(a,b)=>Math.hypot(n(a?.x)-n(b?.x),n(a?.y)-n(b?.y));
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const phase=f=>String(f?.phase||f?.context||'OPEN_PLAY').toUpperCase();
const legacyDead=f=>LEGACY_DEAD.has(phase(f))||String(f?.ball?.mode||'').toUpperCase()==='DEAD'||!!f?.restart;
const byId=(f,id)=>(f?.players||[]).find(p=>p.id===id)||null;
const localX=(p,team)=>team==='AWAY'?105-n(p?.x):n(p?.x);
const round=(v,d=3)=>Number(n(v).toFixed(d));

function terminalEvent(r){return (r.actualEvents||[]).find(e=>['GOAL','SAVE','CHIP_SAVE','PARRY','PARRY_SAFE','PARRY_DANGER','SHOT_MISSED'].includes(e.type))||null;}
function kickTime(r){
 const es=(r.actualEvents||[]).filter(e=>/CORNER_KICK|FREE_KICK|RESTART_KICK|SET_PIECE_KICK/.test(String(e.type||'')));
 if(es.length)return Math.min(...es.map(e=>n(e.t,Infinity)));
 const flight=(r.frames||[]).find(f=>String(f?.ball?.mode||'').toUpperCase()==='FLIGHT');
 return flight?flight.time:null;
}
function liveSetPieceFrames(r){
 const kt=kickTime(r),fs=r.frames||[];
 if(kt!=null)return fs.filter(f=>n(f.time)>=n(kt)-0.051);
 return fs.filter(f=>String(f?.ball?.mode||'').toUpperCase()!=='DEAD'&&(f.players||[]).some(p=>/^(CORNER|FREE_KICK)_/.test(task(p))&&!/(SETUP|_SET$|_HOLD$)/.test(task(p))));
}
function connectedClusters(players,radius=2.35){
 const ps=players.filter(p=>p.role!=='GK'),seen=new Set(),out=[];
 for(let i=0;i<ps.length;i++){
  if(seen.has(i))continue;const q=[i],comp=[];seen.add(i);
  while(q.length){const a=q.shift();comp.push(ps[a]);for(let j=0;j<ps.length;j++){if(seen.has(j))continue;if(dist(ps[a],ps[j])<=radius){seen.add(j);q.push(j);}}}
  if(comp.length>=2)out.push(comp);
 }
 return out.sort((a,b)=>b.length-a.length);
}
function clusterProbe(frames){
 let worst=null,unjustifiedFrames=0;
 for(const f of frames){
  for(const team of ['HOME','AWAY']){
   const c=(connectedClusters((f.players||[]).filter(p=>p.team===team))[0]||[]);if(c.length<3)continue;
   const justified=c.every(p=>/WALL|AERIAL|DUEL|NEAR_POST|MARK|POST_PROTECT/.test(task(p)));
   if(!justified)unjustifiedFrames++;
   const row={time:round(f.time),team,size:c.length,justified,players:c.map(p=>({id:p.id,task:task(p),x:round(p.x),y:round(p.y),tx:round(p.tx,p.x),ty:round(p.ty,p.y)}))};
   if(!worst||row.size>worst.size||(!row.justified&&worst.justified))worst=row;
  }
 }
 return{frames:frames.length,unjustifiedFrames,worst};
}
function targetConvergence(frames){
 let worst=null;
 for(const f of frames){for(const team of ['HOME','AWAY']){
  const ps=(f.players||[]).filter(p=>p.team===team&&p.role!=='GK'),cells=new Map();
  for(const p of ps){const k=`${Math.round(n(p.tx,p.x)*2)/2},${Math.round(n(p.ty,p.y)*2)/2}`;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(p);}
  for(const [cell,g] of cells){if(g.length<3)continue;const justified=g.every(p=>/WALL|AERIAL|DUEL|NEAR_POST|MARK/.test(task(p))),row={time:round(f.time),team,cell,size:g.length,justified,players:g.map(p=>({id:p.id,task:task(p)}))};if(!worst||row.size>worst.size||(!row.justified&&worst.justified))worst=row;}
 }}return worst;
}
function fullbackProbe(r){
 let worst=null;
 for(const f of r.frames||[]){const w=byId(f,'H-RW'),fb=byId(f,'A-LB');if(!w||!fb||localX(w,'HOME')<68)continue;
  const cover=(f.players||[]).filter(p=>p.team==='AWAY'&&p.id!==fb.id&&p.role!=='GK').map(p=>dist(p,w));
  const row={time:round(f.time),rw:{x:round(w.x),y:round(w.y),localX:round(localX(w,'HOME'))},lb:{x:round(fb.x),y:round(fb.y),localX:round(localX(fb,'AWAY')),task:task(fb)},fbThreatDistance:round(dist(fb,w)),nearestCompensator:round(Math.min(...cover,99))};
  const score=row.fbThreatDistance-Math.min(row.nearestCompensator,16)*.25;if(!worst||score>worst._score){row._score=score;worst=row;}
 }
 if(worst)delete worst._score;return worst;
}
function stDepthProbe(r){
 const rows=[];for(const f of r.frames||[]){const st=byId(f,'H-ST');if(st)rows.push({time:n(f.time),x:localX(st,'HOME'),task:task(st),possession:f.possession||f.ball?.ownerTeam||null});}
 if(!rows.length)return null;const min=rows.reduce((a,b)=>b.x<a.x?b:a),deep=rows.filter(x=>x.x<60),deepSeconds=deep.length>1?deep.at(-1).time-deep[0].time:0;
 return{minLocalX:round(min.x),at:round(min.time),task:min.task,possession:min.possession,secondsBelow60:round(deepSeconds)};
}
function gkProbe(r){
 const fs=r.frames||[],term=terminalEvent(r),flight=fs.filter(f=>String(f?.ball?.mode||'').toUpperCase()==='FLIGHT'&&String(f?.ball?.kind||'').toUpperCase()==='SHOT');
 if(!flight.length)return{terminal:term?{type:term.type,t:round(term.t)}:null,shotFlightFrames:0};
 const f0=flight[0],g0=byId(f0,'H-GK');if(!g0)return{terminal:term?{type:term.type,t:round(term.t)}:null,shotFlightFrames:flight.length,gkMissing:true};
 const pre=term?fs.filter(f=>n(f.time)<=n(term.t)+1e-6):flight,post=term?fs.filter(f=>n(f.time)>n(term.t)):[];
 const disp=arr=>arr.reduce((m,f)=>{const g=byId(f,'H-GK');return g?Math.max(m,dist(g,g0)):m;},0);
 const diveish=f=>{const g=byId(f,'H-GK');return g&&(/DIVE|SAVE|PARRY|SHOT_REACT|GK_REACT/.test(task(g))||g.v37DivePresentation);};
 const firstDive=fs.find(diveish),firstMeaningful=pre.find(f=>{const g=byId(f,'H-GK');return g&&dist(g,g0)>=.55;});
 return{terminal:term?{type:term.type,t:round(term.t)}:null,flightStart:round(f0.time),flightEnd:round(flight.at(-1).time),shotFlightFrames:flight.length,maxPreTerminalDisplacement:round(disp(pre)),maxPostTerminalDisplacement:round(disp(post)),firstMeaningfulReaction:firstMeaningful?round(firstMeaningful.time):null,firstDivePresentation:firstDive?round(firstDive.time):null,diveStartsAfterTerminal:!!(term&&firstDive&&n(firstDive.time)>n(term.t)+.051)};
}

const rows=[];
for(const [key,seed] of FAIL_REPORTS){
 const r=H.run(key,seed,{runtimeDir}),fs=r.frames||[],live=liveSetPieceFrames(r),row={key,seed,frameCount:fs.length,legacyGateIncludedFrames:fs.filter(f=>!legacyDead(f)).length,futureOutcomePrecomputed:r.futureOutcomePrecomputed};
 if(/CORNER|FREE_KICK/.test(key)){row.kickTime=kickTime(r);row.liveSetPieceFrameCount=live.length;row.liveFramesExcludedByLegacyGate=live.filter(legacyDead).length;row.actualCluster=clusterProbe(live);row.targetConvergence=targetConvergence(live);}
 if(key==='CROSS_RIGHT')row.fullback=fullbackProbe(r);
 if(key==='CROSS_LEFT')row.stDepth=stDepthProbe(r);
 if(key.startsWith('GK_SHOT'))row.gk=gkProbe(r);
 rows.push(row);
}
const setPieces=rows.filter(r=>/CORNER|FREE_KICK/.test(r.key));
console.log(JSON.stringify({module:'V39_VISUAL_TRUTH_PROBE',status:'DIAGNOSTIC_ONLY',knownVisualFailCount:rows.length,knownPassControl:{key:'ST_BREAKAWAY',seed:'FINAL-MATCH-TEST-12'},setPieceLiveFramesTotal:setPieces.reduce((s,r)=>s+r.liveSetPieceFrameCount,0),setPieceLiveFramesExcludedByLegacyGate:setPieces.reduce((s,r)=>s+r.liveFramesExcludedByLegacyGate,0),rows},null,2));
