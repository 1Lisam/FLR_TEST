from pathlib import Path
import re

ROOT=Path('.')

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,text): (ROOT/path).write_text(text,encoding='utf-8')
def rep(path,old,new,label):
    s=read(path); n=s.count(old)
    if n!=1: raise SystemExit(f'{label}: expected 1 occurrence, got {n}')
    write(path,s.replace(old,new,1))
def sub(path,pattern,repl,label,flags=re.S):
    s=read(path); out,n=re.subn(pattern,repl,s,count=1,flags=flags)
    if n!=1: raise SystemExit(f'{label}: expected 1 regex match, got {n}')
    write(path,out)

CORE=Path('runtime/continuous_match_core.js')
PC=Path('runtime/protagonist_match_controller.js')
TACT=Path('runtime/tactical_movement.js')
HYB=Path('live_hybrid_session_v02.js')
AUTH=Path('live_v06_scene_authority_browser.js')
UI=Path('step71_hybrid_v06_ui.js')

# -----------------------------------------------------------------------------
# 1) Reception: preserve momentum, open the body before contact, directional touch.
# -----------------------------------------------------------------------------
rep(CORE,
"  const bx=m.ball.x,by=m.ball.y;p.hasBall=true;p.controlledSince=m.time;p.lastReceivedAt=m.time;",
"  const bx=m.ball.x,by=m.ball.y,incomingVx=Number(m.ball.vx||0),incomingVy=Number(m.ball.vy||0),incomingSpeed=Math.hypot(incomingVx,incomingVy);p.hasBall=true;p.controlledSince=m.time;p.lastReceivedAt=m.time;",
'receive incoming vector')

flow_new=r'''  if(flow){
    const sp=Math.hypot(p.vx,p.vy),kind=receiveMeta.flightKind||'PASS',delivery=receiveMeta.deliveryMode||'GROUND',source=playerById(m,receiveMeta.sourceId),pressure=nearestOppDistance(m,p),space=forwardSpace(m,p,11),preferred=receiveMeta.preferredReceptionMode||null;
    p.lastReceivedFlightKind=kind;p.lastReceivedDeliveryMode=delivery;p.lastReceivedPassAt=m.time;
    const attackGoalX=p.team===HOME?105:0,goalAngle=Math.atan2(34-p.y,attackGoalX-p.x),runAngle=sp>0.75?Math.atan2(p.vy,p.vx):goalAngle,incomingAngle=incomingSpeed>0.8?Math.atan2(-incomingVy,-incomingVx):(source?Math.atan2(source.y-p.y,source.x-p.x):runAngle);
    const forcedSecure=preferred==='SECURE',forcedDirectional=preferred==='DIRECTIONAL',openBody=forcedDirectional||(!forcedSecure&&pressure>1.35&&space>2.4);
    // TT-0.51: the movement used to meet the ball is not automatically the movement after it.
    // With space, blend the current run with the attacking view so the receiver can open 45-90°
    // before contact and take the first touch into the next lane instead of turning like an outfielder.
    let desiredAngle;
    if(openBody){const gx=Math.cos(goalAngle),gy=Math.sin(goalAngle),rx=Math.cos(runAngle),ry=Math.sin(runAngle),w=sp>2.2?.58:.38,n=norm(gx*(1-w)+rx*w,gy*(1-w)+ry*w);desiredAngle=Math.atan2(n.y,n.x);}
    else desiredAngle=incomingAngle;
    const nx=Math.cos(desiredAngle),ny=Math.sin(desiredAngle),longReceive=kind==='LONG_PASS'||delivery==='AERIAL',base=kind==='THROUGH'?4.4:longReceive?3.6:kind==='CUTBACK'?2.0:2.5,continuation=clamp(base+Math.min(1.6,sp*.18)+Math.min(1.2,space*.10),1.4,5.6);
    p.tx=clamp(p.x+nx*continuation,1,104);p.ty=clamp(p.y+ny*continuation,1,67);p.tacticalTask='FIRST_TOUCH_FLOW';p.action='FIRST_TOUCH_FLOW';p.sprint=openBody&&sp>3.0;
    const tightBackToGoal=p.role==='ST'&&pressure<1.25&&!openBody,receiveBase=openBody?desiredAngle:incomingAngle,receiveTurn=clamp(angleDiff(receiveBase,goalAngle),-(tightBackToGoal?Math.PI*.62:Math.PI),tightBackToGoal?Math.PI*.62:Math.PI),openShare=tightBackToGoal?.58:(openBody?.86:.42);
    p.faceTargetAngle=receiveBase+receiveTurn*openShare;p.receiveFacingUntil=m.time+(openBody?1.15:1.45);p.receiveMode=openBody?'OPEN_BODY':'SECURE';
    // A free open-body reception should not brake to zero and restart. Tight/high balls still
    // demand a settling beat. The first-touch target itself carries the player through contact.
    const settle=forcedSecure?(delivery==='AERIAL'?0.72+m.r()*.16:0.54+m.r()*.14):openBody?(delivery==='AERIAL'?0.38+m.r()*.14:0.28+m.r()*.12):(delivery==='AERIAL'?0.66+m.r()*.18:pressure<1.45?0.54+m.r()*.16:0.46+m.r()*.14);
    p.lockTargetUntil=m.time+Math.min(settle,openBody?.44:.62);p.nextThink=m.time+settle;p.receiveFlowUntil=p.nextThink;
    m.stats.flowReceives=(m.stats.flowReceives||0)+1;if(delivery==='AERIAL')m.stats.flowAerialReceives=(m.stats.flowAerialReceives||0)+1;else m.stats.flowGroundReceives=(m.stats.flowGroundReceives||0)+1;
    if(openBody)m.stats.openBodyReceives=(m.stats.openBodyReceives||0)+1;if(openBody&&continuation>=3)m.stats.directionalFirstTouches=(m.stats.directionalFirstTouches||0)+1;
    m.stats.maxFlowReceiveDelay=Math.max(m.stats.maxFlowReceiveDelay||0,settle);
  }
}'''
sub(CORE,r"  if\(flow\)\{.*?\n  \}\n\}\nfunction setBallFlight",flow_new+"\nfunction setBallFlight",'replace first touch flow')

