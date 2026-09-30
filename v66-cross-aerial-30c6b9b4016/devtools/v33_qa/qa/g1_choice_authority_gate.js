'use strict';
const E=require('../runtime/continuous_match_core.js');
const B=E.choiceStateBridge();
function check(id,pass,detail){return{id,pass:!!pass,detail};}
const out=[];
// Exact-target preservation on a naturally available multi-target pass family.
{
  const m=E.createMatch('G1-EXACT-TARGET',{telemetry:{}}),ownerId=m.ball.ownerId;
  const s=B.inspect(m,ownerId); const safe=s.candidates.filter(c=>c.id==='SAFE_PASS'&&c.targetId);
  out.push(check('G1_ON_BALL_STATE',s.kind==='ON_BALL',{ownerId,kind:s.kind}));
  out.push(check('G1_MULTI_TARGET_FAMILY_EXISTS',safe.length>=2,safe.map(c=>c.targetId)));
  const amb=B.applyCandidate(m,ownerId,'SAFE_PASS',null,'QA');
  out.push(check('G1_AMBIGUOUS_TARGET_REJECTED',safe.length<2||(!amb.ok&&amb.reason==='AMBIGUOUS_CHOICE_TARGET'),amb));
  if(safe.length){
    const wanted=safe[safe.length-1].targetId;
    const r=B.applyCandidate(m,ownerId,'SAFE_PASS',wanted,'QA');
    out.push(check('G1_EXACT_TARGET_APPLIED',r.ok&&r.targetId===wanted,{wanted,result:r}));
    out.push(check('G1_BALL_RECEIVER_MATCHES_SELECTION',m.ball.intendedReceiverId===wanted,{wanted,intended:m.ball.intendedReceiverId}));
    out.push(check('G1_FUTURE_NOT_PRECOMPUTED',r.futureOutcomePrecomputed===false&&m.userChoiceLog.at(-1)?.futureOutcomePrecomputed===false,{result:r,lastLog:m.userChoiceLog.at(-1)}));
    out.push(check('G1_DIRECTED_PASS_TRACE_EXACT',m.lastUserDirectedPassTrace?.requestedTargetId===wanted&&m.lastUserDirectedPassTrace?.resolvedTargetId===wanted,m.lastUserDirectedPassTrace));
  }
}
// A non-shot user choice must cancel any stale automatic pending shot.
{
  const m=E.createMatch('G1-NONSHOT-GUARD',{telemetry:{}}),ownerId=m.ball.ownerId,owner=m.playersById[ownerId];
  owner.pendingShot={releaseAt:m.time+.5}; owner.action='TURNING_SHOT_PREP'; owner.tacticalTask='TURNING_SHOT_PREP';
  const s=B.inspect(m,ownerId),hold=s.candidates.find(c=>c.id==='HOLD');
  const r=hold?B.applyCandidate(m,ownerId,'HOLD',null,'QA'):null;
  out.push(check('G1_NONSHOT_CANCELS_PENDING_SHOT',!!r?.ok&&!owner.pendingShot,{result:r,pendingShot:owner.pendingShot,task:owner.tacticalTask}));
  out.push(check('G1_HOLD_CONTROLLER_OWNERSHIP',m.userChoiceControl?.playerId===ownerId&&m.userChoiceControl?.mode==='HOLD'&&m.userChoiceControl?.controllerOwned===true,m.userChoiceControl));
}
const pass=out.every(x=>x.pass);console.log(JSON.stringify({pass,results:out},null,2));if(!pass)process.exit(1);
