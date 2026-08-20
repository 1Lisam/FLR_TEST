#!/usr/bin/env python3
import sys
from pathlib import Path
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()

def read(rel): return (ROOT/rel).read_text(encoding='utf-8')
def write(rel,s): (ROOT/rel).write_text(s,encoding='utf-8')
def one(t,old,new,label):
    n=t.count(old)
    if n!=1: raise SystemExit(f'TT050_FINAL_REPLACE {label} expected=1 actual={n}')
    return t.replace(old,new,1)
def exact_many(t,old,new,count,label):
    n=t.count(old)
    if n!=count: raise SystemExit(f'TT050_FINAL_REPLACE {label} expected={count} actual={n}')
    return t.replace(old,new)

# A visible pending option is the authoritative current-state user input.
# Do not re-rank it away between menu display and the click that executes it.
p='runtime/continuous_match_core.js';t=read(p)
old="""function applyChoiceCandidate(m,playerId,candidateId,targetId=null,inputSource='DIRECT_API'){
  const frame=inspectChoiceState(m,playerId);if(!frame||frame.kind!=='ON_BALL'||!frame._frame)return{ok:false,reason:'NO_ON_BALL_CHOICE_STATE'};
  const owner=frame._frame.owner,same=frame.candidates.filter(x=>x.id===candidateId);let c=null;
  if(targetId!=null){c=same.find(x=>x.targetId===targetId||x.meta?.targetId===targetId)||null;if(!c)return{ok:false,reason:'CHOICE_TARGET_NOT_AVAILABLE',requestedTargetId:targetId};}
  else{if(same.length>1&&same.some(x=>(x.targetId||x.meta?.targetId)!=null))return{ok:false,reason:'AMBIGUOUS_CHOICE_TARGET'};c=same[0]||null;}
  if(!c)return{ok:false,reason:'CANDIDATE_NOT_AVAILABLE'};
"""
new="""function applyChoiceCandidate(m,playerId,candidateId,targetId=null,inputSource='DIRECT_API',frozenCandidate=null){
  const frame=inspectChoiceState(m,playerId);if(!frame||frame.kind!=='ON_BALL'||!frame._frame)return{ok:false,reason:'NO_ON_BALL_CHOICE_STATE'};
  const owner=frame._frame.owner,same=frame.candidates.filter(x=>x.id===candidateId);let c=null;
  const frozenTarget=frozenCandidate?(frozenCandidate.targetId||frozenCandidate.meta?.targetId||null):null,frozenMatches=!!(frozenCandidate&&frozenCandidate.id===candidateId&&frozenTarget===(targetId||null));
  if(frozenMatches){
    if(targetId!=null){const target=playerById(m,targetId);if(!target||target.team!==owner.team||target.id===owner.id)return{ok:false,reason:'FROZEN_CHOICE_TARGET_PHYSICALLY_INVALID',requestedTargetId:targetId};}
    c=frozenCandidate;m.stats.frozenUserChoiceExecutions=(m.stats.frozenUserChoiceExecutions||0)+1;
  }else if(targetId!=null){c=same.find(x=>x.targetId===targetId||x.meta?.targetId===targetId)||null;if(!c)return{ok:false,reason:'CHOICE_TARGET_NOT_AVAILABLE',requestedTargetId:targetId};}
  else{if(same.length>1&&same.some(x=>(x.targetId||x.meta?.targetId)!=null))return{ok:false,reason:'AMBIGUOUS_CHOICE_TARGET'};c=same[0]||null;}
  if(!c)return{ok:false,reason:'CANDIDATE_NOT_AVAILABLE'};
"""
t=one(t,old,new,'frozen visible candidate execution')
# The actual controller-owned carry duration lives in the core action executor.
t=one(t,"m.time+2.60);owner.nextThink=intentUntil;","m.time+3.20);owner.nextThink=intentUntil;",'carry intent duration 3.2')
write(p,t)

p='runtime/protagonist_match_controller.js';t=read(p)
t=one(t,
"else if(s.pending.kind==='ON_BALL')res=C().applyCandidate(s.m,s.heroPlayerId,opt.id,opt.targetId||null,inputSource);",
"else if(s.pending.kind==='ON_BALL')res=C().applyCandidate(s.m,s.heroPlayerId,opt.id,opt.targetId||null,inputSource,opt);",
'controller passes frozen option')
# One football episode should not remain interactive for half a minute just because the hero
# repeatedly retains possession. This is a temporal episode boundary, not a choice-count cap.
t=one(t,"hardUntil:s.m.time+32","hardUntil:s.m.time+20",'episode hard duration choice branch')
t=one(t,"hardUntil:tr.startedAt+32","hardUntil:tr.startedAt+20",'episode hard duration result branch')
t=exact_many(t,"ep.hardUntil=ep.hardUntil||ep.startedAt+32","ep.hardUntil=ep.hardUntil||ep.startedAt+20",2,'episode hard duration existing branches')
# The controller owns only the decision checkpoint after the coherent carry.
t=one(t,"ready=(critical&&now>=tr.startedAt+1.25)||(moved>=6.0&&now>=tr.startedAt+2.35)||now>=tr.minimumUntil;","ready=(critical&&now>=tr.startedAt+1.35)||(moved>=7.5&&now>=tr.startedAt+2.90)||now>=tr.minimumUntil;",'carry meaningful checkpoint')
write(p,t)

