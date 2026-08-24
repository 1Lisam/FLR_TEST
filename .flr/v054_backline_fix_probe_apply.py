#!/usr/bin/env python3
import json, os, subprocess, sys
from pathlib import Path
if len(sys.argv)<2: raise SystemExit('usage: v054_backline_fix_probe_apply.py <workdir>')
work=Path(sys.argv[1]).resolve();here=Path(__file__).resolve().parent;os.chdir(work)
def apply(name):
 src=(here/name).read_text(encoding='utf-8');exec(compile(src,str(here/name),'exec'),{'__name__':'__main__','__file__':str(here/name)})
def runjs(script,*args):
 p=subprocess.run(['node',str(here/script),str(work),*args],text=True,capture_output=True)
 if p.returncode!=0: raise SystemExit(f'{script} failed: {p.stderr[-4000:]}')
 return json.loads(p.stdout)
def emit(stage):
 back=runjs('v054_backline_probe.js','DEV-RECENT-1787573272419-1');eco=runjs('v054_ecology_probe.js')
 print('V054_BACKLINE_FIX_STAGE='+json.dumps({'stage':stage,'backline':back,'ecology':eco},ensure_ascii=False,separators=(',',':')))
apply('v054_defense_normalization.py');apply('v054_defense_normalization_cm_guard.py');apply('v054_offside_law11_fix.py');emit('BEFORE_COHESION')
apply('v054_backline_cohesion_fix.py');emit('AFTER_COHESION')
print('V054_BACKLINE_FIX_PROBE_APPLIED')
