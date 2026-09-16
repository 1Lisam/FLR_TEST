(function(root,factory){
  const api=factory(
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_CONTINUOUS_CORE)||((typeof require==='function')?require('./continuous_match_core.js'):null),
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_CHOICE_ACTION_RESOLVER)||((typeof require==='function')?require('./choice_action_resolver.js'):null),
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_ATTRIBUTE_MATCH_ADAPTER)||((typeof require==='function')?require('./attribute_match_adapter.js'):null)
  );
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_CHOICE_ACTION_RESOLVER_STEP38=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(E,BASE,A){
'use strict';
const VERSION='STEP38-ABILITY-CHOICE-RESOLVER-0.1';
const B=E.choiceActionBridge();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function relocalX(team,x){return team==='HOME'?x:105-x;}
function record(m,row){m.abilityResolutionLog=m.abilityResolutionLog||[];m.abilityResolutionLog.push({...row,futureOutcomePrecomputed:false});if(m.abilityResolutionLog.length>100)m.abilityResolutionLog.shift();}
function retargetFlight(m,tx,ty){if(m.ball.mode!=='FLIGHT')return;const speed=Math.hypot(m.ball.vx||0,m.ball.vy||0)||18,dx=tx-m.ball.x,dy=ty-m.ball.y,d=Math.hypot(dx,dy)||1;m.ball.vx=dx/d*speed;m.ball.vy=dy/d*speed;m.ball.targetX=tx;m.ball.targetY=ty;}
function tuneShot(m,p,choice){
  if(m.ball.mode!=='FLIGHT'||m.ball.kind!=='SHOT')return;
  const skill=A.composite(m,p.id,choice),gx=p.team==='HOME'?105:0,dGoal=Math.hypot(gx-p.x,34-p.y),long=choice==='LONG_SHOT';
  let onTargetP=(long?0.19:0.25)+(skill-50)*(long?0.0042:0.0048)-Math.max(0,dGoal-(long?18:10))*(long?0.0055:0.0035);
  onTargetP=clamp(onTargetP,long?0.08:0.12,long?0.57:0.72);
  const roll=m.r(),onTarget=roll<onTargetP;let aimY;
  if(onTarget){const sign=m.r()<0.5?-1:1,n=clamp((skill-35)/55,0,1),corner=1.25+n*2.0,jitter=(m.r()-0.5)*(2.4-n*1.45);aimY=clamp(34+sign*corner+jitter,30.72,37.28);}else{const miss=1.0+m.r()*(4.8-clamp((skill-35)/65,0,1)*1.2);aimY=m.r()<0.5?30.66-miss:37.34+miss;}
  const tx=gx+(p.team==='HOME'?1.8:-1.8);retargetFlight(m,tx,aimY);m.ball.onTarget=onTarget;m.ball.shotTargetY=aimY;
  record(m,{at:m.time,playerId:p.id,action:choice,skill:Number(skill.toFixed(2)),test:'SHOT_ACCURACY',onTargetP:Number(onTargetP.toFixed(3)),roll:Number(roll.toFixed(3)),onTarget});
}
function tunePass(m,p,choice){
  if(m.ball.mode!=='FLIGHT'||m.ball.kind==='SHOT')return;
  const skill=A.composite(m,p.id,choice),pressure=B.nearestOppDistance(m,p),long=['THROUGH','LONG_DISTRIBUTION'].includes(choice)||Math.hypot((m.ball.targetX||m.ball.x)-m.ball.originX,(m.ball.targetY||m.ball.y)-m.ball.originY)>28;
  let errP=(long?0.135:0.085)-(skill-50)*0.00215+(pressure<2?0.045:pressure<3?0.018:0);errP=clamp(errP,0.008,long?0.22:0.16);
  const roll=m.r(),miscontrol=roll<errP;m.ball.passMiscontrol=miscontrol;
  const errScale=(100-skill)/100*(long?3.4:1.7);if(errScale>0.05&&m.ball.targetX!=null){const tx=clamp(m.ball.targetX+(m.r()-0.5)*errScale,0,105),ty=clamp(m.ball.targetY+(m.r()-0.5)*errScale*1.6,0,68);retargetFlight(m,tx,ty);}
  record(m,{at:m.time,playerId:p.id,action:choice,skill:Number(skill.toFixed(2)),test:'PASS_EXECUTION',errorP:Number(errP.toFixed(3)),roll:Number(roll.toFixed(3)),miscontrol});
}
function tuneCarry(m,p,choice){
  const skill=A.composite(m,p.id,choice),pressure=B.nearestOppDistance(m,p),l0=relocalX(p.team,p.x),lt=relocalX(p.team,p.tx),planned=Math.max(0,lt-l0),factor=clamp(0.68+(skill-40)*0.009,0.58,1.13),newLocal=clamp(l0+planned*factor,0,105),oldY=p.ty;
  p.tx=p.team==='HOME'?newLocal:105-newLocal;p.ty=clamp(oldY+(m.r()-0.5)*(100-skill)/100*1.9,1,67);
  let lossP=0.10-(skill-50)*0.0016+(pressure<2?0.10:pressure<3.2?0.045:0);lossP=clamp(lossP,0.018,0.25);m._step38CarryChecks=m._step38CarryChecks||[];m._step38CarryChecks.push({playerId:p.id,due:m.time+0.58,lossP,skill,choice,resolved:false});
  record(m,{at:m.time,playerId:p.id,action:choice,skill:Number(skill.toFixed(2)),test:'CARRY_CONTROL',lossP:Number(lossP.toFixed(3)),plannedForward:Number(planned.toFixed(2)),factor:Number(factor.toFixed(3))});
}
function resolveCarryChecks(m){if(!m._step38CarryChecks?.length)return;for(const c of m._step38CarryChecks){if(c.resolved||m.time<c.due)continue;c.resolved=true;const p=B.playerById(m,c.playerId);if(!p||m.ball.mode!=='CONTROLLED'||m.ball.ownerId!==p.id)continue;const roll=m.r(),lost=roll<c.lossP;if(lost){const n=B.norm(B.dir(p.team),m.r()-.5);B.setLoose(m,m.ball.x,m.ball.y,n.x*(2.2+m.r()*1.8),n.y*(2.2+m.r()*1.8),p.team,p.id);m.stats.looseBalls++;m.stats.turnovers++;B.event(m,'CONTROL_ERROR',`${p.name}이 운반 중 공을 길게 건드렸습니다.`);}record(m,{at:m.time,playerId:p.id,action:c.choice,skill:Number(c.skill.toFixed(2)),test:'CARRY_CONTROL_RESOLVE',lossP:Number(c.lossP.toFixed(3)),roll:Number(roll.toFixed(3)),lost});}m._step38CarryChecks=m._step38CarryChecks.filter(c=>!c.resolved||m.time-c.due<1);}
function abilityTackle(m,spec,p,owner){
  const d=B.dist(p,owner),rel=Math.hypot(p.vx-owner.vx,p.vy-owner.vy),def=A.composite(m,p.id,'TACKLE'),att=A.composite(m,owner.id,'CARRY');
  let winP=0.34+(1.55-d)*0.16+rel*0.0035+(def-att)*0.0042;winP=clamp(winP,0.12,0.70);let foulP=0.115-(def-50)*0.00065+(att-def>15?0.018:0);foulP=clamp(foulP,0.045,0.16);const winRoll=m.r(),foulRoll=m.r();m.stats.challenges++;m.lastChallengeAt=m.time;p.nextChallengeAt=m.time+2.4;let result;
  if(winRoll<winP){B.setControlled(m,p,false);m.stats.turnovers++;m.stats.tacklesWon++;m.transitionUntil=m.time+2.2;p.nextThink=m.time+0.45;B.event(m,'TACKLE',`${p.name}이 사용자 선택 태클로 공을 빼앗았습니다.`);result='TACKLE_WON';}
  else if(foulRoll<foulP&&m.time-m.lastFoulAt>8){m.lastFoulAt=m.time;m.stats.fouls++;m.stats.freeKicks++;B.event(m,'FOUL',`${p.name}의 사용자 선택 태클이 파울이 됐습니다.`);B.startDeadRestart(m,'FREE_KICK',owner.team,owner.x,owner.y);result='FOUL';}
  else{const n=B.norm(p.x-owner.x,p.y-owner.y);B.setLoose(m,m.ball.x,m.ball.y,-n.x*(2.5+m.r()*2.5),-n.y*(2.5+m.r()*2.5),owner.team,owner.id);m.stats.looseBalls++;B.event(m,'LOOSE',`${p.name}의 태클 경합으로 공이 흘렀습니다.`);result='TACKLE_LOOSE';}
  m.userChoiceLog=m.userChoiceLog||[];m.userChoiceLog.push({at:Number(m.time.toFixed(3)),playerId:p.id,team:p.team,role:p.role,choice:'TACKLE',targetId:null,result,futureOutcomePrecomputed:false});B.event(m,'USER_CHOICE',`${p.id}: TACKLE`);record(m,{at:m.time,playerId:p.id,opponentId:owner.id,action:'TACKLE',skill:Number(def.toFixed(2)),opponentSkill:Number(att.toFixed(2)),test:'TACKLE_DUEL',winP:Number(winP.toFixed(3)),foulP:Number(foulP.toFixed(3)),winRoll:Number(winRoll.toFixed(3)),foulRoll:Number(foulRoll.toFixed(3)),result});
  return{ok:true,kind:'DEFENSIVE',choice:'TACKLE',targetId:null,result};
}
function apply(m,spec={}){
  const p=B.playerById(m,spec.playerId);if(!p)return{ok:false,reason:'PLAYER_NOT_FOUND'};const choice=String(spec.choice||'').toUpperCase(),owner=B.playerById(m,m.ball.ownerId);
  if(choice==='TACKLE'&&owner&&owner.team!==p.team&&m.ball.mode==='CONTROLLED')return abilityTackle(m,spec,p,owner);
  const res=BASE.apply(m,spec);if(!res.ok)return res;
  if(['SHOT','LONG_SHOT'].includes(choice))tuneShot(m,p,choice);
  else if(['PASS','THROUGH','SHORT_DISTRIBUTION','LONG_DISTRIBUTION'].includes(choice))tunePass(m,p,choice);
  else if(['CARRY','DRIBBLE'].includes(choice))tuneCarry(m,p,choice);
  else if(['DELAY','BLOCK_LANE'].includes(choice)){const skill=A.composite(m,p.id,choice),n=clamp((skill-40)/50,0,1);p.tx=p.x+(p.tx-p.x)*(0.72+n*0.28);p.ty=p.y+(p.ty-p.y)*(0.72+n*0.28);record(m,{at:m.time,playerId:p.id,action:choice,skill:Number(skill.toFixed(2)),test:'DEFENSIVE_POSITIONING'});}
  return{...res,abilityComposite:Number(A.composite(m,p.id,choice).toFixed(2)),relatedAttributes:A.relevant(choice),futureOutcomePrecomputed:false};
}
return{VERSION,apply,resolveCarryChecks};
});