incoming_helpers=r'''
function executeHeaderPassAtContact(m,p,target){
  if(!target||target.team!==p.team)return false;const d=dist(p,target),speed=clamp(12.8+d*.17,13.5,18.0);m.stats.passes++;m.stats.headerPasses=(m.stats.headerPasses||0)+1;m.lastPassAt[p.team]=m.time;setBallFlight(m,{source:p,target,kind:'PASS',speed,loft:.55,targetPoint:{x:target.x,y:target.y},deliveryMode:'AERIAL'});event(m,'HEADER_PASS',`${subjectName(p.name)} 공중볼을 머리로 ${target.name}에게 연결했습니다.`,{actorId:p.id,team:p.team,targetId:target.id});p.nextThink=m.time+.42;return true;
}
function executeIncomingChoiceAtContact(m,p,sourceId,flightKind,deliveryMode){
  const plan=m.protagonistIncomingChoice;if(!plan||plan.playerId!==p.id)return false;m.protagonistIncomingChoice=null;
  const receiveMeta={flow:true,flightKind,deliveryMode,sourceId,preferredReceptionMode:plan.choice==='SECURE_TOUCH'?'SECURE':'DIRECTIONAL'};
  if(plan.choice==='DIRECTIONAL_TOUCH'||plan.choice==='SECURE_TOUCH'){
    setControlled(m,p,false,receiveMeta);p.lastReceivedFromId=sourceId;if(plan.choice==='SECURE_TOUCH'){p.vx*=.45;p.vy*=.45;p.sprint=false;}m.stats.userReceptionChoices=(m.stats.userReceptionChoices||0)+1;event(m,plan.choice==='SECURE_TOUCH'?'SECURE_FIRST_TOUCH':'DIRECTIONAL_FIRST_TOUCH',`${subjectName(p.name)} ${plan.choice==='SECURE_TOUCH'?'공을 안정적으로 잡아':'몸을 열어 첫 터치를 앞으로 두고'} 다음 플레이를 준비합니다.`,{actorId:p.id,team:p.team});return true;
  }
  const target=plan.targetId?playerById(m,plan.targetId):null;
  if(plan.choice==='ONE_TOUCH_PASS'&&target){m.stats.oneTouchPasses=(m.stats.oneTouchPasses||0)+1;executePass(m,p,target,dist(p,target)>31?'LONG_PASS':'PASS',null,'USER_ONE_TOUCH');return true;}
  if(plan.choice==='HEADER_PASS'&&target){return executeHeaderPassAtContact(m,p,target);}
  if(plan.choice==='HEADER_SHOT'){m.stats.userHeaderShots=(m.stats.userHeaderShots||0)+1;return executeCrossHeaderShot(m,p,nearestOppDistance(m,p));}
  if(plan.choice==='VOLLEY_SHOT'){m.stats.volleyShots=(m.stats.volleyShots||0)+1;executeShot(m,p,'VOLLEY_ONE_TOUCH',{releaseNow:true});if(m.ball.kind==='SHOT')m.ball.strikeStyle='VOLLEY';return true;}
  if(plan.choice==='DIRECT_SHOT'){m.stats.directOneTouchShots=(m.stats.directOneTouchShots||0)+1;executeShot(m,p,'DIRECT_ONE_TOUCH',{releaseNow:true});return true;}
  setControlled(m,p,false,receiveMeta);p.lastReceivedFromId=sourceId;return true;
}
'''
rep(CORE,"function resolveCrossLanding(m){",incoming_helpers+"\nfunction resolveCrossLanding(m){",'insert incoming contact executors')

# Resolve an explicit incoming choice at the physical contact frame, before normal control flattens the ball.
rep(CORE,
"  const trace=m.lastUserDirectedPassTrace;if(passFlight&&trace&&trace.outcome==='IN_FLIGHT'&&trace.sourceId===sourceId){trace.firstControllerId=p.id;trace.outcome=p.team===passTeam?(p.id===trace.resolvedTargetId?'SELECTED_TARGET_CONTROL':'OTHER_TEAMMATE_CONTROL'):'OPPONENT_CONTROL';trace.resolvedAt=Number(m.time.toFixed(3));}\n  const sameTeamFlow=transferFlight&&flightKind!=='CROSS'&&p.team===passTeam;",
"  const trace=m.lastUserDirectedPassTrace;if(passFlight&&trace&&trace.outcome==='IN_FLIGHT'&&trace.sourceId===sourceId){trace.firstControllerId=p.id;trace.outcome=p.team===passTeam?(p.id===trace.resolvedTargetId?'SELECTED_TARGET_CONTROL':'OTHER_TEAMMATE_CONTROL'):'OPPONENT_CONTROL';trace.resolvedAt=Number(m.time.toFixed(3));}\n  if(passFlight&&p.team===passTeam&&p.id===m.protagonistControllerId&&m.protagonistIncomingChoice?.playerId===p.id){m.stats.completedPasses++;if(flightKind==='CROSS')m.stats.crossesCompleted++;if(executeIncomingChoiceAtContact(m,p,sourceId,flightKind,deliveryMode))return;}\n  const sameTeamFlow=transferFlight&&flightKind!=='CROSS'&&p.team===passTeam;",
'incoming choice contact hook')

