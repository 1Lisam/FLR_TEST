from pathlib import Path
p=Path('runtime/continuous_match_core.js')
s=p.read_text(encoding='utf-8')
old="""  if(outcome==='ATK'&&atk){const p=atk.p,l=worldToLocal(p.team,p.x,p.y),dGoal=Math.hypot(105-l.x,34-l.y),central=Math.abs(l.y-34),heading=abilityValue(m,p,'heading');m.stats.crossesCompleted++;
    const headerWindow=l.x>=86.0&&dGoal<=19.5&&central<=17.0&&['ST','WF','CM'].includes(p.role);let headerP=p.role==='ST'?0.72:p.role==='WF'?0.56:0.42;headerP+=(heading-60)*0.0028;if(dGoal<=11.5)headerP+=0.11;if(central>13)headerP-=0.08;if(def)headerP-=0.05;headerP=clamp(headerP,0.28,0.84);
    const protagonistAerialChoice=m.protagonistExplicitActionRequired===true&&p.id===m.protagonistControllerId;if(headerWindow&&!protagonistAerialChoice&&m.r()<headerP)return executeCrossHeaderShot(m,p,def?.d??9);
    setControlled(m,p,false);if(p.role==='CM')m.stats.midfieldFinalReceipts=(m.stats.midfieldFinalReceipts||0)+1;p.nextThink=m.time+0.45+m.r()*0.35;p.lastReceivedFromId=m.ball.lastTouchPlayer;event(m,'CROSS_RECEIVE',`${subjectName(p.name)} 박스 안에서 크로스를 받아냈습니다.`);return true;}"""
new="""  if(outcome==='ATK'&&atk){const p=atk.p,l=worldToLocal(p.team,p.x,p.y),dGoal=Math.hypot(105-l.x,34-l.y),central=Math.abs(l.y-34),heading=abilityValue(m,p,'heading'),sourceId=m.ball.lastTouchPlayer,deliveryMode=m.ball.deliveryMode||'AERIAL';m.stats.crossesCompleted++;
    if(p.id===m.protagonistControllerId&&m.protagonistIncomingChoice?.playerId===p.id){if(executeIncomingChoiceAtContact(m,p,sourceId,'CROSS',deliveryMode))return true;}
    const headerWindow=l.x>=86.0&&dGoal<=19.5&&central<=17.0&&['ST','WF','CM'].includes(p.role);let headerP=p.role==='ST'?0.72:p.role==='WF'?0.56:0.42;headerP+=(heading-60)*0.0028;if(dGoal<=11.5)headerP+=0.11;if(central>13)headerP-=0.08;if(def)headerP-=0.05;headerP=clamp(headerP,0.28,0.84);
    const protagonistAerialChoice=m.protagonistExplicitActionRequired===true&&p.id===m.protagonistControllerId;if(headerWindow&&!protagonistAerialChoice&&m.r()<headerP)return executeCrossHeaderShot(m,p,def?.d??9);
    setControlled(m,p,false,{flow:true,flightKind:'CROSS',deliveryMode,sourceId});if(p.role==='CM')m.stats.midfieldFinalReceipts=(m.stats.midfieldFinalReceipts||0)+1;p.nextThink=Math.max(p.nextThink||0,m.time+0.35);p.lastReceivedFromId=sourceId;event(m,'CROSS_RECEIVE',`${subjectName(p.name)} 박스 안에서 크로스를 받아냈습니다.`);return true;}"""
if s.count(old)!=1: raise SystemExit(f'cross attacking contact expected 1, got {s.count(old)}')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('TT-0.51 aerial contact refined')
