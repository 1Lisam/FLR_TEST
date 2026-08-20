#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()


def replace_one(rel, old, new):
    path = ROOT / rel
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'REPLACE_COUNT_MISMATCH {rel}: expected=1 actual={count}\nOLD={old[:180]!r}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {rel}: {old.splitlines()[0][:96]}')

# Candidate policy: improve the immediate continuation after a genuine through-ball receive,
# without forcing every wide entry to become a shot.
replace_one(
    'runtime/action_candidate_engine.js',
    "const VERSION='STEP78-ACTION-CANDIDATE-1.1-RUN-INTENT';",
    "const VERSION='TT049-CANDIDATE-ACTION-1.2-RUN-DECISION';"
)
replace_one(
    'runtime/action_candidate_engine.js',
    "if(!inBox)s-=role==='CM'?4.2:2.9;if(attackingReceive&&(shot.blockers||0)===0&&shot.dGoal<=26)s+=0.55;if(ctx.recentTeamShot)s-=2.2;",
    "if(!inBox)s-=role==='CM'?4.2:2.9;if(attackingReceive&&(shot.blockers||0)===0&&shot.dGoal<=26)s+=1.25;if(ctx.recentTeamShot)s-=2.2;"
)
replace_one(
    'runtime/action_candidate_engine.js',
    "if(clearRunway)carry+=3.4;if(space>5.2&&pressure>1.6)carry+=0.68;if(role==='WF'&&wide)carry+=0.42;if(inBox)carry+=0.30;if(wide&&x>=80&&x<92&&['WF','FB'].includes(role))carry+=1.35;if(x>94)carry-=2.4;if(frontChain>=2&&['ST','WF'].includes(role))carry+=1.25;if(attackingReceive)carry+=0.85;",
    "if(clearRunway)carry+=3.4;if(space>5.2&&pressure>1.6)carry+=0.68;if(role==='WF'&&wide)carry+=0.42;if(inBox)carry+=0.30;if(wide&&x>=80&&x<92&&['WF','FB'].includes(role))carry+=1.35;if(x>94)carry-=2.4;if(frontChain>=2&&['ST','WF'].includes(role))carry+=1.25;if(attackingReceive)carry+=0.35;"
)
replace_one(
    'runtime/action_candidate_engine.js',
    "if(dd<1.15)s-=0.75;if(attackingReceive)s+=1.15;if(ctx.recentTakeOn)s-=2.20;if(inBox&&shot.openWindow)s-=1.6;",
    "if(dd<1.15)s-=0.75;if(attackingReceive)s+=0.45;if(ctx.recentTakeOn)s-=2.20;if(inBox&&shot.openWindow)s-=1.6;"
)
replace_one(
    'runtime/action_candidate_engine.js',
    "if(ctx.recentTakeOnWin)p+=0.22;\n        if(ctx.recentTeamShot)p*=0.55;",
    "if(ctx.recentTakeOnWin)p+=0.22;\n        if(ctx.attackingThroughReceive)p+=0.10;\n        if(ctx.recentTeamShot)p*=0.55;"
)
replace_one(
    'runtime/action_candidate_engine.js',
    "case 'TAKE_ON': return clamp(0.065+(candidate.meta?.skillAdvantage||0)*0.0028+(candidate.meta?.spaceBehind||0)*0.005+(candidate.meta?.wide?0.020:0)+(ctx.attackingThroughReceive?0.20:0),0.045,0.40);",
    "case 'TAKE_ON': return clamp(0.065+(candidate.meta?.skillAdvantage||0)*0.0028+(candidate.meta?.spaceBehind||0)*0.005+(candidate.meta?.wide?0.020:0)+(ctx.attackingThroughReceive?0.08:0),0.045,0.32);"
)

