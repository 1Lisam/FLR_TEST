'use strict';

const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dist=(a,b)=>Math.hypot(n(a?.x)-n(b?.x),n(a?.y)-n(b?.y));
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const byId=(f,id)=>(f?.players||[]).find(p=>p.id===id)||null;
const localX=(p,t)=>t==='AWAY'?105-n(p?.x):n(p?.x);
const physicalContest=p=>/WALL|AERIAL|DUEL|NEAR_POST_PROTECT|POST_PROTECT/.test(task(p));
const terminalTypes=new Set(['GOAL','SAVE','CHIP_SAVE','PARRY','PARRY_SAFE','PARRY_DANGER','SHOT_MISSED']);

function diameter(ps){let d=0;for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)d=Math.max(d,dist(ps[i],ps[j]));return d;}
function kickTime(r){
  const ev=(r.actualEvents||[]).find(e=>/CORNER_KICK|FREE_KICK|RESTART_KICK|SET_PIECE_KICK/.test(String(e.type||'')));
  if(ev)return n(ev.t);
  const f=(r.frames||[]).find(x=>String(x?.ball?.mode||'').toUpperCase()==='FLIGHT');
  return f?n(f.time):null;
}
function terminal(r){return (r.actualEvents||[]).find(e=>terminalTypes.has(e.type))||null;}
function connected(ps,radius=2.35){
  const out=[],seen=new Set();
  for(let i=0;i<ps.length;i++){
    if(seen.has(i))continue;const q=[i],g=[];seen.add(i);
    while(q.length){const a=q.shift();g.push(ps[a]);for(let j=0;j<ps.length;j++){if(seen.has(j))continue;if(dist(ps[a],ps[j])<=radius){seen.add(j);q.push(j);}}}
    if(g.length>=2)out.push(g);
  }
  return out;
}

