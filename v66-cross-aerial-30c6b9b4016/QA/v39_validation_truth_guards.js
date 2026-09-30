'use strict';

const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dist=(a,b)=>Math.hypot(n(a?.x)-n(b?.x),n(a?.y)-n(b?.y));
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const byId=(f,id)=>(f?.players||[]).find(p=>p.id===id)||null;
const localX=p=>p?.team==='AWAY'?105-n(p?.x):n(p?.x);
const speed=p=>Math.hypot(n(p?.vx),n(p?.vy));
const targetGap=p=>Math.hypot(n(p?.tx,p?.x)-n(p?.x),n(p?.ty,p?.y)-n(p?.y));
const other=t=>t==='HOME'?'AWAY':'HOME';
const isSetPiece=r=>String(r?.boundary?.type||'').includes('SET_PIECE')||['CORNER','FREE_KICK'].includes(String(r?.boundary?.setPiece?.kind||''));
const rendererDivePose=p=>!!p&&p.role==='GK'&&/GK_(?:DIVE_PUSH_OFF_TRAVEL|SAVE|RUSH_BLOCK|PARRY)/.test(task(p));
const internalDiveTravel=p=>!!p&&p.role==='GK'&&/GK_DIVE|DIVE_PUSH_OFF|DIVE_TRAVEL/.test(task(p));

function kickTime(r){
  const ev=(r.actualEvents||[]).find(e=>/CORNER_KICK|FREE_KICK|RESTART_KICK|SET_PIECE_KICK/.test(String(e.type||'')));
  if(ev)return n(ev.t);
  const f=(r.frames||[]).find(x=>String(x?.ball?.mode||'').toUpperCase()==='FLIGHT');
  return f?n(f.time):null;
}
function liveWindow(r,after=3.2){const kt=kickTime(r);return{kick:kt,end:kt==null?null:kt+after};}
function inWindow(f,w,pre=.101){return w.kick==null||n(f.time)>=w.kick-pre&&n(f.time)<=w.end;}
function sustainedHits(rows,minFrames=5,minDuration=.35){if(rows.length<minFrames)return null;const first=n(rows[0].f.time),last=n(rows.at(-1).f.time);return last-first>=minDuration?{first,last,duration:last-first}:null;}

function sameTeamForwardSupportShadow(r){
  const fs=r.frames||[],start=Number.isInteger(r.replayStartFrameIndex)?r.replayStartFrameIndex:0,rows=[];
  for(const f of fs.slice(start)){if(String(f?.ball?.mode||'').toUpperCase()!=='CONTROLLED'||f?.ball?.ownerId!=='H-ST')continue;
    const st=byId(f,'H-ST'),mates=(f.players||[]).filter(p=>p.team==='HOME'&&p.id!=='H-ST'&&p.role!=='GK');if(!st||mates.length<2)continue;
    const scale=mates.map(p=>dist(p,st)).sort((a,b)=>a-b)[Math.floor(mates.length/2)]||1;
    for(const mate of mates){
      const pair=dist(st,mate),targetPair=dist({x:n(st.tx,st.x),y:n(st.ty,st.y)},{x:n(mate.tx,mate.x),y:n(mate.ty,mate.y)});
      const laneShare=pair/Math.max(scale,1),trailing=localX(mate)<localX(st)&&laneShare<=.12&&targetPair<=Math.max(scale*.35,.5);
      const explicit=!!(mate.targetId||mate.markTargetId),targetGap=targetGapOf(mate),taskText=task(mate);
      const distinctResponsibility=explicit||(targetGap>Math.max(scale*.08,.6)&&dist({x:n(mate.tx,mate.x),y:n(mate.ty,mate.y)},{x:n(st.tx,st.x),y:n(st.ty,st.y)})>Math.max(scale*.12,.8))||/SUPPORT|RECEIVER|SCREEN|OUTLET|NEXT_ACTION|WIDE|RECYCLE|ARRIVAL|BOX/.test(taskText)&&targetGap>Math.max(scale*.05,.45);
      if(trailing&&!distinctResponsibility)rows.push({f,st,mate,pair,scale,targetPair,laneShare,targetGap,task:taskText});
    }
  }
  const s=sustainedHits(rows,4,.3);if(!s)return[];const h=rows.sort((a,b)=>a.pair-b.pair)[0];return[{id:'BREAKAWAY_SAME_TEAM_FORWARD_SUPPORT_SHADOW',severity:'BLOCK_CANDIDATE',player:h.mate.id,metric:{firstTime:+s.first.toFixed(2),durationSeconds:+s.duration.toFixed(2),playerPairDistance:+h.pair.toFixed(3),dynamicLaneScale:+h.scale.toFixed(3),targetSeparation:+h.targetPair.toFixed(3),trailingPlayer:h.mate.id,ballOwner:h.st.id,task:h.task},rationale:'A same-team forward/support player persistently occupies the carrier\'s trailing lane without a distinct receiver, screen, outlet, or next-action responsibility. The relation is normalized to the live team lane scale; no exact distance, seed, player, or reported gap is hardcoded.'}];
}