# Issue #4: the visible FAR_SIDE_RUN must use the player's real velocity/run direction.
# This extends the look-ahead only for an already committed moving runner; stationary players
# still cannot manufacture a lead pass.
replace_one(
    'runtime/continuous_match_core.js',
    "const targetLead=taskCommitted?{x:p.tx,y:p.ty}:null,speed=Math.hypot(p.vx,p.vy),motionLead=taskRun&&speed>1.6?{x:clamp(p.x+p.vx*0.90,1,104),y:clamp(p.y+p.vy*0.90,1,67)}:null;let lead=plannedRun?{x:p.runTx,y:p.runTy}:targetLead;if(motionLead&&(!lead||dir(team)*(motionLead.x-owner.x)>dir(team)*(lead.x-owner.x)+0.35))lead=motionLead;const leadForward=lead?dir(team)*(lead.x-owner.x):forward;",
    "const targetLead=taskCommitted?{x:p.tx,y:p.ty}:null,speed=Math.hypot(p.vx,p.vy),motionLeadSeconds=taskRun?(p.role==='WF'&&p.tacticalTask==='FAR_SIDE_RUN'?1.65:(['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(p.tacticalTask)?1.35:1.10)):0,motionLead=taskRun&&speed>1.6?{x:clamp(p.x+p.vx*motionLeadSeconds,1,104),y:clamp(p.y+p.vy*motionLeadSeconds,1,67)}:null;let lead=plannedRun?{x:p.runTx,y:p.runTy}:targetLead;if(motionLead&&(!lead||dir(team)*(motionLead.x-owner.x)>dir(team)*(lead.x-owner.x)+0.35))lead=motionLead;const leadForward=lead?dir(team)*(lead.x-owner.x):forward;"
)

# Issue #3: a genuine through-ball reception in the last attacking corridor can become a
# decisive shot decision even a fraction before the strict penalty-area test. It remains
# stochastic and geometry-driven; shot/pass/carry probabilities are not precomputed outcomes.
replace_one(
    'runtime/continuous_match_core.js',
    "const receiveAge=m.time-(owner.lastReceivedAt||-99),decisiveReceive=receiveAge>=.22&&receiveAge<=1.25&&shot.inBox&&shot.dGoal<=19.2&&shot.blockers.length<=1&&shot.facingAlignment>=.55&&['ST','WF','CM'].includes(owner.role);\n  if(decisiveReceive){const open=shot.blockers.length===0,baseP=shot.oneVOne?.62:open?.32:.16,roleP=owner.role==='ST'?0.06:owner.role==='WF'?0.02:-0.02,pressureP=pressure>=3.2?.08:pressure>=2.0?.03:pressure<1.2?-.10:0,p=clamp(baseP+roleP+pressureP,.28,.96),roll=(hash32(`${m.seed}|DECISIVE_RECEIVE_SHOT|${Math.floor((owner.controlledSince||m.time)*10)}|${owner.id}`)%10000)/10000;if(roll<p){m.stats.decisiveReceiveShots=(m.stats.decisiveReceiveShots||0)+1;return{type:'SHOT',reason:'DECISIVE_RECEIVE_FINISH'};}}",
    "const receiveAge=m.time-(owner.lastReceivedAt||-99),throughReceiveFinalThird=owner.lastReceivedFlightKind==='THROUGH'&&receiveAge<=1.35&&local.x>=82&&shot.dGoal<=23.5&&shot.blockers.length<=1,decisiveReceive=receiveAge>=.22&&receiveAge<=1.35&&(shot.inBox||throughReceiveFinalThird)&&shot.dGoal<=23.5&&shot.blockers.length<=1&&shot.facingAlignment>=.55&&['ST','WF','CM'].includes(owner.role);\n  if(decisiveReceive){const open=shot.blockers.length===0,baseP=shot.oneVOne?.62:open?(shot.inBox?.32:.24):.16,roleP=owner.role==='ST'?0.06:owner.role==='WF'?0.02:-0.02,pressureP=pressure>=3.2?.08:pressure>=2.0?.03:pressure<1.2?-.10:0,p=clamp(baseP+roleP+pressureP,shot.inBox?.28:.22,.96),roll=(hash32(`${m.seed}|DECISIVE_RECEIVE_SHOT|${Math.floor((owner.controlledSince||m.time)*10)}|${owner.id}`)%10000)/10000;if(roll<p){m.stats.decisiveReceiveShots=(m.stats.decisiveReceiveShots||0)+1;return{type:'SHOT',reason:'DECISIVE_RECEIVE_FINISH'};}}"
)

