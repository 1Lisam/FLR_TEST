(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FLRPG_HYBRID_SPATIAL_INTENT_V2=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Experimental reference-bench prototype only.
// It is deliberately isolated from production V0.5.2 files.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const SLOT_ROLE={GK:'GK',LB:'FB',LCB:'CB',RCB:'CB',RB:'FB',LCM:'CM',CM:'CM',RCM:'CM',LW:'WF',ST:'ST',RW:'WF'};
const SLOTS=['GK','LB','LCB','RCB','RB','LCM','CM','RCM','LW','ST','RW'];
const LOCAL={GK:[6,34],LB:[25,9],LCB:[22,25],RCB:[22,43],RB:[25,59],LCM:[45,20],CM:[45,34],RCM:[45,48],LW:[65,8],ST:[70,34],RW:[65,60]};
const MAX_SPEED={GK:5.8,FB:7.2,CB:6.9,CM:7.1,WF:7.7,ST:7.6};
const MAX_ACCEL={GK:4.2,FB:5.0,CB:4.8,CM:5.0,WF:5.3,ST:5.2};

function ids(){return ['H','A'].flatMap(p=>SLOTS.map(s=>`${p}-${s}`));}
function slotOf(id){return String(id||'').split('-').slice(1).join('-');}
function roleOf(id){return SLOT_ROLE[slotOf(id)]||'CM';}
function teamOf(id){return String(id||'').startsWith('A-')?'AWAY':'HOME';}
function other(team){return team==='HOME'?'AWAY':'HOME';}
function attackDir(team){return team==='HOME'?1:-1;}
function world(team,x,y){return team==='HOME'?{x,y}:{x:105-x,y:68-y};}
function local(team,x,y){return team==='HOME'?{x,y}:{x:105-x,y:68-y};}
function dist(a,b){return Math.hypot((a?.x||0)-(b?.x||0),(a?.y||0)-(b?.y||0));}

function abstractBallWorld(state){
  const team=state.possession,pr=clamp(Number(state.ball.progress)||.5,.02,.99),zone=state.zone||'MIDFIELD';
  let x;
  if(zone==='OWN_THIRD')x=clamp(12+pr*22,12,34);
  else if(zone==='MIDFIELD')x=clamp(30+pr*35,32,62);
  else if(zone==='FINAL_THIRD')x=clamp(60+(pr-.60)*62,64,84.5);
  else x=clamp(78+(pr-.78)*((state.ball.lane==='CENTER')?42:55),80,state.ball.lane==='CENTER'?91.8:94.2);
  const y=state.ball.lane==='LEFT'?18:state.ball.lane==='RIGHT'?50:34;
  return world(team,x,y);
}

// Exact design family used by current Hybrid, retained only as the SHAPE reference.
function shapeBase(state,id){
  const team=teamOf(id),slot=slotOf(id),role=roleOf(id),poss=state.possession===team,pr=Number(state.ball.progress||.5)*100;
  const st=state.structure?.[team]||{lineHeight:50,width:50};
  let [x,y]=LOCAL[slot]||[45,34];
  x+=(poss?1:-1)*clamp((pr-50)*.18,-8,10);
  x+=(Number(st.lineHeight||50)-50)*.08;
  if(poss&&role==='CM'&&['FINAL_THIRD','CHANCE'].includes(state.phase))x=Math.max(x,slot==='CM'?58:67);
  if(poss&&role==='WF'&&['FINAL_THIRD','CHANCE'].includes(state.phase))x=Math.max(x,74);
  if(poss&&role==='ST'&&['FINAL_THIRD','CHANCE'].includes(state.phase))x=Math.max(x,80);
  const width=clamp(Number(st.width||50)/50,.75,1.25);y=34+(y-34)*width;
  const bw=abstractBallWorld(state),bly=team==='HOME'?bw.y:68-bw.y,nearLeft=bly<27,nearRight=bly>41;
  const nearSide=(nearLeft&&['LB','LCM','LW'].includes(slot))||(nearRight&&['RB','RCM','RW'].includes(slot));
  if(role==='CM')x+=poss?(slot==='CM'?-1.1:(nearSide?2.2:.7)):(slot==='CM'?.4:(nearSide?-1.0:.8));
  else if(role==='FB')x+=poss?(nearSide?2.0:-.5):(nearSide?.6:-.3);
  else if(role==='WF')x+=poss?(nearSide?1.4:2.4):(nearSide?-1.0:.4);
  if(role!=='GK')y+=(bly-y)*(poss?.06:.12);
  return world(team,clamp(x,4,101),clamp(y,4,64));
}

function makePlayers(state){
  const out={};
  for(const id of ids()){
    const p=shapeBase(state,id);
    out[id]={id,team:teamOf(id),slot:slotOf(id),role:roleOf(id),x:p.x,y:p.y,vx:0,vy:0,
      intentKind:'SHAPE',intentTargetId:null,intentTargetX:p.x,intentTargetY:p.y,intentSince:state.second||0,intentMinUntil:state.second||0,
      intentScore:.2,intentMaxUntil:(state.second||0)+maxIntentDuration('SHAPE'),sourceTask:null,lastPossession:state.possession};
  }
  return out;
}

function clonePlayers(players){return Object.fromEntries(Object.entries(players).map(([k,v])=>[k,{...v}]));}
function predicted(p,horizon=.4){return{x:p.x+(p.vx||0)*horizon,y:p.y+(p.vy||0)*horizon};}
function capAround(base,target,maxDist){const dx=target.x-base.x,dy=target.y-base.y,d=Math.hypot(dx,dy);if(d<=maxDist||d<1e-6)return target;return{x:base.x+dx/d*maxDist,y:base.y+dy/d*maxDist};}
function blend(a,b,w){return{x:a.x+(b.x-a.x)*w,y:a.y+(b.y-a.y)*w};}
function nearest(players,from,filter){let best=null,bd=Infinity;for(const p of Object.values(players)){if(!filter(p))continue;const d=dist(from,p);if(d<bd){bd=d;best=p;}}return best?{p:best,d:bd}:null;}

const TASK_INTENT_GROUPS=Object.freeze({
  RECOVER:Object.freeze([
    'AERIAL_FIRST_BALL','BALL_SIDE_RECOVER','BOX_RECOVERY_LINE','BOX_SIDE_RECOVERY','EMERGENCY_TRACK','FAR_SIDE_RECOVER',
    'FREE_KICK_WALL_RECOVERY','GK_RUSH','RECOVER','RECOVER_GOAL_SIDE','RECOVER_LIVE','RECOVER_MIDFIELD_8','RECOVER_MIDFIELD_LANE',
    'RECOVER_SHAPE','RECOVERY','RECOVERY_CHASE','SECOND_BALL','TRANSITION_FB_RECOVERY','WIN_BALL'
  ]),
  PRESS:Object.freeze([
    'CHASE_GOAL_KICK_LANDING','CHASE_LOOSE','CHASE_THROUGH','CLOSE_DOWN','ENGAGE','PRESS','PRESS_CONTAIN'
  ]),
  MARK:Object.freeze([
    'MARK_LANE_SCREEN','THROW_IN_MARK_OPTION'
  ]),
  RUN:Object.freeze([
    'ATTACK_BACK_POST','ATTACK_CENTRAL_CHANNEL','ATTACK_CROSS_ZONE','ATTACK_FAR_CHANNEL','ATTACK_NEAR_POST','ATTACK_OPEN_CHANNEL',
    'BALANCED_OVERLAP','BOX_CHANNEL_RUN','BOX_WIDE_CUTBACK_LANE','CARRY_FORWARD','COMMITTED_BOX_CARRY','FAR_SIDE_RUN','FAR_SIDE_SHOULDER',
    'FB_OVERLAP_SURGE','FB_UNDERLAP_SURGE','INSIDE_CHANNEL','LATE_BOX_ARRIVAL','OVERLAP','PENALTY_SPOT_RUN','PIN_AND_RUN',
    'POST_PASS_CONTINUE_RUN','POST_SHOT_FOLLOW','PULL_OFF_FOR_CROSS','ST_RELEASE_RUN','THIRD_MAN_RUN','UNDERLAP','UNDERLAP_SUPPORT'
  ]),
  COVER:Object.freeze([
    'BALL_SIDE_BLOCK','BOX_EDGE_SCREEN','COUNTER_GUARD','CUTBACK_TRACK','DEEP_SCREEN','DEEP_TUCK','FAR_POST_TUCK','FAR_SIDE_BLOCK',
    'FAR_SIDE_TUCK','INVERT_REST','LAST_COVER_SCREEN','MIDFIELD_BLOCK','MIDFIELD_LANE_SCREEN','PIVOT_SCREEN','PIVOT_SCREEN_DEF',
    'REST_BALANCE','REST_DEFENCE','SECOND_BALL_TUCK','SHOT_LANE_COVER','TRANSITION_WIDE_COVER'
  ]),
  SUPPORT:Object.freeze([
    'ADVANCING_8','BALL_SIDE_8','BOX_EDGE','BOX_EDGE_SUPPORT','BUILD_CONNECTOR','BUILD_SUPPORT_8','CLEAR_CARRIER_LANE','CONNECT_CENTRE',
    'CUTBACK_EDGE','DROP_BETWEEN_LINES','DROP_TO_BUILD','FAR_8_SUPPORT','FAR_SIDE_HOLD','FIRST_TOUCH_FLOW','FULLBACK_BALANCED_SUPPORT',
    'FULLBACK_RECYCLE_SUPPORT','GK_BUILD_SUPPORT','HALFSPACE_CONNECTOR','HALFSPACE_CONNECTOR_8','HALFSPACE_SECOND_LINE','HALFSPACE_SECOND_WAVE',
    'HALFSPACE_SUPPORT_8','HOLD_WIDTH','INVERT_SUPPORT','MOVE_TO_RECEIVE','OUTSIDE_SUPPORT','PIN_CENTRE_BACKS','POST_RECYCLE_SUPPORT',
    'POST_SAFE_PASS_SUPPORT','RECONNECT','RECONNECT_8','SECOND_BALL_SUPPORT','SECOND_LINE','SECOND_LINE_SUPPORT','SECOND_WAVE_8','ST_WALL_SUPPORT',
    'WIDE_COMBINE','WIDE_DELIVERY_HOLD','WIDE_RELEASE_OUTLET','WIDE_SUPPORT_8'
  ]),
  SHAPE:Object.freeze([
    'BUILD_PLATFORM','CARRY_SCAN','CORNER_ATTACK_SETUP','CORNER_DEFENCE_SETUP','CORNER_KICKER_RUNUP_START','CORNER_RUN_UP','CORNER_SET_WAIT','DRIBBLE_EVADE','DUEL_ESCAPE','EDGE_SHOT','FREE_KICK_APPROACH','FREE_KICK_ATTACK_SETUP',
    'FREE_KICK_DEFENCE_SETUP','FREE_KICK_KICKER_READY','FREE_KICK_WALL','GK_SAVE_SET','GK_SET','GOAL_KICK_KEEPER','GOAL_SCORER_CELEBRATE',
    'HOLD_BLOCK','HYBRID_ENTRY_LIVE','JOIN_GOAL_CELEBRATION','KICKOFF_SHAPE','KICKOFF_TAKER','LONG_GOAL_KICK_ATTACK_SETUP',
    'LONG_GOAL_KICK_DEFENSIVE_SETUP','OFFSIDE_KICKER_READY','OFFSIDE_RESTART_APPROACH','PROTECT_SCAN','RESTART_APPROACH','RETURN_FOR_KICKOFF',
    'SHIELD_SCAN','TAKE_ON','THROW_IN_HOLD_ATTACK','THROW_IN_OPTION_FORWARD','THROW_IN_OPTION_INSIDE','THROW_IN_OPTION_SHORT',
    'THROW_IN_SLIDE_DEFENCE','THROW_IN_THROWER','TURN_BACK','TURNING_SHOT_PREP','WIDE_CARRY_SCAN'
  ])
});
const TASK_TO_INTENT=(()=>{
  const out={};
  for(const [kind,tasks] of Object.entries(TASK_INTENT_GROUPS))for(const task of tasks){
    if(out[task]&&out[task]!==kind)throw new Error(`duplicate intent task mapping: ${task}`);
    out[task]=kind;
  }
  return Object.freeze(out);
})();
function taskToIntent(task){
  const t=String(task||'').toUpperCase();
  if(!t)return'SHAPE';
  // Deliberately exact: V0.6 task names are audited into coarse intent families. Unknown
  // tasks fall back to SHAPE rather than being misclassified by a substring (e.g. RECOVER_* -> COVER).
  return TASK_TO_INTENT[t]||'SHAPE';
}
function hasExplicitTaskMapping(task){
  const t=String(task||'').toUpperCase();
  return !!TASK_TO_INTENT[t];
}
function importHighResFrame(state,frame){
  const players={};
  for(const src of frame.players||[]){
    const base=shapeBase(state,src.id),kind=taskToIntent(src.tacticalTask||src.action);
    players[src.id]={id:src.id,team:src.team||teamOf(src.id),slot:src.slot||slotOf(src.id),role:src.role||roleOf(src.id),
      x:Number(src.x),y:Number(src.y),vx:Number(src.vx||0),vy:Number(src.vy||0),intentKind:kind,
      intentTargetId:src.markTargetId||null,intentTargetX:Number(src.tx??base.x),intentTargetY:Number(src.ty??base.y),
      intentSince:Number(frame.time||state.second||0),intentMinUntil:Number(frame.time||state.second||0)+minIntentDuration(kind),
      intentScore:.75,intentMaxUntil:Number(frame.time||state.second||0)+maxIntentDuration(kind),sourceTask:src.tacticalTask||src.action||null,lastPossession:state.possession};
  }
  for(const id of ids())if(!players[id]){
    const b=shapeBase(state,id);players[id]={id,team:teamOf(id),slot:slotOf(id),role:roleOf(id),x:b.x,y:b.y,vx:0,vy:0,intentKind:'SHAPE',intentTargetId:null,intentTargetX:b.x,intentTargetY:b.y,intentSince:state.second||0,intentMinUntil:state.second||0,intentScore:.2,intentMaxUntil:(state.second||0)+maxIntentDuration('SHAPE'),sourceTask:null,lastPossession:state.possession};
  }
  return players;
}

function minIntentDuration(kind){
  return({RUN:3.0,MARK:2.6,COVER:2.4,PRESS:1.2,SUPPORT:2.0,RECOVER:2.0,SHAPE:1.0})[kind]||1.5;
}
function maxIntentDuration(kind){
  return({RUN:5.5,MARK:5.5,COVER:5.0,PRESS:2.8,SUPPORT:4.5,RECOVER:4.5,SHAPE:3.0})[kind]||4.0;
}
function intentPriority(kind){return({PRESS:1.0,MARK:.92,COVER:.82,RUN:.88,RECOVER:.80,SUPPORT:.68,SHAPE:.35})[kind]||.3;}

function pressLeash(role){return({ST:10.5,WF:12.5,CM:13.5,FB:14.5})[role]||12;}
function defensiveAssignments(state,players,team){
  const opp=other(team),owner=players[state.ball.ownerId],teamPs=Object.values(players).filter(p=>p.team===team&&p.role!=='GK');
  const out={press:null,markerByThreat:{},coverByMarker:{}};
  if(owner&&owner.team===opp){
    const ownerLocalX=team==='HOME'?owner.x:105-owner.x;
    const press=nearest(players,owner,p=>{
      if(p.team!==team||p.role==='GK'||!['CM','FB','WF','ST'].includes(p.role))return false;
      // The striker may lead a press high up the pitch, but must not be dragged into his
      // own defensive third simply because he became the nearest player after a transition.
      if(p.role==='ST'&&ownerLocalX<45)return false;
      if(p.role==='WF'&&ownerLocalX<30)return false;
      // A player who is already far outside his structural lane should recover rather than
      // earn a fresh licence to chase the ball even farther away.
      const base=shapeBase(state,p.id),anchorDist=dist(p,base);
      return anchorDist<=pressLeash(p.role)+4;
    });
    if(press&&press.d<=16)out.press=press.p.id;
  }
  const prefix=opp==='HOME'?'H':'A';
  const threats=[`${prefix}-ST`,`${prefix}-LW`,`${prefix}-RW`].map(id=>players[id]).filter(Boolean);
  const cb=teamPs.filter(p=>p.role==='CB');
  const fb=teamPs.filter(p=>p.role==='FB');
  const st=threats.find(p=>p.role==='ST');
  let stMarker=null,freeCbs=[...cb];
  if(st&&cb.length){
    cb.sort((a,b)=>dist(a,st)-dist(b,st));stMarker=cb[0];out.markerByThreat[st.id]=stMarker.id;
    freeCbs=cb.filter(x=>x.id!==stMarker.id&&x.id!==out.press);
    if(freeCbs[0])out.coverByMarker[stMarker.id]=freeCbs[0].id;
  }

  const wingInfo=threats.filter(p=>p.role==='WF').map(w=>{
    const desired=w.slot==='LW'?'RB':'LB',candidate=fb.find(p=>p.slot===desired)||nearest(players,w,p=>p.team===team&&p.role==='FB')?.p;
    const threatAdvance=w.team==='HOME'?w.x:105-w.x,ly=local(w.team,w.x,w.y).y;
    const inside=w.slot==='LW'?ly>=22:ly<=46;
    const centrality=Math.abs(ly-34);
    return{w,candidate,threatAdvance,inside,centrality};
  });

  // A winger cutting into the penalty-area channels is not simply abandoned when he leaves
  // a full-back's normal lane. If one centre-back is genuinely free after the striker is
  // accounted for, that CB may accept one inside runner. With three central runners against
  // a back four, the remaining winger stays the full-back's responsibility: the hand-off is
  // therefore capacity-aware rather than an automatic 'cross the line -> drop the man' rule.
  const handoff=wingInfo.filter(x=>x.inside&&x.threatAdvance>=80&&x.w.id!==state.ball.ownerId)
    .sort((a,b)=>(b.threatAdvance-a.threatAdvance)||(a.centrality-b.centrality));
  if(freeCbs.length&&handoff.length){
    const h=handoff[0],preferredSlot=h.w.slot==='LW'?'RCB':'LCB';
    const preferred=freeCbs.find(p=>p.slot===preferredSlot)||freeCbs.sort((a,b)=>dist(a,h.w)-dist(b,h.w))[0];
    if(preferred&&dist(preferred,h.w)<=20){
      out.markerByThreat[h.w.id]=preferred.id;
      // The full-back that released the inside runner becomes the spare/tuck defender instead
      // of following him all the way across the box. Remove the old CB-cover relationship so
      // one defender is never asked to cover and man-mark simultaneously.
      if(stMarker&&out.coverByMarker[stMarker.id]===preferred.id)delete out.coverByMarker[stMarker.id];
    }
  }

  for(const info of wingInfo){
    const {w,candidate,threatAdvance}=info;
    if(out.markerByThreat[w.id])continue;
    // Do not turn every full-back into a man-marker across half the pitch. Normal wide
    // threats keep the 18m relevance gate. Once a winger is already very deep, however,
    // the same-side full-back must keep recovery responsibility when no safe CB hand-off is
    // available; otherwise a box runner can become nobody's assignment.
    const trackLimit=threatAdvance>=90?30:threatAdvance>=80?24:18;
    if(candidate&&dist(candidate,w)<=trackLimit){
      if(candidate.id!==out.press)out.markerByThreat[w.id]=candidate.id;
      else if(threatAdvance>=80){
        const backupSlot=w.slot==='LW'?'RCB':'LCB';
        const used=new Set(Object.values(out.markerByThreat));
        const backup=cb.find(p=>p.slot===backupSlot&&!used.has(p.id))||nearest(players,w,p=>p.team===team&&p.role==='CB'&&p.id!==out.press&&!used.has(p.id))?.p;
        if(backup&&dist(backup,w)<=18)out.markerByThreat[w.id]=backup.id;
      }
    }
  }
  return out;
}

function candidateIntent(state,players,p,assignments,now){
  const inPoss=p.team===state.possession,base=shapeBase(state,p.id),owner=players[state.ball.ownerId],dir=attackDir(p.team),phase=state.phase;
  if(p.role==='GK')return{kind:'SHAPE',target:base,targetId:null,score:.65};
  if(!inPoss){
    if(assignments.press===p.id&&owner){
      const pp=predicted(owner,.25),goalSide=p.team==='HOME'?-1:1;
      const alreadyGoalSide=p.team==='HOME'?p.x<=pp.x:p.x>=pp.x;
      let lateral=0;
      if(!alreadyGoalSide&&dist(p,pp)<2.4){
        const relY=p.y-pp.y;
        const side=Math.abs(relY)>.25?Math.sign(relY):(['LB','LCB','LCM','LW'].includes(p.slot)?-1:1);
        lateral=side*1.3;
      }
      // When caught wrong-side at contact distance, arc around the carrier rather than
      // steering through his body and becoming visually stuck against the collision floor.
      const raw={x:pp.x+goalSide*1.3,y:pp.y+lateral};
      return{kind:'PRESS',target:capAround(base,raw,pressLeash(p.role)),targetId:owner.id,score:1.0};
    }
    const threatEntry=Object.entries(assignments.markerByThreat).find(([,marker])=>marker===p.id);
    if(threatEntry){const threat=players[threatEntry[0]],pp=predicted(threat,.35),goalSide=p.team==='HOME'?-1:1,raw={x:pp.x+goalSide*2.2,y:pp.y+(p.slot==='LCB'?-0.7:p.slot==='RCB'?0.7:0)},max=p.role==='CB'?12:14;return{kind:'MARK',target:capAround(base,raw,max),targetId:threat.id,score:.94};}
    const markerEntry=Object.entries(assignments.coverByMarker).find(([,cover])=>cover===p.id);
    if(markerEntry){const marker=players[markerEntry[0]],goalX=p.team==='HOME'?0:105,raw={x:marker.x+(goalX-marker.x)*.10,y:marker.y+(34-marker.y)*.28};return{kind:'COVER',target:capAround(base,raw,9),targetId:marker.id,score:.87};}
    if(['CB','FB','CM'].includes(p.role)){
      const goalX=p.team==='HOME'?0:105,blend=p.role==='CM'?.08:.12;return{kind:'COVER',target:{x:base.x+(goalX-base.x)*blend,y:base.y+(34-base.y)*.08},targetId:null,score:.61};
    }
    return{kind:'RECOVER',target:base,targetId:null,score:.56};
  }

  if(p.id===state.ball.ownerId){const bw=abstractBallWorld(state);return{kind:'SUPPORT',target:bw,targetId:null,score:.95};}
  const prog=Number(state.ball.progress||.5);
  if((p.role==='ST'||p.role==='WF')&&prog>=.56&&['PROGRESSION','FINAL_THIRD','CHANCE'].includes(phase)){
    const step=p.role==='ST'?7.2:6.4;
    let laneY=p.y;
    if(p.role==='ST')laneY=clamp(p.y+(state.ball.lane==='LEFT'?-2.5:state.ball.lane==='RIGHT'?2.5:0),18,50);
    else laneY=clamp(p.y+(34-p.y)*.06,6,62);
    return{kind:'RUN',target:{x:clamp(p.x+dir*step,5,100),y:laneY},targetId:owner?.id||null,score:.86};
  }
  if(p.role==='CM'||p.role==='WF'||p.role==='FB'){
    const rel=owner?predicted(owner,.30):abstractBallWorld(state),behind=p.role==='CM'?-6:p.role==='FB'?-9:-2;
    const lateral=p.slot.includes('L')?-7:p.slot.includes('R')?7:0,relation={x:clamp(rel.x+dir*behind,5,100),y:clamp(rel.y+lateral,5,63)};
    const w=p.role==='CM'?.42:p.role==='FB'?.22:.34,max=p.role==='CM'?10:p.role==='FB'?7:11;
    return{kind:'SUPPORT',target:capAround(base,blend(base,relation,w),max),targetId:owner?.id||null,score:p.role==='CM'?.76:.68};
  }
  return{kind:'SHAPE',target:base,targetId:null,score:.48};
}

function shouldSwitch(p,cand,now,possessionChanged){
  if(possessionChanged)return true;
  const same=p.intentKind===cand.kind&&p.intentTargetId===cand.targetId;
  if(same)return false;
  // Persistence is a floor, not immortality. Once a responsibility reaches its maximum
  // lifetime, the current state gets a fresh decision even when the replacement scores lower.
  if(now>=Number(p.intentMaxUntil||0))return true;
  if(now<(p.intentMinUntil||0)){
    const hard=cand.kind==='PRESS'||cand.kind==='MARK';
    if(!hard)return false;
  }
  const gain=cand.score-(p.intentScore||intentPriority(p.intentKind));
  return gain>=.18 || intentPriority(cand.kind)>=intentPriority(p.intentKind)+.20;
}

function updateIntents(state,players,now){
  const ass={HOME:defensiveAssignments(state,players,'HOME'),AWAY:defensiveAssignments(state,players,'AWAY')};
  let switches=0;
  for(const p of Object.values(players)){
    const changed=p.lastPossession!==state.possession,cand=candidateIntent(state,players,p,ass[p.team],now);
    // PRESS responsibility is exclusive. When the team hands the first-defender job to
    // somebody else, the old presser releases immediately instead of lingering through
    // its minimum persistence window and creating a two-player ball swarm.
    const releaseOldPress=p.intentKind==='PRESS'&&cand.kind!=='PRESS';
    // A completed mark hand-off is also a hard responsibility change. Without this release,
    // the old marker can linger through its minimum persistence window while the new marker
    // has already accepted the same runner, creating a short two-defender follow-the-man swarm.
    const oldMarkSlot=slotOf(p.intentTargetId),managedOldMark=p.intentKind==='MARK'&&p.intentTargetId&&teamOf(p.intentTargetId)!==p.team&&['ST','LW','RW'].includes(oldMarkSlot);
    const releaseOldMark=managedOldMark&&ass[p.team].markerByThreat[p.intentTargetId]!==p.id;
    // Receiving the ball is a hard state change. A player who was making an off-ball RUN
    // must not keep executing that old run after becoming the carrier; doing so can drag the
    // physical ball several metres beyond the abstract match progress before a 2D window.
    const ownerControlSwitch=p.id===state.ball.ownerId&&p.intentKind!==cand.kind;
    if(releaseOldPress||releaseOldMark||ownerControlSwitch||shouldSwitch(p,cand,now,changed)){
      p.intentKind=cand.kind;p.intentTargetId=cand.targetId||null;p.intentTargetX=cand.target.x;p.intentTargetY=cand.target.y;
      p.intentSince=now;p.intentMinUntil=now+minIntentDuration(cand.kind);p.intentMaxUntil=now+maxIntentDuration(cand.kind);p.intentScore=cand.score;switches++;
    }else if(p.intentKind===cand.kind){
      // Relation intents may follow a moving target. RUN keeps its committed lane until the
      // minimum intent window expires and the player actually reaches the target.
      const reached=Math.hypot(p.intentTargetX-p.x,p.intentTargetY-p.y)<1.8;
      if(p.intentKind!=='RUN'){p.intentTargetX=cand.target.x;p.intentTargetY=cand.target.y;p.intentTargetId=cand.targetId||p.intentTargetId;}
      else if((now>=p.intentMinUntil&&reached)||now>=Number(p.intentMaxUntil||0)){p.intentTargetX=cand.target.x;p.intentTargetY=cand.target.y;p.intentSince=now;p.intentMinUntil=now+minIntentDuration('RUN');}
      if(now>=Number(p.intentMaxUntil||0))p.intentMaxUntil=now+maxIntentDuration(p.intentKind);
      p.intentScore=Math.max(p.intentScore||0,cand.score-.05);
    }
    p.lastPossession=state.possession;
  }
  return switches;
}

function separation(players,p,radius=2.0){
  let sx=0,sy=0;
  for(const q of Object.values(players)){
    if(q.id===p.id)continue;const dx=p.x-q.x,dy=p.y-q.y,d=Math.hypot(dx,dy);if(d>0.01&&d<radius){const w=(radius-d)/radius;sx+=dx/d*w;sy+=dy/d*w;}
  }
  return{x:sx,y:sy};
}

function steerOne(state,players,p,dt){
  const role=p.role,ms=MAX_SPEED[role]||7,ma=MAX_ACCEL[role]||5;
  let tx=p.intentTargetX,ty=p.intentTargetY;
  const target=players[p.intentTargetId];
  if(target&&['MARK','PRESS'].includes(p.intentKind)){
    const base=shapeBase(state,p.id),goalSide=p.team==='HOME'?-1:1;
    if(p.intentKind==='MARK'){
      const pp=predicted(target,.35),raw={x:pp.x+goalSide*2.2,y:pp.y+(p.slot==='LCB'?-0.7:p.slot==='RCB'?0.7:0)};
      const capped=capAround(base,raw,p.role==='CB'?12:14);tx=capped.x;ty=capped.y;
    }else{
      const pp=predicted(target,.18),alreadyGoalSide=p.team==='HOME'?p.x<=pp.x:p.x>=pp.x;
      let lateral=0;
      if(!alreadyGoalSide&&dist(p,pp)<2.4){const relY=p.y-pp.y,side=Math.abs(relY)>.25?Math.sign(relY):(['LB','LCB','LCM','LW'].includes(p.slot)?-1:1);lateral=side*1.3;}
      const capped=capAround(base,{x:pp.x+goalSide*1.3,y:pp.y+lateral},pressLeash(p.role));tx=capped.x;ty=capped.y;
    }
  }
  const dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy);
  const slow=p.intentKind==='SHAPE'?6.0:p.intentKind==='COVER'?4.5:p.intentKind==='MARK'?5.0:p.intentKind==='PRESS'?6.0:3.2;
  const desiredSpeed=d<.18?0:ms*clamp(d/slow,.18,1);
  const dvx=(d>.01?dx/d*desiredSpeed:0)-p.vx,dvy=(d>.01?dy/d*desiredSpeed:0)-p.vy;
  const sep=separation(players,p,p.intentKind==='PRESS'?1.75:1.85);
  let ax=dvx/Math.max(.35,dt*2.2)+sep.x*2.0,ay=dvy/Math.max(.35,dt*2.2)+sep.y*2.0;
  const amag=Math.hypot(ax,ay);if(amag>ma){ax=ax/amag*ma;ay=ay/amag*ma;}
  p.vx=clamp(p.vx+ax*dt,-ms,ms);p.vy=clamp(p.vy+ay*dt,-ms,ms);
  const sp=Math.hypot(p.vx,p.vy);if(sp>ms){p.vx=p.vx/sp*ms;p.vy=p.vy/sp*ms;}
  p.x=clamp(p.x+p.vx*dt,3,102);p.y=clamp(p.y+p.vy*dt,3,65);
}