receiving_inspect=r'''  if(m.ball.mode==='FLIGHT'&&m.ball.intendedReceiverId===owner.id&&m.ball.lastTouchTeam===owner.team&&['PASS','LONG_PASS','THROUGH','CUTBACK','CROSS'].includes(m.ball.kind)){
    const speed=Math.hypot(m.ball.vx||0,m.ball.vy||0),distance=dist(owner,m.ball),eta=speed>1?distance/speed:9,delivery=m.ball.deliveryMode||((m.ball.z||0)>.35?'AERIAL':'GROUND');
    if(distance<=8.5&&eta<=1.15&&eta>=.04){
      const local=worldToLocal(owner.team,owner.x,owner.y),pressure=nearestOppDistance(m,owner),space=forwardSpace(m,owner,11),gx=oppGoalX(owner.team),dGoal=Math.hypot(gx-owner.x,34-owner.y),aerial=delivery==='AERIAL'||(m.ball.z||0)>.55;
      const mates=teamPlayers(m,owner.team).filter(q=>q.id!==owner.id&&q.role!=='GK'&&q.id!==m.ball.lastTouchPlayer).map(q=>({p:q,d:dist(owner,q),open:nearestOppDistance(m,q),forward:dir(owner.team)*(q.x-owner.x),block:laneBlockers(m,owner,{x:q.x,y:q.y},other(owner.team)).length})).filter(o=>o.d<=32&&o.block===0&&o.open>=1.0).sort((a,b)=>(b.forward-a.forward)||(b.open-a.open)).slice(0,3);
      const candidates=[];
      if(space>=2.1)candidates.push({id:'DIRECTIONAL_TOUCH',score:2.6,reason:'receive_into_space',meta:{incomingKind:m.ball.kind,deliveryMode:delivery,eta,space}});
      candidates.push({id:'SECURE_TOUCH',score:2.2,reason:'secure_reception',meta:{incomingKind:m.ball.kind,deliveryMode:delivery,eta,pressure}});
      for(const o of mates.slice(0,2))candidates.push({id:aerial?'HEADER_PASS':'ONE_TOUCH_PASS',score:2.35+Math.max(0,o.forward)*.025,reason:'direct_release',meta:{targetId:o.p.id,targetSlot:o.p.slot,forward:o.forward,d:o.d,receiverPressure:o.open,incomingKind:m.ball.kind,deliveryMode:delivery}});
      if(dGoal<=25&&local.x>=76&&['ST','WF','CM'].includes(owner.role)){
        if(aerial){if((m.ball.z||0)>=.75)candidates.push({id:(m.ball.kind==='CROSS'||(m.ball.z||0)>1.15)?'HEADER_SHOT':'VOLLEY_SHOT',score:3.0,reason:'aerial_direct_finish',meta:{dGoal,deliveryMode:delivery,incomingKind:m.ball.kind}});else candidates.push({id:'VOLLEY_SHOT',score:2.8,reason:'volley_finish',meta:{dGoal,deliveryMode:delivery,incomingKind:m.ball.kind}});}
        else candidates.push({id:'DIRECT_SHOT',score:3.0,reason:'direct_finish',meta:{dGoal,deliveryMode:delivery,incomingKind:m.ball.kind}});
      }
      const nameById=id=>playerById(m,id)?.name||id||null;
      return{kind:'RECEIVING',playerId:owner.id,team:owner.team,role:owner.role,slot:owner.slot,time:m.time,localX:local.x,localY:local.y,pressure,space,distanceToBall:distance,eta,deliveryMode:delivery,incomingKind:m.ball.kind,ballZ:m.ball.z||0,dGoal,candidates:candidates.map(c=>({...c,targetId:c.meta?.targetId||null,targetName:nameById(c.meta?.targetId)})),_frame:{owner,pressure,space,eta,deliveryMode:delivery,incomingKind:m.ball.kind}};
    }
  }
'''
rep(CORE,"  if(m.ball.mode==='CONTROLLED'&&m.ball.ownerId===owner.id){",receiving_inspect+"  if(m.ball.mode==='CONTROLLED'&&m.ball.ownerId===owner.id){",'insert receiving inspect state')

receiving_apply=r'''  if(frame&&frame.kind==='RECEIVING'&&frame._frame){
    const same=frame.candidates.filter(x=>x.id===candidateId);let c=null;const frozenTarget=frozenCandidate?(frozenCandidate.targetId||frozenCandidate.meta?.targetId||null):null,frozenMatches=!!(frozenCandidate&&frozenCandidate.id===candidateId&&frozenTarget===(targetId||null));
    if(frozenMatches)c=frozenCandidate;else if(targetId!=null)c=same.find(x=>x.targetId===targetId||x.meta?.targetId===targetId)||null;else c=same.find(x=>(x.targetId||x.meta?.targetId)==null)||same[0]||null;
    if(!c)return{ok:false,reason:targetId!=null?'CHOICE_TARGET_NOT_AVAILABLE':'CANDIDATE_NOT_AVAILABLE',requestedTargetId:targetId||null};
    const resolvedTargetId=c.meta?.targetId||c.targetId||null;if(resolvedTargetId){const t=playerById(m,resolvedTargetId);if(!t||t.team!==owner.team||t.id===owner.id)return{ok:false,reason:'FROZEN_CHOICE_TARGET_PHYSICALLY_INVALID',requestedTargetId:resolvedTargetId};}
    m.protagonistIncomingChoice={playerId:owner.id,choice:c.id,targetId:resolvedTargetId,armedAt:m.time,futureOutcomePrecomputed:false};m.userChoiceLog=m.userChoiceLog||[];m.userChoiceLog.push({at:Number(m.time.toFixed(3)),playerId:owner.id,team:owner.team,role:owner.role,choice:c.id,requestedTargetId:targetId||null,targetId:resolvedTargetId,inputSource,result:'ARMED_FOR_PHYSICAL_CONTACT',futureOutcomePrecomputed:false});event(m,'USER_CHOICE',`${owner.id}: ${c.id}${resolvedTargetId?` -> ${resolvedTargetId}`:''}`);return{ok:true,kind:'RECEIVING',choice:c.id,requestedTargetId:targetId||null,targetId:resolvedTargetId,inputSource,action:{type:'RECEIVE_CONTACT',kind:c.id,reason:'USER_INCOMING_CHOICE'},intentUntil:null,intentProtected:true,futureOutcomePrecomputed:false};
  }
'''
rep(CORE,"  const frame=inspectChoiceState(m,playerId);if(!frame||frame.kind!=='ON_BALL'||!frame._frame)return{ok:false,reason:'NO_ON_BALL_CHOICE_STATE'};",
"  const frame=inspectChoiceState(m,playerId);const owner=playerById(m,playerId);\n"+receiving_apply+"  if(!frame||frame.kind!=='ON_BALL'||!frame._frame)return{ok:false,reason:'NO_ON_BALL_CHOICE_STATE'};",
'allow receiving choice application')
# The ON_BALL branch already declares owner from frame; use assignment instead of a second const.
rep(CORE,"  const owner=frame._frame.owner,same=frame.candidates.filter(x=>x.id===candidateId);let c=null;","  const onBallOwner=frame._frame.owner,same=frame.candidates.filter(x=>x.id===candidateId);let c=null;",'rename onball owner')
# Only within applyChoiceCandidate's remaining body, references must use onBallOwner. Narrow substring until choiceStateBridge.
s=read(CORE); a=s.index("function applyChoiceCandidate"); b=s.index("function choiceStateBridge",a); chunk=s[a:b]; chunk=chunk.replace("owner.team","onBallOwner.team").replace("owner.id","onBallOwner.id").replace("owner.pendingShot","onBallOwner.pendingShot").replace("owner.faceTargetAngle","onBallOwner.faceTargetAngle").replace("owner.lockTargetUntil","onBallOwner.lockTargetUntil").replace("owner.action","onBallOwner.action").replace("owner.tacticalTask","onBallOwner.tacticalTask").replace("applyResolvedOwnerAction(m,owner,action)","applyResolvedOwnerAction(m,onBallOwner,action)").replace("candidateToAction(m,owner,c,frame._frame)","candidateToAction(m,onBallOwner,c,frame._frame)").replace("Number(owner.takeOnState?.resolveAt||0)","Number(onBallOwner.takeOnState?.resolveAt||0)").replace("owner.nextThink","onBallOwner.nextThink")
s=s[:a]+chunk+s[b:];write(CORE,s)