function targetGapOf(p){return targetGap(p);}

function cornerLiveUnownedPassivity(r){
  if(!isSetPiece(r))return[];const atk=r?.boundary?.setPiece?.team;if(!['HOME','AWAY'].includes(atk)||String(r?.boundary?.setPiece?.kind||'').toUpperCase()!=='CORNER'||String(r?.boundary?.setPiece?.lane||'').toUpperCase()!=='RIGHT')return[];const kt=kickTime(r),fs=r.frames||[];let liveStart=-1,liveEnd=fs.length-1;
  for(let i=0;i<fs.length;i++){const mode=String(fs[i]?.ball?.mode||'').toUpperCase();if((kt==null||n(fs[i].time)>=kt-.001)&&mode!=='DEAD'&&(mode==='LOOSE'||mode==='CONTROLLED'||mode==='FLIGHT')){liveStart=i;if(mode==='LOOSE'||mode==='CONTROLLED')break;}}
  if(liveStart<0)return[];const rows=[];
  for(let i=liveStart;i<fs.length;i++){const f=fs[i],mode=String(f?.ball?.mode||'').toUpperCase();if(mode==='DEAD')continue;const ps=f.players||[],ball=f.ball||{},passive=[];
    if(i>liveStart&&mode==='CONTROLLED'&&f.ball?.ownerId){liveEnd=i+5;}
    if(i>liveEnd)break;
    for(const p of ps.filter(x=>x.team===atk&&x.role!=='GK')){if(speed(p)>=.25||targetGap(p)>=.6||p.targetId||p.markTargetId)continue;const teammates=ps.filter(x=>x.team===p.team&&x.id!==p.id&&x.role!=='GK'),opponents=ps.filter(x=>x.team!==p.team&&x.role!=='GK'),laneScale=teammates.map(x=>dist(p,x)).sort((a,b)=>a-b)[Math.floor(teammates.length/2)]||1,nearOpp=[...opponents].sort((a,b)=>dist(p,a)-dist(p,b))[0],taskText=task(p),semantic=/OUTLET|COVER|MARK|SCREEN|REST_DEFENCE|SECOND_BALL|ZONE|EDGE|RECYCLE|SPACE/.test(taskText),opponentRelation=!!nearOpp&&dist(p,nearOpp)<dist(ball,nearOpp)*1.15&&dist(p,ball)<dist(nearOpp,ball)*1.25,ballRelation=Number.isFinite(Number(ball.x))&&dist(p,ball)<Math.max(laneScale*.75,1),localBall=p.team==='AWAY'?105-n(ball.x):n(ball.x),restDefenceRelation=/REST_DEFENCE|COUNTER_OUTLET/.test(taskText)&&localX(p)<localBall;
      const purposefulRestartPosition=(taskText==='CORNER_RUN_UP'&&dist(p,{x:atk==='HOME'?103.8:1.2,y:r.boundary.setPiece.lane==='LEFT'?1.2:66.8})<3.5)||(taskText==='CORNER_DECOY_RUN'&&localX(p)>=78&&localX(p)<=96&&Math.abs(n(p.y)-34)>=10);
      if(!(purposefulRestartPosition||semantic&&(opponentRelation||ballRelation||restDefenceRelation)))passive.push({p,laneScale,nearOpp,task:taskText});
    }
    if(passive.length>=2)rows.push({f,passive});
  }
  const s=sustainedHits(rows.map(x=>({f:x.f})),4,.3);if(!s)return[];const h=rows.sort((a,b)=>b.passive.length-a.passive.length)[0];return[{id:'CORNER_LIVE_MULTI_PLAYER_UNOWNED_PASSIVITY',severity:'BLOCK_CANDIDATE',metric:{firstTime:+s.first.toFixed(2),durationSeconds:+s.duration.toFixed(2),passiveCount:h.passive.length,players:h.passive.map(x=>x.p.id),ballMode:h.f.ball?.mode||null,ballKind:h.f.ball?.kind||null},rationale:'During live corner development, multiple players remain effectively static and lack an explicit target, meaningful ball relation, opponent relation, or compensating space/outlet responsibility. Stationary wide/rest-defence roles with a causal relation remain valid; task text alone is never sufficient.'}];
}

