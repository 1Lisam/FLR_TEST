(function(root,factory){
  const api=factory((typeof globalThis!=='undefined'&&globalThis.FLRPG_CONTINUOUS_CORE)||((typeof require==='function')?require('./continuous_match_core.js'):null));
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_CHOICE_ACTION_RESOLVER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(E){
'use strict';
const VERSION='STEP37-CHOICE-ACTION-RESOLVER-0.2';
function apply(m,spec={}){
  const B=E.choiceActionBridge(),player=B.playerById(m,spec.playerId);
  if(!player)return{ok:false,reason:'PLAYER_NOT_FOUND'};
  const choice=String(spec.choice||'').toUpperCase(),now=Number(m.time.toFixed(3));
  m.userChoiceLog=m.userChoiceLog||[];
  const log={at:now,playerId:player.id,team:player.team,role:player.role,choice,targetId:spec.targetId||null,futureOutcomePrecomputed:false};
  if(m.ball.mode==='CONTROLLED'&&m.ball.ownerId===player.id){
    const opts=B.passOptions(m,player),byId=id=>opts.find(o=>o.p.id===id),progressive=opts.find(o=>o.block===0&&o.forward>4&&o.open>1.0)||opts.find(o=>o.block===0&&o.open>1.4)||opts[0];
    if(choice==='SHOT'||choice==='LONG_SHOT'){
      player.lastActionAt=m.time;player.lastDecision='SHOT';B.executeShot(m,player,choice==='LONG_SHOT'?'USER_LONG_SHOT':'USER_SHOT');
    }else if(choice==='CARRY'||choice==='DRIBBLE'){
      player.lastActionAt=m.time;B.executeCarry(m,player);player.lastDecision=choice;
      // STEP37 V0.2: this is still the user's action chain. Do not hand the
      // protagonist straight back to owner AI after the first carry, otherwise a
      // newly-created shooting window can fire automatically instead of becoming
      // the next Choice Window. Movement remains live; only the NEXT decision is held.
      player.action='USER_CARRY';player.tacticalTask='USER_CARRY';player.nextThink=m.time+99;
      m.userChoiceControl={playerId:player.id,team:player.team,mode:'CARRY',startedAt:m.time,futureOutcomePrecomputed:false};
      // Keep the defending line roles stable during the committed carry. This does
      // not change STEP35 tactics; it only prevents press/cover ownership from
      // swapping while the user action is being resolved.
      const defTeam=B.other(player.team),cbs=B.teamPlayers(m,defTeam).filter(q=>q.role==='CB').sort((a,b)=>B.dist(a,player)-B.dist(b,player));
      if(cbs.length>=2){m._lastTacticalPossession=m.possession;m._defenceRoleLocks=m._defenceRoleLocks||{};m._defenceRoleLocks[defTeam]={pressId:cbs[0].id,coverId:cbs[1].id,until:m.time+1.8};}
    }else if(choice==='HOLD'){
      player.action='SHIELD_SCAN';player.tacticalTask='SHIELD_SCAN';player.sprint=false;player.nextThink=m.time+0.62;player.lockTargetUntil=0;player.lastDecision='HOLD';
    }else if(choice==='PASS'||choice==='THROUGH'){
      const op=byId(spec.targetId)||progressive;if(!op)return finish(m,log,false,'NO_PASS_TARGET');
      const kind=choice==='THROUGH'?'THROUGH':(op.d>31?'LONG_PASS':'PASS');player.lastActionAt=m.time;player.lastDecision=choice;B.executePass(m,player,op.p,kind,op);log.targetId=op.p.id;
    }else if(choice==='SHORT_DISTRIBUTION'){
      const op=byId(spec.targetId)||opts.find(o=>['CB','FB','CM'].includes(o.p.role)&&o.block===0&&o.d<32)||opts[0];if(!op)return finish(m,log,false,'NO_SHORT_TARGET');
      player.lastActionAt=m.time;player.lastDecision=choice;B.executePass(m,player,op.p,op.d>30?'LONG_PASS':'PASS',op);log.targetId=op.p.id;
    }else if(choice==='LONG_DISTRIBUTION'){
      const target=B.playerById(m,spec.targetId)||B.teamPlayers(m,player.team).find(p=>p.role==='ST')||B.teamPlayers(m,player.team).find(p=>p.role==='WF');if(!target)return finish(m,log,false,'NO_LONG_TARGET');
      const op=byId(target.id)||{p:target,d:B.dist(player,target),block:B.laneBlockers(m,player,target,B.other(player.team)).length,open:B.nearestOppDistance(m,target),forward:B.dir(player.team)*(target.x-player.x),running:false,lead:false,leadForward:0};player.lastActionAt=m.time;player.lastDecision=choice;B.executePass(m,player,target,'LONG_PASS',op);log.targetId=target.id;
    }else return finish(m,log,false,'UNSUPPORTED_ON_BALL_CHOICE');
    if(choice!=='CARRY'&&choice!=='DRIBBLE')m.userChoiceControl=null;
    return finish(m,log,true,'APPLIED','ON_BALL');
  }
  const owner=B.playerById(m,m.ball.ownerId);
  if(owner&&owner.team!==player.team&&m.ball.mode==='CONTROLLED'){
    const d=B.dist(player,owner),goal={x:B.ownGoalX(player.team),y:34};
    if(choice==='TACKLE'){
      m.stats.challenges++;m.lastChallengeAt=m.time;player.nextChallengeAt=m.time+2.4;const rel=Math.hypot(player.vx-owner.vx,player.vy-owner.vy),chance=B.clamp(0.28+(1.55-d)*0.22+rel*0.006+(d<1.05?0.08:0),0.16,0.58),roll=m.r();
      if(roll<chance){B.setControlled(m,player,false);m.stats.turnovers++;m.stats.tacklesWon++;m.transitionUntil=m.time+2.2;player.nextThink=m.time+0.45;B.event(m,'TACKLE',`${player.name}이 사용자 선택 태클로 공을 빼앗았습니다.`);log.result='TACKLE_WON';}
      else if(roll<chance+0.10&&m.time-m.lastFoulAt>8){m.lastFoulAt=m.time;m.stats.fouls++;m.stats.freeKicks++;B.event(m,'FOUL',`${player.name}의 사용자 선택 태클이 파울이 됐습니다.`);B.startDeadRestart(m,'FREE_KICK',owner.team,owner.x,owner.y);log.result='FOUL';}
      else{const n=B.norm(player.x-owner.x,player.y-owner.y);B.setLoose(m,m.ball.x,m.ball.y,-n.x*(2.5+m.r()*2.5),-n.y*(2.5+m.r()*2.5),owner.team,owner.id);m.stats.looseBalls++;B.event(m,'LOOSE',`${player.name}의 태클 경합으로 공이 흘렀습니다.`);log.result='TACKLE_LOOSE';}
    }else if(choice==='DELAY'){
      const n=B.norm(goal.x-owner.x,goal.y-owner.y),hold=1.65;player.tx=B.clamp(owner.x+n.x*hold,1,104);player.ty=B.clamp(owner.y+n.y*hold,1,67);player.action='USER_DELAY';player.tacticalTask='CONTAIN';player.sprint=false;player.lockTargetUntil=m.time+1.45;player.nextChallengeAt=m.time+1.55;player.duelContainUntil=Math.max(player.duelContainUntil||0,m.time+1.55);player.pressCommitUntil=0;log.result='DELAY_SET';
      // The user's intent is 'delay', not 'delay for 0.7 s and then auto-engage'.
      // Reserve this CB as the single containing defender and the partner CB as cover
      // for the intent window. The existing STEP35 tactical module remains unchanged.
      const cbs=B.teamPlayers(m,player.team).filter(q=>q.role==='CB'&&q.id!==player.id).sort((a,b)=>B.dist(a,owner)-B.dist(b,owner));
      m._lastTacticalPossession=m.possession;m._defenceRoleLocks=m._defenceRoleLocks||{};m._defenceRoleLocks[player.team]={pressId:player.id,coverId:cbs[0]?.id||null,until:m.time+1.55};
    }else if(choice==='BLOCK_LANE'){
      const mates=B.teamPlayers(m,owner.team).filter(p=>p.id!==owner.id&&p.role!=='GK').map(p=>({p,forward:B.dir(owner.team)*(p.x-owner.x),d:B.dist(owner,p)})).filter(o=>o.forward>1).sort((a,b)=>b.forward-a.forward||a.d-b.d),target=B.playerById(m,spec.targetId)||mates[0]?.p;if(!target)return finish(m,log,false,'NO_LANE_TARGET');
      const t=.43;player.tx=B.clamp(owner.x+(target.x-owner.x)*t,1,104);player.ty=B.clamp(owner.y+(target.y-owner.y)*t,1,67);player.action='USER_BLOCK_LANE';player.tacticalTask='BLOCK_LANE';player.sprint=B.dist(player,{x:player.tx,y:player.ty})>2;player.lockTargetUntil=m.time+1.25;player.nextChallengeAt=m.time+1.25;player.markTargetId=target.id;log.targetId=target.id;log.result='BLOCK_LANE_SET';
    }else return finish(m,log,false,'UNSUPPORTED_DEFENSIVE_CHOICE');
    return finish(m,log,true,log.result||'APPLIED','DEFENSIVE');
  }
  return finish(m,log,false,'NO_VALID_CHOICE_STATE');
}
function finish(m,log,ok,result,kind=null){log.result=result;m.userChoiceLog.push(log);if(ok)m.userChoiceLog&&m.userChoiceLog.length&&E.choiceActionBridge().event(m,'USER_CHOICE',`${log.playerId}: ${log.choice}`);return ok?{ok:true,kind,choice:log.choice,targetId:log.targetId,result}:{ok:false,reason:result};}
return{VERSION,apply};
});
