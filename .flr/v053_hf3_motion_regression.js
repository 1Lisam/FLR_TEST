'use strict';
const fs=require('fs'),path=require('path');
const H=require('../live_hybrid_session_v02.js');
const A=require('../live_v06_scene_authority_browser.js');
const E=require('../runtime/continuous_match_core.js');
const P=require('../runtime/protagonist_match_controller.js');
const runtimeDir=path.resolve(__dirname,'../runtime');
const dist=(a,b)=>a&&b?Math.hypot(a.x-b.x,a.y-b.y):99;
const player=(f,id)=>(f.players||[]).find(p=>p.id===id)||null;
const n3=v=>Number.isFinite(Number(v))?+Number(v).toFixed(3):null;
function visual(key,seed,seconds=9){const d=H.createDeveloperScenario({key,seed});const v=A.runDeveloperVisualWindow(d.boundary,{runtimeDir,seed:d.seed,durationSeconds:seconds});return{d,env:v,rows:v.frames};}
function taskKey(p){return `${p?.tacticalTask||p?.action||''}|${p?.markTargetId||''}`;}
function threatContext(f){const b=f?.ball||{};if(b.ownerId)return `OWNER:${b.ownerId}`;if(b.mode==='FLIGHT')return `FLIGHT:${b.intendedReceiverId||'NONE'}`;return `${b.mode||'NONE'}:${b.intendedReceiverId||'NONE'}`;}
function taskChanges(rows,id){const a=rows.map(f=>player(f,id)).filter(Boolean).map(taskKey);let n=0;for(let i=1;i<a.length;i++)if(a[i]!==a[i-1])n++;return n;}
function lateralFlips(rows,id,thr=.06){const s=[];for(let i=1;i<rows.length;i++){const a=player(rows[i-1],id),b=player(rows[i],id);if(!a||!b)continue;const dy=b.y-a.y;if(Math.abs(dy)>=thr)s.push(dy>0?1:-1);}let n=0;for(let i=1;i<s.length;i++)if(s[i]!==s[i-1])n++;return n;}
function shared(a,b){const s=new Set(a||[]);return(b||[]).filter(x=>s.has(x));}
function meaningfulLateral(rows,id){
  const phases=[];let cur=null;
  for(let i=1;i<rows.length;i++){
    const a=player(rows[i-1],id),b=player(rows[i],id);if(!a||!b)continue;
    const dy=b.y-a.y;if(Math.abs(dy)<.025)continue;const sign=dy>0?1:-1,task=b.tacticalTask||b.action||'',owner=threatContext(rows[i]),mark=b.markTargetId||'NONE';
    if(!cur||cur.sign!==sign){if(cur)phases.push(cur);cur={sign,start:rows[i-1].time,end:rows[i].time,travel:Math.abs(dy),samples:1,tasks:new Set([task]),owners:new Set([owner]),marks:new Set([mark])};}
    else{cur.end=rows[i].time;cur.travel+=Math.abs(dy);cur.samples++;cur.tasks.add(task);cur.owners.add(owner);cur.marks.add(mark);}
  }
  if(cur)phases.push(cur);
  const flips=[];
  for(let i=1;i<phases.length;i++){
    const a=phases[i-1],b=phases[i];
    if(a.travel<.34||b.travel<.34||a.samples<2||b.samples<2)continue;
    const sharedTasks=shared([...a.tasks],[...b.tasks]),sharedOwners=shared([...a.owners],[...b.owners]),sharedMarks=shared([...a.marks],[...b.marks]),prev=flips.length?flips.at(-1).at:null;
    flips.push({at:b.start,prevAt:prev,gap:prev==null?null:n3(b.start-prev),rapidRepeat:prev!=null&&b.start-prev<=1.25,sameContext:sharedTasks.length>0&&sharedOwners.length>0,markStable:sharedMarks.length>0,sharedTasks,sharedOwners,sharedMarks,fromMarks:[...a.marks],toMarks:[...b.marks],from:{start:n3(a.start),end:n3(a.end),travel:n3(a.travel),samples:a.samples},to:{start:n3(b.start),end:n3(b.end),travel:n3(b.travel),samples:b.samples}});
  }
  const sameContextRapidDetails=flips.filter(x=>x.rapidRepeat&&x.sameContext);return{meaningfulFlips:flips.length,sameContextRapidRepeats:sameContextRapidDetails.length,sameContextRapidDetails};
}
function taskOscillation(rows,id){
  const runs=[];let cur=null;
  for(const f of rows){const p=player(f,id);if(!p)continue;const key=taskKey(p),owner=threatContext(f);if(!cur||cur.key!==key){if(cur)runs.push(cur);cur={key,start:f.time,samples:1,owners:new Set([owner])};}else{cur.samples++;cur.owners.add(owner);}}
  if(cur)runs.push(cur);
  let ping=0,stableSameOwnerRapid=0;
  for(let i=2;i<runs.length;i++){const a=runs[i-2],b=runs[i-1],c=runs[i];if(a.key!==c.key||a.key===b.key)continue;ping++;const owners=shared(shared([...a.owners],[...b.owners]),[...c.owners]);if(a.samples>=2&&b.samples>=2&&c.samples>=2&&owners.length&&c.start-b.start<=1.25)stableSameOwnerRapid++;}
  return{taskPingPongs:ping,stableSameOwnerRapidTaskPingPongs:stableSameOwnerRapid};
}
function ownerFreeze(rows){let best=0,start=null,lastOwner=null;for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i],oid=b.ball?.ownerId,p=player(b,oid),q=player(a,oid),near=Math.min(...(b.players||[]).filter(x=>p&&x.team!==p.team).map(x=>dist(p,x)),99),move=dist(p,q);if(p&&q&&oid===lastOwner&&move<.06&&near<=1.8){if(start==null)start=a.time;best=Math.max(best,b.time-start);}else start=null;lastOwner=oid;}return +best.toFixed(3);}
function motionCase(key,seed,ids){const v=visual(key,seed);const metrics={freeze:ownerFreeze(v.rows),players:{}};for(const id of ids){const meaningful=meaningfulLateral(v.rows,id),tasks=taskOscillation(v.rows,id);metrics.players[id]={rawTaskChanges:taskChanges(v.rows,id),rawLateralFlips:lateralFlips(v.rows,id),...meaningful,...tasks};}return{seed,key,metrics,rows:v.rows};}
const cases=[];
cases.push(motionCase('BALL_DEPTH_SYNC','DEV-RECENT-1787550734911-1',['H-ST','H-RW','A-LCB','A-RCB','A-LB','A-RB']));
cases.push(motionCase('BALL_DEPTH_SYNC','DEV-RECENT-1787550810767-13',['H-ST','H-RW','A-LCB','A-RCB','A-LB','A-RB']));
cases.push(motionCase('CM_SUPPORT_SPREAD','DEV-RECENT-1787550909999-20',['A-LB','A-LCB','A-RCB','A-RB','A-LCM','A-CM','A-RCM']));
const early=visual('EARLY_ATTACK_ENTRY','DEV-RECENT-1787550979631-32');const earlyGaps=early.rows.map(f=>dist(player(f,'H-RB'),player(f,'A-LW'))).filter(Number.isFinite);const earlyMetrics={first:+earlyGaps[0].toFixed(3),max:+Math.max(...earlyGaps).toFixed(3),last:+earlyGaps.at(-1).toFixed(3),rbTaskChanges:taskChanges(early.rows,'H-RB')};
function optionsOf(opened){return opened?.state?.pending?.options||opened?.pending?.options||[];}
function findNaturalOffside(){const base='DEV-RECENT-1787551093991-33';for(let i=0;i<64;i++){const seed=i===0?base:`${base}-HF3-${String(i).padStart(2,'0')}`,d=H.createDeveloperScenario({key:'OFFSIDE_REVIEW',seed}),o=A.runToChoice(d.boundary,{runtimeDir,seed:d.seed,minPreSeconds:.8,maxSearchSeconds:8}),opts=optionsOf(o),risky=opts.find(x=>['H-ST','H-RW'].includes(x.targetId)&&['THROUGH_PASS','LOFTED_THROUGH_PASS','AVAILABLE_PASS'].includes(x.id));if(!risky||!o.state)continue;const m=o.state.m,t0=m.time,x0=m.ball.x,y0=m.ball.y,res=P.applyChoice(o.state,risky.id,risky.targetId,{source:'AUTO_SIMULATION'});if(!res.ok)continue;let call=null,maxMove=0;for(let k=0;k<45&&!m.completed;k++){P.step(o.state,.1);maxMove=Math.max(maxMove,Math.hypot(m.ball.x-x0,m.ball.y-y0));call=(m.events||[]).find(e=>e.type==='OFFSIDE'&&e.t>=t0-.01);if(call)break;}if(call)return{found:true,seed,choice:{id:risky.id,targetId:risky.targetId},callAge:+(call.t-t0).toFixed(3),maxBallMove:+maxMove.toFixed(3),futureOutcomePrecomputed:d.boundary.futureOutcomePrecomputed};}return{found:false};}
const offside=findNaturalOffside();
const checks=[],legacyForensicChecks=[],watches=[];
for(const c of cases){
  checks.push({id:`${c.seed}:OWNER_FREEZE`,pass:c.metrics.freeze<=1.20,value:c.metrics.freeze});
  for(const [id,m] of Object.entries(c.metrics.players)){
    legacyForensicChecks.push({id:`${c.seed}:${id}:RAW_TASK_CHANGES`,pass:m.rawTaskChanges<=8,value:m.rawTaskChanges});
    legacyForensicChecks.push({id:`${c.seed}:${id}:RAW_LATERAL_FLIPS`,pass:m.rawLateralFlips<=3,value:m.rawLateralFlips});
    checks.push({id:`${c.seed}:${id}:RAPID_SAME_CONTEXT_LATERAL_REPEATS`,pass:m.sameContextRapidRepeats<=1,value:m.sameContextRapidRepeats});
    watches.push({id:`${c.seed}:${id}:STABLE_SAME_OWNER_RAPID_TASK_PINGPONG`,value:m.stableSameOwnerRapidTaskPingPongs,totalPingPongs:m.taskPingPongs});
  }
}
checks.push({id:'EARLY_ENTRY_WIDE_RUNNER_FIRST_GAP',pass:earlyMetrics.first<=10.5,value:earlyMetrics.first});checks.push({id:'EARLY_ENTRY_WIDE_RUNNER_MAX_GAP',pass:earlyMetrics.max<=13.5,value:earlyMetrics.max});checks.push({id:'EARLY_ENTRY_RB_TASK_CHANGES',pass:earlyMetrics.rbTaskChanges<=8,value:earlyMetrics.rbTaskChanges});
checks.push({id:'OFFSIDE_PRODUCTION_RISKY_TARGET_FOUND',pass:offside.found,value:offside});if(offside.found){checks.push({id:'OFFSIDE_MEANINGFUL_FLIGHT_BEFORE_CALL',pass:offside.callAge>=.45&&offside.maxBallMove>=3.0,value:offside});checks.push({id:'OFFSIDE_NO_FUTURE_PRECOMPUTE',pass:offside.futureOutcomePrecomputed===false,value:offside.futureOutcomePrecomputed});}
const status=checks.every(x=>x.pass)?'PASS':'FAIL',legacyStatus=legacyForensicChecks.every(x=>x.pass)?'PASS':'FAIL';
const out={schemaVersion:'FLR_V053_HF3_MOTION_REGRESSION_1.3',status,legacyStatus,measurementPolicy:'Raw task/lateral totals are preserved as forensic evidence. Hard motion gating uses repeated meaningful lateral reversals only when they recur rapidly in the same tactical and semantic ball-threat context. Controlled possession is keyed by owner; pass flight is keyed by intended receiver so distinct live defensive threats are not collapsed into one FLIGHT bucket. Mark identity remains emitted diagnostically; task ping-pong remains WATCH until it is correlated with visible motion.',checks,legacyForensicChecks,watches,cases:cases.map(c=>({seed:c.seed,key:c.key,metrics:c.metrics})),earlyMetrics,offside};
fs.writeFileSync(path.resolve(__dirname,'v053_hf3_motion_regression_status.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));if(status!=='PASS')process.exitCode=1;