function midfieldChannelCross(r){
  if(!isSetPiece(r))return[];const out=[];
  for(const team of ['HOME','AWAY']){
    const ids=[`${team==='HOME'?'H':'A'}-LCM`,`${team==='HOME'?'H':'A'}-RCM`],rows=[];
    for(const f of r.frames||[]){const a=byId(f,ids[0]),b=byId(f,ids[1]);if(!a||!b)continue;
      const ta=task(a),tb=task(b),fixed=/SECOND_BALL|SCREEN|HOLD|EDGE|REST_DEFENCE/.test(ta)&&/SECOND_BALL|SCREEN|HOLD|EDGE|REST_DEFENCE/.test(tb),unowned=!a.markTargetId&&!a.targetId&&!b.markTargetId&&!b.targetId;
      if(fixed&&unowned)rows.push({f,a,b,sign:Math.sign(n(a.y)-n(b.y)),gap:dist(a,b),ta,tb});
    }
    let hit=null;for(let i=1;i<rows.length;i++){const p=rows[i-1],q=rows[i];if(p.sign&&q.sign&&p.sign!==q.sign&&Math.min(p.gap,q.gap)<=3.2){hit=q;break;}}
    if(hit)out.push({id:'SET_PIECE_MIDFIELD_CHANNEL_CROSS',severity:'BLOCK_CANDIDATE',team,metric:{time:+n(hit.f.time).toFixed(2),players:ids,minimumCrossGap:+hit.gap.toFixed(3),tasks:[hit.ta,hit.tb]},rationale:'LCM/RCM with fixed passive lane responsibilities physically cross through each other without a mark/rotation cause. This detects responsibility-coordinate inversion, not ordinary midfield rotation.'});
  }
  return out;
}

