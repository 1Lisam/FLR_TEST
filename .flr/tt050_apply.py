#!/usr/bin/env python3
import sys
from pathlib import Path
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()

def read(rel): return (ROOT/rel).read_text(encoding='utf-8')
def write(rel,s): (ROOT/rel).write_text(s,encoding='utf-8')
def replace_once(text,old,new,label):
    n=text.count(old)
    if n!=1: raise SystemExit(f'TT050_REPLACE_COUNT {label} expected=1 actual={n}')
    return text.replace(old,new,1)

# 1) Through-ball travel time should meet the runner rather than fire at a static point.
p='runtime/ball_strike_model.js'; t=read(p)
t=replace_once(t,
"  const pressure=Number(ctx.pressure)||99,targetSpeed=Number(ctx.targetSpeed)||0,forward=Number(ctx.forward)||0;",
"  const pressure=Number(ctx.pressure)||99,targetSpeed=Number(ctx.targetSpeed)||0,forward=Number(ctx.forward)||0,targetLeadDistance=Math.max(0,Number(ctx.targetLeadDistance)||0);",
'pass context lead distance')
t=replace_once(t,
"      style='THROUGH_GROUND';arrival=clamp(0.60+d/45-(targetSpeed>4?0.07:0),0.72,1.28);speed=clamp(d/arrival+quality*1.0,16.0,24.5);loft=0.07;",
"      style='THROUGH_GROUND';const runnerArrival=targetSpeed>1.6&&targetLeadDistance>1.5?targetLeadDistance/targetSpeed:0,physicsFloor=d/24.5;arrival=runnerArrival>0?clamp(Math.max(physicsFloor,runnerArrival),0.82,1.62):clamp(0.68+d/43-(targetSpeed>4?0.04:0),0.82,1.42);speed=clamp(d/arrival+quality*0.55,13.2,24.5);loft=0.07;",
'runner timed through pass')
write(p,t)