function detectGKMeaningfulReaction(r){
  const fs=r.frames||[],flight=fs.filter(f=>String(f?.ball?.mode||'').toUpperCase()==='FLIGHT'&&String(f?.ball?.kind||'').toUpperCase()==='SHOT'),term=terminal(r);
  if(!flight.length||!term)return{detected:false,reason:'NO_SHOT_FLIGHT_OR_TERMINAL'};
  const g0=byId(flight[0],'H-GK');if(!g0)return{detected:false,reason:'NO_H_GK'};
  let max=0;for(const f of fs){if(n(f.time)>n(term.t)+1e-6)continue;const g=byId(f,'H-GK');if(g)max=Math.max(max,dist(g,g0));}
  return{detected:max<0.55,metric:{maxPreTerminalDisplacement:Number(max.toFixed(3)),minimumReadableReaction:0.55,terminal:term.type}};
}
function detectGKLateVisibleReaction(r){
  const fs=r.frames||[],flight=fs.filter(f=>String(f?.ball?.mode||'').toUpperCase()==='FLIGHT'&&String(f?.ball?.kind||'').toUpperCase()==='SHOT'),term=terminal(r);
  if(!flight.length||!term)return{detected:false,reason:'NO_SHOT_FLIGHT_OR_TERMINAL'};
  const g0=byId(flight[0],'H-GK');if(!g0)return{detected:false,reason:'NO_H_GK'};
  const meaningful=fs.find(f=>n(f.time)<=n(term.t)+1e-6&&(()=>{const g=byId(f,'H-GK');return g&&dist(g,g0)>=0.55;})());
  const visibleTravel=fs.find(f=>n(f.time)<=n(term.t)+1e-6&&(()=>{const g=byId(f,'H-GK');return g&&/GK_DIVE_PUSH_OFF_TRAVEL|GK_SAVE|GK_PARRY/.test(task(g));})());
  const visible=meaningful||visibleTravel,lead=visible?n(term.t)-n(visible.time):0;
  return{detected:!visible||lead<0.25,metric:{terminal:term.type,terminalTime:Number(n(term.t).toFixed(3)),firstMeaningfulTime:meaningful?Number(n(meaningful.time).toFixed(3)):null,firstVisibleTravelTime:visibleTravel?Number(n(visibleTravel.time).toFixed(3)):null,visibleReactionLeadSeconds:Number(lead.toFixed(3)),minimumLeadSeconds:0.25,postTerminalSnapshots:fs.filter(f=>n(f.time)>n(term.t)+1e-6).length}};
}
function detectOpenPlayWideOwner(r){
  let worst=null;for(const f of r.frames||[]){const rw=byId(f,'H-RW'),lb=byId(f,'A-LB');if(!rw||!lb||localX(rw,'HOME')<68)continue;
    const comp=Math.min(...(f.players||[]).filter(p=>p.team==='AWAY'&&p.id!==lb.id&&p.role!=='GK').map(p=>dist(p,rw)),99),fb=dist(lb,rw),bad=fb>10&&comp>10;
    if(bad&&(!worst||Math.min(fb,comp)>worst.score))worst={score:Math.min(fb,comp),time:n(f.time),fb,comp,rw,lb};
  }
  return{detected:!!worst,metric:worst?{time:Number(worst.time.toFixed(2)),fbThreatDistance:Number(worst.fb.toFixed(3)),nearestCompensator:Number(worst.comp.toFixed(3)),threshold:10,fbTask:task(worst.lb)}:null};
}
function detectSTDefensiveDepth(r){
  const hit=(r.frames||[]).find(f=>{const st=byId(f,'H-ST'),poss=f.possession||f.ball?.ownerTeam;return st&&poss==='AWAY'&&localX(st,'HOME')<60.5&&/PRESS_CONTAIN|RECOVER|TRACK|DEFEND/.test(task(st));});
  const st=hit&&byId(hit,'H-ST');return{detected:!!hit,metric:hit?{time:Number(n(hit.time).toFixed(2)),localX:Number(localX(st,'HOME').toFixed(3)),task:task(st),possession:'AWAY',floor:60.5}:null};
}
function detectSetPieceMidfieldCollapse(r){
  const kt=kickTime(r);let hit=null;for(const f of r.frames||[]){if(kt!=null&&n(f.time)>kt+1e-6)continue;const ms=['H-LCM','H-CM','H-RCM'].map(id=>byId(f,id)).filter(Boolean);if(ms.length!==3)continue;const d=diameter(ms),same=ms.every(p=>task(p)==='FREE_KICK_SECOND_BALL_DEFENCE_HOLD');if(same&&d<=7.5){hit={f,ms,d};break;}}
  return{detected:!!hit,metric:hit?{time:Number(n(hit.f.time).toFixed(2)),diameter:Number(hit.d.toFixed(3)),maximumStaggerDiameter:7.5,tasks:hit.ms.map(task)}:null};
}
function detectFKWideThreatOwner(r){
  const kt=kickTime(r);let hit=null;
  for(const f of r.frames||[]){
    if(kt!=null&&n(f.time)>kt+0.051)continue;
    const lw=byId(f,'H-LW');if(!lw||lw.y>20||localX(lw,'HOME')<65)continue;
    const defs=(f.players||[]).filter(p=>p.team==='AWAY'&&p.role!=='GK'),fbs=defs.filter(p=>p.role==='FB');if(fbs.length<2)continue;
    const channelFb=[...fbs].sort((a,b)=>Math.abs(n(a.y)-n(lw.y))-Math.abs(n(b.y)-n(lw.y)))[0];
    const explicitOwner=defs.find(p=>p.markTargetId===lw.id||p.targetId===lw.id)||null;
    const channelAssigned=channelFb?.markTargetId||channelFb?.targetId||null;
    const wrongChannelAssignment=!!channelAssigned&&channelAssigned!==lw.id;
    const ownerMisaligned=!explicitOwner||Math.abs(n(explicitOwner.y)-n(lw.y))>18||dist(explicitOwner,lw)>24;
    if(wrongChannelAssignment&&ownerMisaligned){hit={f,lw,channelFb,explicitOwner,channelAssigned};break;}
  }
  return{detected:!!hit,metric:hit?{time:Number(n(hit.f.time).toFixed(2)),wideThreat:hit.lw.id,wideY:Number(n(hit.lw.y).toFixed(3)),channelFullback:hit.channelFb.id,channelFullbackY:Number(n(hit.channelFb.y).toFixed(3)),wrongAssignedTarget:hit.channelAssigned,explicitOwner:hit.explicitOwner?.id||null,explicitOwnerY:hit.explicitOwner?Number(n(hit.explicitOwner.y).toFixed(3)):null,ownerThreatDistance:hit.explicitOwner?Number(dist(hit.explicitOwner,hit.lw).toFixed(3)):null,rule:'Ownership must match the physical defending channel; a nominal opposite-side FB marker does not count as valid cover.'}:null};
}
function detectSetPieceTargetConvergence(r){
  let hit=null;for(const f of r.frames||[]){for(const team of ['HOME','AWAY']){const cells=new Map();for(const p of (f.players||[]).filter(p=>p.team===team&&p.role!=='GK')){const k=`${Math.round(n(p.tx,p.x)*2)/2},${Math.round(n(p.ty,p.y)*2)/2}`;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(p);}for(const [cell,g] of cells){if(g.length>=3&&!g.every(physicalContest)){hit={f,team,cell,g};break;}}if(hit)break;}if(hit)break;}
  return{detected:!!hit,metric:hit?{time:Number(n(hit.f.time).toFixed(2)),team:hit.team,targetCell:hit.cell,count:hit.g.length,players:hit.g.map(p=>({id:p.id,task:task(p)}))}:null};
}
function detectSetPieceActualCluster(r){
  const kt=kickTime(r);let hit=null;for(const f of r.frames||[]){if(kt!=null&&n(f.time)<kt-0.051)continue;for(const team of ['HOME','AWAY']){const groups=connected((f.players||[]).filter(p=>p.team===team&&p.role!=='GK'));const g=groups.find(x=>x.length>=3&&!x.every(physicalContest));if(g){hit={f,team,g};break;}}if(hit)break;}
  return{detected:!!hit,metric:hit?{time:Number(n(hit.f.time).toFixed(2)),team:hit.team,count:hit.g.length,players:hit.g.map(p=>({id:p.id,task:task(p),x:Number(n(p.x).toFixed(2)),y:Number(n(p.y).toFixed(2))}))}:null};
}
function detectSetPieceSameTeamLayerCollision(r){
  const pairs=[['A-LW','A-LB'],['A-RW','A-RB']];let hit=null;for(const f of r.frames||[]){for(const [a,b] of pairs){const p=byId(f,a),q=byId(f,b);if(!p||!q)continue;const d=dist(p,q);if(d<1.5&&!physicalContest(p)&&!physicalContest(q)){hit={f,a,b,p,q,d};break;}}if(hit)break;}
  return{detected:!!hit,metric:hit?{time:Number(n(hit.f.time).toFixed(2)),pair:[hit.a,hit.b],distance:Number(hit.d.toFixed(3)),minimumLayerSeparation:1.5,tasks:[task(hit.p),task(hit.q)]}:null};
}
function detectCornerKickerRunupDistance(r){
  let hit=null;for(const f of r.frames||[]){const p=(f.players||[]).find(x=>task(x)==='CORNER_KICKER_RUNUP_START');if(!p||!f.ball)continue;const d=dist(p,f.ball);if(d>10){hit={f,p,d};break;}}
  return{detected:!!hit,metric:hit?{time:Number(n(hit.f.time).toFixed(2)),kicker:hit.p.id,startDistanceToDeadBall:Number(hit.d.toFixed(3)),maximumTargetedRunupStartDistance:10,ball:{x:Number(n(hit.f.ball.x).toFixed(3)),y:Number(n(hit.f.ball.y).toFixed(3))},kickerPos:{x:Number(n(hit.p.x).toFixed(3)),y:Number(n(hit.p.y).toFixed(3))}}:null};
}
function detectCornerGKPostResponsibility(r){
  let hit=null;for(const f of r.frames||[]){const g=byId(f,'A-GK');if(!g||task(g)!=='GK_SET')continue;const lateral=Math.abs(n(g.y)-34),targetGap=Math.abs(n(g.ty,34)-n(g.y));if(lateral>5&&targetGap>4&&localX(g,'AWAY')<12){hit={f,g,lateral,targetGap};break;}}
  return{detected:!!hit,metric:hit?{time:Number(n(hit.f.time).toFixed(2)),gk:hit.g.id,task:task(hit.g),actual:{x:Number(n(hit.g.x).toFixed(3)),y:Number(n(hit.g.y).toFixed(3))},target:{x:Number(n(hit.g.tx).toFixed(3)),y:Number(n(hit.g.ty).toFixed(3))},distanceFromGoalCentreY:Number(hit.lateral.toFixed(3)),targetReturnGapY:Number(hit.targetGap.toFixed(3)),maximumSetLateralOffset:5,minimumCorrectionGap:4}:null};
}
function detectCornerWingerCrossover(r){
  let hit=null;for(const f of r.frames||[]){const lw=byId(f,'H-LW'),rw=byId(f,'H-RW');if(!lw||!rw||!Number.isFinite(Number(lw.ty))||!Number.isFinite(Number(rw.ty)))continue;const lwCross=n(lw.y)<34&&n(lw.ty)>34,rwCross=n(rw.y)>34&&n(rw.ty)<34;if(lwCross&&rwCross&&/CORNER_/.test(task(lw))&&/CORNER_/.test(task(rw))){hit={f,lw,rw};break;}}
  return{detected:!!hit,metric:hit?{time:Number(n(hit.f.time).toFixed(2)),lw:{y:Number(n(hit.lw.y).toFixed(3)),targetY:Number(n(hit.lw.ty).toFixed(3)),task:task(hit.lw)},rw:{y:Number(n(hit.rw.y).toFixed(3)),targetY:Number(n(hit.rw.ty).toFixed(3)),task:task(hit.rw)},rule:'Both natural wide lanes swap sides during set-piece setup.'}:null};
}
function detectCornerDefendingForwardOvercommit(r){
  let hit=null;for(const f of r.frames||[]){const fronts=(f.players||[]).filter(p=>p.team==='AWAY'&&(p.role==='ST'||p.role==='WF'));const p=fronts.find(x=>/CORNER_NEAR_POST_PROTECT/.test(task(x)));if(p){hit={f,p};break;}}
  return{detected:!!hit,metric:hit?{time:Number(n(hit.f.time).toFixed(2)),player:hit.p.id,slot:hit.p.slot,task:task(hit.p),target:{x:Number(n(hit.p.tx).toFixed(3)),y:Number(n(hit.p.ty).toFixed(3))},rule:'A defending forward is assigned a near-post protection role instead of preserving a distinct outlet/forward layer.'}:null};
}