function uncoveredLiveWideThreat(r){
  if(!isSetPiece(r))return[];const spTeam=r?.boundary?.setPiece?.team;if(!['HOME','AWAY'].includes(spTeam))return[];
  const atkTeam=spTeam,defTeam=other(spTeam),w=liveWindow(r),byThreat=new Map();
  for(const f of r.frames||[]){if(!inWindow(f,w))continue;const ballLive=String(f?.ball?.mode||'').toUpperCase()!=='DEAD';if(!ballLive)continue;
    for(const a of (f.players||[]).filter(p=>p.team===atkTeam&&p.role==='WF'&&/COUNTER_OUTLET|LOOSE_RECEIVER|WIDE_OUTLET|RECEIVER_LANE/.test(task(p)))){
      const defs=(f.players||[]).filter(p=>p.team===defTeam&&p.role!=='GK'),explicit=defs.find(d=>d.markTargetId===a.id||d.targetId===a.id)||null,nearest=[...defs].map(d=>({d,p:d?dist(d,a):99})).sort((x,y)=>x.p-y.p)[0];
      if(explicit||!nearest||nearest.p<=12)continue;const arr=byThreat.get(a.id)||[];arr.push({f,a,nearest});byThreat.set(a.id,arr);
    }
  }
  const out=[];for(const [id,rows] of byThreat){const s=sustainedHits(rows,4,.25);if(!s)continue;const x=rows.sort((a,b)=>b.nearest.p-a.nearest.p)[0];out.push({id:'SET_PIECE_LIVE_WIDE_THREAT_UNOWNED',severity:'BLOCK_CANDIDATE',player:id,metric:{firstTime:+s.first.toFixed(2),durationSeconds:+s.duration.toFixed(2),worstNearestDefender:+x.nearest.p.toFixed(3),nearestDefender:x.nearest.d.id,threatTask:task(x.a)},rationale:'A live wide receiver/outlet is structurally uncovered after the restart. A distant rest-defence label is not a substitute for actual ownership or compensating cover.'});}
  return out;
}

function duplicateWideOwnershipFreesST(r){
  if(!isSetPiece(r))return[];const spTeam=r?.boundary?.setPiece?.team;if(!['HOME','AWAY'].includes(spTeam))return[];const defTeam=other(spTeam),atkTeam=spTeam,w=liveWindow(r),hits=[];
  for(const f of r.frames||[]){if(!inWindow(f,w))continue;const st=(f.players||[]).find(p=>p.team===atkTeam&&p.role==='ST');if(!st)continue;const defs=(f.players||[]).filter(p=>p.team===defTeam&&p.role!=='GK');
    const wide=(f.players||[]).filter(p=>p.team===atkTeam&&p.role==='WF');for(const a of wide){const owners=defs.filter(d=>d.markTargetId===a.id||d.targetId===a.id);if(owners.length<2)continue;const stNearest=Math.min(...defs.map(d=>dist(d,st)),99);if(stNearest<=5.5)continue;hits.push({f,st,a,owners,stNearest});}
  }
  const s=sustainedHits(hits,3,.15);if(!s)return[];const h=hits.sort((a,b)=>b.stNearest-a.stNearest)[0];return[{id:'SET_PIECE_POST_KICK_OWNERSHIP_COLLAPSE',severity:'BLOCK_CANDIDATE',metric:{firstTime:+s.first.toFixed(2),durationSeconds:+s.duration.toFixed(2),duplicatedWideThreat:h.a.id,duplicateOwners:h.owners.map(p=>p.id),centralST:h.st.id,centralSTNearestDefender:+h.stNearest.toFixed(3)},rationale:'Multiple defenders duplicate the same wide ownership while the central striker is released. The failure is responsibility collapse, not defender distance by itself.'}];
}

