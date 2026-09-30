'use strict';

/* QA-only WATCH adjudication.  This module deliberately consumes normalized
 * observations and never writes runtime/player state.  The old exploration
 * signal remains available as raw evidence; verdicts require one coherent
 * football scene rather than unrelated episode maxima. */
const D=(a,b)=>Math.hypot((a?.x||0)-(b?.x||0),(a?.y||0)-(b?.y||0));
const localX=p=>p.team==='HOME'?Number(p.x):105-Number(p.x);
const open=f=>!/(CORNER|RESTART|GOAL|SET)/.test(f?.phase||'');
const rounded=x=>+Number(x).toFixed(3);

function frameEvidence(frame){
  const players=(frame.players||[]).filter(p=>p.role!=='GK');
  const carrier=players.find(p=>p.id===frame.ball?.ownerId)||null;
  const threats=players.filter(p=>['ST','WF'].includes(p.role)&&localX(p)>=55);
  const duplicate=[],uncovered=[];
  for(const threat of threats){
    const defenders=players.filter(p=>p.team!==threat.team);
    const legacy=defenders.filter(p=>p.markTargetId===threat.id||D(p,threat)<=15);
    const close=defenders.filter(p=>D(p,threat)<=6);
    const closeEvidence=close.map(p=>({playerId:p.id,distance:rounded(D(p,threat)),markTargetId:p.markTargetId||null,action:p.action||null,responsibility:p.responsibility||null}));
    const causallyAssigned=x=>/(BALL|PRESS|COVER|SCREEN|HANDOFF|SECOND)/.test(`${x.action||''}|${x.responsibility||''}`);
    const material=carrier?.team===threat.team&&carrier.id!==threat.id&&D(carrier,threat)<=20&&localX(threat)>=65;
    if(legacy.length>1)duplicate.push({threatId:threat.id,legacyOwnerIds:legacy.map(p=>p.id),closeOwnerIds:close.map(p=>p.id),closeEvidence,causelessCloseOwnerIds:closeEvidence.filter(x=>!causallyAssigned(x)).map(x=>x.playerId),material,carrierId:carrier?.id||null});
    if(material&&!defenders.some(p=>p.markTargetId===threat.id||D(p,threat)<=10))uncovered.push({threatId:threat.id,carrierId:carrier?.id||null});
  }
  const vector=[];
  if(carrier)for(const p of players.filter(x=>x.team!==carrier.team)){
    const dx=carrier.x-p.x,dy=carrier.y-p.y,dist=Math.hypot(dx,dy),speed=Math.hypot(p.vx||0,p.vy||0);
    const cosine=dist&&speed?(p.vx*dx+p.vy*dy)/(dist*speed):0;
    if(dist<=12&&speed>=.4&&cosine>=.7)vector.push({playerId:p.id,distance:rounded(dist),speed:rounded(speed),cosine:rounded(cosine)});
  }
  const rawVector=[];
  if(carrier)for(const p of players.filter(x=>x.team!==carrier.team)){
    const dx=carrier.x-p.x,dy=carrier.y-p.y,dist=Math.hypot(dx,dy),speed=Math.hypot(p.vx||0,p.vy||0);
    if(dist&&speed&&(p.vx*dx+p.vy*dy)/(dist*speed)>.7)rawVector.push(p.id);
  }
  const localDensity=Math.max(0,...players.map(p=>players.filter(q=>D(p,q)<=2.2).length));
  return {time:rounded(frame.time),phase:frame.phase||null,openPlay:open(frame),carrierId:carrier?.id||null,
    raw:{localDensity,teamVectorIds:rawVector,duplicate},
    refined:{vector,duplicateCollapse:duplicate.filter(x=>x.material&&x.causelessCloseOwnerIds.length>=3),uncovered}
  };
}

function spans(events,key){
  const by=new Map();
  for(const e of events){const k=key(e);if(!k)continue;const prior=by.get(k);if(prior&&e.time-prior.last.time<=.151){prior.last=e;prior.events.push(e);}else by.set(k,{key:k,first:e,last:e,events:[e]});}
  return [...by.values()].map(s=>({key:s.key,start:s.first.time,end:s.last.time,persistence:rounded(s.last.time-s.first.time),frames:s.events.length,events:s.events}));
}