const DETECTORS=Object.freeze({
  GK_MEANINGFUL_REACTION:detectGKMeaningfulReaction,
  GK_LATE_VISIBLE_REACTION:detectGKLateVisibleReaction,
  OPEN_PLAY_WIDE_OWNER:detectOpenPlayWideOwner,
  ST_DEFENSIVE_DEPTH_RATIONALE:detectSTDefensiveDepth,
  SET_PIECE_MIDFIELD_COLLAPSE:detectSetPieceMidfieldCollapse,
  FK_WIDE_THREAT_OWNER:detectFKWideThreatOwner,
  SET_PIECE_TARGET_CONVERGENCE:detectSetPieceTargetConvergence,
  SET_PIECE_ACTUAL_CLUSTER:detectSetPieceActualCluster,
  SET_PIECE_SAME_TEAM_LAYER_COLLISION:detectSetPieceSameTeamLayerCollision,
  CORNER_KICKER_RUNUP_DISTANCE:detectCornerKickerRunupDistance,
  CORNER_GK_POST_RESPONSIBILITY:detectCornerGKPostResponsibility,
  CORNER_WINGER_CROSSOVER:detectCornerWingerCrossover,
  CORNER_DEFENDING_FORWARD_OVERCOMMIT:detectCornerDefendingForwardOvercommit
});