# Free-kick wall recovery identity survives restart clear.
rep(CORE,"    event(m,r.kind==='CORNER'?'CORNER_KICK':r.kind==='OFFSIDE'?'OFFSIDE_RESTART':'FREE_KICK_TAKEN',`${subjectName(kicker.name)} ${r.kind==='CORNER'?'뒤로 물러난 뒤 도움닫기해 코너킥 크로스를 올립니다.':r.kind==='OFFSIDE'?'오프사이드 지점에서 동료들이 자리를 잡은 뒤 프리킥으로 재개합니다.':'정지된 공 앞에서 준비한 뒤 경기를 재개합니다.'}`);\n    m.phase='OPEN_PLAY';m.restart=null;m.nextShape=m.time+.12;kicker.nextThink=m.time+.75;return true;",
"    event(m,r.kind==='CORNER'?'CORNER_KICK':r.kind==='OFFSIDE'?'OFFSIDE_RESTART':'FREE_KICK_TAKEN',`${subjectName(kicker.name)} ${r.kind==='CORNER'?'뒤로 물러난 뒤 도움닫기해 코너킥 크로스를 올립니다.':r.kind==='OFFSIDE'?'오프사이드 지점에서 동료들이 자리를 잡은 뒤 프리킥으로 재개합니다.':'정지된 공 앞에서 준비한 뒤 경기를 재개합니다.'}`);\n    if(r.kind==='FREE_KICK'){const wallIds=Object.entries(r.setup?.targets||{}).filter(([,v])=>v?.task==='FREE_KICK_WALL').map(([id])=>id);m.restartRecovery={kind:'FREE_KICK',defendingTeam:other(r.team),wallIds,startedAt:m.time,until:m.time+2.25};}\n    m.phase='OPEN_PLAY';m.restart=null;m.nextShape=m.time+.12;kicker.nextThink=m.time+.75;return true;",
'preserve free kick wall recovery')

# -----------------------------------------------------------------------------
# 2) Controller: receiving choices, physical CARRY floor, suppress one-button checkpoints.
# -----------------------------------------------------------------------------
rep(PC,
"function family(id){if(id==='SHOT')return'슈팅';if(['CARRY','TAKE_ON'].includes(id))return'돌파';if(['EARLY_CROSS','DEEP_CROSS','CUTBACK'].includes(id))return'크로스';if(['THROUGH_PASS','PROGRESSIVE_PASS','AVAILABLE_PASS','SWITCH_PASS','SAFE_PASS','RECYCLE','SHORT_DISTRIBUTION','LONG_DISTRIBUTION'].includes(id))return'패스';if(['TACKLE','DELAY','BLOCK_LANE'].includes(id))return'수비';return'볼 유지';}",
"function family(id){if(['SHOT','DIRECT_SHOT','VOLLEY_SHOT','HEADER_SHOT'].includes(id))return'슈팅';if(['CARRY','TAKE_ON'].includes(id))return'돌파';if(['DIRECTIONAL_TOUCH','SECURE_TOUCH'].includes(id))return'리시브';if(['EARLY_CROSS','DEEP_CROSS','CUTBACK'].includes(id))return'크로스';if(['THROUGH_PASS','PROGRESSIVE_PASS','AVAILABLE_PASS','SWITCH_PASS','SAFE_PASS','RECYCLE','SHORT_DISTRIBUTION','LONG_DISTRIBUTION','ONE_TOUCH_PASS','HEADER_PASS'].includes(id))return'패스';if(['TACKLE','DELAY','BLOCK_LANE'].includes(id))return'수비';return'볼 유지';}",
'controller family ids')

rep(PC,"return({SHOT:shotLabel,CARRY:'공간 전진'",
"return({SHOT:shotLabel,DIRECT_SHOT:'다이렉트 슛',VOLLEY_SHOT:'발리 슛',HEADER_SHOT:'헤딩 슛',DIRECTIONAL_TOUCH:'받으며 전진',SECURE_TOUCH:'안전하게 트래핑',ONE_TOUCH_PASS:'원터치 패스',HEADER_PASS:'헤딩 패스',CARRY:'공간 전진'",
'controller labels')

