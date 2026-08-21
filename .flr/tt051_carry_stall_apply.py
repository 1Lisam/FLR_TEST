#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=root/'runtime/protagonist_match_controller.js'
s=p.read_text(encoding='utf-8')
old="""    else if(tr.choiceId==='CARRY'&&heroOwnNow){const q=inspect(s),f=q?.frame||{},moved=protagonistMovement(s.currentScene)||0,critical=!!(f.shot?.oneVOne||(f.shot?.inBox&&f.shot?.openWindow&&(f.shot?.blockers??9)<=1));ready=(critical&&now>=tr.startedAt+1.35)||(moved>=7.5&&now>=tr.startedAt+2.90)||now>=tr.minimumUntil;}"""
new="""    else if(tr.choiceId==='CARRY'&&heroOwnNow){const q=inspect(s),f=q?.frame||{},moved=protagonistMovement(s.currentScene)||0,critical=!!(f.shot?.oneVOne||(f.shot?.inBox&&f.shot?.openWindow&&(f.shot?.blockers??9)<=1)),carryAge=now-tr.startedAt,blockedStall=carryAge>=.95&&moved<.75&&Number(f.pressure??99)<=1.55;if(blockedStall){const h=hero(s);if(h){h.lockTargetUntil=0;h.nextThink=now;h.tx=h.x;h.ty=h.y;h.vx=0;h.vy=0;h.sprint=false;if(['CARRY_FORWARD','COMMITTED_BOX_CARRY','CARRY_SCAN','PROBE_WITH_BALL'].includes(h.action)){h.action='HOLD_BALL';h.tacticalTask='HOLD_BALL';}}if(s.m.userChoiceControl?.playerId===s.heroPlayerId)s.m.userChoiceControl=null;s.m.stats.userCarryStallReopens=(s.m.stats.userCarryStallReopens||0)+1;}ready=blockedStall||(critical&&now>=tr.startedAt+1.35)||(moved>=7.5&&now>=tr.startedAt+2.90)||now>=tr.minimumUntil;}"""
if s.count(old)!=1: raise SystemExit(f'EXPECTED_ONE_CARRY_BRANCH:{s.count(old)}')
p.write_text(s.replace(old,new,1),encoding='utf-8')
print('TT-0.51 blocked carry early re-choice applied')
