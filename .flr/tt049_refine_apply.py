#!/usr/bin/env python3
import sys
from pathlib import Path
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()

def replace_one(rel,old,new,label):
    p=ROOT/rel;t=p.read_text(encoding='utf-8');n=t.count(old)
    if n!=1: raise SystemExit(f'TT049_REFINE_REPLACE_COUNT {label}: expected=1 actual={n}')
    p.write_text(t.replace(old,new,1),encoding='utf-8');print(f'patched {rel}: {label}')

# Issue #3: bias a genuine through-ball reception toward a timely final action, but keep
# one forward touch and an attacking connection viable. Do not make wide receives auto-shots.
replace_one('runtime/action_candidate_engine.js',
"if(!inBox)s-=role==='CM'?4.2:2.9;if(attackingReceive&&(shot.blockers||0)===0&&shot.dGoal<=26)s+=1.25;if(ctx.recentTeamShot)s-=2.2;",
"if(!inBox)s-=role==='CM'?4.2:2.9;if(attackingReceive&&(shot.blockers||0)===0&&shot.dGoal<=26)s+=0.85;if(ctx.recentTeamShot)s-=2.2;",'through receive shot score')
replace_one('runtime/action_candidate_engine.js',
"if(clearRunway)carry+=3.4;if(space>5.2&&pressure>1.6)carry+=0.68;if(role==='WF'&&wide)carry+=0.42;if(inBox)carry+=0.30;if(wide&&x>=80&&x<92&&['WF','FB'].includes(role))carry+=1.35;if(x>94)carry-=2.4;if(frontChain>=2&&['ST','WF'].includes(role))carry+=1.25;if(attackingReceive)carry+=0.35;",
"if(clearRunway)carry+=3.4;if(space>5.2&&pressure>1.6)carry+=0.68;if(role==='WF'&&wide)carry+=0.42;if(inBox)carry+=0.30;if(wide&&x>=80&&x<92&&['WF','FB'].includes(role))carry+=1.35;if(x>94)carry-=2.4;if(frontChain>=2&&['ST','WF'].includes(role))carry+=1.25;if(attackingReceive)carry+=0.55;",'through receive carry balance')
replace_one('runtime/action_candidate_engine.js',
"if(dd<1.15)s-=0.75;if(attackingReceive)s+=0.45;if(ctx.recentTakeOn)s-=2.20;if(inBox&&shot.openWindow)s-=1.6;",
"if(dd<1.15)s-=0.75;if(attackingReceive)s+=0.25;if(ctx.recentTakeOn)s-=2.20;if(inBox&&shot.openWindow)s-=1.6;",'through receive take-on restraint')
replace_one('runtime/action_candidate_engine.js',
"if(ctx.recentTakeOnWin)p+=0.22;\n        if(ctx.attackingThroughReceive)p+=0.10;\n        if(ctx.recentTeamShot)p*=0.55;",
"if(ctx.recentTakeOnWin)p+=0.22;\n        if(ctx.attackingThroughReceive)p+=0.05;\n        if(ctx.recentTeamShot)p*=0.55;",'shot commitment balance')

# V13 explicitly separates clean 1v1 from the broader Big Chance/open-chance family.
# Keep clearKeeperChance for the broad shooting model and introduce an instrumentation-only
# cleanOneVOne definition: central, no shot-ray blocker, no defender protecting the keeper lane,
# and enough separation that the attacker is genuinely facing the GK rather than in a shoulder duel.
replace_one('runtime/continuous_match_core.js',
"const goalSideDefenders=defenders.filter(p=>dir(team)*(p.x-owner.x)>0.15&&dist(owner,p)<17.0&&Math.abs(p.y-owner.y)<13.5);",
"const goalSideDefenders=defenders.filter(p=>dir(team)*(p.x-owner.x)>0.15&&dist(owner,p)<17.0&&Math.abs(p.y-owner.y)<13.5);\n  const keeperLaneDefenders=defenders.filter(p=>dir(team)*(p.x-owner.x)>0.10&&dist(owner,p)<19.5&&Math.abs(p.y-owner.y)<16.5);",'keeper lane defender guard')
replace_one('runtime/continuous_match_core.js',
"const clearKeeperChance=inBox&&dGoal<=18.5&&Math.abs(owner.y-34)<=11.5&&blockers.length===0&&goalSideDefenders.length===0&&pressure>0.95;",
"const clearKeeperChance=inBox&&dGoal<=18.5&&Math.abs(owner.y-34)<=11.5&&blockers.length===0&&keeperLaneDefenders.length===0&&pressure>0.95;\n  const cleanOneVOne=clearKeeperChance&&Math.abs(owner.y-34)<=10.5&&pressure>1.45;",'separate clean 1v1 from broad clear chance')
replace_one('runtime/continuous_match_core.js',
"return{dGoal,angle,goalAngle,bodyAngleDiff,facingAlignment,turningRequired,backToGoal,blockers,goalSideDefenders,pressure,inBox,oneVOne,openWindow,clearKeeperChance,bestAimY:bestLane.y,score};",
"return{dGoal,angle,goalAngle,bodyAngleDiff,facingAlignment,turningRequired,backToGoal,blockers,goalSideDefenders,keeperLaneDefenders,pressure,inBox,oneVOne,cleanOneVOne,openWindow,clearKeeperChance,bestAimY:bestLane.y,score};",'expose clean 1v1')
replace_one('runtime/continuous_match_core.js',
"if(assess.oneVOne)m.stats.strictOneVOneShots=(m.stats.strictOneVOneShots||0)+1;if(assess.clearKeeperChance)m.stats.cleanKeeperChanceShots=(m.stats.cleanKeeperChanceShots||0)+1;",
"if(assess.oneVOne)m.stats.strictOneVOneShots=(m.stats.strictOneVOneShots||0)+1;if(assess.cleanOneVOne)m.stats.cleanOneVOneShots=(m.stats.cleanOneVOneShots||0)+1;if(assess.clearKeeperChance)m.stats.cleanKeeperChanceShots=(m.stats.cleanKeeperChanceShots||0)+1;",'clean 1v1 shot instrumentation')

print('TT049_REFINE_APPLY_OK')
