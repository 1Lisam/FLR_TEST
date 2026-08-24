'use strict';
const path=require('path');
const H=require('../live_hybrid_session_v02.js');
const A=require('../live_v06_scene_authority_browser.js');
const E=require('../runtime/continuous_match_core.js');
const P=require('../runtime/protagonist_match_controller.js');
const runtimeDir=path.resolve(__dirname,'../runtime');
const byId=(f,id)=>(f.players||[]).find(p=>p.id===id)||null;
const n2=v=>Number.isFinite(Number(v))?+Number(v).toFixed(2):null;
function phaseRuns(rows,id){
  const phases=[];let cur=null;
  for(let i=1;i<rows.length;i++){
    const a=byId(rows[i-1],id),b=byId(rows[i],id);if(!a||!b)continue;
    const dy=b.y-a.y;if(Math.abs(dy)<.025)continue;const sign=dy>0?1:-1;
    if(!cur||cur.sign!==sign){if(cur)phases.push(cur);cur={sign,start:rows[i-1].time,end:rows[i].time,travel:Math.abs(dy),samples:1,startY:a.y,endY:b.y,tasks:new Set([b.tacticalTask||b.action||'']),owners:new Set([rows[i].ball?.ownerId||'FLIGHT'])};}
    else{cur.end=rows[i].time;cur.travel+=Math.abs(dy);cur.samples++;cur.endY=b.y;cur.tasks.add(b.tacticalTask||b.action||'');cur.owners.add(rows[i].ball?.ownerId||'FLIGHT');}
  }
  if(cur)phases.push(cur);
  return phases.map(p=>({...p,start:n2(p.start),end:n2(p.end),travel:+p.travel.toFixed(3),startY:+p.startY.toFixed(3),endY:+p.endY.toFixed(3),tasks:[...p.tasks],owners:[...p.owners]}));
}
function shared(a,b){const s=new Set(a||[]);return(b||[]).filter(x=>s.has(x));}
function taskRuns(rows,id){
  const runs=[];let cur=null;
  for(const frame of rows){
    const p=byId(frame,id);if(!p)continue;
    const task=p.tacticalTask||p.action||'';
    const mark=p.markTargetId||'';
    const key=`${task}|${mark}`;
    const owner=frame.ball?.ownerId||'FLIGHT';
    if(!cur||cur.key!==key){
      if(cur)runs.push(cur);
      cur={key,task,mark,start:frame.time,end:frame.time,samples:1,owners:new Set([owner])};
    }else{
      cur.end=frame.time;cur.samples++;cur.owners.add(owner);
    }
  }
  if(cur)runs.push(cur);
  return runs.map(r=>({...r,start:n2(r.start),end:n2(r.end),owners:[...r.owners]}));
}
function taskStability(rows,id){
  const runs=taskRuns(rows,id);
  const stableTransitions=[];
  for(let i=1;i<runs.length;i++){
    const a=runs[i-1],b=runs[i];
    if(a.samples>=2&&b.samples>=2){
      stableTransitions.push({at:b.start,from:a.key,to:b.key,sharedOwners:shared(a.owners,b.owners)});
    }
  }
  const pingPongs=[];
  for(let i=2;i<runs.length;i++){
    const a=runs[i-2],b=runs[i-1],c=runs[i];
    if(a.key!==c.key||a.key===b.key)continue;
    const span=c.start-b.start;
    const ownerABC=shared(shared(a.owners,b.owners),c.owners);
    const stable=a.samples>=2&&b.samples>=2&&c.samples>=2;
    pingPongs.push({
      at:c.start,from:a.key,via:b.key,backTo:c.key,span:n2(span),
      stable,sharedOwners:ownerABC,sameOwner:ownerABC.length>0,
      rapid:span<=1.25,
      sameOwnerRapid:ownerABC.length>0&&span<=1.25,
      stableSameOwnerRapid:stable&&ownerABC.length>0&&span<=1.25
    });
  }
  return{
    rawTaskChangeCount:Math.max(0,runs.length-1),
    stableTaskChangeCount:stableTransitions.length,
    taskPingPongCount:pingPongs.length,
    sameOwnerRapidTaskPingPongCount:pingPongs.filter(x=>x.sameOwnerRapid).length,
    stableSameOwnerRapidTaskPingPongCount:pingPongs.filter(x=>x.stableSameOwnerRapid).length,
    taskRuns:runs,
    taskPingPongs:pingPongs
  };
}
function meaningfulFlips(rows,id){
  const ph=phaseRuns(rows,id),flips=[];
  for(let i=1;i<ph.length;i++){
    const a=ph[i-1],b=ph[i];
    if(a.travel>=.34&&b.travel>=.34&&a.samples>=2&&b.samples>=2){
      const sharedTasks=shared(a.tasks,b.tasks),sharedOwners=shared(a.owners,b.owners);
      const previousAt=flips.length?flips.at(-1).at:null;
      flips.push({at:b.start,from:a,to:b,sharedTasks,sharedOwners,sameTask:sharedTasks.length>0,sameOwner:sharedOwners.length>0,sameTaskAndOwner:sharedTasks.length>0&&sharedOwners.length>0,rapidRepeat:previousAt!=null&&b.start-previousAt<=1.25});
    }
  }
  return{
    count:flips.length,
    sameTaskCount:flips.filter(f=>f.sameTask).length,
    sameOwnerCount:flips.filter(f=>f.sameOwner).length,
    sameTaskAndOwnerCount:flips.filter(f=>f.sameTaskAndOwner).length,
    rapidRepeatCount:flips.filter(f=>f.rapidRepeat).length,
    sameContextRapidRepeatCount:flips.filter(f=>f.sameTaskAndOwner&&f.rapidRepeat).length,
    phases:ph,flips
  };
}
function run(key,seed,ids,seconds=9){
  const d=H.createDeveloperScenario({key,seed});const env=A.seedMatch(d.boundary,{runtimeDir,seed:d.seed,explicitHeroChoiceRequired:false});env.state.mode='FULL_SKIP';
  const rows=[E.snapshot(env.state.m)];for(let i=0;i<Math.round(seconds/.1)&&!env.state.m.completed;i++){P.step(env.state,.1);rows.push(E.snapshot(env.state.m));}
  const result={key,seed,players:{}};
  for(const id of ids){
    const raw=[];let lastSign=0,lastMove=null;
    for(let i=1;i<rows.length;i++){
      const fa=rows[i-1],fb=rows[i],a=byId(fa,id),b=byId(fb,id);if(!a||!b)continue;const dy=b.y-a.y;if(Math.abs(dy)<.06)continue;const sign=dy>0?1:-1;
      if(lastSign&&sign!==lastSign)raw.push({t:n2(fb.time),dy:+dy.toFixed(3),task:b.tacticalTask||b.action||null,mark:b.markTargetId||null,x:n2(b.x),y:n2(b.y),tx:n2(b.tx),ty:n2(b.ty),ballOwner:fb.ball?.ownerId||null,ballX:n2(fb.ball?.x),ballY:n2(fb.ball?.y),prevMove:lastMove});
      lastSign=sign;lastMove={t:n2(fb.time),dy:+dy.toFixed(3),task:b.tacticalTask||b.action||null,tx:n2(b.tx),ty:n2(b.ty)};
    }
    const meaningful=meaningfulFlips(rows,id),tasks=taskStability(rows,id);result.players[id]={rawFlipCount:raw.length,meaningfulFlipCount:meaningful.count,sameTaskMeaningfulFlipCount:meaningful.sameTaskCount,sameOwnerMeaningfulFlipCount:meaningful.sameOwnerCount,sameTaskAndOwnerMeaningfulFlipCount:meaningful.sameTaskAndOwnerCount,rapidMeaningfulRepeatCount:meaningful.rapidRepeatCount,sameContextRapidRepeatCount:meaningful.sameContextRapidRepeatCount,rawTaskChangeCount:tasks.rawTaskChangeCount,stableTaskChangeCount:tasks.stableTaskChangeCount,taskPingPongCount:tasks.taskPingPongCount,sameOwnerRapidTaskPingPongCount:tasks.sameOwnerRapidTaskPingPongCount,stableSameOwnerRapidTaskPingPongCount:tasks.stableSameOwnerRapidTaskPingPongCount,rawFlips:raw,meaningfulFlips:meaningful.flips,taskPingPongs:tasks.taskPingPongs,phases:meaningful.phases,taskRuns:tasks.taskRuns};
    if(seed==='DEV-RECENT-1787550909999-20'&&id==='A-LB'){
      result.players[id].residualTrace=rows.filter(f=>f.time>=666.7&&f.time<=669.1).map(f=>{const p=byId(f,id);return{t:n2(f.time),y:n2(p?.y),ty:n2(p?.ty),x:n2(p?.x),tx:n2(p?.tx),vy:n2(p?.vy),vx:n2(p?.vx),task:p?.tacticalTask||p?.action||null,mark:p?.markTargetId||null,ballMode:f.ball?.mode||null,ballKind:f.ball?.kind||null,ballOwner:f.ball?.ownerId||null,intendedReceiverId:f.ball?.intendedReceiverId||null};});
    }
  }
  return result;
}
const out=[
 run('BALL_DEPTH_SYNC','DEV-RECENT-1787550734911-1',['H-ST','H-RW','A-LB','A-LCB','A-RCB','A-RB']),
 run('BALL_DEPTH_SYNC','DEV-RECENT-1787550810767-13',['H-ST','H-RW','A-LB','A-LCB','A-RCB','A-RB']),
 run('CM_SUPPORT_SPREAD','DEV-RECENT-1787550909999-20',['A-LB','A-LCB','A-RCB','A-RB','A-LCM','A-CM','A-RCM'])
];
const summary=out.map(s=>({key:s.key,seed:s.seed,players:Object.fromEntries(Object.entries(s.players).map(([id,p])=>[id,{rawFlipCount:p.rawFlipCount,meaningfulFlipCount:p.meaningfulFlipCount,sameContextRapidRepeatCount:p.sameContextRapidRepeatCount,rawTaskChangeCount:p.rawTaskChangeCount,stableTaskChangeCount:p.stableTaskChangeCount,taskPingPongCount:p.taskPingPongCount,sameOwnerRapidTaskPingPongCount:p.sameOwnerRapidTaskPingPongCount,stableSameOwnerRapidTaskPingPongCount:p.stableSameOwnerRapidTaskPingPongCount,flaggedTaskPingPongs:p.taskPingPongs.filter(x=>x.stableSameOwnerRapid).map(x=>({at:x.at,from:x.from,via:x.via,backTo:x.backTo,span:x.span,sharedOwners:x.sharedOwners})),flaggedLateralFlips:p.meaningfulFlips.filter(x=>x.sameTaskAndOwner&&x.rapidRepeat).map(x=>({at:x.at,fromTasks:x.from.tasks,toTasks:x.to.tasks,sharedOwners:x.sharedOwners,fromTravel:x.from.travel,toTravel:x.to.travel})),residualTrace:p.residualTrace||undefined}]))}));
console.log('HF3_TASK_STABILITY_SUMMARY='+JSON.stringify(summary));
if(process.env.HF3_DIAGNOSTIC_VERBOSE==='1')console.log(JSON.stringify(out,null,2));
