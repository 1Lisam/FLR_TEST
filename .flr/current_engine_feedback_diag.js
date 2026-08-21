'use strict';
const fs=require('fs'),path=require('path');
const A=require('../live_v06_scene_authority_browser.js');
const E=require('../runtime/continuous_match_core.js');
const old=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const neu=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const boundary=old.currentSituation?.hybridBefore?.boundary;
if(!boundary)throw new Error('OLD_BOUNDARY_MISSING');
const opened=A.runToChoice(boundary,{runtimeDir:path.resolve('runtime'),maxSearchSeconds:35});
const frames=opened.scene?.preFrames?.length?opened.scene.preFrames:opened.frames;
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function metric(id){const rows=frames.map(f=>({t:f.time,p:f.players.find(p=>p.id===id)})).filter(x=>x.p);if(rows.length<2)return{samples:rows.length};let plen=0,xr=0,yr=0,pdx=null,pdy=null,acts=[];for(let i=0;i<rows.length;i++){const a=rows[i].p;if(a.action&&acts.at(-1)?.action!==a.action)acts.push({t:Number(rows[i].t.toFixed(2)),action:a.action});if(i){const b=rows[i-1].p,dx=a.x-b.x,dy=a.y-b.y;plen+=Math.hypot(dx,dy);if(pdx!=null&&Math.abs(pdx)>.01&&Math.abs(dx)>.01&&pdx*dx<0)xr++;if(pdy!=null&&Math.abs(pdy)>.01&&Math.abs(dy)>.01&&pdy*dy<0)yr++;pdx=dx;pdy=dy;}}const first=rows[0].p,last=rows.at(-1).p,net=dist(first,last);return{samples:rows.length,t0:rows[0].t,t1:rows.at(-1).t,start:[+first.x.toFixed(2),+first.y.toFixed(2)],end:[+last.x.toFixed(2),+last.y.toFixed(2)],path:+plen.toFixed(2),net:+net.toFixed(2),pathToNet:+((plen/Math.max(net,.05))).toFixed(2),xReversals:xr,yReversals:yr,actions:acts};}
const last=frames.at(-1),hero=last.players.find(p=>p.id==='H-ST');const opp=last.players.filter(p=>p.team!=='HOME').map(p=>({id:p.id,d:dist(hero,p),action:p.action,markTargetId:p.markTargetId||null})).sort((a,b)=>a.d-b.d).slice(0,4).map(x=>({...x,d:+x.d.toFixed(2)}));
const pre=neu.currentSituation?.highResolution?.preActionFrames||[];const fr=pre.at(-1);if(!fr)throw new Error('NEW_PREACTION_MISSING');
const players=fr.players.map(p=>({...p,tx:Number.isFinite(p.tx)?p.tx:p.x,ty:Number.isFinite(p.ty)?p.ty:p.y,tacticalTask:p.tacticalTask||p.action,runUntil:p.runUntil||0}));const m={players,playersById:Object.fromEntries(players.map(p=>[p.id,p])),ball:{...fr.ball},time:fr.time,seed:'D1-FEEDBACK-DIAG',playerAbilityProfiles:{},possession:fr.possession,r:()=>0.5};const owner=m.playersById[m.ball.ownerId];const po=E.choiceActionBridge().passOptions(m,owner,true).map(o=>({targetId:o.p.id,slot:o.p.slot,role:o.p.role,d:+o.d.toFixed(2),forward:+o.forward.toFixed(2),open:+o.open.toFixed(2),block:o.block,score:+o.score.toFixed(3),running:!!o.running,leadForward:Number.isFinite(o.leadForward)?+o.leadForward.toFixed(2):null,offsideRisk:!!o.offsideRisk,task:o.p.tacticalTask,vx:+(o.p.vx||0).toFixed(2),vy:+(o.p.vy||0).toFixed(2)}));
const out={schemaVersion:'FLR_CURRENT_ENGINE_FEEDBACK_DIAG_1.0',oldJitterReplayOnCurrentEngine:{hadChoice:opened.hadChoice,preSpan:opened.preSpan,searchSeconds:opened.searchSeconds,hero:metric('H-ST'),nearestOpponents:opp,nearestMetrics:Object.fromEntries(opp.map(x=>[x.id,metric(x.id)])),futureOutcomePrecomputed:opened.futureOutcomePrecomputed},newMissingChoicePassOptions:{time:fr.time,ownerId:m.ball.ownerId,passOptions:po,wingers:po.filter(x=>['H-LW','H-RW'].includes(x.targetId))}};
fs.writeFileSync(process.argv[4],JSON.stringify(out,null,2)+'\n');
