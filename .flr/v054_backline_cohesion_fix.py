from pathlib import Path

p=Path('runtime/tactical_movement.js')
s=p.read_text(encoding='utf-8')
marker='\nfunction separateRecoveringMidfieldFromStriker(m,team){'
if s.count(marker)!=1: raise SystemExit(f'backline cohesion insert marker count={s.count(marker)}')
fn=r'''
function enforceBackFourDepthCohesion(m,team,threat){
  if(!threat||threat.team===team||!['CONTROLLED','FLIGHT'].includes(m.ball.mode))return;
  const ball=worldToLocal(team,m.ball.x,m.ball.y);
  // Inside the immediate penalty-area corridor the back four may legitimately collapse and
  // stagger around the carrier. The danger-block code owns that emergency shape.
  if(ball.x<24)return;
  const backs=outfield(m,team).filter(p=>['CB','FB'].includes(p.role));if(backs.length<4)return;
  const cbs=backs.filter(p=>p.role==='CB');if(cbs.length<2)return;
  const lock=m._defenceRoleLocks?.[team]||{},transition=m.transitionUntil>m.time;
  const cbTargetXs=cbs.map(p=>worldToLocal(team,p.tx,p.ty).x).sort((a,b)=>a-b),line=(cbTargetXs[0]+cbTargetXs[1])/2;
  const onsideFloor=Math.min(ball.x,line),normalAllowance=transition?4.2:2.8,trackAllowance=transition?5.2:4.0;
  for(const p of backs){
    if(p.id===lock.pressId||['PRESS_CONTAIN','ENGAGE','EMERGENCY_TRACK','AERIAL_FIRST_BALL'].includes(p.tacticalTask))continue;
    const mark=playerById(m,p.markTargetId),ml=mark?worldToLocal(team,mark.x,mark.y):null;
    const tracking=['WIDE_RUN_TRACK','TRANSITION_WIDE_COVER','MARK_LANE_SCREEN','MARK_TIGHT'].includes(p.tacticalTask);
    // A controlled-ball attacker already beyond both the ball and the coherent back line is
    // in an offside position. Do not let one defender follow him goal-side and destroy the
    // line for everyone else; release the body mark and recover the lane instead.
    if(m.ball.mode==='CONTROLLED'&&ml&&ml.x<onsideFloor-.55){
      p.markTargetId=null;
      if(p.role==='FB'&&tracking)p.action=p.tacticalTask='WIDE_LINE_RECOVER';
      else if(p.role==='CB'&&tracking)p.action=p.tacticalTask='BACKLINE_RECOVER';
    }
    const allowance=tracking?trackAllowance:(p.role==='CB'?2.2:normalAllowance),tl=worldToLocal(team,p.tx,p.ty),minX=line-allowance;
    if(tl.x<minX){const w=localToWorld(team,minX,tl.y);p.tx=w.x;p.ty=w.y;p.sprint=p.sprint||worldToLocal(team,p.x,p.y).x<minX-2.0;}
  }
  // Centre-backs are the depth reference. A routine cover/mark redraw must not leave one CB
  // several metres behind his partner outside the emergency corridor.
  const cl=cbs.map(p=>({p,l:worldToLocal(team,p.tx,p.ty)})).sort((a,b)=>a.l.x-b.l.x),deep=cl[0],high=cl[1];
  if(high.l.x-deep.l.x>2.6&&!['PRESS_CONTAIN','ENGAGE','EMERGENCY_TRACK'].includes(deep.p.tacticalTask)){
    const nx=high.l.x-2.6,w=localToWorld(team,nx,deep.l.y);deep.p.tx=w.x;deep.p.ty=w.y;deep.p.sprint=deep.p.sprint||worldToLocal(team,deep.p.x,deep.p.y).x<nx-2.0;
  }
}
'''
s=s.replace(marker,'\n'+fn+marker,1)
old='enforceFullbackWideRunnerResponsibility(m,defTeam,liveThreat);enforceWideLaneHierarchy(m,poss);stabilizeDefensiveResponsibilities(m,defTeam,liveThreat);'
new='enforceFullbackWideRunnerResponsibility(m,defTeam,liveThreat);enforceBackFourDepthCohesion(m,defTeam,liveThreat);enforceWideLaneHierarchy(m,poss);stabilizeDefensiveResponsibilities(m,defTeam,liveThreat);'
if s.count(old)!=1: raise SystemExit(f'backline cohesion assign marker count={s.count(old)}')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('V054_BACKLINE_COHESION_APPLIED')
