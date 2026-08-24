from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    p=ROOT/path
    s=p.read_text(encoding='utf-8')
    if new in s:
        return False
    if s.count(old)!=1:
        raise SystemExit(f'ANCHOR_MISMATCH {path}: expected 1 got {s.count(old)}')
    p.write_text(s.replace(old,new,1),encoding='utf-8')
    return True

# 1) Defensive role/target stability. Existing HF2 geometry guards remain the proposal layer;
# HF3 stabilizes the final responsibility so a player is not reclassified every tactical tick.
tac=Path('runtime/tactical_movement.js')
anchor="function assign(m){\n"
insert=r'''function defenceRoleFamily(p,lock){
  const t=String(p.tacticalTask||p.action||'');
  if(p.id===lock?.pressId||['PRESS_CONTAIN','ENGAGE','RECOVERY_CHASE','EMERGENCY_TRACK'].includes(t))return'PRESS';
  if(['WIDE_RUN_TRACK','TRANSITION_WIDE_COVER'].includes(t))return'WIDE_TRACK';
  if(p.markTargetId||t==='MARK'||t==='MARK_LANE_SCREEN')return'MARK';
  if(p.id===lock?.coverId||/COVER|SCREEN|TUCK|REST_DEFENCE|BLOCK/.test(t))return'COVER';
  return'SHAPE';
}
function defensiveResponsibilityHold(family){return family==='PRESS'?.42:family==='WIDE_TRACK'?.92:family==='MARK'?.82:family==='COVER'?.72:.62;}
function stabilizeDefensiveResponsibilities(m,team,owner){
  if(!owner||owner.team===team||m.ball.mode!=='CONTROLLED')return;
  m._defenceMotionStability=m._defenceMotionStability||{};
  const state=m._defenceMotionStability[team]||(m._defenceMotionStability[team]={players:{},ownerId:owner.id});
  if(state.ownerId!==owner.id){state.ownerId=owner.id;for(const q of Object.values(state.players||{})){q.minUntil=Math.min(Number(q.minUntil||0),m.time+.18);}}
  const lock=m._defenceRoleLocks?.[team]||{},ball=worldToLocal(team,m.ball.x,m.ball.y);
  for(const p of outfield(m,team).filter(q=>['CB','FB','CM'].includes(q.role))){
    const family=defenceRoleFamily(p,lock),prev=state.players[p.id],mark=playerById(m,p.markTargetId),markLocal=mark?worldToLocal(team,mark.x,mark.y):null;
    const emergencyPress=p.id===lock.pressId||family==='PRESS'&&dist(p,owner)<=3.2;
    const emergencyWide=family==='WIDE_TRACK'&&markLocal&&markLocal.x<=34;
    const emergencyBox=ball.x<=19&&['CB','FB'].includes(p.role)&&dist(p,owner)<=5.0;
    const emergency=emergencyPress||emergencyWide||emergencyBox;
    const proposed={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:p.tx,ty:p.ty};
    if(prev){
      const semanticChanged=prev.family!==family||prev.task!==proposed.task||prev.markTargetId!==proposed.markTargetId;
      const holdActive=m.time<Number(prev.minUntil||0);
      if(semanticChanged&&holdActive&&!emergency){
        // Keep the football responsibility, but allow the path itself to follow the live shape.
        p.tacticalTask=prev.task;p.action=prev.action;p.markTargetId=prev.markTargetId||null;
      }
      // Path smoothing is deliberately modest: it removes left/right target ping-pong without
      // making defenders slow to react to an actual pass or runner.
      const jump=Math.hypot(Number(proposed.tx)-Number(prev.tx),Number(proposed.ty)-Number(prev.ty));
      const alpha=emergency?.82:jump>7?.58:.42;
      p.tx=lerp(Number(prev.tx),Number(p.tx),alpha);p.ty=lerp(Number(prev.ty),Number(p.ty),alpha);
      const finalFamily=defenceRoleFamily(p,lock),finalChanged=prev.family!==finalFamily||prev.task!==p.tacticalTask||prev.markTargetId!==(p.markTargetId||null);
      if(finalChanged){prev.minUntil=m.time+defensiveResponsibilityHold(finalFamily);prev.since=m.time;}
      prev.family=finalFamily;prev.task=p.tacticalTask;prev.action=p.action;prev.markTargetId=p.markTargetId||null;prev.tx=p.tx;prev.ty=p.ty;
    }else state.players[p.id]={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:p.tx,ty:p.ty,since:m.time,minUntil:m.time+defensiveResponsibilityHold(family)};
  }
}

function assign(m){
'''
replace_once(tac,anchor,insert)
replace_once(tac,
"    m._defenceRoleLocks={};\n    m._markLocks={};\n    m._lastTacticalPossession=poss;",
"    m._defenceRoleLocks={};\n    m._markLocks={};\n    m._defenceMotionStability={};\n    m._lastTacticalPossession=poss;")
replace_once(tac,
"enforceActualDefenderCrowdExit(m,defTeam,owner);enforceFullbackWideRunnerResponsibility(m,defTeam,owner);enforceWideLaneHierarchy(m,poss);",
"enforceActualDefenderCrowdExit(m,defTeam,owner);enforceFullbackWideRunnerResponsibility(m,defTeam,owner);enforceWideLaneHierarchy(m,poss);stabilizeDefensiveResponsibilities(m,defTeam,owner);")
# Engage the same-side full-back before the winger has already become a deep free runner.
replace_once(tac,
".filter(o=>(o.l.y<34?-1:1)===sg&&o.l.x<=40).sort((a,b)=>a.l.x-b.l.x)[0];",
".filter(o=>(o.l.y<34?-1:1)===sg&&o.l.x<=52).sort((a,b)=>a.l.x-b.l.x)[0];")

