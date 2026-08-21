#!/usr/bin/env python3
import sys
from pathlib import Path
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=root/'runtime/continuous_match_core.js'
s=p.read_text(encoding='utf-8')
needle="""function captureLooseOrFlight(m){
"""
helper="""function tryNpcOneTouchPass(m,p,flightKind,sourceId,passTeam,incomingSpeed){
  // NPC-only live first-touch action. This runs at the actual contact frame, after
  // miscontrol/receive-contest resolution and before normal FIRST_TOUCH_FLOW control.
  // The protagonist is never eligible: their incoming touch remains an explicit user choice.
  if(!p||p.role==='GK'||p.id===m.protagonistControllerId||p.team!==passTeam)return false;
  if(!['PASS','LONG_PASS','THROUGH','CUTBACK'].includes(flightKind)||(m.ball.z||0)>.72||incomingSpeed>24.5)return false;
  if((m.npcOneTouchChainUntil||0)>m.time)return false;
  const skill=(abilityValue(m,p,'short_pass')+abilityValue(m,p,'vision')+abilityValue(m,p,'ball_control'))/3,pressure=nearestOppDistance(m,p);
  if(skill<44)return false;
  const opts=passOptions(m,p,false).filter(o=>o.p.id!==sourceId&&o.block===0&&o.d>=3&&o.d<=29&&o.open>=1.20&&o.forward>=-4.5);
  if(!opts.length)return false;
  const targetOpt=opts.sort((a,b)=>(b.forward-a.forward)+(b.open-a.open)*.18+(a.d-b.d)*.025)[0];
  const chance=clamp(.075+(skill-50)*.0022+(pressure<2.0?.035:0)+(p.role==='CM'?.025:0),.055,.21),roll=(hash32(`${m.seed}|NPC_ONE_TOUCH|${Math.floor(m.time*10)}|${p.id}|${sourceId}`)%10000)/10000;
  if(roll>=chance)return false;
  recordInboundCompletion(m,p,flightKind,sourceId,passTeam);p.x=clamp(p.x,1,104);p.y=clamp(p.y,1,67);p.hasBall=false;m.ballOwner=null;m.lastTouchTeam=p.team;m.lastTouchPlayer=p.id;
  executePass(m,p,targetOpt.p,'PASS',{...targetOpt,running:false},'NPC_ONE_TOUCH');p.lastDecision='NPC_ONE_TOUCH_PASS';m.stats.npcOneTouchPasses=(m.stats.npcOneTouchPasses||0)+1;m.npcOneTouchChainUntil=m.time+.72;return true;
}

function captureLooseOrFlight(m){
"""
if s.count(needle)!=1: raise SystemExit(f'capture needle count={s.count(needle)}')
s=s.replace(needle,helper,1)
old="""  if(isShot){if(p.role==='GK'){const strict=!!m.ball.shotOneVOne,clean=!!m.ball.shotClearKeeperChance;if(strict)m.stats.strictOneVOneSaves=(m.stats.strictOneVOneSaves||0)+1;if(clean)m.stats.cleanKeeperChanceSaves=(m.stats.cleanKeeperChanceSaves||0)+1;setControlled(m,p);m.stats.saves++;event(m,'SAVE',`${subjectName(p.name)} 슈팅을 막아냈습니다.`);p.nextThink=m.time+0.75;return;}setLoose(m,m.ball.x,m.ball.y,-m.ball.vx*0.28+(m.r()-0.5)*3,-m.ball.vy*0.28+(m.r()-0.5)*3,p.team,p.id);m.stats.blocks++;m.stats.looseBalls++;event(m,'BLOCK',`${subjectName(p.name)} 슈팅을 몸으로 막았습니다.`);return;}
  const oldTeam=m.possession,sourceId=m.ball.lastTouchPlayer,passTeam=m.ball.lastTouchTeam,deliveryMode=m.ball.deliveryMode||((m.ball.z||0)>0.2?'AERIAL':'GROUND'),incomingVx=m.ball.vx||0,incomingVy=m.ball.vy||0,incomingZ=m.ball.z||0,incomingSpeed=Math.hypot(incomingVx,incomingVy);
"""
new="""  if(isShot){if(p.role==='GK'){const strict=!!m.ball.shotOneVOne,clean=!!m.ball.shotClearKeeperChance;if(strict)m.stats.strictOneVOneSaves=(m.stats.strictOneVOneSaves||0)+1;if(clean)m.stats.cleanKeeperChanceSaves=(m.stats.cleanKeeperChanceSaves||0)+1;setControlled(m,p);m.stats.saves++;event(m,'SAVE',`${subjectName(p.name)} 슈팅을 막아냈습니다.`);p.nextThink=m.time+0.75;return;}setLoose(m,m.ball.x,m.ball.y,-m.ball.vx*0.28+(m.r()-0.5)*3,-m.ball.vy*0.28+(m.r()-0.5)*3,p.team,p.id);m.stats.blocks++;m.stats.looseBalls++;event(m,'BLOCK',`${subjectName(p.name)} 슈팅을 몸으로 막았습니다.`);return;}
  const oldTeam=m.possession,sourceId=m.ball.lastTouchPlayer,passTeam=m.ball.lastTouchTeam,deliveryMode=m.ball.deliveryMode||((m.ball.z||0)>0.2?'AERIAL':'GROUND'),incomingVx=m.ball.vx||0,incomingVy=m.ball.vy||0,incomingZ=m.ball.z||0,incomingSpeed=Math.hypot(incomingVx,incomingVy);
  if(passFlight&&flightKind!=='CROSS'&&tryNpcOneTouchPass(m,p,flightKind,sourceId,passTeam,incomingSpeed))return;
"""
if s.count(old)!=1: raise SystemExit(f'insertion context count={s.count(old)}')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('TT-0.51 NPC one-touch patch applied')
