from pathlib import Path
p=Path(__file__).with_name('v053_hf3_tune_v2.py')
s=p.read_text(encoding='utf-8')
needle='r1(ui,old_ui,new_ui)'
if needle not in s: raise SystemExit('HF3_TUNE_V3_SOURCE_ANCHOR')
s=s.replace(needle,"\ntry:\n r1(ui,old_ui,new_ui)\nexcept SystemExit as e:\n print('HF3_UI_PATCH_DEFERRED',e)\n",1)
exec(compile(s,str(p),'exec'))
