from pathlib import Path
import re

# 1) Chained incoming-ball decisions: replay pass departure/flight before choices.
p=Path('step71_hybrid_v06_ui.js')
s=p.read_text(encoding='utf-8')
marker="\nfunction choose(id,targetId,inputMeta={source:'USER_UI_CLICK'})"
assert marker in s
assert 'function showPendingCausally()' not in s
helper="""
function showPendingCausally(){
  const p=session?.pending;if(!p)return;
  if(p.kind==='INCOMING_BALL'&&p.chained){
    const rows=(p.replayFrames||[]).map(deep);
    if(rows.length>=2){
      const hid=$('heroPlayer').value;let flight=rows.findIndex(f=>f?.ball?.mode==='FLIGHT'&&f?.ball?.intendedReceiverId===hid);
      const start=flight>=0?Math.max(0,flight-5):Math.max(0,rows.length-24),clip=rows.slice(start);
      if(clip.length>=2){startReplay(clip,'CHOICE','다가오는 공 → 선택 직전 실제 경기');return;}
    }
  }
  showPending();
}
"""
s=s.replace(marker,'\n'+helper+marker.lstrip('\n'),1)
assert s.count("if(session.pending?.chained){showPending();return}")==2
s=s.replace("if(session.pending?.chained){showPending();return}","if(session.pending?.chained){showPendingCausally();return}")
assert s.count("if(session.pending){showPending();return}")==1
s=s.replace("if(session.pending){showPending();return}","if(session.pending){showPendingCausally();return}")
p.write_text(s,encoding='utf-8')

# 2) A genuinely open WF slightly lateral/backward remains a player pass option.
p=Path('runtime/protagonist_match_controller.js')
s=p.read_text(encoding='utf-8')
marker="  // PLAYER risk floor: the raw live pass geometry, not NPC ranking, decides whether a risky\n"
assert marker in s
assert 'const openWideOutlet=' not in s
block="""  // V0.5 follow-up: an obviously open wide outlet is a PLAYER option even when it is
  // slightly lateral/backward. NPC forward-progress preference may rank it low, but it must
  // not erase a real winger with receiving space. Execution still re-checks live geometry,
  // so a blocker may intercept it and no success outcome is preselected here.
  const openWideOutlet=(frame?._frame?.opts||[]).filter(o=>o?.p&&o.p.role==='WF'&&o.d>=3&&o.d<=32&&o.block<=1&&o.open>=3.0&&o.forward>=-5.0&&!o.offsideRisk)
    .sort((a,b)=>(b.open-a.open)+(b.forward-a.forward)*.05+(Number(b.running)-Number(a.running))*.35)[0]||null;
  if(openWideOutlet&&!out.some(o=>o.family==='패스'&&o.targetId===openWideOutlet.p.id)){
    if(out.length>=6){const ix=out.findIndex(o=>o.id==='HOLD'||o.id==='CARRY'||o.id==='RECYCLE');if(ix>=0)out.splice(ix,1);}
    if(out.length<6){const c={id:'AVAILABLE_PASS',targetId:openWideOutlet.p.id,targetName:`같은 팀 ${openWideOutlet.p.slot}`,meta:{targetId:openWideOutlet.p.id,targetSlot:openWideOutlet.p.slot,forward:Number(openWideOutlet.forward||0),d:Number(openWideOutlet.d||0),receiverPressure:Number(openWideOutlet.open||0),contested:openWideOutlet.block>0,laneBlockers:Number(openWideOutlet.block||0),offsideRisk:false,lateralOutlet:true}};const row={id:c.id,targetId:c.targetId,targetName:c.targetName,family:'패스',label:labelFor(c),meta:deep(c.meta)};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;out.push(row);}
  }
"""
s=s.replace(marker,block+marker,1)
p.write_text(s,encoding='utf-8')