# 2) Carrier freeze: SHIELD_SCAN is a beat, not a loop. The next close-pressure decision is also
# scheduled sooner so the owner does not stand shoulder-to-shoulder for several seconds.
core=Path('runtime/continuous_match_core.js')
replace_once(core,
"  if(!opts.userCommitted&&!inBox&&l.x>=70&&l.x<88&&['ST','WF','CM'].includes(owner.role)&&pressure<3.0){owner.action=owner.tacticalTask='SHIELD_SCAN';owner.sprint=false;owner.lockTargetUntil=0;owner.nextThink=m.time+0.68;owner.lastDecision='HOLD';return;}",
"  const recentShieldScan=m.time-Number(owner.lastShieldScanAt||-99)<1.20;\n  if(!opts.userCommitted&&!recentShieldScan&&!inBox&&l.x>=70&&l.x<88&&['ST','WF','CM'].includes(owner.role)&&pressure<3.0){owner.lastShieldScanAt=m.time;owner.action=owner.tacticalTask='SHIELD_SCAN';owner.sprint=false;owner.lockTargetUntil=0;owner.nextThink=m.time+0.48;owner.lastDecision='HOLD';return;}")
replace_once(core,
"if(pressure<1.20&&held>0.28)owner.nextThink=Math.min(owner.nextThink,m.time+0.22+m.r()*0.18);",
"if(pressure<1.65&&held>0.22)owner.nextThink=Math.min(owner.nextThink,m.time+0.18+m.r()*0.16);")

# 3) Offside: Law 11 still freezes at release, but the whistle waits for actual involvement
# (receiver close to the live ball) rather than a fixed 0.30-second animation timer.
old_off="""function maybeOffside(m){\n  // Offside position is frozen when the pass is RELEASED. Do not re-evaluate after the runner\n  // has moved during the first 0.1s of ball flight.\n  if(m.ball.mode!=='FLIGHT'||!m.ball.intendedReceiverId||m.ball.offsideCalled||m.ball.age<0.30||m.ball.age>1.20)return;\n  const t=playerById(m,m.ball.intendedReceiverId),source=playerById(m,m.ball.lastTouchPlayer);if(!t||!source||source.team!==t.team)return;\n  if(m.ball.offsideAtRelease===true){m.ball.offsideCalled=true;m.stats.offsides++;event(m,'OFFSIDE',`${subjectName(t.name)} 오프사이드 위치에 있었습니다.`);startDeadRestart(m,'OFFSIDE',other(t.team),t.x,t.y);}\n}"""
new_off="""function maybeOffside(m){\n  // Law 11 reference is still frozen at RELEASE. HF3 changes only when the referee call becomes\n  // visible: let the real pass/run develop until the intended receiver is involved with the ball.\n  if(m.ball.mode!=='FLIGHT'||!m.ball.intendedReceiverId||m.ball.offsideCalled||m.ball.age<0.24||m.ball.age>1.90)return;\n  const t=playerById(m,m.ball.intendedReceiverId),source=playerById(m,m.ball.lastTouchPlayer);if(!t||!source||source.team!==t.team)return;\n  if(m.ball.offsideAtRelease===true){\n    const involvementGap=dist(t,m.ball),involved=involvementGap<=2.55||m.ball.age>=1.65;\n    if(!involved)return;\n    m.ball.offsideCalled=true;m.stats.offsides++;event(m,'OFFSIDE',`${subjectName(t.name)} 오프사이드 위치에 있었습니다.`,{actorId:t.id,team:t.team,releaseFrozen:true,involvementGap:Number(involvementGap.toFixed(3)),flightAge:Number(m.ball.age.toFixed(3))});startDeadRestart(m,'OFFSIDE',other(t.team),t.x,t.y);\n  }\n}"""
replace_once(core,old_off,new_off)

# 4) Bug-reporter repository path: token is still user-managed, but when installed the Worker
# must address /repos/1Lisam/FLR_TEST/issues rather than duplicating the owner in repo.
replace_once(Path('bug-report-worker/wrangler.toml'),'GITHUB_REPO = "1Lisam/FLR_TEST"','GITHUB_REPO = "FLR_TEST"')

print('HF3_APPLY_OK')
