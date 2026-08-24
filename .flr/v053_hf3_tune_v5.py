from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def r1(path,old,new):
    p=ROOT/path;s=p.read_text(encoding='utf-8')
    if new in s:return
    n=s.count(old)
    if n!=1:raise SystemExit(f'HF3_V5_ANCHOR {path} count={n}: {old[:120]}')
    p.write_text(s.replace(old,new,1),encoding='utf-8')

t=Path('runtime/tactical_movement.js')
old="""function defensiveResponsibilityHold(family){return family==='PRESS'?.48:family==='WIDE_TRACK'?1.35:family==='MARK'?1.32:family==='COVER'?1.18:1.05;}
function stabilizeDefensiveResponsibilities(m,team,owner){
  if(!owner||owner.team===team||m.ball.mode!=='CONTROLLED')return;
  m._defenceMotionStability=m._defenceMotionStability||{};
  const state=m._defenceMotionStability[team]||(m._defenceMotionStability[team]={players:{},ownerId:owner.id});
  const ownerChanged=state.ownerId!==owner.id;
  if(ownerChanged){state.ownerId=owner.id;for(const q of Object.values(state.players||{})){q.minUntil=m.time+.16;q.laneUntil=m.time;q.lastLateralFlipAt=-99;}}
  const lock=m._defenceRoleLocks?.[team]||{},ball=worldToLocal(team,m.ball.x,m.ball.y);
  for(const p of outfield(m,team).filter(q=>['CB','FB','CM'].includes(q.role))){
    const family=defenceRoleFamily(p,lock),prev=state.players[p.id],mark=playerById(m,p.markTargetId),markLocal=mark?worldToLocal(team,mark.x,mark.y):null;
    const emergencyPress=p.id===lock.pressId||family==='PRESS'&&dist(p,owner)<=3.2;
    const emergencyWide=family==='WIDE_TRACK'&&markLocal&&markLocal.x<=52;
    const emergencyBox=ball.x<=19&&['CB','FB'].includes(p.role)&&dist(p,owner)<=5.0;
    const emergency=ownerChanged||emergencyPress||emergencyWide||emergencyBox;
    const proposed={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:Number(p.tx),ty:Number(p.ty)};
    if(prev){
      const oldMark=playerById(m,prev.markTargetId),oldMarkGap=oldMark?dist(p,oldMark):99;
      const oldMarkRelevant=!!oldMark&&oldMark.team!==team&&oldMarkGap<=13.5;
      const familyChanged=prev.family!==family,markChanged=prev.markTargetId!==proposed.markTargetId;
      const holdActive=m.time<Number(prev.minUntil||0);
      // Preserve the football responsibility itself. A new wide emergency, the current presser,
      // owner/pass change, or an irrelevant old mark can take over immediately.
      if(holdActive&&!emergency&&(familyChanged||(markChanged&&oldMarkRelevant))){
        p.tacticalTask=prev.task;p.action=prev.action;p.markTargetId=prev.markTargetId||null;
      }
      const finalFamily=defenceRoleFamily(p,lock),finalMark=p.markTargetId||null,semanticChanged=prev.family!==finalFamily||prev.markTargetId!==finalMark;
      if(semanticChanged){prev.minUntil=m.time+defensiveResponsibilityHold(finalFamily);prev.since=m.time;prev.laneUntil=m.time;}
      // X may follow the live line continuously. Y belongs to a short-lived defensive lane and
      // is updated only a few times per second; this removes the left-right-left target ping-pong.
      const xAlpha=emergency?.82:.46;p.tx=lerp(Number(prev.tx),Number(p.tx),xAlpha);
      if(emergency){prev.laneTy=Number(proposed.ty);prev.laneUntil=m.time+.18;}
      else if(!Number.isFinite(Number(prev.laneTy))){prev.laneTy=Number(proposed.ty);prev.laneUntil=m.time+.40;}
      else if(m.time>=Number(prev.laneUntil||0)){
        const step=clamp(Number(proposed.ty)-Number(prev.laneTy),-1.65,1.65);
        prev.laneTy=clamp(Number(prev.laneTy)+step,2,66);prev.laneUntil=m.time+.42;
      }
      p.ty=lerp(Number(prev.ty),Number(prev.laneTy),emergency?.88:.58);
      prev.family=finalFamily;prev.task=p.tacticalTask;prev.action=p.action;prev.markTargetId=finalMark;prev.tx=p.tx;prev.ty=p.ty;
    }else state.players[p.id]={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:Number(p.tx),ty:Number(p.ty),laneTy:Number(p.ty),laneUntil:m.time+.40,since:m.time,minUntil:m.time+defensiveResponsibilityHold(family),lastLateralFlipAt:-99};
  }
}"""
new="""function defensiveResponsibilityHold(family){return family==='PRESS'?.48:family==='WIDE_TRACK'?1.35:family==='MARK'?1.32:family==='COVER'?1.18:1.05;}
function stabilizeDefensiveResponsibilities(m,team,owner){
  if(!owner||owner.team===team||!['CONTROLLED','FLIGHT'].includes(m.ball.mode))return;
  m._defenceMotionStability=m._defenceMotionStability||{};
  const state=m._defenceMotionStability[team]||(m._defenceMotionStability[team]={players:{},ownerId:owner.id});
  const ownerChanged=state.ownerId!==owner.id;
  if(ownerChanged){state.ownerId=owner.id;for(const q of Object.values(state.players||{})){q.minUntil=m.time+.16;q.laneUntil=m.time;q.lastLateralFlipAt=-99;}}
  const lock=m._defenceRoleLocks?.[team]||{},ball=worldToLocal(team,m.ball.x,m.ball.y),controlled=m.ball.mode==='CONTROLLED';
  for(const p of outfield(m,team).filter(q=>['CB','FB','CM'].includes(q.role))){
    const family=defenceRoleFamily(p,lock),prev=state.players[p.id],mark=playerById(m,p.markTargetId),markLocal=mark?worldToLocal(team,mark.x,mark.y):null;
    const emergencyPress=controlled&&(p.id===lock.pressId||family==='PRESS'&&dist(p,owner)<=3.2);
    const emergencyWide=family==='WIDE_TRACK'&&markLocal&&markLocal.x<=52;
    const emergencyBox=controlled&&ball.x<=19&&['CB','FB'].includes(p.role)&&dist(p,owner)<=5.0;
    const semanticEmergency=ownerChanged||emergencyPress||emergencyWide||emergencyBox;
    const hardMotionEmergency=ownerChanged||emergencyBox;
    const fastMotion=!hardMotionEmergency&&(emergencyPress||emergencyWide);
    const proposed={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:Number(p.tx),ty:Number(p.ty)};
    if(prev){
      const oldMark=playerById(m,prev.markTargetId),oldMarkGap=oldMark?dist(p,oldMark):99;
      const oldMarkRelevant=!!oldMark&&oldMark.team!==team&&oldMarkGap<=14.5;
      const familyChanged=prev.family!==family,markChanged=prev.markTargetId!==proposed.markTargetId;
      const holdActive=m.time<Number(prev.minUntil||0);
      if(holdActive&&!semanticEmergency&&(familyChanged||(markChanged&&oldMarkRelevant))){p.tacticalTask=prev.task;p.action=prev.action;p.markTargetId=prev.markTargetId||null;}
      const finalFamily=defenceRoleFamily(p,lock),finalMark=p.markTargetId||null,semanticChanged=prev.family!==finalFamily||prev.markTargetId!==finalMark;
      if(semanticChanged){prev.minUntil=m.time+defensiveResponsibilityHold(finalFamily);prev.since=m.time;prev.laneUntil=m.time;}
      const xAlpha=hardMotionEmergency?.82:fastMotion?.68:.46;p.tx=lerp(Number(prev.tx),Number(p.tx),xAlpha);
      if(hardMotionEmergency){prev.laneTy=Number(proposed.ty);prev.laneUntil=m.time+.16;}
      else if(!Number.isFinite(Number(prev.laneTy))){prev.laneTy=Number(proposed.ty);prev.laneUntil=m.time+(fastMotion?.16:.40);}
      else if(m.time>=Number(prev.laneUntil||0)){
        const cap=fastMotion?1.15:1.65,step=clamp(Number(proposed.ty)-Number(prev.laneTy),-cap,cap);
        prev.laneTy=clamp(Number(prev.laneTy)+step,2,66);prev.laneUntil=m.time+(fastMotion?.18:.42);
      }
      p.ty=lerp(Number(prev.ty),Number(prev.laneTy),hardMotionEmergency?.88:fastMotion?.72:.58);
      prev.family=finalFamily;prev.task=p.tacticalTask;prev.action=p.action;prev.markTargetId=finalMark;prev.tx=p.tx;prev.ty=p.ty;
    }else state.players[p.id]={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:Number(p.tx),ty:Number(p.ty),laneTy:Number(p.ty),laneUntil:m.time+.32,since:m.time,minUntil:m.time+defensiveResponsibilityHold(family),lastLateralFlipAt:-99};
  }
}"""
r1(t,old,new)