# 3) Keep causal V0.6 spatial asymmetry through Hybrid instead of rapidly relaxing all
# uninvolved players onto identical 4-3-3 anchor rails.
p=Path('live_hybrid_session_v02.js')
s=p.read_text(encoding='utf-8')
assert 'HYBRID_CONTINUOUS_FROM_V06' not in s
base_re=r"function spatialBase\(state,id\)\{.*?\}\nfunction createSpatialState"
m=re.search(base_re,s,flags=re.S)
assert m,'spatialBase block not found'
old=m.group(0);base_old=old[:-len('\nfunction createSpatialState')]
needle="const width=clamp(Number(st.width||50)/50,.75,1.25);y=34+(y-34)*width;return localToWorld(team,clamp(x,4,101),clamp(y,4,64));"
assert needle in base_old
replacement="const width=clamp(Number(st.width||50)/50,.75,1.25);y=34+(y-34)*width;const bw=abstractBallWorld(state),bly=team==='HOME'?bw.y:68-bw.y,nearLeft=bly<27,nearRight=bly>41,nearSide=(nearLeft&&['LB','LCM','LW'].includes(slot))||(nearRight&&['RB','RCM','RW'].includes(slot));if(role==='CM')x+=poss?(slot==='CM'?-1.1:(nearSide?2.2:.7)):(slot==='CM'?.4:(nearSide?-1.0:.8));else if(role==='FB')x+=poss?(nearSide?2.0:-.5):(nearSide?.6:-.3);else if(role==='WF')x+=poss?(nearSide?1.4:2.4):(nearSide?-1.0:.4);if(role!=='GK')y+=(bly-y)*(poss ? .06 : .12);return localToWorld(team,clamp(x,4,101),clamp(y,4,64));"
base_new=base_old.replace(needle,replacement)
s=s.replace(old,base_new+'\nfunction createSpatialState',1)
adv_re=r"function advanceSpatial\(session,dt\)\{.*?\}\nfunction spatialSnapshot"
m=re.search(adv_re,s,flags=re.S)
assert m,'advanceSpatial block not found'
adv_new="""function advanceSpatial(session,dt){
 const s=session.state,sp=s.spatial||(s.spatial=createSpatialState(s)),last=s.chain.at(-1),actor=last?.detail?.actorId||null,target=last?.detail?.targetId||null,owner=s.ball.ownerId||null,bw=abstractBallWorld(s),seconds=Math.max(.1,Number(dt)||.1),fromExact=sp.source==='V06_HANDOFF_EXACT';
 for(const id of spatialPlayerIds()){
  const q=sp.players[id]||(sp.players[id]={id,...spatialBase(s,id),vx:0,vy:0}),base=spatialBase(s,id),team=teamOfPlayer(id),role=roleOf(id),inPoss=s.possession===team,attack=team==='HOME'?1:-1;let tx=base.x,ty=base.y;
  if(id===owner){tx=bw.x;ty=bw.y;}
  else if(id===target){tx=base.x+attack*2.4;ty=base.y+(bw.y-base.y)*.18;}
  else if(id===actor){tx=base.x+(bw.x-base.x)*.18;ty=base.y+(bw.y-base.y)*.18;}
  else{
   if(s.phase==='TRANSITION'){tx+=inPoss?attack*2.4:-attack*2.0;ty+=(bw.y-ty)*.08;}
   else if(inPoss){const prog=clamp(Number(s.ball.progress||.5),.02,.99),push=role==='WF'?2.8:role==='CM'?1.8:role==='FB'?1.2:role==='ST'?2.0:.4;tx+=attack*push*clamp((prog-.42)/.45,0,1);}
   else{const pull=role==='CB'?.10:role==='CM'?.13:role==='FB'?.11:.06;tx+=(bw.x-tx)*pull;}
   const retain=fromExact ? .82 : .50,window=Math.min(seconds,3.0);tx+=clamp(Number(q.vx||0)*window*retain,-4.5,4.5);ty+=clamp(Number(q.vy||0)*window*retain,-3.8,3.8);
  }
  const tau=(id===owner||id===actor||id===target)?3.2:(fromExact?24:18),alpha=1-Math.exp(-seconds/tau),ox=q.x,oy=q.y;q.x=clamp(ox+(tx-ox)*alpha,3,102);q.y=clamp(oy+(ty-oy)*alpha,3,65);q.vx=(q.x-ox)/seconds;q.vy=(q.y-oy)/seconds;
 }
 const op=sp.players[owner];if(op)sp.ball={x:op.x,y:op.y,ownerId:owner};else{const a=.35;sp.ball={x:(sp.ball?.x??bw.x)+(bw.x-(sp.ball?.x??bw.x))*a,y:(sp.ball?.y??bw.y)+(bw.y-(sp.ball?.y??bw.y))*a,ownerId:null};}sp.atSecond=s.second;if(fromExact)sp.source='HYBRID_CONTINUOUS_FROM_V06';return sp;
}
function spatialSnapshot"""
s=s[:m.start()]+adv_new+s[m.end():]
p.write_text(s,encoding='utf-8')

