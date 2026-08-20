#!/usr/bin/env python3
import sys
from pathlib import Path
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()
p=ROOT/'live_hybrid_session_v02.js'
t=p.read_text(encoding='utf-8')
start=t.find('function maybeHeroWindow(session,e){')
end=t.find('function doAction(session,policy={},prePromotion=null){',start)
if start<0 or end<0: raise SystemExit(f'TT050_HYBRID_WINDOW_BOUNDARY start={start} end={end}')
new="""function maybeHeroWindow(session,e){const s=session.state,ht=session.opts.heroTeam||'HOME',role=session.opts.heroRole||'CM',hid=heroId(session),age=s.second-session.lastHeroWindowAt,actorInvolved=e.detail?.actorId===hid,targetInvolved=e.detail?.targetId===hid,heroInvolved=actorInvolved||targetInvolved,roleGap=role==='ST'?68:role==='CM'?72:role==='CB'?80:110,urgentHero=heroInvolved&&s.danger>=.72&&['DANGEROUS_PASS','BOX_ENTRY','TURNOVER_DANGER'].includes(e.kind),minGap=urgentHero?42:roleGap;if(age<minGap||session.durationSeconds-s.second<15)return null;let reason=null;
 if(s.possession===ht){
   if(role==='ST'&&['FINAL_THIRD','BOX'].includes(s.zone)&&heroInvolved)reason='ATTACKING_INVOLVEMENT';
   else if(role==='CM'&&['PROGRESSION','FINAL_THIRD'].includes(s.phase)&&heroInvolved)reason='MIDFIELD_INVOLVEMENT';
   else if(role==='CB'&&s.phase==='BUILD_UP'&&heroInvolved)reason='BUILDUP_INVOLVEMENT';
 }
 else if(role==='CM'&&e.kind.startsWith('TURNOVER')&&s.danger>=.66&&s.ball.lane==='CENTER')reason='DEFENSIVE_TRANSITION';
 else if(role==='CB'&&e.kind.startsWith('TURNOVER')&&s.danger>=.58&&['FINAL_THIRD','BOX'].includes(s.zone))reason='DEFENSIVE_TRANSITION';
 else if(role==='GK'&&s.possession!==ht&&['FINAL_THIRD','BOX'].includes(s.zone)&&s.danger>=.60&&['PROGRESS','DANGEROUS_PASS','BOX_ENTRY'].includes(e.kind))reason='GK_GOALKEEPING';
 return reason?makeWindow(session,e,reason):null;}
"""
p.write_text(t[:start]+new+t[end:],encoding='utf-8')
print('TT050_CADENCE_REFINE_OK')
