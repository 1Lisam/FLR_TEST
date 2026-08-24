#!/usr/bin/env python3
import os, sys
from pathlib import Path

if len(sys.argv) < 2:
    raise SystemExit('usage: v054_defense_normalization_apply_bundle.py <workdir>')
work=Path(sys.argv[1]).resolve()
if not (work/'runtime/tactical_movement.js').is_file():
    raise SystemExit(f'invalid workdir: {work}')
here=Path(__file__).resolve().parent
os.chdir(work)
for name in ['v054_defense_normalization.py','v054_defense_normalization_cm_guard.py','v054_offside_law11_fix.py','v054_second_ball_layer_fix.py']:
    src=(here/name).read_text(encoding='utf-8')
    code=compile(src,str(here/name),'exec')
    exec(code,{'__name__':'__main__','__file__':str(here/name)})
print('V054_DEFENCE_NORMALIZATION_BUNDLE_APPLIED')