# Shooting calibration: restore a real miss tail for central clean keeper-facing chances.
# These are probability floors, not fixed result quotas.
replace_one(
    'runtime/continuous_match_core.js',
    "const floor=clamp(0.855+(finishing-60)*0.0026-Math.max(0,assess.dGoal-9)*0.008-(assess.pressure<1.20?0.035:0),0.79,0.91);",
    "const floor=clamp(0.755+(finishing-60)*0.0025-Math.max(0,assess.dGoal-9)*0.007-(assess.pressure<1.20?0.030:0),0.70,0.82);"
)
replace_one(
    'runtime/continuous_match_core.js',
    "const floor=clamp(0.800+(finishing-60)*0.0023-Math.max(0,assess.dGoal-14)*0.012-(assess.pressure<1.30?0.035:0),0.72,0.86);",
    "const floor=clamp(0.748+(finishing-60)*0.0023-Math.max(0,assess.dGoal-14)*0.010-(assess.pressure<1.30?0.030:0),0.69,0.82);"
)

# Instrument clean 1v1/keeper-facing outcomes so frequency and shooting distribution can be
# measured from full-match samples instead of guessed from visual anecdotes.
replace_one(
    'runtime/continuous_match_core.js',
    "m.stats.shots++;m.stats.shotsByTeam[team]=(m.stats.shotsByTeam[team]||0)+1;m.stats.shotReasons[reason]=(m.stats.shotReasons[reason]||0)+1;m.stats.shotStyles[stylePlan.style]=(m.stats.shotStyles[stylePlan.style]||0)+1;m.lastShotAt[team]=m.time;if(owner.role==='CM'){m.stats.midfieldShots=(m.stats.midfieldShots||0)+1;if(assess.inBox)m.stats.midfieldBoxShots=(m.stats.midfieldBoxShots||0)+1;else m.stats.midfieldLongShots=(m.stats.midfieldLongShots||0)+1;}if(assess.inBox)m.stats.boxShots++;",
    "m.stats.shots++;m.stats.shotsByTeam[team]=(m.stats.shotsByTeam[team]||0)+1;m.stats.shotReasons[reason]=(m.stats.shotReasons[reason]||0)+1;m.stats.shotStyles[stylePlan.style]=(m.stats.shotStyles[stylePlan.style]||0)+1;m.lastShotAt[team]=m.time;if(assess.oneVOne)m.stats.strictOneVOneShots=(m.stats.strictOneVOneShots||0)+1;if(assess.clearKeeperChance)m.stats.cleanKeeperChanceShots=(m.stats.cleanKeeperChanceShots||0)+1;if(owner.role==='CM'){m.stats.midfieldShots=(m.stats.midfieldShots||0)+1;if(assess.inBox)m.stats.midfieldBoxShots=(m.stats.midfieldBoxShots||0)+1;else m.stats.midfieldLongShots=(m.stats.midfieldLongShots||0)+1;}if(assess.inBox)m.stats.boxShots++;"
)
replace_one(
    'runtime/continuous_match_core.js',
    "if(isShot){if(p.role==='GK'){setControlled(m,p);m.stats.saves++;event(m,'SAVE',`${subjectName(p.name)} 슈팅을 막아냈습니다.`);p.nextThink=m.time+0.75;return;}setLoose(m,m.ball.x,m.ball.y,-m.ball.vx*0.28+(m.r()-0.5)*3,-m.ball.vy*0.28+(m.r()-0.5)*3,p.team,p.id);m.stats.blocks++;m.stats.looseBalls++;event(m,'BLOCK',`${subjectName(p.name)} 슈팅을 몸으로 막았습니다.`);return;}",
    "if(isShot){if(p.role==='GK'){const strict=!!m.ball.shotOneVOne,clean=!!m.ball.shotClearKeeperChance;if(strict)m.stats.strictOneVOneSaves=(m.stats.strictOneVOneSaves||0)+1;if(clean)m.stats.cleanKeeperChanceSaves=(m.stats.cleanKeeperChanceSaves||0)+1;setControlled(m,p);m.stats.saves++;event(m,'SAVE',`${subjectName(p.name)} 슈팅을 막아냈습니다.`);p.nextThink=m.time+0.75;return;}setLoose(m,m.ball.x,m.ball.y,-m.ball.vx*0.28+(m.r()-0.5)*3,-m.ball.vy*0.28+(m.r()-0.5)*3,p.team,p.id);m.stats.blocks++;m.stats.looseBalls++;event(m,'BLOCK',`${subjectName(p.name)} 슈팅을 몸으로 막았습니다.`);return;}"
)
replace_one(
    'runtime/continuous_match_core.js',
    "const saveRoll=(hash32(shotKey)%10000)/10000;if(saveRoll>saveP)return false;m.stats.saves=(m.stats.saves||0)+1;m.stats.chipSaves=(m.stats.chipSaves||0)+1;",
    "const saveRoll=(hash32(shotKey)%10000)/10000;if(saveRoll>saveP)return false;if(m.ball.shotOneVOne)m.stats.strictOneVOneSaves=(m.stats.strictOneVOneSaves||0)+1;if(m.ball.shotClearKeeperChance)m.stats.cleanKeeperChanceSaves=(m.stats.cleanKeeperChanceSaves||0)+1;m.stats.saves=(m.stats.saves||0)+1;m.stats.chipSaves=(m.stats.chipSaves||0)+1;"
)
replace_one(
    'runtime/continuous_match_core.js',
    "const team=m.ball.shotTeam,description=goalDescription(m,team,cross);m.score[team]++;m.stats.goals++;event(m,'GOAL',`${description} ${m.score.HOME}-${m.score.AWAY}`,{actorId:m.ball.lastTouchPlayer,team});settleGoalBallInNet(m,team,cross);startGoalCelebration(m,team);return;",
    "const team=m.ball.shotTeam,description=goalDescription(m,team,cross);if(m.ball.shotOneVOne)m.stats.strictOneVOneGoals=(m.stats.strictOneVOneGoals||0)+1;if(m.ball.shotClearKeeperChance)m.stats.cleanKeeperChanceGoals=(m.stats.cleanKeeperChanceGoals||0)+1;m.score[team]++;m.stats.goals++;event(m,'GOAL',`${description} ${m.score.HOME}-${m.score.AWAY}`,{actorId:m.ball.lastTouchPlayer,team});settleGoalBallInNet(m,team,cross);startGoalCelebration(m,team);return;"
)
replace_one(
    'runtime/continuous_match_core.js',
    "  const defendingGoalTeam=cross.side==='GOAL_LEFT'?HOME:AWAY;",
    "  if((cross.side==='GOAL_LEFT'||cross.side==='GOAL_RIGHT')&&m.ball.kind==='SHOT'){if(m.ball.shotOneVOne)m.stats.strictOneVOneMisses=(m.stats.strictOneVOneMisses||0)+1;if(m.ball.shotClearKeeperChance)m.stats.cleanKeeperChanceMisses=(m.stats.cleanKeeperChanceMisses||0)+1;}\n  const defendingGoalTeam=cross.side==='GOAL_LEFT'?HOME:AWAY;"
)

