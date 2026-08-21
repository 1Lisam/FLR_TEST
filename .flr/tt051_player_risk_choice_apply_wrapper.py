#!/usr/bin/env python3
import os,runpy,sys
from pathlib import Path
if len(sys.argv)<2: raise SystemExit('WORKDIR_REQUIRED')
work=Path(sys.argv[1]).resolve()
os.chdir(work)
script=Path(__file__).with_name('tt051_player_risk_choice_apply.py').resolve()
runpy.run_path(str(script),run_name='__main__')
