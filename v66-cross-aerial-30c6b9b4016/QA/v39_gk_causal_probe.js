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
const terminalTypes=new Set(['GOAL','SAVE','CHIP_SAVE','PARRY','PARRY_SAFE','PARRY_DANGER','SHOT_MISSED']);
function one(scenario,seed){
 const r=H.run(scenario,seed,{runtimeDir}),fs=r.frames||[],term=(r.actualEvents||[]).find(e=>terminalTypes.has(e.type))||null,flight=fs.filter(f=>String(f?.ball?.mode||'').toUpperCase()==='FLIGHT'&&String(f?.ball?.kind||'').toUpperCase()==='SHOT');
 const first=flight[0],g0=first&&(first.players||[]).find(p=>p.id==='H-GK');
 const rows=fs.map(f=>{const g=(f.players||[]).find(p=>p.id==='H-GK');return g?{time:n(f.time),mode:f.ball?.mode,kind:f.ball?.kind,ballX:n(f.ball?.x),ballY:n(f.ball?.y),x:n(g.x),y:n(g.y),tx:n(g.tx,g.x),ty:n(g.ty,g.y),task:task(g),disp:g0?dist(g,g0):0,presentation:!!g.v37DivePresentation}:null;}).filter(Boolean);
 const before=term?rows.filter(x=>x.time<=n(term.t)+1e-6):rows;
 const firstPresentation=rows.find(x=>x.presentation),firstPush=rows.find(x=>/PUSH_OFF_TRAVEL|RESULT_REACH|RESULT_CONTACT/.test(x.task)),firstMove15=rows.find(x=>x.disp>=.15),firstMove55=rows.find(x=>x.disp>=.55),maxDisp=before.reduce((m,x)=>Math.max(m,x.disp),0);
 const tail=term?rows.filter(x=>x.time>=n(term.t)-.65&&x.time<=n(term.t)+.15).map(x=>({...x,time:+x.time.toFixed(3),ballX:+x.ballX.toFixed(2),ballY:+x.ballY.toFixed(2),x:+x.x.toFixed(3),y:+x.y.toFixed(3),tx:+x.tx.toFixed(3),ty:+x.ty.toFixed(3),disp:+x.disp.toFixed(3)})):[];
 return{scenario,seed,terminal:term,shotStart:first?+n(first.time).toFixed(3):null,flightToTerminal:first&&term?+(n(term.t)-n(first.time)).toFixed(3):null,gkStart:g0?{x:+n(g0.x).toFixed(3),y:+n(g0.y).toFixed(3)}:null,firstPresentation:firstPresentation?+firstPresentation.time.toFixed(3):null,firstPush:firstPush?+firstPush.time.toFixed(3):null,firstMove15:firstMove15?+firstMove15.time.toFixed(3):null,firstMove55:firstMove55?+firstMove55.time.toFixed(3):null,maxPreTerminalDisplacement:+maxDisp.toFixed(3),tail};
}
console.log(JSON.stringify({module:'V39_GK_CAUSAL_PROBE',rows:[one('GK_SHOT_CLOSE','FINAL-MATCH-TEST-30'),one('GK_SHOT_BOX','FINAL-MATCH-TEST-12')]},null,2));