function resolveBodySeparation(players,minDist=.68){
  const ps=Object.values(players).filter(p=>p.role!=='GK');
  // Repeat a few deterministic sweeps. A single push can be partially lost when one
  // player is already against a pitch boundary; later sweeps transfer the remaining
  // separation to the player who still has room to move.
  for(let sweep=0;sweep<4;sweep++){
    let changed=false;
    for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
      const a=ps[i],b=ps[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
      if(d>=minDist-.001)continue;
      let nx,ny;if(d<1e-5){const sign=String(a.id)<String(b.id)?1:-1;nx=sign;ny=0;}else{nx=dx/d;ny=dy/d;}
      const need=minDist-Math.max(d,1e-5),push=need*.5;
      const ax0=a.x,ay0=a.y,bx0=b.x,by0=b.y;
      a.x=clamp(a.x-nx*push,3,102);a.y=clamp(a.y-ny*push,3,65);
      b.x=clamp(b.x+nx*push,3,102);b.y=clamp(b.y+ny*push,3,65);
      // If a boundary absorbed most of the normal push, use the remaining legal room on
      // the other body rather than injecting random lateral jitter.
      const rem=minDist-Math.hypot(b.x-a.x,b.y-a.y);
      if(rem>.001){
        const aBlocked=Math.abs(a.x-ax0)<push*.15&&Math.abs(a.y-ay0)<push*.15;
        const bBlocked=Math.abs(b.x-bx0)<push*.15&&Math.abs(b.y-by0)<push*.15;
        if(aBlocked&&!bBlocked){b.x=clamp(b.x+nx*rem,3,102);b.y=clamp(b.y+ny*rem,3,65);}
        else if(bBlocked&&!aBlocked){a.x=clamp(a.x-nx*rem,3,102);a.y=clamp(a.y-ny*rem,3,65);}
      }
      // Remove only inward relative velocity; tangential duel motion survives.
      const rvx=(b.vx||0)-(a.vx||0),rvy=(b.vy||0)-(a.vy||0),closing=rvx*nx+rvy*ny;
      if(closing<0){const impulse=-closing*.5;a.vx-=nx*impulse;a.vy-=ny*impulse;b.vx+=nx*impulse;b.vy+=ny*impulse;}
      changed=true;
    }
    if(!changed)break;
  }
}

