#!/usr/bin/env python3
import json, os, subprocess, sys
from pathlib import Path
if len(sys.argv)<2: raise SystemExit('usage: v054_backline_ab_apply.py <workdir>')
work=Path(sys.argv[1]).resolve(); here=Path(__file__).resolve().parent
os.chdir(work)
def apply(name):
 src=(here/name).read_text(encoding='utf-8'); exec(compile(src,str(here/name),'exec'),{'__name__':'__main__','__file__':str(here/name)})
def probe(stage):
 p=subprocess.run(['node',str(here/'v054_backline_probe.js'),str(work),'DEV-RECENT-1787573272419-1'],text=True,capture_output=True)
 if p.returncode!=0: raise SystemExit(p.stderr[-4000:])
 print('V054_BACKLINE_STAGE='+json.dumps({'stage':stage,'data':json.loads(p.stdout)},ensure_ascii=False,separators=(',',':')))
apply('v054_defense_normalization.py');apply('v054_defense_normalization_cm_guard.py');probe('A_DEFENCE_AND_CM_GUARD')
apply('v054_offside_law11_fix.py');probe('B_PLUS_LAW11')
print('V054_BACKLINE_AB_APPLIED')