# Weight ground through-balls to the runner's arrival, including genuinely soft balls into space.
p='runtime/ball_strike_model.js';t=read(p)
old="style='THROUGH_GROUND';const runnerArrival=targetSpeed>1.6&&targetLeadDistance>1.5?targetLeadDistance/targetSpeed:0,physicsFloor=d/24.5;arrival=runnerArrival>0?clamp(Math.max(physicsFloor,runnerArrival),0.82,1.62):clamp(0.68+d/43-(targetSpeed>4?0.04:0),0.82,1.42);speed=clamp(d/arrival+quality*0.55,13.2,24.5);loft=0.07;"
new="style='THROUGH_GROUND';const runnerArrival=targetSpeed>1.6&&targetLeadDistance>1.5?targetLeadDistance/targetSpeed:0,physicsFloor=d/22.5;arrival=runnerArrival>0?clamp(Math.max(physicsFloor,runnerArrival),0.82,2.85):clamp(0.72+d/41-(targetSpeed>4?0.03:0),0.84,1.55);speed=runnerArrival>0?clamp(d/arrival+quality*0.12,5.6,22.5):clamp(d/arrival+quality*0.35,11.5,22.5);loft=0.07;"
t=one(t,old,new,'runner arrival weighted through ball')
write(p,t)

# ST Hybrid windows: involvement alone is too broad. Require a materially dangerous direct
# involvement while retaining an urgent path for exceptional states and the separate finish window.
p='live_hybrid_session_v02.js';t=read(p)
start=t.find('function maybeHeroWindow(session,e){');end=t.find('function doAction(session,policy={},prePromotion=null){',start)
if start<0 or end<0: raise SystemExit(f'TT050_FINAL_HYBRID_BOUNDARY start={start} end={end}')
new="""function maybeHeroWindow(session,e){const s=session.state,ht=session.opts.heroTeam||'HOME',role=session.opts.heroRole||'CM',hid=heroId(session),age=s.second-session.lastHeroWindowAt,actorInvolved=e.detail?.actorId===hid,targetInvolved=e.detail?.targetId===hid,heroInvolved=actorInvolved||targetInvolved,urgentHero=heroInvolved&&s.danger>=.80&&['DANGEROUS_PASS','BOX_ENTRY','TURNOVER_DANGER'].includes(e.kind),roleGap=role==='ST'?105:role==='CM'?72:role==='CB'?80:110,minGap=urgentHero?(role==='ST'?55:42):roleGap;if(age<minGap||session.durationSeconds-s.second<15)return null;let reason=null;
 if(s.possession===ht){
   if(role==='ST'&&['FINAL_THIRD','BOX'].includes(s.zone)&&heroInvolved){const direct=['DANGEROUS_PASS','BOX_ENTRY'].includes(e.kind),actorThreat=actorInvolved&&(direct||(e.kind==='PROGRESS'&&s.zone==='BOX'&&s.danger>=.68)),targetThreat=targetInvolved&&direct&&s.danger>=.50;if(actorThreat||targetThreat)reason='ATTACKING_INVOLVEMENT';}
   else if(role==='CM'&&['PROGRESSION','FINAL_THIRD'].includes(s.phase)&&heroInvolved)reason='MIDFIELD_INVOLVEMENT';
   else if(role==='CB'&&s.phase==='BUILD_UP'&&heroInvolved)reason='BUILDUP_INVOLVEMENT';
 }
 else if(role==='CM'&&e.kind.startsWith('TURNOVER')&&s.danger>=.66&&s.ball.lane==='CENTER')reason='DEFENSIVE_TRANSITION';
 else if(role==='CB'&&e.kind.startsWith('TURNOVER')&&s.danger>=.58&&['FINAL_THIRD','BOX'].includes(s.zone))reason='DEFENSIVE_TRANSITION';
 else if(role==='GK'&&s.possession!==ht&&['FINAL_THIRD','BOX'].includes(s.zone)&&s.danger>=.60&&['PROGRESS','DANGEROUS_PASS','BOX_ENTRY'].includes(e.kind))reason='GK_GOALKEEPING';
 return reason?makeWindow(session,e,reason):null;}
"""
write(p,t[:start]+new+t[end:])
print('TT050_FINAL_REFINE_OK')