# Receiving tooltips before generic HOLD branch.
rep(PC,"  else if(c.id==='HOLD'){intent='몸으로 공을 보호하며 동료 움직임을 기다립니다.';related='힘, 밸런스, 볼 컨트롤';gain='지원이 올 시간을 벌 수 있음';loss='압박이 강하면 갇히거나 탈취당할 수 있음';}",
"  else if(c.id==='DIRECTIONAL_TOUCH'){intent='공이 오기 전에 몸을 열고 첫 터치를 다음 진행 방향으로 둡니다.';related='퍼스트 터치, 민첩성, 판단';gain='속도를 크게 죽이지 않고 다음 공간으로 이어갈 수 있음';loss='터치가 길면 압박 수비에게 공을 내줄 수 있음';}\n  else if(c.id==='SECURE_TOUCH'){intent='진행 속도를 줄이고 공을 확실히 소유합니다.';related='볼 컨트롤, 밸런스';gain='어려운 공을 안정적으로 소유할 수 있음';loss='공격 템포가 느려지고 압박이 붙을 수 있음';}\n  else if(c.id==='ONE_TOUCH_PASS'||c.id==='HEADER_PASS'){intent=`공을 멈추지 않고 동료${target}에게 바로 연결합니다.`;related='퍼스트 터치, 패스, 시야';gain='압박이 붙기 전에 공격 템포를 유지할 수 있음';loss='정확도가 떨어지면 곧바로 소유권을 잃을 수 있음';}\n  else if(['DIRECT_SHOT','VOLLEY_SHOT','HEADER_SHOT'].includes(c.id)){intent='공을 따로 잡지 않고 도착하는 공을 바로 슈팅으로 연결합니다.';related='골 결정력, 퍼스트 터치, 헤딩/기술';gain='수비가 정비되기 전에 빠르게 마무리할 수 있음';loss='트래핑 후 슈팅보다 난도가 높아 정확도가 떨어질 수 있음';}\n  else if(c.id==='HOLD'){intent='몸으로 공을 보호하며 동료 움직임을 기다립니다.';related='힘, 밸런스, 볼 컨트롤';gain='지원이 올 시간을 벌 수 있음';loss='압박이 강하면 갇히거나 탈취당할 수 있음';}",
'receiving tooltips')

receiving_options=r'''
function receivingOptions(frame){
  return(frame.candidates||[]).map(c=>{const row={id:c.id,targetId:c.targetId||null,targetName:c.targetName||null,family:family(c.id),label:labelFor(c),meta:c.meta?deep(c.meta):null};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;return row;});
}
'''
rep(PC,"function defensiveOptions(frame){",receiving_options+"function defensiveOptions(frame){",'insert receiving options')
rep(PC,"function inspect(s){const f=C().inspect(s.m,s.heroPlayerId);if(!f)return null;const importance=f.kind==='ON_BALL'?onBallImportance(f):f.kind==='DEFENDING'?defendingImportance(f):0,options=f.kind==='ON_BALL'?onBallOptions(f):f.kind==='DEFENDING'?defensiveOptions(f):[];return{frame:f,importance:Number(importance.toFixed(3)),options,futureOutcomePrecomputed:false};}",
"function inspect(s){const f=C().inspect(s.m,s.heroPlayerId);if(!f)return null;const receiveImportance=f.kind==='RECEIVING'?clamp(.30+(f.localX||0)/105*.30+((f.dGoal||99)<=25?.18:0),0,1):0,importance=f.kind==='ON_BALL'?onBallImportance(f):f.kind==='DEFENDING'?defendingImportance(f):receiveImportance,options=f.kind==='ON_BALL'?onBallOptions(f):f.kind==='DEFENDING'?defensiveOptions(f):f.kind==='RECEIVING'?receivingOptions(f):[];return{frame:f,importance:Number(importance.toFixed(3)),options,futureOutcomePrecomputed:false};}",
'controller inspect receiving')

# Physical CARRY floor independent of NPC ranking.
carry_floor=r'''  const physicalCarry=ranked.find(c=>c.id==='CARRY'),carryOpen=physicalCarry&&frame.localX<94&&frame.space>=4.0&&frame.pressure>=1.35&&!frame.context?.deepEntryRestricted&&!(takeOn&&(takeOn.meta?.defenderDistance??99)<=1.75);
  if(carryOpen&&!out.some(o=>o.id==='CARRY')){
    if(out.length>=6){const ix=out.findIndex(o=>o.id==='HOLD'||o.id==='RECYCLE'||o.id==='AVAILABLE_PASS');if(ix>=0)out.splice(ix,1);}
    if(out.length<6){const row={id:'CARRY',targetId:null,targetName:null,family:'돌파',label:'공간 전진',meta:{physicalAvailability:true,space:frame.space,pressure:frame.pressure}};row.hint=tooltipFor({...physicalCarry,meta:{...(physicalCarry.meta||{}),clearRunway:frame.space>=6}},frame);row.tooltip=row.hint;out.push(row);}
  }
'''
rep(PC,"  if(ranked.some(c=>c.id==='HOLD')&&!out.some(c=>c.id==='HOLD')&&out.length<6){const c=ranked.find(x=>x.id==='HOLD'),row={id:'HOLD',targetId:null,targetName:null,family:'볼 유지',label:'볼 지키기'};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;out.push(row);}\n  return out;",
"  if(ranked.some(c=>c.id==='HOLD')&&!out.some(c=>c.id==='HOLD')&&out.length<6){const c=ranked.find(x=>x.id==='HOLD'),row={id:'HOLD',targetId:null,targetName:null,family:'볼 유지',label:'볼 지키기'};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;out.push(row);}\n"+carry_floor+"  return out;",
'physical carry visibility floor')

