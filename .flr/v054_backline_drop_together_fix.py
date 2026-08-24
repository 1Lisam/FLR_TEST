from pathlib import Path
p=Path('runtime/tactical_movement.js');s=p.read_text(encoding='utf-8')
marker='\nfunction separateRecoveringMidfieldFromStriker(m,team){'
if s.count(marker)!=1: raise SystemExit(f'drop-together insert marker count={s.count(marker)}')
fn=r'''
function enforceBackFourDropTogether(m,team,threat){
  if(!threat||threat.team===team||!['CONTROLLED','FLIGHT'].includes(m.ball.mode))return;
  const ball=worldToLocal(team,m.ball.x,m.ball.y),pr=profile(m,team),backs=outfield(m,team).filter(p=>['CB','FB'].includes(p.role));if(backs.length<4)return;
  const lock=m._defenceRoleLocks?.[team]||{},transition=m.transitionUntil>m.time;
  // First release a defender who is following an attacker already beyond both the coherent
  // structural line and the controlled ball. That attacker is standing offside; following him
  // only destroys the line and creates a legal channel for somebody else.
  const nominalCbLine=['LCB','RCB'].map(slot=>defendingBlockAnchors(pr,ball.x,ball.y,slot,'CB').x).reduce((a,b)=>a+b,0)/2,onsideFloor=Math.min(ball.x,nominalCbLine);
  for(const p of backs){
    const mark=playerById(m,p.markTargetId),ml=mark?worldToLocal(team,mark.x,mark.y):null,tracking=['WIDE_RUN_TRACK','MARK_LANE_SCREEN','MARK_TIGHT'].includes(p.tacticalTask);
    if(m.ball.mode==='CONTROLLED'&&ml&&ml.x<onsideFloor-.65&&tracking&&p.id!==lock.pressId){
      const base=defendingBlockAnchors(pr,ball.x,ball.y,p.slot,p.role),w=localToWorld(team,base.x,base.y);p.tx=w.x;p.ty=w.y;p.markTargetId=null;p.action=p.tacticalTask=p.role==='FB'?'WIDE_LINE_RECOVER':'BACKLINE_RECOVER';p.sprint=dist(p,w)>3.0;
    }
  }
  // When one defender has a justified deeper job, the safer response is normally for the line
  // to drop compactly with him, not for that defender to sprint upward and open a through lane.
  const rows=backs.map(p=>({p,l:worldToLocal(team,p.tx,p.ty)}));
  const eligible=rows.filter(o=>o.p.id!==lock.pressId&&!['PRESS_CONTAIN','ENGAGE','EMERGENCY_TRACK','AERIAL_FIRST_BALL'].includes(o.p.tacticalTask));if(eligible.length<3)return;
  const deepest=Math.min(...eligible.map(o=>o.l.x)),ballDanger=ball.x<32,maxGap=ballDanger?3.0:(transition?5.0:3.8);
  for(const o of eligible){
    if(o.l.x<=deepest+maxGap)continue;
    const nx=deepest+maxGap,w=localToWorld(team,nx,o.l.y);o.p.tx=w.x;o.p.ty=w.y;o.p.sprint=o.p.sprint||worldToLocal(team,o.p.x,o.p.y).x>nx+2.4;
    if(o.p.role==='CB'&&!/COVER|SCREEN|RECOVER/.test(o.p.tacticalTask||''))o.p.action=o.p.tacticalTask='BACKLINE_DROP_COVER';
  }
}
'''
s=s.replace(marker,'\n'+fn+marker,1)
old='enforceFullbackWideRunnerResponsibility(m,defTeam,liveThreat);enforceWideLaneHierarchy(m,poss);stabilizeDefensiveResponsibilities(m,defTeam,liveThreat);'
new='enforceFullbackWideRunnerResponsibility(m,defTeam,liveThreat);enforceBackFourDropTogether(m,defTeam,liveThreat);enforceWideLaneHierarchy(m,poss);stabilizeDefensiveResponsibilities(m,defTeam,liveThreat);'
if s.count(old)!=1: raise SystemExit(f'drop-together assign marker count={s.count(old)}')
s=s.replace(old,new,1);p.write_text(s,encoding='utf-8');print('V054_BACKLINE_DROP_TOGETHER_APPLIED')