function advanceV2(state,players,seconds,opts={}){
  // Hybrid time is compressed event time. `seconds` controls how much continuous spatial
  // motion we sample, while clockSeconds advances tactical responsibility/TTL across the
  // full low-resolution event. Keeping them separate prevents every player from reaching
  // a static target at the end of a long 8-12s abstract event.
  const clockSeconds=Number.isFinite(opts.clockSeconds)?Math.max(.1,Number(opts.clockSeconds)):seconds;
  const sub=opts.substep||.25,steps=Math.max(1,Math.ceil(seconds/sub)),dt=seconds/steps,clockDt=clockSeconds/steps,start=Number.isFinite(opts.startTime)?Number(opts.startTime):Number(state.second||0);let switches=0;
  const endProgress=Number(state.ball?.progress||.5),startProgress=Number.isFinite(opts.startProgress)?Number(opts.startProgress):endProgress;
  for(let i=0;i<steps;i++){
    const now=start+i*clockDt,frac=(i+1)/steps;
    if(state.ball)state.ball.progress=startProgress+(endProgress-startProgress)*frac;
    if(i===0||i%Math.max(1,Math.round(1.0/clockDt))===0)switches+=updateIntents(state,players,now);
    for(const p of Object.values(players))steerOne(state,players,p,dt);
    resolveBodySeparation(players,.68);
  }
  if(state.ball)state.ball.progress=endProgress;
  if(opts.mutateTime!==false)state.second=start+clockSeconds;return{players,switches};
}