# No meaningless one-button checkpoint. Continue live play until a second real option or episode end.
rep(PC,"  updateEpisodeState(s);const def=modeDef(s);if(s.pending||s.resultTracker||def.presentation==='SKIP'||s.m.completed||s.m.restart)return null;const q=inspect(s);if(!q||!q.options.length)return null;",
"  updateEpisodeState(s);const def=modeDef(s);if(s.pending||s.resultTracker||def.presentation==='SKIP'||s.m.completed||s.m.restart)return null;const q=inspect(s);if(!q||q.options.length<2)return null;",
'suppress single option checkpoint')
# Receiving state is already a real imminent contact; no posture wait is required.
rep(PC,"if(f.kind==='ON_BALL'&&!readyForOnBallPause(s,f,q.importance))return null;if(f.kind==='DEFENDING'&&!readyForDefPause(s,f,q.importance))return null;",
"if(f.kind==='ON_BALL'&&!readyForOnBallPause(s,f,q.importance))return null;if(f.kind==='RECEIVING'&&!gapReady(s,q.importance)&&!s.forceNextChoice)return null;if(f.kind==='DEFENDING'&&!readyForDefPause(s,f,q.importance))return null;",
'receiving pause readiness')
rep(PC,"  if(s.pending.kind==='ON_BALL'&&['SHORT_DISTRIBUTION','LONG_DISTRIBUTION'].includes(opt.id))res=R38.apply(s.m,{playerId:s.heroPlayerId,choice:opt.id,targetId:opt.targetId||null});\n  else if(s.pending.kind==='ON_BALL')res=C().applyCandidate(s.m,s.heroPlayerId,opt.id,opt.targetId||null,inputSource,opt);",
"  if(s.pending.kind==='ON_BALL'&&['SHORT_DISTRIBUTION','LONG_DISTRIBUTION'].includes(opt.id))res=R38.apply(s.m,{playerId:s.heroPlayerId,choice:opt.id,targetId:opt.targetId||null});\n  else if(['ON_BALL','RECEIVING'].includes(s.pending.kind))res=C().applyCandidate(s.m,s.heroPlayerId,opt.id,opt.targetId||null,inputSource,opt);",
'apply receiving through core')
rep(PC,"  if(['CARRY','HOLD'].includes(opt.id)){minimumUntil=intentUntil||now+1.0;deadline=minimumUntil+0.45;}",
"  if(['DIRECTIONAL_TOUCH','SECURE_TOUCH'].includes(opt.id)){minimumUntil=now+.55;deadline=now+2.2;}\n  else if(['CARRY','HOLD'].includes(opt.id)){minimumUntil=intentUntil||now+1.0;deadline=minimumUntil+0.45;}",
'reception result timing')
rep(PC,"  else if(['CARRY','HOLD'].includes(tr.choiceId)){",
"  else if(['DIRECTIONAL_TOUCH','SECURE_TOUCH'].includes(tr.choiceId)){ready=(heroOwnNow&&now>=tr.minimumUntil)||(tr.possessionChangedAt!=null&&ballSettled);}\n  else if(['CARRY','HOLD'].includes(tr.choiceId)){",
'reception result boundary')
# Normalize direct finishing variants onto existing shot result narration/tracking.
rep(PC,"  const familyName=opt.family||family(opt.id),now=s.m.time,intentUntil=Number.isFinite(res?.intentUntil)?Number(res.intentUntil):null;",
"  const familyName=opt.family||family(opt.id),now=s.m.time,intentUntil=Number.isFinite(res?.intentUntil)?Number(res.intentUntil):null,trackId=['DIRECT_SHOT','VOLLEY_SHOT','HEADER_SHOT'].includes(opt.id)?'SHOT':opt.id;",
'shot variant tracking id')
rep(PC,"minimumUntil,deadline,choiceId:opt.id,targetId:opt.targetId||null", "minimumUntil,deadline,choiceId:trackId,originalChoiceId:opt.id,targetId:opt.targetId||null",'use normalized tracking id')

# -----------------------------------------------------------------------------
# 3) Tactical motion: persistent far-side runs, carrier-lane ownership, free-kick wall release.
# -----------------------------------------------------------------------------
far_helper=r'''
function persistentFarSideRunTarget(m,p,wantedX,wantedY){
  const l=worldToLocal(p.team,p.x,p.y),enter=p.tacticalTask!=='FAR_SIDE_RUN'||!Number.isFinite(p.farSideRunUntil)||m.time>=p.farSideRunUntil;
  if(enter){p.farSideRunUntil=m.time+1.85;p.farSideRunX=releaseForwardLocal(m,p,Math.max(wantedX,l.x+5.0));p.farSideRunY=clamp(wantedY,6,62);}
  else{p.farSideRunX=Math.max(p.farSideRunX||wantedX,releaseForwardLocal(m,p,Math.max(wantedX,l.x+3.2)));}
  return{lx:clamp(p.farSideRunX,5,96.5),ly:clamp(p.farSideRunY,6,62),task:'FAR_SIDE_RUN',sprint:true};
}
'''
rep(TACT,"function applyTarget(p,lx,ly,action,sprint=false,m=null){",far_helper+"function applyTarget(p,lx,ly,action,sprint=false,m=null){",'insert persistent far run helper')
rep(TACT,"      const x=safeForwardLocal(m,p,clamp(progress+8,82,91.5)),y=34+sg*16.0;\n      return{lx:x,ly:y,task:'FAR_SIDE_RUN',sprint:true};",
"      const x=clamp(progress+8,82,91.5),y=34+sg*16.0;\n      return persistentFarSideRunTarget(m,p,x,y);",
'persist final-third far-side run')
rep(TACT,"    if(!ss&&progress>48){return{lx:safeForwardLocal(m,p,Math.max(front+5,progress+8)),ly:34+sg*(18.5*pr.wingerWidth),task:'FAR_SIDE_RUN',sprint:true};}",
"    if(!ss&&progress>48){return persistentFarSideRunTarget(m,p,Math.max(front+5,progress+8),34+sg*(18.5*pr.wingerWidth));}",
'persist progression far-side run')

