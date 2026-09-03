(function(root){'use strict';
const T=(root&&root.FLRPG_TACTICS)||((typeof require==='function')?require('./tactical_movement.js'):null);if(!T||T.__v39OpenPlayResponsibility)return;
const VERSION='V39-OPEN-PLAY-RESPONSIBILITY-0.3';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const other=t=>t==='HOME'?'AWAY':'HOME';
const local=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const dist=(a,b)=>Math.hypot((a?.x||0)-(b?.x||0),(a?.y||0)-(b?.y||0));
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const player=(m,id)=>m.playersById?.[id]||m.players.find(p=>p.id===id)||null;
function setTarget(p,w,name,sprint=false){if(!p||!w)return;p.tx=clamp(w.x,1,104);p.ty=clamp(w.y,1,67);p.action=name;p.tacticalTask=name;p.sprint=!!sprint;}
function exposeShapeResponsibility(m){
  for(const p of m.players||[]){const t=task(p);
    if(t==='INVERT_REST')p.responsibilityReason='FULLBACK_INVERT_REST_COVERAGE';
    else if(t==='INVERT_SUPPORT')p.responsibilityReason='FULLBACK_INVERT_SUPPORT_HANDOFF';
    else if(t==='REST_BALANCE')p.responsibilityReason='FULLBACK_REST_BALANCE_COVERAGE';
    else if(/FREE_KICK_REST_DEFENCE|FREE_KICK_LINE_ZONE|FREE_KICK_TRACK_RUNNER|PRESS_CONTAIN|^REST_DEFENCE$/.test(t))p.responsibilityReason='FREE_KICK_EXPLICIT_COVERAGE_HANDOFF';
  }
}
function repairCrossChannel(m){
  if(!m?.ball||String(m.ball.mode).toUpperCase()!=='FLIGHT'||String(m.ball.kind).toUpperCase()!=='CROSS'){if(m?._v39CrossChannel&&m.time>=(m._v39CrossChannel.until||0))delete m._v39CrossChannel;return;}
  const atk=m.possession,def=other(atk);if(!atk)return;
  let state=m._v39CrossChannel;
  if(!state||state.team!==def||m.time>=(state.until||0)){
    const wfs=m.players.filter(p=>p.team===atk&&p.role==='WF').map(p=>({p,l:local(def,p.x,p.y),d:dist(p,m.ball)})).filter(x=>x.l.x<42&&Math.abs(x.l.y-34)>14).sort((a,b)=>a.d-b.d);
    const c=wfs[0];if(!c)return;
    const side=c.l.y<34?'LB':'RB',fb=m.players.find(p=>p.team===def&&p.role==='FB'&&p.slot===side);if(!fb)return;
    state=m._v39CrossChannel={team:def,crosserId:c.p.id,fullbackId:fb.id,startedAt:m.time,until:m.time+1.15};
  }
  const c=player(m,state.crosserId),fb=player(m,state.fullbackId);if(!c||!fb)return;
  const cl=local(def,c.x,c.y),fl=local(def,fb.x,fb.y),naturalY=fb.slot==='LB'?9:59;
  const tx=clamp(cl.x-2.6,8,68),ty=clamp(naturalY+(cl.y-naturalY)*0.74,5,63),w=world(def,tx,ty);
  setTarget(fb,w,'CROSS_CHANNEL_OWNER',Math.hypot(fl.x-tx,fl.y-ty)>2.4);fb.markTargetId=c.id;fb.targetId=c.id;
}
function chooseMidfieldHandoff(m,def,owner,st,maxDistance=8.5){
  const stD=dist(st,owner),candidates=m.players.filter(p=>p.team===def&&p.role==='CM').map(p=>({p,d:dist(p,owner)})).sort((a,b)=>a.d-b.d),best=candidates[0];
  if(!best||best.d>maxDistance||best.d>stD+1.5)return null;return best.p;
}
function applyHandoff(m,def,owner,st,q,state){
  const ol=local(def,owner.x,owner.y),ql=local(def,q.x,q.y),wfs=m.players.filter(p=>p.team===def&&p.role==='WF'),wfX=wfs.length?wfs.reduce((s,p)=>s+local(def,p.x,p.y).x,0)/wfs.length:local(def,st.x,st.y).x+2;
  const side=Math.abs(ql.y-ol.y)>.2?Math.sign(ql.y-ol.y):(q.slot==='LCM'?-1:1),pw=world(def,clamp(ol.x-1.85,4,92),clamp(ol.y+side*.55,4,64));
  setTarget(q,pw,state?.pressMode?'PRESS_CONTAIN':'FORWARD_DEFENSIVE_HANDOFF',dist(q,owner)>3.0);q.markTargetId=owner.id;q.targetId=owner.id;
  const sl=local(def,st.x,st.y),frontX=Math.max(wfX+1.0,sl.x+1.2),sw=world(def,clamp(frontX,20,86),clamp(34+(ol.y-34)*.10,24,44));
  setTarget(st,sw,state?.pressMode?'FORWARD_PRESS_HANDOFF':'FORWARD_LAYER_RECOVER',Math.hypot(st.x-sw.x,st.y-sw.y)>2.5);st.markTargetId=owner.id;st.targetId=owner.id;st.responsibilityReason='FORWARD_LAYER_HANDOFF_OWNER';st.pressCommitUntil=0;
  if(!m._defenceRoleLocks)m._defenceRoleLocks={};const lock=m._defenceRoleLocks[def]||(m._defenceRoleLocks[def]={pressId:null,coverId:null,until:0});lock.pressId=q.id;if(lock.coverId===q.id)lock.coverId=null;lock.until=Math.max(lock.until||0,state.until);
}
function repairForwardPressHandoff(m){
  if(!m?.ball||String(m.ball.mode).toUpperCase()!=='CONTROLLED'||m.restart)return;
  const atk=m.possession,def=other(atk),owner=player(m,m.ball.ownerId);if(!atk||!owner||owner.team!==atk)return;
  const st=m.players.find(p=>p.team===def&&p.role==='ST');if(!st)return;
  let state=m._v39ForwardPressHandoff;
  if(state&&state.team===def&&m.time<(state.until||0)){
    const q=player(m,state.pressId);if(q&&q.team===def&&q.role!=='ST')return applyHandoff(m,def,owner,st,q,state);
  }
  if(!['PRESS_CONTAIN','ENGAGE'].includes(task(st)))return;
  const sl=local(def,st.x,st.y),wfs=m.players.filter(p=>p.team===def&&p.role==='WF');if(wfs.length<2)return;
  const wfX=wfs.reduce((s,p)=>s+local(def,p.x,p.y).x,0)/wfs.length;if(sl.x>wfX-1.5)return;
  const best=chooseMidfieldHandoff(m,def,owner,st,6.0);if(!best)return;
  state=m._v39ForwardPressHandoff={team:def,pressId:best.id,startedAt:m.time,until:m.time+1.55,pressMode:true};applyHandoff(m,def,owner,st,best,state);
}
function repairGeneralForwardLayer(m){
  if(!m?.ball||!['CONTROLLED','LOOSE'].includes(String(m.ball.mode).toUpperCase())||m.restart)return;
  const atk=m.possession,def=other(atk),owner=player(m,m.ball.ownerId)||player(m,m.ball.lastTouchPlayer)||m.players.filter(p=>p.team===atk&&p.role!=='GK').sort((a,b)=>dist(a,m.ball)-dist(b,m.ball))[0];if(!atk||!owner||owner.team!==atk)return;
  const st=m.players.find(p=>p.team===def&&p.role==='ST');if(!st||st.markTargetId||st.targetId)return;
  const wfs=m.players.filter(p=>p.team===def&&p.role==='WF');if(wfs.length<2)return;
  const sl=local(def,st.x,st.y),wfFloor=Math.min(...wfs.map(p=>local(def,p.x,p.y).x)),layerDebt=wfFloor-sl.x;
  const defensive=/COVER|TRACK|DEFEND|RECOVER|PRESS|ZONE|SCREEN|HOLD/.test(task(st));if(!defensive||layerDebt<5.5||dist(st,owner)<=9.5)return;
  let state=m._v39ForwardLayerHandoff;
  if(state&&state.team===def&&m.time<(state.until||0)){
    const q=player(m,state.pressId);if(q&&q.team===def&&q.role==='CM')return applyHandoff(m,def,owner,st,q,state);
  }
  const best=chooseMidfieldHandoff(m,def,owner,st,9.0);
  if(!best){
    const sw=world(def,clamp(sl.x+1.2,20,86),clamp(34+(local(def,owner.x,owner.y).y-34)*.10,24,44));
    setTarget(st,sw,'FORWARD_LAYER_RECOVER',true);st.markTargetId=owner.id;st.targetId=owner.id;st.responsibilityReason='FORWARD_LAYER_EMERGENCY_OWNER';
    return;
  }
  state=m._v39ForwardLayerHandoff={team:def,pressId:best.id,startedAt:m.time,until:m.time+1.35,pressMode:false};applyHandoff(m,def,owner,st,best,state);
}
function freeKickOwnerCandidate(m,state,a){
  const ball=m.ball||{},rows=m.players.filter(p=>p.team===state.defTeam&&p.role!=='GK').filter(p=>{
    if(p.markTargetId===a.id||p.targetId===a.id)return true;
    if(p.markTargetId||p.targetId)return false;
    if(/CHASE_LOOSE|BALL_CHASE|PRESS_BALL/.test(task(p))&&dist(p,ball)<7.5)return false;
    return ['CB','FB','CM'].includes(p.role);
  }).map(p=>({p,score:(p.role==='CB'?0:p.role==='FB'?2.5:5)+dist(p,a)})).sort((x,y)=>x.score-y.score);
  return rows[0]?.p||null;
}
function keepFreeKickOwner(m,state,a,d,label){
  const al=local(state.attackTeam,a.x,a.y),goalSide=world(state.attackTeam,clamp(al.x+1.6,8,101),clamp(al.y+(al.y<34?.25:-.25),5,63));
  setTarget(d,goalSide,label,dist(d,a)>4.6);d.markTargetId=a.id;d.targetId=a.id;
}
function repairFreeKickContinuation(m){
  const state=m?._v39FreeKickContinuation;if(!state||m.restart)return;
  if(m.time>(state.until||0)){delete m._v39FreeKickContinuation;return;}
  // A defensive interception does not end the responsibility window: the first
  // live handoff still needs the restart's lane/cover ownership for the next
  // beat. Let the bounded 10-second window, rather than first control, expire it.
  const centralId=state.central?.attackerId||Object.keys(state.pairs||{}).find(id=>player(m,id)?.role==='ST'),a=centralId?player(m,centralId):null;if(!a||a.team!==state.attackTeam)return;
  const al=local(state.attackTeam,a.x,a.y);if(al.x<76)return;
  let d=m.players.find(p=>p.team===state.defTeam&&(p.markTargetId===a.id||p.targetId===a.id));
  if(!d){const preferred=player(m,state.central?.defenderId||state.pairs?.[a.id]);if(preferred&&preferred.team===state.defTeam&&!preferred.markTargetId&&!preferred.targetId&&!(/CHASE_LOOSE|BALL_CHASE|PRESS_BALL/.test(task(preferred))&&dist(preferred,m.ball)<7.5))d=preferred;}
  if(!d)d=freeKickOwnerCandidate(m,state,a);if(!d)return;
  keepFreeKickOwner(m,state,a,d,'FREE_KICK_CONTINUATION_CENTRAL_OWNER');
  /* The generic set-piece live maintainer reapplies its entry snapshot until the
     first loose-ball beat completes. Carry the repaired owner into that snapshot
     so the next visible frame cannot erase the live handoff. */
  if(m.setPieceLive?.kind==='FREE_KICK'&&m.setPieceLive.roles){m.setPieceLive.roles[d.id]={tx:d.tx,ty:d.ty,action:d.action,tacticalTask:d.tacticalTask,sprint:!!d.sprint};}
  state.central={attackerId:a.id,defenderId:d.id};state.pairs=state.pairs||{};state.pairs[a.id]=d.id;
}
function freeKickGeometryHandoff(m){
  const state=m?._v39FreeKickContinuation;if(!state||m.restart||m.time>(state.until||0))return;
  const ball=m.ball;if(!ball||['DEAD'].includes(String(ball.mode||'').toUpperCase()))return;
  const localX=(team,p)=>team==='HOME'?p.x:105-p.x;
  const localY=(team,p)=>team==='HOME'?p.y:68-p.y;
  const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
  const set=(p,team,x,y,task,reason)=>{const w=world(team,Math.max(4,Math.min(98,x)),Math.max(4,Math.min(64,y)));p.tx=w.x;p.ty=w.y;p.action=p.tacticalTask=task;p.sprint=Math.hypot(p.x-w.x,p.y-w.y)>2.5;p.responsibilityReason=reason;};
  const ballLocalX=localX(state.defTeam,ball), attackBallLocalX=localX(state.attackTeam,ball);
  // The restart plan owns the first live beat. Generic shape code may not replace
  // an explicit mark/coverage assignment during that beat.
  for(const p of m.players.filter(x=>x.team===state.defTeam&&x.role!=='GK')){
    // A mark is an explicit live responsibility. Generic targetId values from
    // open-play shape are not sufficient to excuse a fullback lane crossing;
    // CB/CM target ownership remains valid for central handoffs.
    if(p.markTargetId||((p.role==='CB'||p.role==='CM')&&p.targetId))continue;
    const y= p.slot==='LB'?12:p.slot==='RB'?56:p.slot==='LCB'?27:p.slot==='RCB'?41:
      p.slot==='LCM'?22:p.slot==='RCM'?46:34;
    if(p.role==='FB')set(p,state.defTeam,Math.min(ballLocalX-5,38),y,'FREE_KICK_LANE_COVER_HOLD','free-kick rest-defence channel');
    else if(p.role==='CB')set(p,state.defTeam,Math.min(ballLocalX-4,42),y,'FREE_KICK_CB_LINE_HOLD','free-kick back-line order');
    else if(p.role==='CM')set(p,state.defTeam,Math.min(ballLocalX-3,48),y,'FREE_KICK_SECOND_BALL_LANE_HOLD','free-kick distinct second-ball lane');
  }
  // A forward remains an outlet/forward-layer player unless a concrete mark or
  // live contest owns the drop. This is relative/mirrored, never an absolute pose.
  for(const p of m.players.filter(x=>x.team===state.attackTeam&&['ST','WF'].includes(x.role))){
    if(p.markTargetId||p.targetId)continue;
    const lx=localX(state.attackTeam,p),ly=localY(state.attackTeam,p);
    if(lx<62)set(p,state.attackTeam,Math.max(lx,Math.min(78,attackBallLocalX+8)),p.slot==='LW'?16:p.slot==='RW'?52:34,'FREE_KICK_FORWARD_LAYER_HOLD','free-kick forward outlet continuity');
  }
}
const base=T.assign.bind(T);
const baseLoose=T.assignLooseBallArbitration?.bind(T);
if(baseLoose)T.assignLooseBallArbitration=function(m){const out=baseLoose(m);repairFreeKickContinuation(m);repairGeneralForwardLayer(m);return out;};
T.assign=function(m){const out=base(m);exposeShapeResponsibility(m);repairFreeKickContinuation(m);repairCrossChannel(m);repairForwardPressHandoff(m);repairGeneralForwardLayer(m);freeKickGeometryHandoff(m);return out;};
T.V39_OPEN_PLAY_RESPONSIBILITY_VERSION=VERSION;T.__v39OpenPlayResponsibility=true;
if(root&&root.FLRPG_TACTICS)root.FLRPG_TACTICS=T;
})(typeof globalThis!=='undefined'?globalThis:this);