# A pass has no ballOwner while it is physically in flight. Keep defensive responsibility tied
# to the intended live receiver instead of dropping the full-back/marker to HOLD for a few frames.
r1(t,
"  const owner=playerById(m,m.ball.ownerId),ctx={owner};",
"  const owner=playerById(m,m.ball.ownerId),flightThreat=m.ball.mode==='FLIGHT'&&['PASS','LONG_PASS','THROUGH','CROSS','CUTBACK'].includes(m.ball.kind)&&m.ball.intendedReceiverId?playerById(m,m.ball.intendedReceiverId):null,liveThreat=owner||flightThreat,ctx={owner};")
r1(t,
"enforceActualDefenderCrowdExit(m,defTeam,owner);enforceFullbackWideRunnerResponsibility(m,defTeam,owner);enforceWideLaneHierarchy(m,poss);stabilizeDefensiveResponsibilities(m,defTeam,owner);",
"enforceActualDefenderCrowdExit(m,defTeam,owner);enforceFullbackWideRunnerResponsibility(m,defTeam,liveThreat);enforceWideLaneHierarchy(m,poss);stabilizeDefensiveResponsibilities(m,defTeam,liveThreat);")
r1(t,
"function enforceFullbackWideRunnerResponsibility(m,team,owner){\n  if(!owner||owner.team===team||m.ball.mode!=='CONTROLLED')return;",
"function enforceFullbackWideRunnerResponsibility(m,team,owner){\n  if(!owner||owner.team===team||!['CONTROLLED','FLIGHT'].includes(m.ball.mode))return;")

