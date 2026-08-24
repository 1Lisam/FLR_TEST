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
    const meaningful=meaningfulFlips(rows,id);result.players[id]={rawFlipCount:raw.length,meaningfulFlipCount:meaningful.count,sameTaskMeaningfulFlipCount:meaningful.sameTaskCount,sameOwnerMeaningfulFlipCount:meaningful.sameOwnerCount,sameTaskAndOwnerMeaningfulFlipCount:meaningful.sameTaskAndOwnerCount,rapidMeaningfulRepeatCount:meaningful.rapidRepeatCount,sameContextRapidRepeatCount:meaningful.sameContextRapidRepeatCount,rawFlips:raw,meaningfulFlips:meaningful.flips,phases:meaningful.phases};
  }
  return result;
}
const out=[
 run('BALL_DEPTH_SYNC','DEV-RECENT-1787550734911-1',['H-ST','H-RW','A-LB','A-LCB','A-RCB','A-RB']),
 run('BALL_DEPTH_SYNC','DEV-RECENT-1787550810767-13',['H-ST','H-RW','A-LB','A-LCB','A-RCB','A-RB']),
 run('CM_SUPPORT_SPREAD','DEV-RECENT-1787550909999-20',['A-LB','A-LCB','A-RCB','A-RB','A-LCM','A-CM','A-RCM'])
];
console.log(JSON.stringify(out,null,2));