# 4) A runner who controls a THROUGH ball keeps the physical run through the first touch.
# Generic shape/probe logic must not zero the momentum immediately after reception. This is
# a short current-state movement continuation only; the next live AI/user action still owns
# the outcome and can replace the continuation target at any time.
p=Path('runtime/continuous_match_core.js')
s=p.read_text(encoding='utf-8')
assert 'receiveRunContinuationUntil' not in s
needle="    let touchVec;if(kind==='THROUGH'&&sp>0.75)touchVec=norm(moveVec.x*.78+goalVec.x*.22,moveVec.y*.78+goalVec.y*.22);else if(sp>0.45)touchVec=norm(moveVec.x*.62+incomingTravel.x*.20+goalVec.x*.18,moveVec.y*.62+incomingTravel.y*.20+goalVec.y*.18);else touchVec=norm(incomingTravel.x*.78+goalVec.x*.22,incomingTravel.y*.78+goalVec.y*.22);\n    const continuation=kind==='THROUGH'?2.75:kind==='CUTBACK'?1.20:kind==='LONG_PASS'?1.05:1.15;\n    p.tx=clamp(p.x+touchVec.x*continuation,1,104);p.ty=clamp(p.y+touchVec.y*continuation,1,67);p.tacticalTask='FIRST_TOUCH_FLOW';"
assert needle in s
replacement="    let touchVec;if(kind==='THROUGH'&&sp>0.75)touchVec=norm(moveVec.x*.78+goalVec.x*.22,moveVec.y*.78+goalVec.y*.22);else if(sp>0.45)touchVec=norm(moveVec.x*.62+incomingTravel.x*.20+goalVec.x*.18,moveVec.y*.62+incomingTravel.y*.20+goalVec.y*.18);else touchVec=norm(incomingTravel.x*.78+goalVec.x*.22,incomingTravel.y*.78+goalVec.y*.22);\n    const throughMomentum=kind==='THROUGH'&&sp>0.75,continuation=throughMomentum?clamp(sp*.92,4.2,5.8):kind==='THROUGH'?3.10:kind==='CUTBACK'?1.20:kind==='LONG_PASS'?1.05:1.15;\n    p.tx=clamp(p.x+touchVec.x*continuation,1,104);p.ty=clamp(p.y+touchVec.y*continuation,1,67);p.tacticalTask='FIRST_TOUCH_FLOW';p.sprint=throughMomentum;if(throughMomentum)p.receiveRunContinuationUntil=m.time+1.05;"
s=s.replace(needle,replacement,1)
needle="    p.lockTargetUntil=m.time+Math.min(settle,0.62);p.nextThink=m.time+settle;p.receiveFlowUntil=p.nextThink;"
assert needle in s
replacement="    const flowTargetHold=throughMomentum?Math.max(1.05,settle):Math.min(settle,0.62);p.lockTargetUntil=m.time+flowTargetHold;p.nextThink=m.time+settle;p.receiveFlowUntil=m.time+flowTargetHold;"
s=s.replace(needle,replacement,1)
needle="    else if(p.id===m.ball.ownerId){\n      if((p.lockTargetUntil||0)>m.time){const q=worldToLocal(p.team,p.tx,p.ty);lx=q.x;ly=q.y;action=p.action||'CARRY';sprint=p.sprint;}"
assert needle in s
replacement="    else if(p.id===m.ball.ownerId){\n      if((p.receiveRunContinuationUntil||0)>m.time){const q=worldToLocal(p.team,p.tx,p.ty);lx=q.x;ly=q.y;action='FIRST_TOUCH_FLOW';sprint=true;}\n      else if((p.lockTargetUntil||0)>m.time){const q=worldToLocal(p.team,p.tx,p.ty);lx=q.x;ly=q.y;action=p.action||'CARRY';sprint=p.sprint;}"
s=s.replace(needle,replacement,1)
needle="function applyResolvedOwnerAction(m,owner,action){\n  if(!owner||!action)return false;"
assert needle in s
replacement="function applyResolvedOwnerAction(m,owner,action){\n  if(!owner||!action)return false;owner.receiveRunContinuationUntil=0;"
s=s.replace(needle,replacement,1)
p.write_text(s,encoding='utf-8')

print('APPLIED_V05_FOLLOWUP_4')