# 2) Core: preserve the runner's diagonal vector and make one user carry a coherent action.
p='runtime/continuous_match_core.js'; t=read(p)
old="""  if(kind==='THROUGH'){
    const receiverLead=dist(target,tp),roughSpeed=clamp(16.0+pd*0.30,16.5,24.0),flightTime=pd/Math.max(1,roughSpeed),desiredLead=clamp(flightTime*6.25,5.8,14.5);
    // The receiver should still be running when the ball reaches the lane. A conservative
    // lead made quick forwards arrive ~0.5-1.0s early and wait for the pass. Extend only
    // along the attacking axis; keep the requested lane/side intact.
    if(receiverLead<desiredLead*0.88){const tl=worldToLocal(target.team,target.x,target.y),tpl=worldToLocal(target.team,tp.x,tp.y),extra=clamp(desiredLead-receiverLead,0,3.6),candidate=localToWorld(target.team,clamp(tpl.x+extra,4,98.2),clamp(tpl.y,4,64)),oldBlocks=laneBlockers(m,owner,tp,other(owner.team)).length,newBlocks=laneBlockers(m,owner,candidate,other(owner.team)).length,oldOpen=outfield(m,other(owner.team)).reduce((best,q)=>Math.min(best,dist(q,tp)),99),newOpen=outfield(m,other(owner.team)).reduce((best,q)=>Math.min(best,dist(q,candidate)),99);if(newBlocks<=oldBlocks&&newOpen>=Math.min(1.25,oldOpen-.35))tp=candidate;pd=dist(owner,tp);}
  }
"""
new="""  if(kind==='THROUGH'){
    const receiverLead=dist(target,tp),targetSpeed=Math.hypot(target.vx,target.vy),roughArrival=clamp(pd/Math.max(13.2,Math.min(24.5,pd/1.10)),0.82,1.62),desiredLead=clamp((targetSpeed>1.6?targetSpeed:5.0)*roughArrival,4.8,14.5);
    // Extend an under-led pass along the runner's LIVE movement vector. The old X-only
    // extension could turn a diagonal/wide run into a hard straight ball toward goal.
    if(receiverLead<desiredLead*0.88){const baseDx=targetSpeed>1.6?target.vx:(tp.x-target.x),baseDy=targetSpeed>1.6?target.vy:(tp.y-target.y),nv=norm(baseDx,baseDy),extra=clamp(desiredLead-receiverLead,0,3.8),candidate={x:clamp(tp.x+nv.x*extra,1,104),y:clamp(tp.y+nv.y*extra,1,67)},oldBlocks=laneBlockers(m,owner,tp,other(owner.team)).length,newBlocks=laneBlockers(m,owner,candidate,other(owner.team)).length,oldOpen=outfield(m,other(owner.team)).reduce((best,q)=>Math.min(best,dist(q,tp)),99),newOpen=outfield(m,other(owner.team)).reduce((best,q)=>Math.min(best,dist(q,candidate)),99);if(newBlocks<=oldBlocks&&newOpen>=Math.min(1.25,oldOpen-.35))tp=candidate;pd=dist(owner,tp);}
  }
"""
t=replace_once(t,old,new,'through vector extension')
t=replace_once(t,
"const sl=worldToLocal(owner.team,owner.x,owner.y),strike=STRIKE&&typeof STRIKE.passPlan==='function'?STRIKE.passPlan({kind,distance:pd,deliveryMode,pressure:ballCarrierPressureDistance(m,owner),targetSpeed:Math.hypot(target.vx,target.vy),forward:dir(owner.team)*(tp.x-owner.x),passSkill,sourceX:sl.x}):null;",
"const sl=worldToLocal(owner.team,owner.x,owner.y),strike=STRIKE&&typeof STRIKE.passPlan==='function'?STRIKE.passPlan({kind,distance:pd,deliveryMode,pressure:ballCarrierPressureDistance(m,owner),targetSpeed:Math.hypot(target.vx,target.vy),targetLeadDistance:dist(target,tp),forward:dir(owner.team)*(tp.x-owner.x),passSkill,sourceX:sl.x}):null;",
'passPlan target lead')
old="if(!CANDIDATES)return null;const l=worldToLocal(owner.team,owner.x,owner.y),runner=opts.find(o=>(o.running||['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p.tacticalTask))&&o.block===0&&((['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p.tacticalTask)&&owner.role==='ST'&&o.leadForward>2.5&&o.score>-1.25)||(o.leadForward>6&&o.score>1.55))),progressive=opts.find(o=>o.forward>5&&o.block===0&&o.score>1.20),switchOpt=opts.find(o=>Math.abs(o.p.y-owner.y)>23&&o.block===0&&o.score>1.0),safe=opts.find(o=>o.block===0&&o.open>1.8),recycle=opts.find(o=>['CM','FB'].includes(o.p.role)&&o.block===0&&o.open>1.25&&o.forward<0&&o.forward>-16);"
new="if(!CANDIDATES)return null;const l=worldToLocal(owner.team,owner.x,owner.y),runner=opts.find(o=>(o.running||['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p.tacticalTask))&&o.block===0&&((['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p.tacticalTask)&&owner.role==='ST'&&o.leadForward>2.5&&o.score>-1.25)||(o.leadForward>6&&o.score>1.55))),progressive=opts.find(o=>o.forward>5&&o.block===0&&o.score>1.20),switchOpt=opts.find(o=>Math.abs(o.p.y-owner.y)>23&&o.block===0&&o.score>1.0),safeAny=opts.find(o=>o.block===0&&o.open>1.8),safeForward=opts.find(o=>o.block===0&&o.open>1.35&&o.forward>-2&&['ST','WF','CM'].includes(o.p.role)),safe=l.x>=80?(safeForward||safeAny):safeAny,recycle=opts.find(o=>['CM','FB'].includes(o.p.role)&&o.block===0&&o.open>1.25&&o.forward<0&&o.forward>-16);"
t=replace_once(t,old,new,'final third safe outlet preference')
old="""  if(userControl&&userControl.playerId===owner.id){
    if(userControl.controllerOwned)return;
    if(m.time<=Number(userControl.until||0)+0.001)return;
    m.userChoiceControl=null;owner.nextThink=Math.max(owner.nextThink||0,m.time);return;
  }
"""
new="""  if(userControl&&userControl.playerId===owner.id){
    if(userControl.controllerOwned){
      if(userControl.mode==='CARRY'&&m.time<Number(userControl.until||0)-0.05&&m.ball.mode==='CONTROLLED'&&m.ball.ownerId===owner.id){
        const remain=dist(owner,{x:owner.tx,y:owner.ty});
        if(remain<0.72){const l=worldToLocal(owner.team,owner.x,owner.y),tl=worldToLocal(owner.team,owner.tx,owner.ty),dx=tl.x-l.x,dy=tl.y-l.y,n=Math.hypot(dx,dy),ux=n>0.18?dx/n:1,uy=n>0.18?dy/n:0,step=clamp((Number(userControl.until)-m.time)*2.25,1.15,3.2),w=localToWorld(owner.team,clamp(l.x+ux*step,4,96.2),clamp(l.y+uy*step,4,64));owner.tx=w.x;owner.ty=w.y;owner.action=inOppPenaltyArea(owner.team,owner.x,owner.y)?'COMMITTED_BOX_CARRY':'CARRY_FORWARD';owner.tacticalTask=owner.action;owner.sprint=!inOppPenaltyArea(owner.team,owner.x,owner.y)&&step>2.4;m.stats.userCarryIntentExtensions=(m.stats.userCarryIntentExtensions||0)+1;}
      }
      return;
    }
    if(m.time<=Number(userControl.until||0)+0.001)return;
    m.userChoiceControl=null;owner.nextThink=Math.max(owner.nextThink||0,m.time);return;
  }
"""
t=replace_once(t,old,new,'coherent controller carry')
t=replace_once(t,"intentUntil=Math.max(Number(owner.lockTargetUntil||0),m.time+0.90);owner.nextThink=intentUntil;","intentUntil=Math.max(Number(owner.lockTargetUntil||0),m.time+2.60);owner.nextThink=intentUntil;",'carry intent duration')
t=replace_once(t,"intentUntil=m.time+1.85;owner.nextThink=intentUntil;owner.lockTargetUntil=Math.max(owner.lockTargetUntil||0,intentUntil);","intentUntil=m.time+2.35;owner.nextThink=intentUntil;owner.lockTargetUntil=Math.max(owner.lockTargetUntil||0,intentUntil);",'hold intent duration')
write(p,t)

