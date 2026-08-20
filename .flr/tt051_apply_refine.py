from pathlib import Path
import re

p=Path('runtime/continuous_match_core.js')
s=p.read_text(encoding='utf-8')
new=r'''function applyChoiceCandidate(m,playerId,candidateId,targetId=null,inputSource='DIRECT_API',frozenCandidate=null){
  const frame=inspectChoiceState(m,playerId),owner=playerById(m,playerId);
  if(frame&&frame.kind==='RECEIVING'&&frame._frame&&owner){
    const same=frame.candidates.filter(x=>x.id===candidateId);let c=null;
    const frozenTarget=frozenCandidate?(frozenCandidate.targetId||frozenCandidate.meta?.targetId||null):null,frozenMatches=!!(frozenCandidate&&frozenCandidate.id===candidateId&&frozenTarget===(targetId||null));
    if(frozenMatches)c=frozenCandidate;
    else if(targetId!=null)c=same.find(x=>x.targetId===targetId||x.meta?.targetId===targetId)||null;
    else{if(same.length>1&&same.some(x=>(x.targetId||x.meta?.targetId)!=null))return{ok:false,reason:'AMBIGUOUS_CHOICE_TARGET'};c=same[0]||null;}
    if(!c)return{ok:false,reason:targetId!=null?'CHOICE_TARGET_NOT_AVAILABLE':'CANDIDATE_NOT_AVAILABLE',requestedTargetId:targetId||null};
    const resolvedTargetId=c.meta?.targetId||c.targetId||null;
    if(resolvedTargetId){const t=playerById(m,resolvedTargetId);if(!t||t.team!==owner.team||t.id===owner.id)return{ok:false,reason:'FROZEN_CHOICE_TARGET_PHYSICALLY_INVALID',requestedTargetId:resolvedTargetId};}
    m.protagonistIncomingChoice={playerId:owner.id,choice:c.id,targetId:resolvedTargetId,armedAt:m.time,futureOutcomePrecomputed:false};
    m.userChoiceLog=m.userChoiceLog||[];m.userChoiceLog.push({at:Number(m.time.toFixed(3)),playerId:owner.id,team:owner.team,role:owner.role,choice:c.id,requestedTargetId:targetId||null,targetId:resolvedTargetId,inputSource,result:'ARMED_FOR_PHYSICAL_CONTACT',futureOutcomePrecomputed:false});
    event(m,'USER_CHOICE',`${owner.id}: ${c.id}${resolvedTargetId?` -> ${resolvedTargetId}`:''}`);
    return{ok:true,kind:'RECEIVING',choice:c.id,requestedTargetId:targetId||null,targetId:resolvedTargetId,inputSource,action:{type:'RECEIVE_CONTACT',kind:c.id,reason:'USER_INCOMING_CHOICE'},intentUntil:null,intentProtected:true,futureOutcomePrecomputed:false};
  }
  if(!frame||frame.kind!=='ON_BALL'||!frame._frame)return{ok:false,reason:'NO_ON_BALL_CHOICE_STATE'};
  const onBallOwner=frame._frame.owner,same=frame.candidates.filter(x=>x.id===candidateId);let c=null;
  const frozenTarget=frozenCandidate?(frozenCandidate.targetId||frozenCandidate.meta?.targetId||null):null,frozenMatches=!!(frozenCandidate&&frozenCandidate.id===candidateId&&frozenTarget===(targetId||null));
  if(frozenMatches){
    if(targetId!=null){const target=playerById(m,targetId);if(!target||target.team!==onBallOwner.team||target.id===onBallOwner.id)return{ok:false,reason:'FROZEN_CHOICE_TARGET_PHYSICALLY_INVALID',requestedTargetId:targetId};}
    c=frozenCandidate;m.stats.frozenUserChoiceExecutions=(m.stats.frozenUserChoiceExecutions||0)+1;
  }else if(targetId!=null){c=same.find(x=>x.targetId===targetId||x.meta?.targetId===targetId)||null;if(!c)return{ok:false,reason:'CHOICE_TARGET_NOT_AVAILABLE',requestedTargetId:targetId};}
  else{if(same.length>1&&same.some(x=>(x.targetId||x.meta?.targetId)!=null))return{ok:false,reason:'AMBIGUOUS_CHOICE_TARGET'};c=same[0]||null;}
  if(!c)return{ok:false,reason:'CANDIDATE_NOT_AVAILABLE'};
  const action=candidateToAction(m,onBallOwner,c,frame._frame);if(!action)return{ok:false,reason:'CANDIDATE_NOT_EXECUTABLE'};
  if(c.id!=='SHOT'&&onBallOwner.pendingShot){onBallOwner.pendingShot=null;onBallOwner.faceTargetAngle=null;onBallOwner.lockTargetUntil=0;if(onBallOwner.action==='TURNING_SHOT_PREP'){onBallOwner.action='HOLD_BALL';onBallOwner.tacticalTask='HOLD_BALL';}}
  applyResolvedOwnerAction(m,onBallOwner,action);
  let intentUntil=null;
  if(c.id==='CARRY'){
    intentUntil=Math.max(Number(onBallOwner.lockTargetUntil||0),m.time+3.20);onBallOwner.nextThink=intentUntil;
    m.userChoiceControl={playerId:onBallOwner.id,choice:c.id,mode:'CARRY',startedAt:m.time,until:intentUntil,controllerOwned:true,futureOutcomePrecomputed:false};
  }else if(c.id==='HOLD'){
    intentUntil=m.time+2.35;onBallOwner.nextThink=intentUntil;onBallOwner.lockTargetUntil=Math.max(onBallOwner.lockTargetUntil||0,intentUntil);
    m.userChoiceControl={playerId:onBallOwner.id,choice:c.id,mode:'HOLD',startedAt:m.time,until:intentUntil,controllerOwned:true,futureOutcomePrecomputed:false};
  }else if(c.id==='TAKE_ON'){
    intentUntil=Math.max(Number(onBallOwner.lockTargetUntil||0),Number(onBallOwner.takeOnState?.resolveAt||0)+0.55,m.time+1.05);onBallOwner.nextThink=Math.max(onBallOwner.nextThink||0,intentUntil);
    m.userChoiceControl={playerId:onBallOwner.id,choice:c.id,mode:'TAKE_ON',startedAt:m.time,until:intentUntil,controllerOwned:true,futureOutcomePrecomputed:false};
  }else if(c.id==='SHOT'&&onBallOwner.pendingShot){intentUntil=onBallOwner.pendingShot.releaseAt;m.userChoiceControl={playerId:onBallOwner.id,choice:c.id,mode:'SHOT_PREP',startedAt:m.time,until:intentUntil,controllerOwned:true,futureOutcomePrecomputed:false};}
  else m.userChoiceControl=null;
  const resolvedTargetId=c.meta?.targetId||c.targetId||null;
  const directedPassChoices=new Set(['THROUGH_PASS','PROGRESSIVE_PASS','AVAILABLE_PASS','SWITCH_PASS','SAFE_PASS','RECYCLE','EARLY_CROSS','DEEP_CROSS','CUTBACK']);
  if(directedPassChoices.has(c.id)&&resolvedTargetId){m.lastUserDirectedPassTrace={at:Number(m.time.toFixed(3)),sourceId:onBallOwner.id,choiceId:c.id,requestedTargetId:targetId||resolvedTargetId,resolvedTargetId,intendedReceiverId:m.ball.intendedReceiverId||null,firstControllerId:null,outcome:'IN_FLIGHT'};}
  m.userChoiceLog=m.userChoiceLog||[];m.userChoiceLog.push({at:Number(m.time.toFixed(3)),playerId:onBallOwner.id,team:onBallOwner.team,role:onBallOwner.role,choice:c.id,requestedTargetId:targetId||null,targetId:resolvedTargetId,inputSource,result:'APPLIED_CURRENT_STATE',futureOutcomePrecomputed:false});event(m,'USER_CHOICE',`${onBallOwner.id}: ${c.id}${resolvedTargetId?` -> ${resolvedTargetId}`:''}`);
  return{ok:true,kind:'ON_BALL',choice:c.id,requestedTargetId:targetId||null,targetId:resolvedTargetId,inputSource,action:{type:action.type,kind:action.kind||null,reason:action.reason||null},intentUntil,intentProtected:!!intentUntil,futureOutcomePrecomputed:false};
}
'''
out,n=re.subn(r"function applyChoiceCandidate\(m,playerId,candidateId,targetId=null,inputSource='DIRECT_API',frozenCandidate=null\)\{.*?\n\}\nfunction choiceStateBridge",new+"function choiceStateBridge",s,count=1,flags=re.S)
if n!=1: raise SystemExit(f'applyChoiceCandidate refine expected 1 match, got {n}')
p.write_text(out,encoding='utf-8')
print('TT-0.51 applyChoiceCandidate refined')
