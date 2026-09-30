'use strict';
const path=require('path');
require('./v37_movement_gate_luna_calibration.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');
const runtimeDir=path.resolve(__dirname,'../runtime');
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const byId=(f,id)=>(f?.players||[]).find(p=>p.id===id)||null;
const dist=(a,b)=>Math.hypot(n(a?.x)-n(b?.x),n(a?.y)-n(b?.y));
const round=v=>Number(n(v).toFixed(3));
const lx=(p,t)=>t==='AWAY'?105-n(p?.x):n(p?.x);
function kickTime(r){const e=(r.actualEvents||[]).find(x=>/CORNER_KICK|FREE_KICK|RESTART_KICK|SET_PIECE_KICK/.test(String(x.type||'')));if(e)return n(e.t);const f=(r.frames||[]).find(x=>String(x?.ball?.mode||'').toUpperCase()==='FLIGHT');return f?n(f.time):null;}
function compact(f,ids){return ids.map(id=>{const p=byId(f,id);return p&&{id,role:p.role,slot:p.slot,x:round(p.x),y:round(p.y),tx:round(p.tx),ty:round(p.ty),task:task(p),targetId:p.targetId||null,markTargetId:p.markTargetId||null};}).filter(Boolean);}
function diameter(ps,useTarget=false){let d=0;for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const a=useTarget?{x:ps[i].tx,y:ps[i].ty}:ps[i],b=useTarget?{x:ps[j].tx,y:ps[j].ty}:ps[j];d=Math.max(d,dist(a,b));}return d;}
function keyFrames(r){const fs=r.frames||[],kt=kickTime(r),pre=kt==null?fs[0]:[...fs].reverse().find(f=>n(f.time)<kt-.001)||fs[0],post=kt==null?fs.at(-1):fs.find(f=>n(f.time)>=kt-.001)||fs.at(-1);return{first:fs[0],pre,post,last:fs.at(-1),kickTime:kt};}
function fkProbe(seed){const r=H.run('FREE_KICK_ATTACK_LEFT',seed,{runtimeDir}),k=keyFrames(r),ids=['H-LCM','H-CM','H-RCM','H-ST','H-LW','H-RW','A-LB','A-RB','A-LCB','A-RCB','A-LCM','A-CM','A-RCM'];let minTarget=null,minActual=null,worstWide=null;
 for(const f of r.frames||[]){if(k.kickTime!=null&&n(f.time)>k.kickTime+.05)continue;const group=['H-LCM','H-CM','H-RCM','H-ST'].map(id=>byId(f,id)).filter(Boolean);if(group.length===4){const td=diameter(group,true),ad=diameter(group,false);if(!minTarget||td<minTarget.d)minTarget={time:round(f.time),d:round(td),players:compact(f,['H-LCM','H-CM','H-RCM','H-ST'])};if(!minActual||ad<minActual.d)minActual={time:round(f.time),d:round(ad),players:compact(f,['H-LCM','H-CM','H-RCM','H-ST'])};}
  const lw=byId(f,'H-LW'),rb=byId(f,'A-RB');if(lw&&rb){const defs=(f.players||[]).filter(p=>p.team==='AWAY'&&p.role!=='GK'),others=defs.filter(p=>p.id!=='A-RB'),cover=Math.min(...others.map(p=>dist(p,lw)),99),gap=dist(rb,lw),score=gap+Math.max(0,cover-8);if(!worstWide||score>worstWide.score){const explicitOwner=defs.find(p=>p.markTargetId==='H-LW'||p.targetId==='H-LW')||null;worstWide={score:round(score),time:round(f.time),gap:round(gap),nearestCover:round(cover),lw:compact(f,['H-LW'])[0],rb:compact(f,['A-RB'])[0],explicitOwner:explicitOwner?compact(f,[explicitOwner.id])[0]:null,fullbacks:compact(f,defs.filter(p=>p.role==='FB').map(p=>p.id)),markedDefenders:compact(f,defs.filter(p=>p.markTargetId||p.targetId).map(p=>p.id))};}}
 }
 return{scenario:'FREE_KICK_ATTACK_LEFT',seed,kickTime:k.kickTime,first:compact(k.first,ids),preKick:compact(k.pre,ids),postKick:compact(k.post,ids),minTargetDiameterHMidSt:minTarget,minActualDiameterHMidSt:minActual,worstWideLWvsARB:worstWide};}
function cornerProbe(key,seed){const r=H.run(key,seed,{runtimeDir}),k=keyFrames(r);let maxAwayGk=null,kickerFrames=[];
 for(const f of r.frames||[]){const g=byId(f,'A-GK');if(g){const local=lx(g,'AWAY'),speed=Math.hypot(n(g.vx),n(g.vy));if(!maxAwayGk||local>maxAwayGk.localX)maxAwayGk={time:round(f.time),localX:round(local),x:round(g.x),y:round(g.y),tx:round(g.tx),ty:round(g.ty),speed:round(speed),task:task(g)};}
  const cand=(f.players||[]).find(p=>p.team==='HOME'&&/CORNER.*(KICK|APPROACH|RUN_UP)|KICKER/.test(task(p)));if(cand)kickerFrames.push({time:round(f.time),ball:{x:round(f.ball?.x),y:round(f.ball?.y),mode:f.ball?.mode},p:compact(f,[cand.id])[0]});
 }
 const ids=['H-LW','H-ST','H-RW','H-LCM','H-CM','H-RCM','H-LB','H-RB','A-LW','A-ST','A-RW','A-LCM','A-CM','A-RCM','A-LB','A-RB','A-LCB','A-RCB','A-GK'];
 return{scenario:key,seed,kickTime:k.kickTime,first:compact(k.first,ids),preKick:compact(k.pre,ids),postKick:compact(k.post,ids),maxAwayGkDepth:maxAwayGk,kickerFrames:kickerFrames.slice(0,20)};}
console.log(JSON.stringify({module:'V39_PENDING_RELATION_PROBE',rows:[fkProbe('FINAL-MATCH-TEST-10'),fkProbe('FINAL-MATCH-TEST-6'),cornerProbe('CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-6'),cornerProbe('CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-4'),cornerProbe('CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-4'),cornerProbe('CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-1')]},null,2));