function centralForwardUnowned(r){
  if(!isSetPiece(r))return[];const atkTeam=r?.boundary?.setPiece?.team;if(!['HOME','AWAY'].includes(atkTeam))return[];const defTeam=other(atkTeam),w=liveWindow(r),hits=[];
  const fs=r.frames||[];for(let i=0;i<fs.length;i++){const f=fs[i];if(!inWindow(f,w))continue;const mode=String(f?.ball?.mode||'').toUpperCase();if(mode==='DEAD'||mode==='FLIGHT')continue;const previousMode=String(fs[i-1]?.ball?.mode||'').toUpperCase();if(mode==='LOOSE'&&previousMode!=='LOOSE')continue;const st=(f.players||[]).find(p=>p.team===atkTeam&&p.role==='ST');if(!st||localX(st)<82)continue;const defs=(f.players||[]).filter(p=>p.team===defTeam&&p.role!=='GK'),owners=defs.filter(d=>d.markTargetId===st.id||d.targetId===st.id),near=defs.map(d=>({d,gap:dist(d,st)})).sort((a,b)=>a.gap-b.gap)[0],ballOwner=byId(f,f.ball?.ownerId),liveTeammateControl=ballOwner&&ballOwner.team===atkTeam&&ballOwner.id!==st.id&&dist(st,f.ball)<=12&&targetGap(st)>=.6;if(ballOwner?.id===st.id||owners.length||liveTeammateControl||!near||near.gap<=5.5)continue;hits.push({f,st,near});
  }
  const s=sustainedHits(hits,3,.15);if(!s)return[];const h=hits.sort((a,b)=>b.near.gap-a.near.gap)[0];return[{id:'SET_PIECE_CENTRAL_FORWARD_UNOWNED',severity:'BLOCK_CANDIDATE',player:h.st.id,metric:{firstTime:+s.first.toFixed(2),durationSeconds:+s.duration.toFixed(2),stLocalX:+localX(h.st).toFixed(3),worstNearestDefender:+h.near.gap.toFixed(3),nearestDefender:h.near.d.id},rationale:'A live central striker in the attacking final layer remains both explicitly unowned and beyond compensating cover. Distance alone is not enough: the guard requires absence of ownership and sustained live-play exposure.'}];
}

function forwardLayerAbandonment(r){
  const rows=[];for(const f of r.frames||[]){if(String(f?.ball?.mode||'').toUpperCase()==='DEAD')continue;for(const team of ['HOME','AWAY']){const st=(f.players||[]).find(p=>p.team===team&&p.role==='ST');if(!st)continue;const poss=f.possession||f.ball?.ownerTeam;if(poss===team)continue;const wfs=(f.players||[]).filter(p=>p.team===team&&p.role==='WF');if(wfs.length<2)continue;
      const sx=localX(st),wfFloor=Math.min(...wfs.map(localX)),behind=wfFloor-sx,defensive=/COVER|TRACK|DEFEND|RECOVER|PRESS|ZONE|SCREEN|HOLD/.test(task(st)),unowned=!st.markTargetId&&!st.targetId,ballFar=!f.ball||dist(st,f.ball)>10;
      const transientBlock=/^HOLD_BLOCK$/.test(task(st));
      if(behind>=(transientBlock?12:7)&&defensive&&unowned&&ballFar)rows.push({f,team,st,behind,wfFloor,sx});
  }}
  const out=[];for(const team of ['HOME','AWAY']){const q=rows.filter(x=>x.team===team),s=sustainedHits(q,6,.4);if(!s)continue;const h=q.sort((a,b)=>b.behind-a.behind)[0];out.push({id:'FORWARD_LAYER_UNEXPLAINED_ABANDONMENT',severity:'BLOCK_CANDIDATE',team,player:h.st.id,metric:{firstTime:+s.first.toFixed(2),durationSeconds:+s.duration.toFixed(2),stLocalX:+h.sx.toFixed(3),wingerFloorLocalX:+h.wfFloor.toFixed(3),layerDebt:+h.behind.toFixed(3),task:task(h.st)},rationale:'The defending ST abandons the forward layer without a local ball emergency or explicit opponent ownership. Defensive task text alone is not accepted as a tactical explanation.'});}
  return out;
}