# 3) Controller: reopen only for a materially new state during the selected carry.
p='runtime/protagonist_match_controller.js'; t=read(p)
old="""  else if(['CARRY','HOLD'].includes(tr.choiceId)){
    if(tr.possessionChangedAt!=null)ready=now-tr.possessionChangedAt>=1.20&&ballSettled;
    else ready=now>=tr.minimumUntil;
  }else if(tr.family==='패스'||tr.family==='크로스'){"""
new="""  else if(['CARRY','HOLD'].includes(tr.choiceId)){
    if(tr.possessionChangedAt!=null)ready=now-tr.possessionChangedAt>=1.20&&ballSettled;
    else if(tr.choiceId==='CARRY'&&heroOwnNow){const q=inspect(s),f=q?.frame||{},moved=protagonistMovement(s.currentScene)||0,critical=!!(f.shot?.oneVOne||(f.shot?.inBox&&f.shot?.openWindow&&(f.shot?.blockers??9)<=1));ready=(critical&&now>=tr.startedAt+1.25)||(moved>=6.0&&now>=tr.startedAt+2.35)||now>=tr.minimumUntil;}
    else ready=now>=tr.minimumUntil;
  }else if(tr.family==='패스'||tr.family==='크로스'){"""
t=replace_once(t,old,new,'meaningful carry checkpoint')
write(p,t)

# 4) Tactics: a recovering 8 leaves the ST's occupied central path via its half-space.
p='runtime/tactical_movement.js'; t=read(p)
anchor="function targetSeparation(m){\n"
helper="""function separateRecoveringMidfieldFromStriker(m,team){
  const st=teamPlayers(m,team).find(p=>p.slot==='ST');if(!st)return;
  const sl=worldToLocal(team,st.x,st.y);
  for(const p of teamPlayers(m,team).filter(p=>['LCM','RCM'].includes(p.slot)&&['RECOVER_MIDFIELD_8','BOX_EDGE_SUPPORT','SECOND_WAVE_8'].includes(p.tacticalTask))){
    const pl=worldToLocal(team,p.x,p.y);if(Math.hypot(pl.x-sl.x,pl.y-sl.y)>7.0||Math.abs(pl.y-sl.y)>3.8)continue;
    const sign=p.slot==='RCM'?1:-1,tl=worldToLocal(team,p.tx,p.ty),wantedY=clamp(sl.y+sign*5.2,18,50),w=localToWorld(team,Math.min(tl.x,pl.x-1.0),wantedY);p.tx=w.x;p.ty=w.y;p.action=p.tacticalTask='RECOVER_MIDFIELD_LANE';p.sprint=true;m.stats.midfieldStrikerLaneSeparations=(m.stats.midfieldStrikerLaneSeparations||0)+1;
  }
}

function targetSeparation(m){
"""
t=replace_once(t,anchor,helper,'midfield striker lane helper')
t=replace_once(t,"assignAttack(m,poss,ctx);const defTeam=other(poss);assignDefence(m,defTeam,ctx);","assignAttack(m,poss,ctx);separateRecoveringMidfieldFromStriker(m,poss);const defTeam=other(poss);assignDefence(m,defTeam,ctx);",'call midfield lane separation')
write(p,t)

# 5) Public bug-report endpoint config and browser load order. Worker/UI body is refined separately.
write('bug_report_config.js',"window.FLR_BUG_REPORT_ENDPOINT = window.FLR_BUG_REPORT_ENDPOINT || ''; // set to https://<worker>/report after one-time Worker deployment\n")
p='index.html'; t=read(p)
t=replace_once(t,"<script src=\"in_pitch_choice_ui.js\"></script><script src=\"step71_hybrid_v06_ui.js\"></script>","<script src=\"in_pitch_choice_ui.js\"></script><script src=\"bug_report_config.js\"></script><script src=\"step71_hybrid_v06_ui.js\"></script>",'bug config script')
t=replace_once(t,"현재 TT 버전, 경기 시간, seed, 선택 choiceId + exact targetId, 선수/공 위치와 최근 이벤트가 자동 첨부됩니다. GitHub 등록 화면에서 마지막 Submit만 누르면 됩니다.","등록 버튼을 누르면 현재 Episode의 전체 통합 JSON 원본을 자동 저장하고 GitHub Issue에 링크합니다. 서버가 아직 연결되지 않았거나 업로드에 실패하면 기존 수동 GitHub 등록 방식으로 안전하게 전환됩니다.",'bug modal help')
write(p,t)
print('TT050_APPLY_OK')
