from pathlib import Path
import sys

p = Path(sys.argv[1])
s = p.read_text(encoding='utf-8')

if "TT051-PROTAGONIST-MATCH-CONTROLLER-1.7-CARRY-CADENCE-GUARD" in s and "s.suppressCarryNextCheckpoint=true" in s and "userCarryRepeatSuppressions" in s:
    print('ALREADY_PATCHED historical carry cadence guard')
    raise SystemExit(0)

old_checkpoint = "updateEpisodeState(s);const def=modeDef(s);if(s.pending||s.resultTracker||def.presentation==='SKIP'||s.m.completed||s.m.restart)return null;const q=inspect(s);"
new_checkpoint = "updateEpisodeState(s);const def=modeDef(s);if(s.pending||s.resultTracker||def.presentation==='SKIP'||s.m.completed||s.m.restart)return null;const q=inspect(s);\n  // V0.4 historical #5: if a chosen CARRY was physically stopped almost immediately by tight\n  // pressure, the very next checkpoint must not offer the identical generic CARRY again.\n  // This is a one-checkpoint semantic guard, not a time quota: passes/take-on/shot remain live,\n  // and a genuinely critical new shooting state keeps the full current-state option set.\n  if(q&&s.suppressCarryNextCheckpoint){if(q.frame?.kind==='ON_BALL'){const blockers=Array.isArray(q.frame?.shot?.blockers)?q.frame.shot.blockers.length:Number(q.frame?.shot?.blockers??99),critical=!!(q.frame?.shot?.oneVOne||(q.frame?.shot?.inBox&&q.frame?.shot?.openWindow&&blockers<=1));if(!critical){const before=q.options.length;q.options=q.options.filter(o=>o.id!=='CARRY');if(q.options.length<before)s.m.stats.userCarryRepeatSuppressions=(s.m.stats.userCarryRepeatSuppressions||0)+1;}s.suppressCarryNextCheckpoint=false;}else s.suppressCarryNextCheckpoint=false;}"
if s.count(old_checkpoint) != 1:
    raise SystemExit(f'checkpoint anchor count={s.count(old_checkpoint)}')
s = s.replace(old_checkpoint, new_checkpoint, 1)

old_stall = "blockedStall=carryAge>=.95&&moved<.75&&Number(f.pressure??99)<=1.55;if(blockedStall){const h=hero(s);"
new_stall = "blockedStall=carryAge>=.95&&moved<.75&&Number(f.pressure??99)<=1.55;if(blockedStall){s.suppressCarryNextCheckpoint=true;const h=hero(s);"
if s.count(old_stall) != 1:
    raise SystemExit(f'blocked-stall anchor count={s.count(old_stall)}')
s = s.replace(old_stall, new_stall, 1)

old_version = "const VERSION='TT051-PROTAGONIST-MATCH-CONTROLLER-1.6-MEANINGFUL-CHOICE-FLOORS';"
new_version = "const VERSION='TT051-PROTAGONIST-MATCH-CONTROLLER-1.7-CARRY-CADENCE-GUARD';"
if s.count(old_version) != 1:
    raise SystemExit(f'version anchor count={s.count(old_version)}')
s = s.replace(old_version, new_version, 1)

p.write_text(s, encoding='utf-8')
print('PATCH_OK historical carry cadence guard')