lane_helpers=r'''
function enforceAttackingCarrierLane(m,team){
  if(m.ball.mode!=='CONTROLLED')return;const owner=playerById(m,m.ball.ownerId);if(!owner||owner.team!==team||!['CM','ST'].includes(owner.role))return;const ol=worldToLocal(team,owner.x,owner.y);if(ol.x<62)return;
  const st=teamPlayers(m,team).find(p=>p.slot==='ST');if(!st||st.id===owner.id)return;const sl=worldToLocal(team,st.x,st.y),otl=worldToLocal(team,owner.tx,owner.ty),seg=segmentDistanceLocal(ol,otl,sl);
  if(seg>3.2&&Math.hypot(sl.x-ol.x,sl.y-ol.y)>4.3)return;const sign=(sl.y>=ol.y?1:-1)||(st.id<owner.id?-1:1),newY=clamp(ol.y+sign*6.0,18,50),newX=safeForwardLocal(m,st,Math.max(sl.x+3.2,ol.x+4.0)),w=localToWorld(team,newX,newY);st.tx=w.x;st.ty=w.y;st.action=st.tacticalTask='ST_CLEAR_CARRIER_LANE';st.sprint=true;m.stats.attackingLaneSeparations=(m.stats.attackingLaneSeparations||0)+1;
}
function segmentDistanceLocal(a,b,p){const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y,c=vx*vx+vy*vy,t=c?clamp((wx*vx+wy*vy)/c,0,1):0;return Math.hypot(p.x-(a.x+vx*t),p.y-(a.y+vy*t));}
function enforceRestartWallRecovery(m,team){
  const r=m.restartRecovery;if(!r||r.kind!=='FREE_KICK'||r.defendingTeam!==team||m.time>=r.until)return;const pr=profile(m,team),ball=worldToLocal(team,m.ball.x,m.ball.y);
  for(const id of r.wallIds||[]){const p=playerById(m,id);if(!p||p.team!==team)continue;const base=defendingBlockAnchors(pr,ball.x,ball.y,p.slot,p.role),w=localToWorld(team,base.x,base.y);p.tx=w.x;p.ty=w.y;p.action=p.tacticalTask='SET_PIECE_RECOVERY';p.sprint=true;}
}
'''
rep(TACT,"function targetSeparation(m){",lane_helpers+"function targetSeparation(m){",'insert attacking/restart lane helpers')
rep(TACT,"  assignAttack(m,poss,ctx);separateRecoveringMidfieldFromStriker(m,poss);const defTeam=other(poss);assignDefence(m,defTeam,ctx);enforceDefensiveLayering",
"  assignAttack(m,poss,ctx);separateRecoveringMidfieldFromStriker(m,poss);enforceAttackingCarrierLane(m,poss);const defTeam=other(poss);assignDefence(m,defTeam,ctx);enforceRestartWallRecovery(m,defTeam);enforceDefensiveLayering",
'call attacking lane and wall recovery')

# -----------------------------------------------------------------------------
# 4) Hybrid scoring: promote non-hero shots BEFORE outcome so goals/concessions are symmetric.
# -----------------------------------------------------------------------------
important_window=r'''
function makeImportantWindow(session,sourceEvent,reason,focusPlayerId,team){const s=session.state,id=`IW${String((s.counters.importantWindows||0)+1).padStart(4,'0')}`;s.counters.importantWindows=(s.counters.importantWindows||0)+1;return{id,type:'IMPORTANT_2D_WINDOW',sceneId:id,atSecond:s.second,sourceEventId:sourceEvent.id,reason,focusPlayerId,focusTeam:team,heroPlayerId:heroId(session),heroRole:session.opts.heroRole||'CM',heroTeam:session.opts.heroTeam||'HOME',stateSnapshot:{second:s.second,score:{...s.score},possession:team,zone:s.zone,phase:s.phase,danger:s.danger,ball:{...s.ball,team,ownerId:focusPlayerId},structure:deep(s.structure)},preContext:causalContext(s,8),futureOutcomePrecomputed:false,choicePrecomputed:false};}
'''
rep(HYB,"function makeFinalWindow(session){",important_window+"function makeFinalWindow(session){",'important window constructor')

shot_repl=r'''if(s.ball.progress>.84&&nextRandom(session)<.04+s.danger*.07){const q=clamp(.2+s.danger*.62+(nextRandom(session)-.5)*.22,.05,.95),priorOwner=s.ball.ownerId,shooter=pickActor(session,team,s,'SHOT');if(shooter===heroId(session)){s.ball.ownerId=priorOwner;const trigger={id:`HERO-FINISH-${String((s.counters.heroFinishingWindows||0)+1).padStart(4,'0')}`,t:s.second,kind:'HERO_FINISHING_WINDOW'};s.counters.heroFinishingWindows=(s.counters.heroFinishingWindows||0)+1;s.danger=Math.max(s.danger,q);return promoteFromStepStart(session,prePromotion,trigger,'ATTACKING_INVOLVEMENT');}s.ball.ownerId=shooter;s.danger=Math.max(s.danger,q);const trigger={id:`IMPORTANT-SHOT-${String((s.counters.importantShotWindows||0)+1).padStart(4,'0')}`,t:s.second,kind:'NON_HERO_SHOT_WINDOW',detail:{actorId:shooter,actorRole:roleOf(shooter),quality:q,team}};s.counters.importantShotWindows=(s.counters.importantShotWindows||0)+1;return makeImportantWindow(session,trigger,'NON_HERO_SHOT',shooter,team);}'''
sub(HYB,r"if\(s\.ball\.progress>\.84&&nextRandom\(session\)<\.04\+s\.danger\*\.07\)\{.*?\}\n return null;\}",shot_repl+"\n return null;}",'replace low-res shot outcome with pre-outcome 2D promotion')
rep(HYB,"!['PROTAGONIST_2D_WINDOW','SET_PIECE_2D_WINDOW','FINAL_2D_WINDOW'].includes(session.boundary?.type)","!['PROTAGONIST_2D_WINDOW','SET_PIECE_2D_WINDOW','IMPORTANT_2D_WINDOW','FINAL_2D_WINDOW'].includes(session.boundary?.type)",'allow important handback')