// Bench replica of the current production advance family. Kept independent so production stays frozen.
function advanceBaseline(state,players,seconds,opts={}){
  const last=opts.last||null,actor=last?.actorId||null,target=last?.targetId||null,owner=state.ball.ownerId||null,bw=abstractBallWorld(state),fromExact=!!opts.fromExact;
  for(const id of ids()){
    const q=players[id]||(players[id]={id,team:teamOf(id),slot:slotOf(id),role:roleOf(id),...shapeBase(state,id),vx:0,vy:0});
    const base=shapeBase(state,id),team=teamOf(id),role=roleOf(id),inPoss=state.possession===team,attack=attackDir(team);let tx=base.x,ty=base.y;
    if(id===owner){tx=bw.x;ty=bw.y;}
    else if(id===target){tx=base.x+attack*2.4;ty=base.y+(bw.y-base.y)*.18;}
    else if(id===actor){tx=base.x+(bw.x-base.x)*.18;ty=base.y+(bw.y-base.y)*.18;}
    else{
      if(state.phase==='TRANSITION'){tx+=inPoss?attack*3.2:-attack*2.7;ty+=(bw.y-ty)*.12;}
      else if(inPoss){const prog=clamp(Number(state.ball.progress||.5),.02,.99),push=role==='WF'?3.8:role==='CM'?2.3:role==='FB'?1.5:role==='ST'?3.2:.5;tx+=attack*push*clamp((prog-.38)/.48,0,1);}
      else{
        const pull=role==='CB'?.10:role==='CM'?.15:role==='FB'?.12:.07;tx+=(bw.x-tx)*pull;
        const oppPrefix=team==='HOME'?'A':'H',slot=slotOf(id),markId=slot==='LB'?`${oppPrefix}-RW`:slot==='RB'?`${oppPrefix}-LW`:(slot==='LCB'||slot==='RCB')?`${oppPrefix}-ST`:null,mp=markId?players[markId]:null;
        if(mp){const mx=mp.x+attack*(role==='CB'?3.0:2.2),my=mp.y+(slot==='LCB'?-1.2:slot==='RCB'?1.2:0);tx+=(mx-tx)*(role==='CB'?.34:.28);ty+=(my-ty)*(role==='CB'?.28:.24);}
      }
      const retain=fromExact?.86:.62,window=Math.min(seconds,3.2);tx+=clamp(Number(q.vx||0)*window*retain,-5.2,5.2);ty+=clamp(Number(q.vy||0)*window*retain,-4.2,4.2);
    }
    const tau=(id===owner||id===actor||id===target)?3.2:(fromExact?30:24),alpha=1-Math.exp(-seconds/tau),ox=q.x,oy=q.y,ivx=clamp((tx-ox)/3.2,-5.2,5.2),ivy=clamp((ty-oy)/3.2,-4.4,4.4);
    q.x=clamp(ox+(tx-ox)*alpha,3,102);q.y=clamp(oy+(ty-oy)*alpha,3,65);q.vx=clamp(Number(q.vx||0)*.38+ivx*.62,-6.5,6.5);q.vy=clamp(Number(q.vy||0)*.38+ivy*.62,-5.5,5.5);
  }
  state.second=(state.second||0)+seconds;return{players,switches:null};
}

function anchorMetrics(state,players){
  const rows=Object.values(players).filter(p=>p.role!=='GK').map(p=>{const b=shapeBase(state,p.id);return{id:p.id,d:dist(p,b),speed:Math.hypot(p.vx||0,p.vy||0),intent:p.intentKind||'BASELINE'};});
  const avg=rows.reduce((a,b)=>a+b.d,0)/rows.length,variance=rows.reduce((a,b)=>a+(b.d-avg)**2,0)/rows.length;
  return{avgAnchorDistance:+avg.toFixed(3),anchorStd:+Math.sqrt(variance).toFixed(3),movingGt075:rows.filter(r=>r.speed>.75).length,movingGt2:rows.filter(r=>r.speed>2).length,farFromAnchorGt3:rows.filter(r=>r.d>3).length,rows};
}

return {ids,slotOf,roleOf,teamOf,shapeBase,makePlayers,clonePlayers,taskToIntent,hasExplicitTaskMapping,importHighResFrame,updateIntents,advanceV2,advanceBaseline,anchorMetrics,abstractBallWorld,dist};

});