# Issue #2: preserve an explicit trace from user-selected target -> engine intended receiver ->
# first controller/opponent interception. This is diagnostics only and does not alter physics.
replace_one(
    'runtime/continuous_match_core.js',
    "  const resolvedTargetId=c.meta?.targetId||c.targetId||null;\n  m.userChoiceLog=m.userChoiceLog||[];",
    "  const resolvedTargetId=c.meta?.targetId||c.targetId||null;\n  const directedPassChoices=new Set(['THROUGH_PASS','PROGRESSIVE_PASS','AVAILABLE_PASS','SWITCH_PASS','SAFE_PASS','RECYCLE','EARLY_CROSS','DEEP_CROSS','CUTBACK']);\n  if(directedPassChoices.has(c.id)&&resolvedTargetId){m.lastUserDirectedPassTrace={at:Number(m.time.toFixed(3)),sourceId:owner.id,choiceId:c.id,requestedTargetId:targetId||resolvedTargetId,resolvedTargetId,intendedReceiverId:m.ball.intendedReceiverId||null,firstControllerId:null,outcome:'IN_FLIGHT'};}\n  m.userChoiceLog=m.userChoiceLog||[];"
)
replace_one(
    'runtime/continuous_match_core.js',
    "if(m.r()<cleanTake){setControlled(m,p,false);p.nextThink=m.time+0.75;m.stats.turnovers++;m.stats.interceptions++;m.transitionUntil=m.time+1.8;event(m,'INTERCEPT',`${subjectName(p.name)} 패스 길을 읽고 가로챘습니다.`);if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.onInterception==='function')TELEMETRY.onInterception(m,{team:p.team,playerId:p.id});return true;}",
    "if(m.r()<cleanTake){const tr=m.lastUserDirectedPassTrace;if(tr&&tr.outcome==='IN_FLIGHT'&&tr.sourceId===m.ball.lastTouchPlayer){tr.firstControllerId=p.id;tr.outcome='OPPONENT_INTERCEPT';tr.resolvedAt=Number(m.time.toFixed(3));}setControlled(m,p,false);p.nextThink=m.time+0.75;m.stats.turnovers++;m.stats.interceptions++;m.transitionUntil=m.time+1.8;event(m,'INTERCEPT',`${subjectName(p.name)} 패스 길을 읽고 가로챘습니다.`);if(TELEMETRY&&m.telemetry&&typeof TELEMETRY.onInterception==='function')TELEMETRY.onInterception(m,{team:p.team,playerId:p.id});return true;}"
)
replace_one(
    'runtime/continuous_match_core.js',
    "  const oldTeam=m.possession,sourceId=m.ball.lastTouchPlayer,passTeam=m.ball.lastTouchTeam,deliveryMode=m.ball.deliveryMode||((m.ball.z||0)>0.2?'AERIAL':'GROUND');\n  const sameTeamFlow=transferFlight&&flightKind!=='CROSS'&&p.team===passTeam;\n  setControlled(m,p,false,sameTeamFlow?{flow:true,flightKind,deliveryMode,sourceId}:null);",
    "  const oldTeam=m.possession,sourceId=m.ball.lastTouchPlayer,passTeam=m.ball.lastTouchTeam,deliveryMode=m.ball.deliveryMode||((m.ball.z||0)>0.2?'AERIAL':'GROUND');\n  const trace=m.lastUserDirectedPassTrace;if(passFlight&&trace&&trace.outcome==='IN_FLIGHT'&&trace.sourceId===sourceId){trace.firstControllerId=p.id;trace.outcome=p.team===passTeam?(p.id===trace.resolvedTargetId?'SELECTED_TARGET_CONTROL':'OTHER_TEAMMATE_CONTROL'):'OPPONENT_CONTROL';trace.resolvedAt=Number(m.time.toFixed(3));}\n  const sameTeamFlow=transferFlight&&flightKind!=='CROSS'&&p.team===passTeam;\n  setControlled(m,p,false,sameTeamFlow?{flow:true,flightKind,deliveryMode,sourceId}:null);"
)
replace_one(
    'runtime/continuous_match_core.js',
    "actionCandidates:m.actionCandidateTelemetry?JSON.parse(JSON.stringify(m.actionCandidateTelemetry)):null,tactical:m.tactical?JSON.parse(JSON.stringify(m.tactical)):null,events:m.events.slice(-20),stats,",
    "actionCandidates:m.actionCandidateTelemetry?JSON.parse(JSON.stringify(m.actionCandidateTelemetry)):null,userDirectedPassTrace:m.lastUserDirectedPassTrace?JSON.parse(JSON.stringify(m.lastUserDirectedPassTrace)):null,tactical:m.tactical?JSON.parse(JSON.stringify(m.tactical)):null,events:m.events.slice(-20),stats,"
)

print('TT049_APPLY_OK')
