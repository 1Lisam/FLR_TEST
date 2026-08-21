#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def repl(rel,old,new):
 p=root/rel;s=p.read_text(encoding='utf-8');n=s.count(old)
 if n!=1: raise SystemExit(f'EXPECTED_ONE:{rel}:{n}:{old[:100]}')
 p.write_text(s.replace(old,new,1),encoding='utf-8')
repl('runtime/continuous_match_core.js',
"const bothBox=insideBox(a)&&insideBox(b),min=a.role==='GK'||b.role==='GK'?0.82:same?(bothBox?1.18:0.88):(duel?1.02:1.05);",
"const bothBox=insideBox(a)&&insideBox(b),min=a.role==='GK'||b.role==='GK'?0.82:same?(bothBox?1.18:0.88):(duel?1.02:1.30);")
repl('runtime/tactical_movement.js',
"if(['CUTBACK_TRACK','SECOND_BALL_TUCK','BOX_EDGE_SCREEN','MARK_LANE_SCREEN','DEEP_SCREEN','EMERGENCY_TRACK','DEEP_TUCK'].includes(z.p.tacticalTask))z.p.action=z.p.tacticalTask=z.p.tacticalTask==='MARK_LANE_SCREEN'?'MIDFIELD_LANE_SCREEN':z.p.tacticalTask;",
"if(['CUTBACK_TRACK','SECOND_BALL_TUCK','BOX_EDGE_SCREEN','MARK_LANE_SCREEN','DEEP_SCREEN','EMERGENCY_TRACK','DEEP_TUCK'].includes(z.p.tacticalTask))z.p.action=z.p.tacticalTask=z.p.tacticalTask==='MARK_LANE_SCREEN'?(z.p.role==='CM'?'MIDFIELD_LANE_SCREEN':'MARK_LANE_SCREEN'):z.p.tacticalTask;")
repl('runtime/manager_tendency_adapter.js',
"else if(['ST','WF','CM'].includes(p.role))penalty=-.7;",
"else if(['ST','WF','CM'].includes(p.role))penalty=-.7;\n    // A centre-back already responsible for a different attacker should not be repeatedly\n    // stolen from that off-ball mark by the manager press layer. Keep it possible only when\n    // no better presser exists; the added cost is preference, not a hard prohibition.\n    if(p.role==='CB'&&p.markTargetId&&p.markTargetId!==owner.id)penalty+=8.5;")
print('TT-0.51 off-ball marker stability patch applied')