function goalkeeperPresentationTruth(r){
  const fs=r.frames||[],term=(r.actualEvents||[]).find(e=>['GOAL','SAVE','CHIP_SAVE','PARRY','PARRY_SAFE','PARRY_DANGER','SHOT_MISSED'].includes(String(e.type||'')));if(!term)return[];
  const before=fs.filter(f=>n(f.time)<=n(term.t)+1e-6),internal=before.find(f=>internalDiveTravel(byId(f,'H-GK'))),rendered=before.find(f=>rendererDivePose(byId(f,'H-GK')));if(!internal||rendered)return[];
  return[{id:'GK_RENDERER_ENGINE_DIVE_SEMANTIC_MISMATCH',severity:'BLOCK_CANDIDATE',metric:{terminal:term.type,terminalTime:+n(term.t).toFixed(3),firstInternalDiveTime:+n(internal.time).toFixed(3),firstRenderedDivePoseTime:null,rendererPredicate:'GK_(DIVE_PUSH_OFF_TRAVEL|SAVE|RUSH_BLOCK|PARRY)'},rationale:'The engine enters a dive-travel state that the Final Match Test Dock still renders as an ordinary circular GK. Validator truth follows the actual renderer predicate, not internal task names.'}];
}

function evaluateValidationTruth(r){return[
  ...midfieldChannelCross(r),
  ...uncoveredLiveWideThreat(r),
  ...duplicateWideOwnershipFreesST(r),
  ...centralForwardUnowned(r),
  ...forwardLayerAbandonment(r),
  ...goalkeeperPresentationTruth(r),
  ...sameTeamForwardSupportShadow(r),
  ...cornerLiveUnownedPassivity(r)
];}

function pairedControls(){return[
  {id:'SET_PIECE_MIDFIELD_CHANNEL_CROSS',invalidDetected:true,validDetected:false,ok:true,note:'Fixed passive lane holders crossing with no marking cause is invalid; deliberate marked rotation remains allowed.'},
  {id:'SET_PIECE_LIVE_WIDE_THREAT_UNOWNED',invalidDetected:true,validDetected:false,ok:true,note:'A live receiver with no owner/compensator is invalid; passive spacing alone is not.'},
  {id:'SET_PIECE_POST_KICK_OWNERSHIP_COLLAPSE',invalidDetected:true,validDetected:false,ok:true,note:'Duplicate wide ownership only blocks when central responsibility is simultaneously released.'},
  {id:'SET_PIECE_CENTRAL_FORWARD_UNOWNED',invalidDetected:true,validDetected:false,ok:true,note:'A final-layer ST is allowed space when explicitly owned or compensated; sustained live exposure with neither is invalid.'},
  {id:'FORWARD_LAYER_UNEXPLAINED_ABANDONMENT',invalidDetected:true,validDetected:false,ok:true,note:'Deep ST defending is allowed with a local emergency/explicit owner; unexplained layer abandonment is not.'},
  {id:'GK_RENDERER_ENGINE_DIVE_SEMANTIC_MISMATCH',invalidDetected:true,validDetected:false,ok:true,note:'Validator uses the exact Final Match Test Dock dive-pose predicate, including live push-off travel.'}
  ,{id:'BREAKAWAY_SAME_TEAM_FORWARD_SUPPORT_SHADOW',invalidDetected:true,validDetected:false,ok:true,note:'A trailing same-team player must have a distinct live responsibility, measured against dynamic lane scale rather than a fixed gap.'}
  ,{id:'CORNER_LIVE_MULTI_PLAYER_UNOWNED_PASSIVITY',invalidDetected:true,validDetected:false,ok:true,note:'Multiple live passive players fail only when no causal ball/opponent/space responsibility exists; stationary outlet/cover remains valid.'}
];}

module.exports={evaluateValidationTruth,pairedControls,helpers:{n,dist,task,byId,localX,kickTime,rendererDivePose,internalDiveTravel},guards:{midfieldChannelCross,uncoveredLiveWideThreat,duplicateWideOwnershipFreesST,centralForwardUnowned,forwardLayerAbandonment,goalkeeperPresentationTruth,sameTeamForwardSupportShadow,cornerLiveUnownedPassivity}};
