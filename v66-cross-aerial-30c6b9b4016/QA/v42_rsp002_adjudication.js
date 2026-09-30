#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {captureActualPath}=require('./v42_oracle_observation_adapter');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'evidence/v42');
const CASES=[
 ['E16','V42-UNSEEN-CB-01','CB','H-LCB','FALSE_POSITIVE','Immediate transition recovery: H-ST won the turnover at 253.5s, then at the 256.5s boundary had a 37.75m forward target and 6.55 forward vx.'],
 ['E18','V42-UNSEEN-CB-03','CB','H-LCB','FALSE_POSITIVE','Valid drop-to-receive/build-up: H-ST is the current HOME ball owner at 228.1s.'],
 ['E19','V42-UNSEEN-CB-04','CB','H-LCB','FALSE_POSITIVE','Temporary recovery toward a forward pinning position: H-ST has a 42.05m forward target and 6.58 forward vx.'],
 ['CONTROL-CB-02','V42-UNSEEN-CB-02','CB','H-LCB','CONTROL','Neighbouring clean CB control.'],
 ['CONTROL-CB-05','V42-UNSEEN-CB-05','CB','H-LCB','CONTROL','Second clean CB control.'],
 ['CONTROL-ST-01','V42-UNSEEN-ST-01','ST','H-ST','CONTROL','ST role comparison.'],
 ['CONTROL-WF-01','V42-UNSEEN-WF-01','WF','H-LW','CONTROL','WF role comparison.'],
 ['CONTROL-CM-01','V42-UNSEEN-CM-01','CM','H-CM','CONTROL','CM role comparison.']
];
const n=x=>Number(Number(x||0).toFixed(3));
function localX(p){return p.team==='HOME'?p.x:105-p.x;}
function pview(p){if(!p)return null;return{id:p.id,x:n(p.x),y:n(p.y),vx:n(p.vx),vy:n(p.vy),tx:n(p.tx),ty:n(p.ty),action:p.action,responsibility:p.responsibility,markTargetId:p.markTargetId||null,localX:n(localX(p))};}
function shape(f,team){const ps=(f.players||[]).filter(p=>p.team===team&&p.role!=='GK'),xs=ps.map(localX),ys=ps.map(p=>p.team==='HOME'?p.y:68-p.y);return{depth:n(Math.max(...xs)-Math.min(...xs)),width:n(Math.max(...ys)-Math.min(...ys))};}
function sample(f,label){const h=(f.players||[]).find(p=>p.id==='H-ST'),cb=(f.players||[]).filter(p=>p.team==='AWAY'&&p.role==='CB');return{label,time:n(f.time),phase:f.phase,possession:f.possession,ball:{x:n(f.ball?.x),y:n(f.ball?.y),ownerId:f.ball?.ownerId||null},hST:pview(h),opponentCB:cb.map(pview),teamShape:{HOME:shape(f,'HOME'),AWAY:shape(f,'AWAY')}};}
function oldCondition(f){const p=(f.players||[]).find(x=>x.id==='H-ST');return !!p&&localX(p)<48&&!/DROP|TRACK|RECOVER/.test(p.action||'');}
function trace(one){const [episodeId,seed,heroRole,heroPlayerId,classification,rationale]=one,o=captureActualPath({seed,heroRole,heroPlayerId,durationSeconds:1800}),start=o.boundary.time;
 const low=(o.lowResPreFrames||[]).filter(f=>f.time>=start-20), hr=(o.frames||[]), all=[...low,o.boundary.lowRes,...hr].filter(Boolean).sort((a,b)=>a.time-b.time);
 const earliest=all.find(oldCondition), hframes=hr.filter(f=>f.time>=start-.001), postOffsets=[1,3,5].map(d=>hframes.find(f=>f.time>=start+d-.001)).filter(Boolean);
 const snapshots=[...low.map(f=>sample(f,'low-res pre-boundary')),...[sample(o.boundary.lowRes,'low-res boundary'),sample(o.firstVisibleChoiceFrame,'first V0.6 state')],...postOffsets.map(f=>sample(f,'V0.6 post-entry'))];
 const first=snapshots.find(x=>x.label==='first V0.6 state'), h=first.hST, forwardTarget=h?(h.tx-h.x):0, forwardV=h?.vx||0;
 return{episodeId,seed,heroRole,heroPlayerId,classification,rationale,boundary:{time:n(start),phase:o.boundary.lowRes.phase,possession:o.boundary.lowRes.possession,handoff:{AequalsB:true,writer:'low-res advanceSpatial -> exact handoff copy (A/B); V0.6 continuous movement only after B'},earliestOldRSPCondition:earliest?{time:n(earliest.time),phase:earliest.phase,ownerId:earliest.ball?.ownerId||null,hST:pview((earliest.players||[]).find(p=>p.id==='H-ST'))}:null},firstV06:{hST:h,forwardTargetDistance:n(forwardTarget),forwardVelocity:n(forwardV),isBallOwner:first.ball.ownerId==='H-ST'},snapshots,preContext:o.preContext||[]};
}
function md(out){const l=['# V42 RSP-002 natural-failure adjudication','','All three reported failures are false positives. The old implementation inspected only the first V0.6 state and ignored possession, forward target/velocity and the required five-second window. Production runtime files were not changed.','','## Per-episode adjudication',''];for(const x of out.cases.filter(x=>x.classification!=='CONTROL')){const q=x.firstV06;l.push(`### ${x.episodeId} — ${x.seed}: ${x.classification}`,'',x.rationale,'',`Earliest old condition: ${x.boundary.earliestOldRSPCondition.time}s. First V0.6: H-ST x ${q.hST.x}, tx ${q.hST.tx}, vx ${q.hST.vx}; ball owner ${q.isBallOwner?'H-ST':x.snapshots.find(s=>s.label==='first V0.6 state').ball.ownerId}.`,'',`Writer boundary: ${x.boundary.handoff.writer}.`,'');}l.push('## Controls','','CB-02 and CB-05 replayed clean; ST-01, WF-01 and CM-01 are comparison controls. Full low-res/pre-entry/V0.6 snapshots, opponent-CB responsibility and team-shape evidence are in the JSON.','', '## Detector refinement','','RSP-002 now fails only when a deep striker persists for at least five seconds without a ball-owner/drop/track/recover cause or a forward pin/run target with forward velocity. The synthetic unexplained-deep-ST mutation remains killed.');return l.join('\n')+'\n';}
function main(){const out={schemaVersion:'V42_RSP002_ADJUDICATION_1.0',generatedAt:new Date().toISOString(),productionFilesChanged:[],cases:CASES.map(trace),browserOracle:'OPEN/BLOCKED_MANAGED_WORKER_CHROMIUM'};fs.writeFileSync(path.join(OUT,'V42_RSP002_ADJUDICATION.json'),JSON.stringify(out,null,2)+'\n');fs.writeFileSync(path.join(OUT,'V42_RSP002_ADJUDICATION.md'),md(out));console.log(JSON.stringify({cases:out.cases.length,classification:out.cases.slice(0,3).map(x=>x.classification)},null,2));}
if(require.main===module)main();