# -----------------------------------------------------------------------------
# 5) Scene authority + UI for non-hero important windows and RECEIVING checkpoints.
# -----------------------------------------------------------------------------
rep(AUTH,"function tryHeroOwnerCheckpoint(P,state){const q=P.inspect(state);if(!q||q.frame?.kind!=='ON_BALL'||!q.options?.length)return false;",
"function tryHeroOwnerCheckpoint(P,state){const q=P.inspect(state);if(!q||!['ON_BALL','RECEIVING'].includes(q.frame?.kind)||!q.options?.length)return false;",
'authority receiving checkpoint')
rep(AUTH,"if(role==='ST')return kind==='ON_BALL'&&q.importance>=.16;","if(role==='ST')return['ON_BALL','RECEIVING'].includes(kind)&&q.importance>=.16;",'authority ST receiving relevance')
rep(AUTH,"if(role==='CM')return(kind==='ON_BALL'&&q.importance>=.14)||(kind==='DEFENDING'&&boundary.reason==='DEFENSIVE_TRANSITION'&&q.importance>=.22);","if(role==='CM')return(['ON_BALL','RECEIVING'].includes(kind)&&q.importance>=.14)||(kind==='DEFENDING'&&boundary.reason==='DEFENSIVE_TRANSITION'&&q.importance>=.22);",'authority CM receiving relevance')

important_runner=r'''
function runImportantWindow(boundary,opts={}){const env=seedMatch(boundary,{...opts,explicitHeroChoiceRequired:true}),{E,P,state}=env,frames=[deep(E.snapshot(state.m))],start=state.m.time,duration=clamp(Number(opts.durationSeconds)||10,6,14);state.mode='FULL_SKIP';let guard=0,shotAt=null,terminalAt=null;
 while(!state.m.completed&&!state.pending&&state.m.time<start+duration-.001&&guard++<2600){if(tryHeroOwnerCheckpoint(P,state))break;P.step(state,.10);frames.push(deep(E.snapshot(state.m)));if(tryHeroOwnerCheckpoint(P,state))break;const ev=(state.m.events||[]).filter(e=>e.t>=start-.001);const shot=[...ev].reverse().find(e=>['SHOT','HEADER_SHOT'].includes(e.type));if(shot&&!shotAt)shotAt=shot.t;const terminal=shot&&[...ev].reverse().find(e=>e.t>=shot.t&&['GOAL','SAVE','CHIP_SAVE','CHIP_PARRY','BLOCK','CORNER','GOAL_KICK'].includes(e.type));if(terminal){terminalAt=terminal.t;if(state.m.time-terminalAt>=.75&&(state.m.ball.mode==='CONTROLLED'||state.m.restart||state.m.phase==='GOAL_CELEBRATION'))break;}if(!shot&&state.m.time>start+6.5&&state.m.ball.mode==='CONTROLLED')break;}
 const snapshot=E.snapshot(state.m),events=(state.m.events||[]).filter(e=>e.t>=start-.001).map(deep),pending=state.pending?deep(state.pending):null,scene=state.currentScene?deep(state.currentScene):null;return{...env,frames,snapshot,actualEvents:events,pending,scene,hadChoice:!!pending,result:null,searchSeconds:Number((snapshot.time-start).toFixed(3)),preSpan:Number((snapshot.time-start).toFixed(3)),futureOutcomePrecomputed:false};}
'''
rep(AUTH,"function runFinalWindow(boundary,opts={}){",important_runner+"function runFinalWindow(boundary,opts={}){",'important window runner')
rep(AUTH,"runSetPieceWindow,runFinalWindow", "runSetPieceWindow,runImportantWindow,runFinalWindow",'export important window runner')

important_ui=r'''  if(r.boundary?.type==='IMPORTANT_2D_WINDOW'){
    opened=A.runImportantWindow(r.boundary,{seed:`${seed()}-${r.boundary.sceneId}-IMPORTANT`,durationSeconds:11});
    if(opened.pending){session=opened.state;selectedStepResults=[];const rep=P.latestReplay(session);phase='SCENE_NOTICE';showSceneNotice(`${periodMinute(session.m.time)} · 중요 장면에서 주인공 선택 상황`,()=>{if(phase==='SCENE_NOTICE')startReplay(rep,'CHOICE','중요 장면 → 선택 직전 실제 경기')});return true}
    const goal=(opened.actualEvents||[]).find(e=>e.type==='GOAL');if(goal){deferredHandback={snapshot:opened.snapshot,hadChoice:false,result:null,actualEvents:opened.actualEvents||[],episodeFrames:opened.frames||[]};deferredHandback.entrySnapshot=deep(opened.entrySnapshot);const frames=causalFramesForEvent(opened.frames,goal.t,8,3.5),who=(goal.team||scoreDeltaTeam(opened.entrySnapshot,opened.snapshot))===(world.opts?.heroTeam||'HOME')?'우리 팀':'상대 팀';$('heroEventLog').innerHTML+=`<div class="major-match-event"><strong>⚽ ${Math.floor(goal.t/60)+1}' · ${who} 득점</strong> · 결과를 미리 정하지 않은 실제 2D 장면</div>`;startReplay(frames,'NOCHOICE_HANDOFF',`${who} 득점 · 실제 원인 장면`);return true}
    const hb={snapshot:opened.snapshot,hadChoice:false,result:null,actualEvents:opened.actualEvents||[],episodeFrames:opened.frames||[]};H.resumeFromHighRes(world,hb);appendHighResNotables(hb.actualEvents);flushHybridNotables();opened=null;activeBoundary=null;beforeHybrid=null;phase='SEARCHING';return true;
  }
'''
rep(UI,"  if(r.boundary?.type==='FINAL_2D_WINDOW'){",important_ui+"  if(r.boundary?.type==='FINAL_2D_WINDOW'){",'UI important 2D boundary')

print('TT-0.51 transform applied')
