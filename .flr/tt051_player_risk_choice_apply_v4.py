#!/usr/bin/env python3
import subprocess,sys
from pathlib import Path
if len(sys.argv)<2: raise SystemExit('WORKDIR_REQUIRED')
work=Path(sys.argv[1]).resolve();base=Path(__file__).with_name('tt051_player_risk_choice_apply_v3.py').resolve()
subprocess.check_call([sys.executable,str(base),str(work)])
p=work/'runtime/protagonist_match_controller.js';s=p.read_text(encoding='utf-8')
old="if(out.length>=6){const ix=out.findIndex(o=>o.id==='HOLD'||o.id==='RECYCLE'||o.id==='AVAILABLE_PASS');if(ix>=0)out.splice(ix,1);}"
new="if(out.length>=6){const ix=out.findIndex(o=>o.id==='HOLD'||o.id==='RECYCLE'||(o.id==='AVAILABLE_PASS'&&!o.meta?.offsideRisk&&!o.meta?.contested&&!(o.meta?.laneBlockers>0))||o.id==='SAFE_PASS');if(ix>=0)out.splice(ix,1);}"
# This pattern occurs only in the physical-CARRY floor after v3. If other floors ever adopt the same
# text, fail rather than silently changing their priority contract.
if s.count(old)!=1: raise SystemExit(f'carry eviction pattern count={s.count(old)}')
s=s.replace(old,new,1);p.write_text(s,encoding='utf-8')
print('TT-0.51 player-risk choice v4 applied')