function adjudicate(observation){
  const frames=(observation.frames||[]).filter(f=>Number.isFinite(Number(f.time))&&Array.isArray(f.players)).map(frameEvidence);
  const legacy=[];
  for(const f of frames){
    if(f.raw.localDensity>=4)legacy.push({metric:'local-density',time:f.time,ids:[]});
    if(f.raw.teamVectorIds.length>=3)legacy.push({metric:'team-vector-convergence',time:f.time,ids:f.raw.teamVectorIds});
    for(const x of f.raw.duplicate)legacy.push({metric:'duplicate-ownership',time:f.time,threatId:x.threatId,ids:x.legacyOwnerIds});
  }
  const legacyFamilies=[...new Set(legacy.map(x=>x.metric))];
  const refined=[];
  for(const f of frames)if(f.openPlay){
    if(f.refined.vector.length>=5)refined.push({metric:'persistent-team-wide-ball-chase',time:f.time,ids:f.refined.vector.map(x=>x.playerId),carrierId:f.carrierId});
    for(const x of f.refined.duplicateCollapse)refined.push({metric:'persistent-multi-defender-collapse',time:f.time,threatId:x.threatId,ids:x.closeOwnerIds,carrierId:x.carrierId});
    for(const x of f.refined.uncovered)refined.push({metric:'persistent-uncovered-material-threat',time:f.time,threatId:x.threatId,carrierId:x.carrierId});
  }
  const persistent=spans(refined,e=>`${e.metric}|${e.threatId||e.carrierId||e.ids.join(',')}`).filter(s=>s.persistence>=.8);
  const coherent=[];
  for(const a of persistent)for(const b of persistent){
    if(a===b||a.key===b.key)continue;
    const overlap=Math.max(a.start,b.start)<=Math.min(a.end,b.end)+.001;
    const sameThreat=a.events[0].threatId&&a.events[0].threatId===b.events[0].threatId;
    const sameCarrier=a.events[0].carrierId&&a.events[0].carrierId===b.events[0].carrierId;
    if(overlap&&(sameThreat||sameCarrier))coherent.push({a:a.key,b:b.key,start:Math.max(a.start,b.start),end:Math.min(a.end,b.end),sameThreat:!!sameThreat,sameCarrier:!!sameCarrier});
  }
  const independentlySevere=persistent.filter(s=>/persistent-(multi-defender-collapse|team-wide-ball-chase)/.test(s.key));
  const watch=(coherent.length||independentlySevere.length)?{status:'WATCH',reason:coherent.length?'persistent, same-scene causal contradiction':'persistent independently severe collapse/chase',scenes:[...coherent,...independentlySevere.map(s=>({a:s.key,b:null,start:s.start,end:s.end,independentlySevere:true}))]}:null;
  let classification;
  if(watch)classification='TRUE_WATCH';
  else if(legacyFamilies.length>=2){
    const times=legacy.map(x=>x.time), overlap=legacy.some(a=>legacy.some(b=>a.metric!==b.metric&&Math.abs(a.time-b.time)<=1));
    classification=overlap?'FALSE_WATCH_HEURISTIC':'FALSE_WATCH_AGGREGATION';
    // Maxima at remote times are additionally recorded even when another
    // broad metric happens to overlap; the primary class reflects the cause
    // that actually made this episode WATCH.
    if(!overlap) classification='FALSE_WATCH_AGGREGATION';
  } else classification='INSUFFICIENT_EVIDENCE';
  const causalResponseFrames=frames.flatMap(f=>f.raw.duplicate.filter(x=>x.closeOwnerIds.length>=3&&x.causelessCloseOwnerIds.length<x.closeOwnerIds.length).map(x=>({time:f.time,phase:f.phase,threatId:x.threatId,carrierId:x.carrierId,closeEvidence:x.closeEvidence})));
  const classificationReason=watch?'persistent causeless collapse or team-wide chase':causalResponseFrames.length?'legitimate mark+cover/ball-pressure response, not duplicate ownership':'broad distance/vector heuristic without a persistent causeless football contradiction';
  return {windowSeconds:1,persistenceSeconds:.8,frames,legacyHits:legacy,legacyFamilies,refinedHits:refined,persistentSpans:persistent,coherentScenes:coherent,causalResponseFrames,watch,classification,classificationReason};
}

function syntheticControls(){
  const p=(id,team,role,x,y,vx=0,vy=0,markTargetId=null)=>({id,team,role,x,y,vx,vy,markTargetId});
  const base=()=>[p('H-ST','HOME','ST',82,34),p('H-CM','HOME','CM',70,34),p('A-CB1','AWAY','CB',76,34),p('A-CB2','AWAY','CB',76,38),p('A-CB3','AWAY','CB',76,30),p('A-CM','AWAY','CM',72,20),p('A-FB','AWAY','FB',70,48)];
  const f=(t,players,ownerId='H-CM')=>({time:t,phase:'FINAL_THIRD',ball:{ownerId},players});
  const separated=[f(0,base()),f(2,base())]; separated[0].players[2].vx=1;separated[0].players[2].vy=0; separated[1].players[3].markTargetId='H-ST';
  const cover=Array.from({length:12},(_,i)=>f(i/10,base().map(x=>({...x})))) ;cover.forEach(x=>{x.players[2].markTargetId='H-ST';x.players[3].markTargetId='H-ST';});
  const collapse=Array.from({length:12},(_,i)=>f(i/10,base().map(x=>({...x})))) ;collapse.forEach(x=>x.players.slice(2,5).forEach(q=>{q.x=81;q.y=34;q.markTargetId='H-ST';}));
  const chase=Array.from({length:12},(_,i)=>f(i/10,base().map(x=>({...x})))) ;chase.forEach(x=>x.players.slice(2).forEach(q=>{q.x=72;q.y=34;q.vx=-1;q.vy=0;}));
  const verdict=a=>adjudicate({frames:a});
  return {separated:verdict(separated),markCover:verdict(cover),collapse:verdict(collapse),ballChase:verdict(chase)};
}
function selftest(){const c=syntheticControls();if(c.separated.watch||c.markCover.watch||!c.collapse.watch||!c.ballChase.watch)throw Error('V42_WATCH_ADJUDICATION_SYNTHETIC_CONTROL_FAILED');return c;}
if(require.main===module){const r=selftest();console.log(JSON.stringify({module:'V42_ORACLE_WATCH_ADJUDICATION',verdict:'PASS',controls:Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v.watch?'WATCH':'NOT_WATCH']))},null,2));}
module.exports={frameEvidence,adjudicate,syntheticControls,selftest};