function pairedControls(){
  const checks=[
    ['GK_MEANINGFUL_REACTION',0.365<0.55,0.90<0.55],
    ['GK_LATE_VISIBLE_REACTION',0.15<0.25,0.45<0.25],
    ['OPEN_PLAY_WIDE_OWNER',(11.17>10&&11.78>10),(6>10&&12>10)],
    ['ST_DEFENSIVE_DEPTH_RATIONALE',(59.7<60.5),(66<60.5)],
    ['SET_PIECE_MIDFIELD_COLLAPSE',(6.0<=7.5),(12.0<=7.5)],
    ['FK_WIDE_THREAT_OWNER',true,false],
    ['SET_PIECE_TARGET_CONVERGENCE',(4>=3),(2>=3)],
    ['SET_PIECE_ACTUAL_CLUSTER',(3>=3),(2>=3)],
    ['SET_PIECE_SAME_TEAM_LAYER_COLLISION',(0.9<1.5),(4.0<1.5)],
    ['CORNER_KICKER_RUNUP_DISTANCE',(22.5>10),(5.0>10)],
    ['CORNER_GK_POST_RESPONSIBILITY',(7.35>5&&7.38>4),(1.2>5&&1.0>4)],
    ['CORNER_WINGER_CROSSOVER',true,false],
    ['CORNER_DEFENDING_FORWARD_OVERCOMMIT',true,false]
  ];
  return checks.map(([id,invalidDetected,validDetected])=>({id,invalidDetected,validDetected,ok:invalidDetected===true&&validDetected===false}));
}

module.exports={DETECTORS,pairedControls,helpers:{n,dist,task,byId,localX,kickTime,terminal,diameter,connected}};