# Striker central/box runs belong to one attacking intention for a short beat. Keep only the
# lateral lane continuous; forward x and task changes still react normally to the live play.
insert="""function stabilizeStrikerRunLane(m,team,owner){
  if(!owner||owner.team!==team||m.ball.mode!=='CONTROLLED')return;
  const st=teamPlayers(m,team).find(p=>p.slot==='ST');if(!st||st.id===owner.id)return;
  const familyTasks=new Set(['PIN_CENTRE_BACKS','PIN_AND_RUN','ATTACK_OPEN_CHANNEL','ATTACK_NEAR_POST','ATTACK_BACK_POST','PULL_OFF_FOR_CROSS','ATTACK_CENTRAL_CHANNEL']);
  if(!familyTasks.has(st.tacticalTask))return;
  m._attackRunStability=m._attackRunStability||{};let s=m._attackRunStability[team];
  const ownerChanged=!s||s.ownerId!==owner.id;if(ownerChanged)s=m._attackRunStability[team]={ownerId:owner.id,laneY:Number(st.ty),laneUntil:m.time+.45};
  if(!Number.isFinite(Number(s.laneY)))s.laneY=Number(st.ty);
  if(m.time>=Number(s.laneUntil||0)){const step=clamp(Number(st.ty)-Number(s.laneY),-2.0,2.0);s.laneY=clamp(Number(s.laneY)+step,10,58);s.laneUntil=m.time+.48;}
  st.ty=lerp(Number(st.ty),Number(s.laneY),.70);
}

"""
r1(t,"function enforceActualDefenderCrowdExit(m,team,owner){\n",insert+"function enforceActualDefenderCrowdExit(m,team,owner){\n")
r1(t,
"assignAttack(m,poss,ctx);separateRecoveringMidfieldFromStriker(m,poss);enforceAttackingCarrierLane(m,poss);",
"assignAttack(m,poss,ctx);stabilizeStrikerRunLane(m,poss,owner);separateRecoveringMidfieldFromStriker(m,poss);enforceAttackingCarrierLane(m,poss);")
# Reset attacking short-run lane only on a real possession-team change.
r1(t,
"    m._defenceMotionStability={};\n    m._lastTacticalPossession=poss;",
"    m._defenceMotionStability={};\n    m._attackRunStability={};\n    m._lastTacticalPossession=poss;")

print('HF3_TUNE_V5_OK')
v6=ROOT/'.flr/v053_hf3_tune_v6.py'
if v6.exists():
    exec(compile(v6.read_text(encoding='utf-8'),str(v6),'exec'))
